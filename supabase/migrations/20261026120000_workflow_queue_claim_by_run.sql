begin;

-- Queue push consumers receive a runId, not a queue cursor. They must claim that exact Run
-- instead of calling the shared `claim` rotation, because Preview and Production share the
-- Hosted database and the legacy PGMQ rotation still contains Runs from other deployments.
--
-- `claim_run` is deliberately not a second watchdog: it never re-executes a `running` Run.
-- A stale lease is sealed as WORKER_LOST, which keeps at-least-once delivery idempotent.
-- `expire_wait` is the delayed-message wake-up for a paused Thread; it is also idempotent.

create or replace function workflow_private.seal_run(
  p_run uuid,
  p_code text,
  p_thread_status text default 'closed',
  p_category text default 'infrastructure',
  p_effect text default 'unknown',
  p_retryable boolean default false
) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.workflow_live_runs; begin
 select * into r from public.workflow_live_runs where run_id=p_run for update;
 if not found or r.status in ('success','failed','cancelled','continued') then return false; end if;
 perform workflow_private.accrue_compute(p_run);
 update public.workflow_live_runs set status='failed',finished_at=now(),
  error=jsonb_build_object('code',p_code,'category',p_category,'message',p_code,'retryable',p_retryable,'effect',p_effect)
  where run_id=p_run;
 if r.thread_id is not null then
  update public.workflow_execution_threads set status=p_thread_status,
   last_error=jsonb_build_object('code',p_code),interrupts='[]',updated_at=now()
   where thread_id=r.thread_id;
 end if;
 perform workflow_private.event(p_run,'run.failed',jsonb_build_object('error',p_code));
 update public.workflow_run_steps set status='failed',finished_at=now(),
  error=jsonb_build_object('code',p_code,'category',p_category,'message',p_code,'retryable',p_retryable,'effect',p_effect)
  where run_id=p_run and status='running';
 perform pgmq.delete('workflow_v2',(select queue_msg_id from public.workflow_run_jobs where run_id=p_run));
 perform public.workflow_v2_prune(r.owner_user_id,r.workflow_id);
 return true;
end $$;
revoke all on function workflow_private.seal_run(uuid,text,text,text,text,boolean) from public,anon,authenticated,workflow_worker;

create or replace function workflow_private.claim_run(p_run uuid,p_worker text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.workflow_live_runs; j public.workflow_run_jobs; t public.workflow_execution_threads; begin
 if p_worker is null or length(p_worker)=0 then raise exception 'INVALID_WORKER'; end if;
 select * into r from public.workflow_live_runs where run_id=p_run for update;
 if not found then return null; end if;
 if r.status in ('success','failed','cancelled','continued') then
  return jsonb_build_object('kind','terminal','status',r.status);
 end if;
 if r.status='running' then
  select * into j from public.workflow_run_jobs where run_id=p_run for update;
  if found and j.lease_until is not null and j.lease_until>=now() then
   return jsonb_build_object('kind','running');
  end if;
  perform workflow_private.seal_run(p_run,'WORKER_LOST','closed','infrastructure','unknown',false);
  return jsonb_build_object('kind','sealed');
 end if;
 if r.thread_id is null then return jsonb_build_object('kind','unsupported','status',r.status); end if;
 if r.status='waiting' then
  select * into t from public.workflow_execution_threads where thread_id=r.thread_id for update;
  if not found then return jsonb_build_object('kind','unsupported','status',r.status); end if;
  if t.status='waiting' and t.wait_expires_at is not null and t.wait_expires_at<=now() then
   perform workflow_private.seal_run(p_run,'WAIT_EXPIRED','expired','policy','none',false);
   return jsonb_build_object('kind','expired');
  end if;
  return jsonb_build_object('kind','waiting','waitExpiresAt',t.wait_expires_at);
 end if;
 if r.status<>'queued' then return jsonb_build_object('kind','unsupported','status',r.status); end if;
 perform pg_advisory_xact_lock(hashtextextended(r.owner_user_id::text,0));
 select * into r from public.workflow_live_runs where run_id=p_run for update;
 if r.status in ('success','failed','cancelled','continued') then
  return jsonb_build_object('kind','terminal','status',r.status);
 end if;
 if r.status<>'queued' then return jsonb_build_object('kind','running'); end if;
 if (select count(*) from public.workflow_live_runs where owner_user_id=r.owner_user_id and status='running')>=2 then
  return jsonb_build_object('kind','busy');
 end if;
 select * into t from public.workflow_execution_threads where thread_id=r.thread_id for update;
 if not found then raise exception 'THREAD_MISSING'; end if;
 update public.workflow_run_jobs set fencing_token=fencing_token+1,worker_id=p_worker,
  lease_until=now()+interval '30 seconds',heartbeat_at=now()
  where run_id=r.run_id returning * into j;
 update public.workflow_live_runs set status='running',started_at=clock_timestamp(),
  budget_updated_at=clock_timestamp(),raw_state=t.state,state_version=t.state_version
  where run_id=r.run_id returning * into r;
 perform workflow_private.event(r.run_id,'run.started',jsonb_build_object('threadId',t.thread_id));
 return jsonb_build_object('kind','claimed','run',to_jsonb(r)-'launch_context',
  'thread',to_jsonb(t)-'launch_context'-'snapshot',
  'definition',(select definition from public.workflow_revisions
   where owner_user_id=r.owner_user_id and workflow_id=r.workflow_id and revision=r.revision),
  'token',j.fencing_token);
end $$;

create or replace function workflow_private.expire_wait(p_run uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.workflow_live_runs; t public.workflow_execution_threads; begin
 select * into r from public.workflow_live_runs where run_id=p_run for update;
 if not found then return jsonb_build_object('expired',false,'status','missing'); end if;
 if r.status<>'waiting' or r.thread_id is null then
  return jsonb_build_object('expired',false,'status',r.status);
 end if;
 select * into t from public.workflow_execution_threads where thread_id=r.thread_id for update;
 if t.status='waiting' and t.wait_expires_at is not null and t.wait_expires_at<=now() then
  perform workflow_private.seal_run(p_run,'WAIT_EXPIRED','expired','policy','none',false);
  return jsonb_build_object('expired',true);
 end if;
 return jsonb_build_object('expired',false,'status',t.status,'waitExpiresAt',t.wait_expires_at);
end $$;

revoke all on function workflow_private.claim_run(uuid,text),workflow_private.expire_wait(uuid) from public,anon,authenticated;
grant execute on function workflow_private.claim_run(uuid,text),workflow_private.expire_wait(uuid) to workflow_worker;

commit;

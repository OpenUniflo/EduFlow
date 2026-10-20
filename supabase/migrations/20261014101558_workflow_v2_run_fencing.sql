-- Keep launch metadata outside Worker and consume one queued item per lease.
create or replace function workflow_private.claim(p_worker text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare message record; r public.workflow_live_runs; j public.workflow_run_jobs; begin
 for message in select * from pgmq.read('workflow_v2',30,1) loop
  select * into r from public.workflow_live_runs where run_id=(message.message->>'runId')::uuid for update;
  if not found or r.status<>'queued' then perform pgmq.delete('workflow_v2',message.msg_id); continue; end if;
  perform pg_advisory_xact_lock(hashtextextended(r.owner_user_id::text,0));
  if (select count(*) from public.workflow_live_runs where owner_user_id=r.owner_user_id and status='running')>=2 then continue; end if;
  update public.workflow_run_jobs set fencing_token=fencing_token+1,worker_id=p_worker,lease_until=now()+interval '30 seconds',heartbeat_at=now() where run_id=r.run_id returning * into j;
  update public.workflow_live_runs set status='running',started_at=now() where run_id=r.run_id;
  perform workflow_private.event(r.run_id,'run.started','{}');
  return jsonb_build_object('run',(to_jsonb(r)-'launch_context')||jsonb_build_object('status','running'),'definition',(select definition from public.workflow_revisions where owner_user_id=r.owner_user_id and workflow_id=r.workflow_id and revision=r.revision),'token',j.fencing_token,'queueMessageId',message.msg_id);
 end loop;
 return null;
end $$;

create or replace function workflow_private.emit(p_run uuid,p_token bigint,p_type text,p_payload jsonb,p_step uuid default null,p_node text default null)
returns void language plpgsql security definer set search_path='' as $$ begin
 if (workflow_private.check_lease(p_run,p_token)->>'cancelled')::boolean and p_type='tool.started' then raise exception 'RUN_CANCELLED'; end if;
 if p_type not in ('tool.started','tool.completed','tool.failed','tool.skipped','step.failed') then raise exception 'INVALID_EVENT_TYPE'; end if;
 perform workflow_private.event(p_run,p_type,p_payload,p_step,p_node);
 if p_type='step.failed' then update public.workflow_run_steps set status='failed',error=p_payload->'error',finished_at=now() where run_id=p_run and step_id=p_step and attempt=1; end if;
end $$;

create or replace function workflow_private.watchdog()
returns integer language plpgsql security definer set search_path='' as $$
declare r record; err text; n integer:=0; begin
 for r in select l.*,j.lease_until from public.workflow_live_runs l join public.workflow_run_jobs j using(run_id) where l.status in ('queued','running') for update of l skip locked loop
  err:=null;
  if r.status='queued' and r.created_at<now()-interval '60 seconds' then err:='QUEUE_TIMEOUT';
  elsif r.status='running' and r.lease_until<now() then err:='WORKER_LOST';
  elsif r.status='running' and r.started_at+(select ((definition->'policy'->>'timeoutMs')::integer::text||' milliseconds')::interval from public.workflow_revisions where owner_user_id=r.owner_user_id and workflow_id=r.workflow_id and revision=r.revision)<now() then err:='RUN_TIMEOUT'; end if;
  if r.cancel_requested_at is not null or err is not null then
   update public.workflow_live_runs set status=case when r.cancel_requested_at is not null then 'cancelled' else 'failed' end,finished_at=now(),error=case when err is null then null else jsonb_build_object('code',err,'category','infrastructure','message',err,'retryable',false,'effect','unknown') end where run_id=r.run_id;
   perform workflow_private.event(r.run_id,case when r.cancel_requested_at is not null then 'run.cancelled' else 'run.failed' end,jsonb_build_object('error',err));
   update public.workflow_run_steps set status='failed',finished_at=now(),error=jsonb_build_object('code',coalesce(err,'RUN_CANCELLED'),'category','infrastructure','message',coalesce(err,'RUN_CANCELLED'),'retryable',false,'effect','unknown') where run_id=r.run_id and status='running';
   perform pgmq.delete('workflow_v2',(select queue_msg_id from public.workflow_run_jobs where run_id=r.run_id)); perform public.workflow_v2_prune(r.owner_user_id,r.workflow_id); n:=n+1;
  end if;
 end loop;
 return n;
end $$;

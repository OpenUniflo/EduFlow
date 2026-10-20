-- Return capacity-blocked work to PGMQ after a bounded delay instead of holding a 30s execution lease.
create or replace function workflow_private.claim(p_worker text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare message record; r public.workflow_live_runs; j public.workflow_run_jobs; begin
 for message in select * from pgmq.read('workflow_v2',30,1) loop
  select * into r from public.workflow_live_runs where run_id=(message.message->>'runId')::uuid for update;
  if not found or r.status<>'queued' then perform pgmq.delete('workflow_v2',message.msg_id); continue; end if;
  perform pg_advisory_xact_lock(hashtextextended(r.owner_user_id::text,0));
  if (select count(*) from public.workflow_live_runs where owner_user_id=r.owner_user_id and status='running')>=2 then perform pgmq.set_vt('workflow_v2',message.msg_id,1); continue; end if;
  update public.workflow_run_jobs set fencing_token=fencing_token+1,worker_id=p_worker,lease_until=now()+interval '30 seconds',heartbeat_at=now() where run_id=r.run_id returning * into j;
  update public.workflow_live_runs set status='running',started_at=now() where run_id=r.run_id;
  perform workflow_private.event(r.run_id,'run.started','{}');
  return jsonb_build_object('run',(to_jsonb(r)-'launch_context')||jsonb_build_object('status','running'),'definition',(select definition from public.workflow_revisions where owner_user_id=r.owner_user_id and workflow_id=r.workflow_id and revision=r.revision),'token',j.fencing_token,'queueMessageId',message.msg_id);
 end loop;
 return null;
end $$;

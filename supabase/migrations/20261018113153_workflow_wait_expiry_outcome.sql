begin;
-- Human-wait expiry itself cannot introduce a new external side effect.
create or replace function workflow_private.watchdog() returns integer language plpgsql security definer set search_path='' as $$
declare t public.workflow_execution_threads; r public.workflow_live_runs; j public.workflow_run_jobs; err text; n integer:=0; max_ms integer; begin
 for t in select * from public.workflow_execution_threads where status in ('active','waiting') order by thread_id for update skip locked loop
  select * into r from public.workflow_live_runs where run_id=t.current_run_id for update;
  err:=null;
  if t.status='waiting' and t.wait_expires_at<=now() then err:='WAIT_EXPIRED';
  elsif t.status='active' and r.status='queued' and r.created_at<now()-interval '60 seconds' then err:='QUEUE_TIMEOUT';
  elsif t.status='active' and r.status='running' then
   select * into j from public.workflow_run_jobs where run_id=r.run_id;
   select (definition->'policy'->>'timeoutMs')::integer into max_ms from public.workflow_revisions where owner_user_id=t.owner_user_id and workflow_id=t.workflow_id and revision=t.revision;
   if j.lease_until<now() then err:='WORKER_LOST';
   elsif t.compute_ms+extract(epoch from(clock_timestamp()-coalesce(r.budget_updated_at,r.started_at)))*1000>max_ms then err:='RUN_TIMEOUT'; end if;
  end if;
  if r.cancel_requested_at is not null or err is not null then
   perform workflow_private.accrue_compute(r.run_id);
   update public.workflow_live_runs set status=case when r.cancel_requested_at is not null then 'cancelled' else 'failed' end,finished_at=now(),error=jsonb_build_object('code',coalesce(err,'RUN_CANCELLED'),'category',case when err='WAIT_EXPIRED' then 'policy' else 'infrastructure' end,'message',coalesce(err,'RUN_CANCELLED'),'effect',case when err='WAIT_EXPIRED' then 'none' else 'unknown' end) where run_id=r.run_id;
   update public.workflow_execution_threads set status=case when err='WAIT_EXPIRED' then 'expired' else 'closed' end,last_error=jsonb_build_object('code',coalesce(err,'RUN_CANCELLED')),interrupts='[]',updated_at=now() where thread_id=t.thread_id;
   if r.run_id is not null then
    perform workflow_private.event(r.run_id,case when r.cancel_requested_at is not null then 'run.cancelled' else 'run.failed' end,jsonb_build_object('error',coalesce(err,'RUN_CANCELLED')));
    update public.workflow_run_steps set status='failed',finished_at=now(),error=jsonb_build_object('code',coalesce(err,'RUN_CANCELLED')) where run_id=r.run_id and status='running';
    perform pgmq.delete('workflow_v2',(select queue_msg_id from public.workflow_run_jobs where run_id=r.run_id));
    perform public.workflow_v2_prune(r.owner_user_id,r.workflow_id);
   end if;
   n:=n+1;
  end if;
 end loop;
 delete from public.workflow_execution_threads where status in ('closed','expired') and updated_at<now()-interval '7 days';
 return n;
end $$;
commit;

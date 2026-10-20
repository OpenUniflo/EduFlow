begin;
CREATE OR REPLACE FUNCTION public.workflow_v2_cancel_thread(p_owner uuid, p_thread uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare t public.workflow_execution_threads; begin
 select * into t from public.workflow_execution_threads where thread_id=p_thread and owner_user_id=p_owner for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if t.status in ('active','waiting') and exists(select from public.workflow_live_runs where run_id=t.current_run_id) then perform public.workflow_v2_cancel(p_owner,t.current_run_id);
 else update public.workflow_execution_threads set status='closed',interrupts='[]',last_error=jsonb_build_object('code','RUN_CANCELLED'),updated_at=now() where thread_id=p_thread; end if;
end $function$

;
CREATE OR REPLACE FUNCTION workflow_private.finish(p_run uuid, p_token bigint, p_status text, p_output jsonb DEFAULT NULL::jsonb, p_error jsonb DEFAULT NULL::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.workflow_live_runs; begin
 perform 1 from public.workflow_execution_threads e join public.workflow_live_runs l using(thread_id) where l.run_id=p_run for update of e;
 select * into r from public.workflow_live_runs where run_id=p_run for update;
 if r.status is distinct from 'running' or not exists(select from public.workflow_run_jobs where run_id=p_run and fencing_token=p_token and lease_until>=now()) then raise exception 'LEASE_LOST'; end if;
 perform workflow_private.accrue_compute(p_run);
 if p_status not in ('success','failed','cancelled') then raise exception 'INVALID_STATUS'; end if;
 if p_status='success' and exists(select from public.workflow_execution_threads t join public.workflow_revisions d on d.owner_user_id=t.owner_user_id and d.workflow_id=t.workflow_id and d.revision=t.revision where t.thread_id=r.thread_id and t.compute_ms>(d.definition->'policy'->>'timeoutMs')::integer) then
  p_status:='failed';p_output:=null;p_error:=jsonb_build_object('code','RUN_TIMEOUT','category','timeout','message','Thread compute budget exhausted','effect','unknown');
 end if;
 if r.cancel_requested_at is not null then p_status:='cancelled'; p_output:=null; p_error:=jsonb_build_object('code','RUN_CANCELLED'); end if;
 update public.workflow_live_runs set status=p_status,output=p_output,error=p_error,finished_at=now() where run_id=p_run;
 update public.workflow_execution_threads set status='closed',last_error=p_error,interrupts='[]',updated_at=now() where thread_id=r.thread_id;
 perform workflow_private.event(p_run,case p_status when 'success' then 'run.completed' when 'failed' then 'run.failed' else 'run.cancelled' end,jsonb_strip_nulls(jsonb_build_object('output',p_output,'error',p_error)));
 perform pgmq.delete('workflow_v2',(select queue_msg_id from public.workflow_run_jobs where run_id=p_run));
 perform public.workflow_v2_prune(r.owner_user_id,r.workflow_id);
 return true;
end $function$

;

update public.workflow_execution_threads t set status='closed',last_error=r.error,updated_at=coalesce(r.finished_at,now()) from public.workflow_live_runs r where t.current_run_id=r.run_id and t.status='active' and r.status in ('success','failed','cancelled');
commit;

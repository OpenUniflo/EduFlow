begin;
-- Server-only invocation of the existing deletion RPC. No browser role gains access.
grant usage on schema workflow_checkpoints to service_role;
grant select,delete on workflow_checkpoints.checkpoints,workflow_checkpoints.checkpoint_blobs,workflow_checkpoints.checkpoint_writes to service_role;
CREATE OR REPLACE FUNCTION public.workflow_v2_delete(p_owner uuid, p_workflow text, p_base integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare h public.workflow_v2_definitions; j record; runs integer; versions integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 if exists(select 1 from public.workflow_execution_threads where owner_user_id=p_owner and workflow_id=p_workflow and status in ('active','waiting')) then raise exception 'WORKFLOW_BUSY'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_workflow,0));
 select * into h from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=p_workflow for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if h.current_revision<>p_base then raise exception 'REVISION_CONFLICT'; end if;
 for j in select jobs.queue_msg_id from public.workflow_run_jobs jobs join public.workflow_live_runs r using(run_id) where r.owner_user_id=p_owner and r.workflow_id=p_workflow loop
  perform pgmq.delete('workflow_v2',j.queue_msg_id);
 end loop;
 delete from public.workflow_idempotency where owner_user_id=p_owner and workflow_id=p_workflow;
 delete from public.workflow_run_tombstones where owner_user_id=p_owner and workflow_id=p_workflow;
 delete from public.workflow_live_runs where owner_user_id=p_owner and workflow_id=p_workflow;
 get diagnostics runs=row_count;
 -- Official saver tables have no FK to the product Thread. Delete by its exact identity
 -- before revisions cascade their Threads; the RPC owner/workflow lock scopes this transaction.
 delete from workflow_checkpoints.checkpoint_writes where thread_id in (select thread_id::text from public.workflow_execution_threads where owner_user_id=p_owner and workflow_id=p_workflow);
 delete from workflow_checkpoints.checkpoint_blobs where thread_id in (select thread_id::text from public.workflow_execution_threads where owner_user_id=p_owner and workflow_id=p_workflow);
 delete from workflow_checkpoints.checkpoints where thread_id in (select thread_id::text from public.workflow_execution_threads where owner_user_id=p_owner and workflow_id=p_workflow);
 delete from public.workflow_editor_documents where owner_user_id=p_owner and workflow_id=p_workflow;
 delete from public.workflow_revisions where owner_user_id=p_owner and workflow_id=p_workflow;
 get diagnostics versions=row_count;
 delete from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=p_workflow;
 return jsonb_build_object('ok',true,'deletedRuns',runs,'deletedRevisions',versions);
end $function$

;

revoke all on function public.workflow_v2_delete(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.workflow_v2_delete(uuid,text,integer) to service_role;
commit;

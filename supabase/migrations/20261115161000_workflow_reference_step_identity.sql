-- Phase 3 step identity adds the executing Workflow revision and the stable
-- reference call path. Keep the existing task/checkpoint fields and reject any
-- other keys. This is metadata only; it contains no credentials or State.
CREATE OR REPLACE FUNCTION workflow_private.step_start(
  p_run uuid,p_token bigint,p_step uuid,p_node text,p_invocation integer,
  p_input jsonb,p_version integer,p_execution jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
begin
 if p_execution is null or jsonb_typeof(p_execution)<>'object'
   or not (p_execution ?& array['taskId','namespace','checkpointId','attempt'])
   or (p_execution - array['taskId','namespace','checkpointId','attempt','graphPath','parentTaskId','graphNamespace','workflowId','revision','workflowPath']) <> '{}'::jsonb
   or jsonb_typeof(p_execution->'taskId')<>'string'
   or length(coalesce(p_execution->>'taskId',''))=0
   or jsonb_typeof(p_execution->'namespace')<>'string'
   or jsonb_typeof(p_execution->'checkpointId')<>'string'
   or jsonb_typeof(p_execution->'attempt')<>'number'
   or (p_execution->>'attempt')::numeric < 1
   or (p_execution->>'attempt')::numeric <> trunc((p_execution->>'attempt')::numeric)
   or jsonb_typeof(coalesce(p_execution->'workflowId','null')) not in ('string','null')
   or jsonb_typeof(coalesce(p_execution->'revision','null')) not in ('number','null')
   or (jsonb_typeof(coalesce(p_execution->'revision','null'))='number' and (
        (p_execution->>'revision')::numeric < 1
        or (p_execution->>'revision')::numeric <> trunc((p_execution->>'revision')::numeric)))
   or (p_execution ? 'workflowId' and length(coalesce(p_execution->>'workflowId',''))=0)
   or (p_execution ? 'workflowPath' and jsonb_typeof(p_execution->'workflowPath')<>'array')
 then raise exception 'INVALID_EXECUTION_IDENTITY'; end if;
 perform workflow_private.step_start(p_run,p_token,p_step,p_node,p_invocation,p_input,p_version);
 update public.workflow_run_steps set execution_identity=p_execution
 where run_id=p_run and step_id=p_step and attempt=1;
end $$;

revoke all on function workflow_private.step_start(uuid,bigint,uuid,text,integer,jsonb,integer,jsonb) from public,anon,authenticated;
grant execute on function workflow_private.step_start(uuid,bigint,uuid,text,integer,jsonb,integer,jsonb) to workflow_worker;

notify pgrst, 'reload schema';

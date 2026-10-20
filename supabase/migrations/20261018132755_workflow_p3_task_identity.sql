begin;
CREATE OR REPLACE FUNCTION workflow_private.step_start(p_run uuid, p_token bigint, p_step uuid, p_node text, p_invocation integer, p_input jsonb, p_version integer, p_execution jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if p_execution is null or jsonb_typeof(p_execution)<>'object'
   or not (p_execution ?& array['taskId','namespace','checkpointId','attempt'])
   or (p_execution - array['taskId','namespace','checkpointId','attempt','graphPath','parentTaskId']) <> '{}'::jsonb
   or jsonb_typeof(p_execution->'taskId')<>'string'
   or length(p_execution->>'taskId')=0
   or jsonb_typeof(p_execution->'namespace')<>'string'
   or jsonb_typeof(p_execution->'checkpointId')<>'string'
   or jsonb_typeof(p_execution->'attempt')<>'number'
   or (p_execution->>'attempt')::numeric < 1
   or (p_execution->>'attempt')::numeric <> trunc((p_execution->>'attempt')::numeric)
 then raise exception 'INVALID_EXECUTION_IDENTITY'; end if;
 perform workflow_private.step_start(p_run,p_token,p_step,p_node,p_invocation,p_input,p_version);
 update public.workflow_run_steps set execution_identity=p_execution
 where run_id=p_run and step_id=p_step and attempt=1;
end $function$;


commit;

CREATE OR REPLACE FUNCTION workflow_private.emit(p_run uuid, p_token bigint, p_type text, p_payload jsonb, p_step uuid DEFAULT NULL::uuid, p_node text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin
 if (workflow_private.check_lease(p_run,p_token)->>'cancelled')::boolean and p_type='tool.started' then raise exception 'RUN_CANCELLED'; end if;
 if p_type not in ('tool.started','tool.completed','tool.failed','tool.skipped','step.failed','node.attempt.started','node.attempt.completed','node.attempt.failed','node.handler.started','node.handler.completed','node.cache') then raise exception 'INVALID_EVENT_TYPE'; end if;
 if p_type='tool.started' then
  update public.workflow_execution_threads t set tool_calls=tool_calls+1
  from public.workflow_live_runs r join public.workflow_revisions d on d.owner_user_id=r.owner_user_id and d.workflow_id=r.workflow_id and d.revision=r.revision
  where r.run_id=p_run and t.thread_id=r.thread_id and t.tool_calls<(d.definition->'policy'->>'maxToolCalls')::integer;
  if not found then raise exception 'TOOL_BUDGET_EXCEEDED'; end if;
 end if;
 perform workflow_private.event(p_run,p_type,p_payload,p_step,p_node);
 if p_type='step.failed' then update public.workflow_run_steps set status='failed',error=p_payload->'error',finished_at=now() where run_id=p_run and step_id=p_step and attempt=1; end if;
end $function$

;

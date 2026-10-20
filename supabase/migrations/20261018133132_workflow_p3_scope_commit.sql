begin;
CREATE OR REPLACE FUNCTION workflow_private.commit_scope(p_run uuid, p_token bigint, p_checkpoint text, p_parent text, p_state jsonb, p_initialized boolean, p_digest text, p_namespace text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t uuid; prior text; receipt record; sid uuid; begin
 perform workflow_private.check_lease(p_run,p_token);
 select thread_id into t from public.workflow_live_runs where run_id=p_run;
 perform 1 from public.workflow_execution_threads where thread_id=t for update;
 select commit_digest into prior from workflow_private.scope_commits where thread_id=t and namespace=p_namespace and checkpoint_id=p_checkpoint;
 if found then
  if prior<>p_digest then raise exception 'CHECKPOINT_CONTENT_CONFLICT'; end if;
  return 0;
 end if;
 if not exists(select from workflow_checkpoints.checkpoints where thread_id=t::text and checkpoint_ns=p_namespace and checkpoint_id=p_checkpoint) then raise exception 'CHECKPOINT_NOT_DURABLE'; end if;
 for receipt in select * from workflow_private.task_receipts where thread_id=t and checkpoint_id=p_parent and execution_identity->>'graphNamespace'=p_namespace and committed_checkpoint_id is null order by invocation,task_id loop
  select step_id into sid from public.workflow_run_steps where run_id=p_run and execution_identity->>'taskId'=receipt.task_id limit 1;
  if sid is null then
   sid:=gen_random_uuid();
   insert into public.workflow_run_steps(run_id,step_id,node_id,invocation,status,input,output,state_version_before,state_version_after,usage,execution_identity)
   values(p_run,sid,receipt.node_id,receipt.invocation,'prepared',receipt.input,receipt.output,0,0,receipt.usage,receipt.execution_identity);
  end if;
  update public.workflow_run_steps set status='completed',finished_at=now() where run_id=p_run and step_id=sid;
  perform workflow_private.event(p_run,'step.completed',jsonb_build_object('output',receipt.output,'checkpointId',p_checkpoint,'execution',receipt.execution_identity,'reused',receipt.source_run_id<>p_run),sid,receipt.node_id);
  if receipt.patch<>'{}' then perform workflow_private.event(p_run,'state.updated',jsonb_build_object('patch',receipt.patch,'scopeState',p_state,'execution',receipt.execution_identity),sid,receipt.node_id); end if;
  update workflow_private.task_receipts set committed_checkpoint_id=p_checkpoint where thread_id=t and task_id=receipt.task_id;
 end loop;
 insert into workflow_private.scope_commits values(t,p_namespace,p_checkpoint,p_parent,p_digest);
 return 0;
end $function$;


CREATE OR REPLACE FUNCTION workflow_private.step_start(p_run uuid, p_token bigint, p_step uuid, p_node text, p_invocation integer, p_input jsonb, p_version integer, p_execution jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if p_execution is null or jsonb_typeof(p_execution)<>'object'
   or not (p_execution ?& array['taskId','namespace','checkpointId','attempt'])
   or (p_execution - array['taskId','namespace','checkpointId','attempt','graphPath','parentTaskId','graphNamespace']) <> '{}'::jsonb
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


create function workflow_private.complete_stateless_task(p_run uuid,p_token bigint,p_step uuid)
returns void language plpgsql security definer set search_path='' as $$
declare receipt workflow_private.task_receipts; begin
 perform workflow_private.check_lease(p_run,p_token);
 select x.* into receipt from workflow_private.task_receipts x join public.workflow_live_runs r using(thread_id) where r.run_id=p_run and x.source_run_id=p_run and x.source_step_id=p_step for update of x;
 if not found then raise exception 'INVALID_STEP'; end if;
 update workflow_private.task_receipts set committed_checkpoint_id='stateless:'||receipt.checkpoint_id where thread_id=receipt.thread_id and task_id=receipt.task_id;
 update public.workflow_run_steps set status='completed',finished_at=now() where run_id=p_run and step_id=p_step;
 perform workflow_private.event(p_run,'step.completed',jsonb_build_object('output',receipt.output,'execution',receipt.execution_identity,'durability','parent-task-only'),p_step,receipt.node_id);
end $$;
revoke all on function workflow_private.complete_stateless_task(uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function workflow_private.complete_stateless_task(uuid,bigint,uuid) to workflow_worker;
commit;

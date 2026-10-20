begin;
create function workflow_private.commit_transferred_children(p_run uuid,p_token bigint,p_task text,p_checkpoint text)
returns void language plpgsql security definer set search_path='' as $$
declare t uuid; receipt record; sid uuid; begin
 perform workflow_private.check_lease(p_run,p_token);
 select thread_id into t from public.workflow_live_runs where run_id=p_run;
 for receipt in select * from workflow_private.task_receipts where thread_id=t and execution_identity->>'parentTaskId'=p_task and committed_checkpoint_id is null order by invocation,task_id loop
  perform workflow_private.commit_transferred_children(p_run,p_token,receipt.task_id,p_checkpoint);
  select step_id into sid from public.workflow_run_steps where run_id=p_run and execution_identity->>'taskId'=receipt.task_id limit 1;
  if sid is null then
   sid:=gen_random_uuid();
   insert into public.workflow_run_steps(run_id,step_id,node_id,invocation,status,input,output,state_version_before,state_version_after,usage,execution_identity)
   values(p_run,sid,receipt.node_id,receipt.invocation,'prepared',receipt.input,receipt.output,0,0,receipt.usage,receipt.execution_identity);
  end if;
  update public.workflow_run_steps set status='completed',finished_at=now() where run_id=p_run and step_id=sid;
  update workflow_private.task_receipts set committed_checkpoint_id=p_checkpoint where thread_id=t and task_id=receipt.task_id;
  perform workflow_private.event(p_run,'step.completed',jsonb_build_object('output',receipt.output,'checkpointId',p_checkpoint,'execution',receipt.execution_identity,'durability','parent-transfer','reused',receipt.source_run_id<>p_run),sid,receipt.node_id);
 end loop;
 update public.workflow_run_steps set status='cancelled',finished_at=now(),error=jsonb_build_object('code','PARENT_CONTROL_TRANSFER','message','Parent control transfer ended this child invocation') where run_id=p_run and execution_identity->>'parentTaskId'=p_task and status='running';
end $$;
revoke all on function workflow_private.commit_transferred_children(uuid,bigint,text,text) from public,anon,authenticated,workflow_worker;

CREATE OR REPLACE FUNCTION workflow_private.commit_superstep(p_run uuid, p_token bigint, p_checkpoint text, p_parent text, p_state jsonb, p_initialized boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.workflow_live_runs; t public.workflow_execution_threads; receipt record; sid uuid; version integer; changed jsonb; changes jsonb; begin
 perform workflow_private.check_lease(p_run,p_token);
 select * into r from public.workflow_live_runs where run_id=p_run for update;
 select * into t from public.workflow_execution_threads where thread_id=r.thread_id for update;
 select state_version into version from workflow_private.superstep_commits where thread_id=t.thread_id and checkpoint_id=p_checkpoint;
 if found then return version; end if;
 if t.checkpoint_id is distinct from p_parent then raise exception 'CHECKPOINT_PARENT_CONFLICT'; end if;
 if not exists(select from workflow_checkpoints.checkpoints where thread_id=t.thread_id::text and checkpoint_ns='' and checkpoint_id=p_checkpoint) then raise exception 'CHECKPOINT_NOT_DURABLE'; end if;
 select coalesce(jsonb_object_agg(key,p_state->key),'{}') into changed from (
  select distinct key from workflow_private.task_receipts x cross join lateral jsonb_object_keys(x.patch) key
  where x.thread_id=t.thread_id and x.checkpoint_id=p_parent and x.committed_checkpoint_id is null
 ) fields;
 version:=t.state_version+case when changed='{}' then 0 else 1 end;
 update public.workflow_execution_threads set checkpoint_id=p_checkpoint,state=case when p_initialized then p_state else state end,state_version=version,updated_at=now() where thread_id=t.thread_id;
 if p_initialized then update public.workflow_live_runs set raw_state=p_state,state_version=version where run_id=p_run; end if;
 if changed<>'{}' then
  select coalesce(jsonb_agg(jsonb_build_object('field',key,'before',t.state->key,'after',p_state->key)),'[]') into changes from jsonb_each(changed);
  perform workflow_private.event(p_run,'state.updated',jsonb_build_object('patch',changed,'changes',changes,'checkpointId',p_checkpoint),null,null,version);
 end if;
 for receipt in select * from workflow_private.task_receipts where thread_id=t.thread_id and checkpoint_id=p_parent and committed_checkpoint_id is null order by invocation,task_id loop
  select step_id into sid from public.workflow_run_steps where run_id=p_run and execution_identity->>'taskId'=receipt.task_id limit 1;
  if sid is null then
   sid:=gen_random_uuid();
   insert into public.workflow_run_steps(run_id,step_id,node_id,invocation,status,input,output,state_version_before,state_version_after,usage,execution_identity)
   values(p_run,sid,receipt.node_id,receipt.invocation,'prepared',receipt.input,receipt.output,t.state_version,t.state_version,receipt.usage,receipt.execution_identity);
  end if;
  update public.workflow_run_steps set status='completed',state_version_after=version,finished_at=now() where run_id=p_run and step_id=sid;
  perform workflow_private.event(p_run,'step.completed',jsonb_build_object('output',receipt.output,'checkpointId',p_checkpoint,'reused',receipt.source_run_id<>p_run),sid,receipt.node_id,version);
  perform workflow_private.commit_transferred_children(p_run,p_token,receipt.task_id,p_checkpoint);
  update workflow_private.task_receipts set committed_checkpoint_id=p_checkpoint where thread_id=t.thread_id and task_id=receipt.task_id;
 end loop;
 insert into workflow_private.superstep_commits values(t.thread_id,p_checkpoint,version);
 return version;
end $function$;


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
  perform workflow_private.commit_transferred_children(p_run,p_token,receipt.task_id,p_checkpoint);
  update workflow_private.task_receipts set committed_checkpoint_id=p_checkpoint where thread_id=t and task_id=receipt.task_id;
 end loop;
 insert into workflow_private.scope_commits values(t,p_namespace,p_checkpoint,p_parent,p_digest);
 return 0;
end $function$;


commit;
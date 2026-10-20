begin;
drop function public.workflow_v2_resume(uuid,uuid,text,jsonb,text,text);
CREATE OR REPLACE FUNCTION public.workflow_v2_resume(p_owner uuid, p_thread uuid, p_checkpoint text, p_responses jsonb, p_hash text, p_key text, p_expected_run uuid default null)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare t public.workflow_execution_threads; prior public.workflow_idempotency; run uuid; msg bigint; s jsonb; begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into prior from public.workflow_idempotency where owner_user_id=p_owner and key=p_key and expires_at>now();
 if found then
  if prior.request_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('runId',prior.run_id,'revision',prior.revision,'status',coalesce((select status from public.workflow_live_runs where run_id=prior.run_id),'expired'),'historyExpired',not exists(select from public.workflow_live_runs where run_id=prior.run_id));
 end if;
 select * into t from public.workflow_execution_threads where thread_id=p_thread and owner_user_id=p_owner for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if p_expected_run is not null and t.current_run_id<>p_expected_run then raise exception 'THREAD_STATE_CONFLICT'; end if;
 if t.checkpoint_id is distinct from p_checkpoint or t.status not in ('waiting','closed') then raise exception 'THREAD_STATE_CONFLICT'; end if;
 if t.status='closed' and (t.last_error is null or t.last_error->>'code' in ('RUN_CANCELLED','WAIT_EXPIRED')) then raise exception 'THREAD_NOT_RESUMABLE'; end if;
 if t.status='waiting' and t.wait_expires_at<=now() then raise exception 'WAIT_EXPIRED'; end if;
 if not exists(select from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=t.workflow_id and not archived) then raise exception 'WORKFLOW_ARCHIVED'; end if;
 if (select count(*) from public.workflow_live_runs where owner_user_id=p_owner and status='queued')>=5 then raise exception 'RUN_QUOTA_EXCEEDED'; end if;
 if jsonb_typeof(p_responses)<>'object' or (t.status='waiting' and p_responses='{}'::jsonb) or exists(select from jsonb_object_keys(p_responses) key where not exists(select from jsonb_array_elements(t.interrupts) x where x->>'id'=key)) then raise exception 'INTERRUPT_ID_CONFLICT'; end if;
 s:=t.snapshot;
 insert into public.workflow_live_runs(owner_user_id,workflow_id,revision,status,definition_hash,semantic_hash,compile_fingerprint,environment_ref,environment_revision,input,registry_snapshot,launch_context,thread_id,resume_of_run_id,resume_values)
 values(p_owner,t.workflow_id,t.revision,'queued',s->>'definition_hash',s->>'semantic_hash',s->>'compile_fingerprint',s->>'environment_ref',s->>'environment_revision',s->'input',s->'registry_snapshot',t.launch_context,t.thread_id,t.current_run_id,p_responses) returning run_id into run;
 update public.workflow_live_runs set status='continued',continuation_run_id=run,finished_at=now() where run_id=t.current_run_id and status='waiting';
 msg:=pgmq.send('workflow_v2',jsonb_build_object('runId',run));
 insert into public.workflow_run_jobs(run_id,queue_msg_id) values(run,msg);
 insert into public.workflow_idempotency(owner_user_id,key,request_hash,run_id,workflow_id,revision) values(p_owner,p_key,p_hash,run,t.workflow_id,t.revision)
 on conflict(owner_user_id,key) do update set request_hash=p_hash,run_id=run,expires_at=now()+interval '24 hours';
 update public.workflow_execution_threads set status='active',current_run_id=run,interrupts='[]',last_error=null,updated_at=now() where thread_id=t.thread_id;
 perform workflow_private.event(run,'run.queued',jsonb_build_object('threadId',t.thread_id,'resumeOfRunId',t.current_run_id));
 perform public.workflow_v2_prune(p_owner,t.workflow_id);
 return jsonb_build_object('runId',run,'revision',t.revision,'status','queued','eventsCursor',0);
end $function$;


CREATE OR REPLACE FUNCTION workflow_private.pause_run(p_run uuid, p_token bigint, p_interrupts jsonb, p_wait_ms integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.workflow_live_runs; t public.workflow_execution_threads; begin
 perform workflow_private.check_lease(p_run,p_token);
 perform workflow_private.accrue_compute(p_run);
 select * into r from public.workflow_live_runs where run_id=p_run;
 select * into t from public.workflow_execution_threads where thread_id=r.thread_id;
 if t.checkpoint_id is null or jsonb_typeof(p_interrupts)<>'array' or jsonb_array_length(p_interrupts)<1 then raise exception 'CHECKPOINT_NOT_DURABLE'; end if;
 if not coalesce((p_interrupts->0->>'breakpoint')::boolean,false) and not exists(select from workflow_checkpoints.checkpoint_writes where thread_id=t.thread_id::text and channel='__interrupt__') then raise exception 'INTERRUPT_NOT_DURABLE'; end if;
 if p_wait_ms<1000 or p_wait_ms>604800000 then raise exception 'INVALID_WAIT_TIMEOUT'; end if;
 update public.workflow_execution_threads set status='waiting',interrupts=p_interrupts,wait_expires_at=least(coalesce(t.wait_expires_at,'infinity'::timestamptz),now()+(p_wait_ms::text||' milliseconds')::interval),updated_at=now() where thread_id=t.thread_id;
 update public.workflow_live_runs set status='waiting' where run_id=p_run;
 perform workflow_private.event(p_run,'run.waiting',jsonb_build_object('threadId',t.thread_id,'interrupts',p_interrupts,'checkpointId',t.checkpoint_id));
 perform pgmq.delete('workflow_v2',(select queue_msg_id from public.workflow_run_jobs where run_id=p_run));
end $function$;


create table workflow_private.scope_commits(
 thread_id uuid not null references public.workflow_execution_threads on delete cascade,
 namespace text not null, checkpoint_id text not null, parent_id text, commit_digest text not null,
 primary key(thread_id,namespace,checkpoint_id));
alter table workflow_private.scope_commits enable row level security;
revoke all on workflow_private.scope_commits from public,anon,authenticated;
create function workflow_private.commit_scope(p_run uuid,p_token bigint,p_checkpoint text,p_parent text,p_state jsonb,p_initialized boolean,p_digest text,p_namespace text)
returns integer language plpgsql security definer set search_path='' as $$
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
 for receipt in select * from workflow_private.task_receipts where thread_id=t and checkpoint_id=p_parent and execution_identity->>'namespace'=p_namespace and committed_checkpoint_id is null order by invocation,task_id loop
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
end $$;
create function workflow_private.scope_patches(p_run uuid,p_token bigint,p_parent_task text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform workflow_private.check_lease(p_run,p_token);
 return (select coalesce(jsonb_agg(x.patch order by x.invocation),'[]') from workflow_private.task_receipts x join public.workflow_live_runs r using(thread_id) where r.run_id=p_run and x.execution_identity->>'parentTaskId'=p_parent_task and x.committed_checkpoint_id is not null);
end $$;
revoke all on function workflow_private.commit_scope(uuid,bigint,text,text,jsonb,boolean,text,text),workflow_private.scope_patches(uuid,bigint,text) from public,anon,authenticated;
grant execute on function workflow_private.commit_scope(uuid,bigint,text,text,jsonb,boolean,text,text),workflow_private.scope_patches(uuid,bigint,text) to workflow_worker;

revoke all on function public.workflow_v2_resume(uuid,uuid,text,jsonb,text,text,uuid) from public,anon,authenticated;
grant execute on function public.workflow_v2_resume(uuid,uuid,text,jsonb,text,text,uuid) to service_role;
commit;
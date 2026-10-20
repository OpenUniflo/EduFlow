begin;
-- Thread snapshots contain internal registry details; all access goes through API projection.
revoke select on public.workflow_execution_threads from authenticated;
alter table public.workflow_execution_threads add column last_error jsonb;
alter table public.workflow_live_runs drop constraint workflow_live_runs_status_check;
alter table public.workflow_live_runs add constraint workflow_live_runs_status_check check(status in ('queued','running','waiting','continued','success','failed','cancelled'));
create table workflow_private.task_journal (
 thread_id uuid not null references public.workflow_execution_threads(thread_id) on delete cascade,
 task_id text not null,node_id text not null,input jsonb not null,effect text not null check(effect in ('none','read','write')),
 status text not null default 'started',primary key(thread_id,task_id)
);
alter table workflow_private.task_journal enable row level security;
revoke all on workflow_private.task_journal from public,anon,authenticated;

create function workflow_private.begin_task(p_run uuid,p_token bigint,p_step uuid,p_node text,p_input jsonb,p_version integer,p_execution jsonb,p_effect text)
returns integer language plpgsql security definer set search_path='' as $$
declare t public.workflow_execution_threads; prior workflow_private.task_journal; max_nodes integer; n integer; begin
 perform workflow_private.check_lease(p_run,p_token);
 select e.* into t from public.workflow_execution_threads e join public.workflow_live_runs r using(thread_id) where r.run_id=p_run for update of e;
 if t.state_version<>p_version then raise exception 'STATE_VERSION_CONFLICT'; end if;
 if p_effect not in ('none','read','write') then raise exception 'INVALID_EFFECT'; end if;
 select * into prior from workflow_private.task_journal where thread_id=t.thread_id and task_id=p_execution->>'taskId';
 if found then
  if prior.node_id<>p_node or prior.input<>p_input then raise exception 'TASK_RESULT_CONFLICT'; end if;
  if prior.effect='write' and not exists(select from workflow_private.task_receipts where thread_id=t.thread_id and task_id=p_execution->>'taskId') then raise exception 'EXTERNAL_EFFECT_UNCERTAIN'; end if;
 end if;
 select (definition->'policy'->>'maxNodeExecutions')::integer into max_nodes from public.workflow_revisions where owner_user_id=t.owner_user_id and workflow_id=t.workflow_id and revision=t.revision;
 if t.node_executions>=max_nodes then raise exception 'NODE_BUDGET_EXCEEDED'; end if;
 n:=t.node_executions+1;
 update public.workflow_execution_threads set node_executions=n where thread_id=t.thread_id;
 insert into workflow_private.task_journal(thread_id,task_id,node_id,input,effect) values(t.thread_id,p_execution->>'taskId',p_node,p_input,p_effect) on conflict do nothing;
 perform workflow_private.step_start(p_run,p_token,p_step,p_node,n,p_input,p_version,p_execution);
 return n;
end $$;

create function workflow_private.accrue_compute(p_run uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.workflow_live_runs; begin
 select * into r from public.workflow_live_runs where run_id=p_run for update;
 if r.status='running' then
  update public.workflow_execution_threads set compute_ms=compute_ms+greatest(0,extract(epoch from (clock_timestamp()-coalesce(r.budget_updated_at,r.started_at,clock_timestamp())))*1000)::bigint where thread_id=r.thread_id;
  update public.workflow_live_runs set budget_updated_at=clock_timestamp() where run_id=p_run;
 end if;
end $$;

create or replace function workflow_private.check_lease(p_run uuid,p_token bigint,p_extend boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.workflow_live_runs; j public.workflow_run_jobs; t public.workflow_execution_threads; max_ms integer; begin
 select e.* into t from public.workflow_execution_threads e join public.workflow_live_runs l using(thread_id) where l.run_id=p_run for update of e;
 select * into r from public.workflow_live_runs where run_id=p_run for update;
 select * into j from public.workflow_run_jobs where run_id=p_run for update;
 if r.status is distinct from 'running' or j.fencing_token is distinct from p_token or j.lease_until<now() or t.current_run_id is distinct from p_run then raise exception 'LEASE_LOST'; end if;
 select (definition->'policy'->>'timeoutMs')::integer into max_ms from public.workflow_revisions where owner_user_id=r.owner_user_id and workflow_id=r.workflow_id and revision=r.revision;
 if t.compute_ms+greatest(0,extract(epoch from(clock_timestamp()-coalesce(r.budget_updated_at,r.started_at,clock_timestamp())))*1000)>max_ms then raise exception 'RUN_TIMEOUT'; end if;
 if p_extend then update public.workflow_run_jobs set lease_until=now()+interval '30 seconds',heartbeat_at=now() where run_id=p_run; end if;
 return jsonb_build_object('cancelled',r.cancel_requested_at is not null,'startedAt',r.started_at);
end $$;

create or replace function workflow_private.claim(p_worker text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare message record; r public.workflow_live_runs; j public.workflow_run_jobs; t public.workflow_execution_threads; begin
 for message in select * from pgmq.read('workflow_v2',30,1) loop
  select * into r from public.workflow_live_runs where run_id=(message.message->>'runId')::uuid;
  if not found or r.status<>'queued' then perform pgmq.delete('workflow_v2',message.msg_id); continue; end if;
  perform pg_advisory_xact_lock(hashtextextended(r.owner_user_id::text,0));
  select * into t from public.workflow_execution_threads where thread_id=r.thread_id for update;
  select l.* into r from public.workflow_live_runs l where l.run_id=r.run_id for update;
  if r.status<>'queued' then perform pgmq.delete('workflow_v2',message.msg_id); continue; end if;
  if (select count(*) from public.workflow_live_runs where owner_user_id=r.owner_user_id and status='running')>=2 then continue; end if;
  update public.workflow_run_jobs set fencing_token=fencing_token+1,worker_id=p_worker,lease_until=now()+interval '30 seconds',heartbeat_at=now() where run_id=r.run_id returning * into j;
  update public.workflow_live_runs set status='running',started_at=clock_timestamp(),budget_updated_at=clock_timestamp(),raw_state=t.state,state_version=t.state_version where run_id=r.run_id returning * into r;
  perform workflow_private.event(r.run_id,'run.started',jsonb_build_object('threadId',t.thread_id));
  return jsonb_build_object('run',to_jsonb(r)-'launch_context','thread',to_jsonb(t)-'launch_context'-'snapshot',
   'definition',(select definition from public.workflow_revisions where owner_user_id=r.owner_user_id and workflow_id=r.workflow_id and revision=r.revision),'token',j.fencing_token);
 end loop;
 return null;
end $$;

create function workflow_private.pause_run(p_run uuid,p_token bigint,p_interrupts jsonb,p_wait_ms integer)
returns void language plpgsql security definer set search_path='' as $$
declare r public.workflow_live_runs; t public.workflow_execution_threads; begin
 perform workflow_private.check_lease(p_run,p_token);
 perform workflow_private.accrue_compute(p_run);
 select * into r from public.workflow_live_runs where run_id=p_run;
 select * into t from public.workflow_execution_threads where thread_id=r.thread_id;
 if t.checkpoint_id is null or jsonb_typeof(p_interrupts)<>'array' or jsonb_array_length(p_interrupts)<1 then raise exception 'CHECKPOINT_NOT_DURABLE'; end if;
 if not exists(select from workflow_checkpoints.checkpoint_writes where thread_id=t.thread_id::text and checkpoint_id=t.checkpoint_id and channel='__interrupt__') then raise exception 'INTERRUPT_NOT_DURABLE'; end if;
 if p_wait_ms<1000 or p_wait_ms>604800000 then raise exception 'INVALID_WAIT_TIMEOUT'; end if;
 update public.workflow_execution_threads set status='waiting',interrupts=p_interrupts,wait_expires_at=now()+(p_wait_ms::text||' milliseconds')::interval,updated_at=now() where thread_id=t.thread_id;
 update public.workflow_live_runs set status='waiting' where run_id=p_run;
 perform workflow_private.event(p_run,'run.waiting',jsonb_build_object('threadId',t.thread_id,'interrupts',p_interrupts,'checkpointId',t.checkpoint_id));
 perform pgmq.delete('workflow_v2',(select queue_msg_id from public.workflow_run_jobs where run_id=p_run));
end $$;

create function public.workflow_v2_resume(p_owner uuid,p_thread uuid,p_checkpoint text,p_responses jsonb,p_hash text,p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.workflow_execution_threads; prior public.workflow_idempotency; run uuid; msg bigint; s jsonb; begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into prior from public.workflow_idempotency where owner_user_id=p_owner and key=p_key and expires_at>now();
 if found then
  if prior.request_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('runId',prior.run_id,'revision',prior.revision,'status',coalesce((select status from public.workflow_live_runs where run_id=prior.run_id),'expired'),'historyExpired',not exists(select from public.workflow_live_runs where run_id=prior.run_id));
 end if;
 select * into t from public.workflow_execution_threads where thread_id=p_thread and owner_user_id=p_owner for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if t.checkpoint_id is distinct from p_checkpoint or t.status not in ('waiting','closed') then raise exception 'THREAD_STATE_CONFLICT'; end if;
 if t.status='closed' and (t.last_error is null or t.last_error->>'code' in ('RUN_CANCELLED','WAIT_EXPIRED')) then raise exception 'THREAD_NOT_RESUMABLE'; end if;
 if t.status='waiting' and t.wait_expires_at<=now() then raise exception 'WAIT_EXPIRED'; end if;
 if not exists(select from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=t.workflow_id and not archived) then raise exception 'WORKFLOW_ARCHIVED'; end if;
 if (select count(*) from public.workflow_live_runs where owner_user_id=p_owner and status='queued')>=5 then raise exception 'RUN_QUOTA_EXCEEDED'; end if;
 if jsonb_typeof(p_responses)<>'object' or (select coalesce(array_agg(key order by key),'{}') from jsonb_object_keys(p_responses) key) is distinct from (select coalesce(array_agg(x->>'id' order by x->>'id'),'{}') from jsonb_array_elements(t.interrupts) x) then raise exception 'INTERRUPT_ID_CONFLICT'; end if;
 s:=t.snapshot;
 insert into public.workflow_live_runs(owner_user_id,workflow_id,revision,status,definition_hash,semantic_hash,compile_fingerprint,environment_ref,environment_revision,input,registry_snapshot,launch_context,thread_id,resume_of_run_id,resume_values)
 values(p_owner,t.workflow_id,t.revision,'queued',s->>'definition_hash',s->>'semantic_hash',s->>'compile_fingerprint',s->>'environment_ref',s->>'environment_revision',s->'input',s->'registry_snapshot',t.launch_context,t.thread_id,t.current_run_id,p_responses) returning run_id into run;
 update public.workflow_live_runs set status='continued',continuation_run_id=run,finished_at=now() where run_id=t.current_run_id and status='waiting';
 msg:=pgmq.send('workflow_v2',jsonb_build_object('runId',run));
 insert into public.workflow_run_jobs(run_id,queue_msg_id) values(run,msg);
 insert into public.workflow_idempotency(owner_user_id,key,request_hash,run_id,workflow_id,revision) values(p_owner,p_key,p_hash,run,t.workflow_id,t.revision)
 on conflict(owner_user_id,key) do update set request_hash=p_hash,run_id=run,expires_at=now()+interval '24 hours';
 update public.workflow_execution_threads set status='active',current_run_id=run,interrupts='[]',wait_expires_at=null,last_error=null,updated_at=now() where thread_id=t.thread_id;
 perform workflow_private.event(run,'run.queued',jsonb_build_object('threadId',t.thread_id,'resumeOfRunId',t.current_run_id));
 perform public.workflow_v2_prune(p_owner,t.workflow_id);
 return jsonb_build_object('runId',run,'revision',t.revision,'status','queued','eventsCursor',0);
end $$;
revoke all on function public.workflow_v2_resume(uuid,uuid,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.workflow_v2_resume(uuid,uuid,text,jsonb,text,text) to service_role;

create or replace function public.workflow_v2_cancel(p_owner uuid,p_run uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.workflow_live_runs; t uuid; begin
 select thread_id into t from public.workflow_live_runs where owner_user_id=p_owner and run_id=p_run;
 perform 1 from public.workflow_execution_threads where thread_id=t for update;
 select * into r from public.workflow_live_runs where owner_user_id=p_owner and run_id=p_run for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if r.status in ('success','failed','cancelled','continued') then return jsonb_build_object('status',r.status,'terminal',true); end if;
 if r.cancel_requested_at is null then
  update public.workflow_live_runs set cancel_requested_at=now() where run_id=p_run;
  perform workflow_private.event(p_run,'run.cancel_requested','{}');
 end if;
 if r.status in ('queued','waiting') then
  update public.workflow_live_runs set status='cancelled',finished_at=now() where run_id=p_run;
  update public.workflow_execution_threads set status='closed',interrupts='[]',last_error=jsonb_build_object('code','RUN_CANCELLED'),updated_at=now() where thread_id=t;
  perform workflow_private.event(p_run,'run.cancelled','{}');
 end if;
 return jsonb_build_object('status',case when r.status in ('queued','waiting') then 'cancelled' else r.status end,'terminal',r.status in ('queued','waiting'));
end $$;

create function public.workflow_v2_cancel_thread(p_owner uuid,p_thread uuid) returns void language plpgsql security invoker set search_path='' as $$
declare t public.workflow_execution_threads; begin
 select * into t from public.workflow_execution_threads where thread_id=p_thread and owner_user_id=p_owner for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if exists(select from public.workflow_live_runs where run_id=t.current_run_id) then perform public.workflow_v2_cancel(p_owner,t.current_run_id);
 else update public.workflow_execution_threads set status='closed',interrupts='[]',last_error=jsonb_build_object('code','RUN_CANCELLED'),updated_at=now() where thread_id=p_thread; end if;
end $$;
revoke all on function public.workflow_v2_cancel_thread(uuid,uuid) from public,anon,authenticated;
grant execute on function public.workflow_v2_cancel_thread(uuid,uuid) to service_role;

create or replace function workflow_private.finish(p_run uuid,p_token bigint,p_status text,p_output jsonb default null,p_error jsonb default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.workflow_live_runs; begin
 perform 1 from public.workflow_execution_threads e join public.workflow_live_runs l using(thread_id) where l.run_id=p_run for update of e;
 select * into r from public.workflow_live_runs where run_id=p_run for update;
 if r.status is distinct from 'running' or not exists(select from public.workflow_run_jobs where run_id=p_run and fencing_token=p_token and lease_until>=now()) then raise exception 'LEASE_LOST'; end if;
 perform workflow_private.accrue_compute(p_run);
 if p_status not in ('success','failed','cancelled') then raise exception 'INVALID_STATUS'; end if;
 if r.cancel_requested_at is not null then p_status:='cancelled'; p_output:=null; p_error:=jsonb_build_object('code','RUN_CANCELLED'); end if;
 update public.workflow_live_runs set status=p_status,output=p_output,error=p_error,finished_at=now() where run_id=p_run;
 update public.workflow_execution_threads set status='closed',last_error=p_error,interrupts='[]',updated_at=now() where thread_id=r.thread_id;
 perform workflow_private.event(p_run,case p_status when 'success' then 'run.completed' when 'failed' then 'run.failed' else 'run.cancelled' end,jsonb_strip_nulls(jsonb_build_object('output',p_output,'error',p_error)));
 perform pgmq.delete('workflow_v2',(select queue_msg_id from public.workflow_run_jobs where run_id=p_run));
 perform public.workflow_v2_prune(r.owner_user_id,r.workflow_id);
 return true;
end $$;

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
   update public.workflow_live_runs set status=case when r.cancel_requested_at is not null then 'cancelled' else 'failed' end,finished_at=now(),error=jsonb_build_object('code',coalesce(err,'RUN_CANCELLED'),'category','infrastructure','message',coalesce(err,'RUN_CANCELLED'),'effect','unknown') where run_id=r.run_id;
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

revoke all on function workflow_private.begin_task(uuid,bigint,uuid,text,jsonb,integer,jsonb,text),workflow_private.accrue_compute(uuid),workflow_private.pause_run(uuid,bigint,jsonb,integer) from public,anon,authenticated;
grant execute on function workflow_private.begin_task(uuid,bigint,uuid,text,jsonb,integer,jsonb,text),workflow_private.pause_run(uuid,bigint,jsonb,integer) to workflow_worker;

-- Run retention and Thread retention have separate lifetimes. An active Worker is never pruned.
create function workflow_private.run_capacity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.owner_user_id::text,0));
 if exists(select from (
  select status,row_number() over(order by created_at desc,run_id desc) as position
  from public.workflow_live_runs where owner_user_id=new.owner_user_id and workflow_id=new.workflow_id
 ) ranked where position>=20 and status in ('queued','running')) then raise exception 'RUN_QUOTA_EXCEEDED'; end if;
 if new.thread_id is null and (select count(*) from public.workflow_execution_threads where owner_user_id=new.owner_user_id and workflow_id=new.workflow_id and status in ('active','waiting'))>=20 then raise exception 'THREAD_QUOTA_EXCEEDED'; end if;
 return new;
end $$;
create trigger aa_workflow_run_capacity before insert on public.workflow_live_runs for each row execute function workflow_private.run_capacity();
revoke all on function workflow_private.run_capacity() from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.workflow_v2_prune(p_owner uuid, p_workflow text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare item record; n integer:=0; begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_workflow,0));
 for item in select run_id,created_at from public.workflow_live_runs where owner_user_id=p_owner and workflow_id=p_workflow order by created_at desc,run_id desc offset 20 loop
  if exists(select from public.workflow_live_runs where run_id=item.run_id and status in ('queued','running')) then continue; end if;
  if exists(select from public.knowledge_evidence where user_id=p_owner and event_type='workflow_passed' and source_entity_id=item.run_id::text) or exists(select from public.learning_attempts where user_id=p_owner and response->>'kind'='workflow' and response->>'runId'=item.run_id::text) then
   insert into public.workflow_run_evidence_receipts(owner_user_id,run_id,workflow_id,proof)
   select p_owner,item.run_id::text,p_workflow,jsonb_build_object('runId',run_id,'revision',revision,'definitionHash',definition_hash,'semanticHash',semantic_hash,'status',status,'finishedAt',finished_at,'output',output) from public.workflow_live_runs where run_id=item.run_id on conflict do nothing;
  end if;
  insert into public.workflow_run_tombstones(owner_user_id,run_id,workflow_id) values(p_owner,item.run_id,p_workflow) on conflict do nothing;
  delete from public.workflow_live_runs where owner_user_id=p_owner and run_id=item.run_id;
  n:=n+1;
 end loop;
 delete from public.workflow_idempotency where owner_user_id=p_owner and expires_at<now();
 return n;
end $function$

;

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
 delete from public.workflow_editor_documents where owner_user_id=p_owner and workflow_id=p_workflow;
 delete from public.workflow_revisions where owner_user_id=p_owner and workflow_id=p_workflow;
 get diagnostics versions=row_count;
 delete from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=p_workflow;
 return jsonb_build_object('ok',true,'deletedRuns',runs,'deletedRevisions',versions);
end $function$

;

CREATE OR REPLACE FUNCTION workflow_private.emit(p_run uuid, p_token bigint, p_type text, p_payload jsonb, p_step uuid DEFAULT NULL::uuid, p_node text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin
 if (workflow_private.check_lease(p_run,p_token)->>'cancelled')::boolean and p_type='tool.started' then raise exception 'RUN_CANCELLED'; end if;
 if p_type not in ('tool.started','tool.completed','tool.failed','tool.skipped','step.failed') then raise exception 'INVALID_EVENT_TYPE'; end if;
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

CREATE OR REPLACE FUNCTION public.workflow_v2_enqueue(p_owner uuid, p_workflow text, p_revision integer, p_input jsonb, p_environment text, p_environment_revision text, p_registry jsonb, p_semantic text, p_fingerprint text, p_request_hash text, p_key text, p_launch jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare previous public.workflow_idempotency; run uuid; msg bigint; hash text; active integer; queued integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into previous from public.workflow_idempotency where owner_user_id=p_owner and key=p_key and expires_at>now();
 if found then
  if previous.request_hash<>p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('runId',previous.run_id,'revision',previous.revision,'status',coalesce((select status from public.workflow_live_runs where run_id=previous.run_id),'expired'),'historyExpired',not exists(select from public.workflow_live_runs where run_id=previous.run_id));
 end if;
 if not exists(select from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=p_workflow and not archived) then raise exception 'WORKFLOW_ARCHIVED'; end if;
 select definition_hash into hash from public.workflow_revisions where owner_user_id=p_owner and workflow_id=p_workflow and revision=p_revision;
 if hash is null then raise exception 'NOT_FOUND'; end if;
 if p_launch is not null then
  if p_launch->>'workflowTemplateId'<>p_workflow or not exists(
   select from public.course_assignments a join public.courses c on c.id=a.course_id
   where a.course_id=p_launch->>'courseId' and a.id=p_launch->>'assignmentId' and a.mode='workflow' and a.workflow_template_id=p_workflow
   and c.lifecycle='published' and (c.course_type<>'personal' or c.owner_user_id=p_owner)
  ) then raise exception 'LAUNCH_CONTEXT_CHANGED'; end if;
 end if;
 select count(*) filter(where status='running'),count(*) filter(where status='queued') into active,queued from public.workflow_live_runs where owner_user_id=p_owner;
 if queued>=5 then raise exception 'RUN_QUOTA_EXCEEDED'; end if;
 insert into public.workflow_live_runs(owner_user_id,workflow_id,revision,status,definition_hash,semantic_hash,compile_fingerprint,environment_ref,environment_revision,input,registry_snapshot,launch_context)
 values(p_owner,p_workflow,p_revision,'queued',hash,p_semantic,p_fingerprint,p_environment,p_environment_revision,p_input,p_registry,p_launch) returning run_id into run;
 msg:=pgmq.send('workflow_v2',jsonb_build_object('runId',run));
 insert into public.workflow_run_jobs(run_id,queue_msg_id) values(run,msg);
 insert into public.workflow_idempotency values(p_owner,p_key,p_request_hash,run,p_workflow,p_revision,now()+interval '24 hours') on conflict(owner_user_id,key) do update set request_hash=p_request_hash,run_id=run,workflow_id=p_workflow,revision=p_revision,expires_at=now()+interval '24 hours';
 if p_launch is not null then
  insert into public.user_course_states(user_id,course_id,is_active,updated_at) values(p_owner,p_launch->>'courseId',true,now())
  on conflict(user_id,course_id) do update set is_active=true,updated_at=now();
 end if;
 perform workflow_private.event(run,'run.queued','{}');
 perform public.workflow_v2_prune(p_owner,p_workflow);
 return jsonb_build_object('runId',run,'revision',p_revision,'status','queued','eventsCursor',0);
end $function$

;
commit;

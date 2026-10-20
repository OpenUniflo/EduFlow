begin;
create schema if not exists workflow_checkpoints;
revoke all on schema workflow_checkpoints from public,anon,authenticated;
grant usage on schema workflow_checkpoints to workflow_worker;
set local search_path = workflow_checkpoints;
-- Official langgraph-checkpoint-postgres 3.2.0 migration 0; transactional index creation.
CREATE TABLE IF NOT EXISTS checkpoint_migrations (
    v INTEGER PRIMARY KEY
);
insert into checkpoint_migrations(v) values (0) on conflict do nothing;
-- Official langgraph-checkpoint-postgres 3.2.0 migration 1; transactional index creation.
CREATE TABLE IF NOT EXISTS checkpoints (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    parent_checkpoint_id TEXT,
    type TEXT,
    checkpoint JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);
insert into checkpoint_migrations(v) values (1) on conflict do nothing;
-- Official langgraph-checkpoint-postgres 3.2.0 migration 2; transactional index creation.
CREATE TABLE IF NOT EXISTS checkpoint_blobs (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL,
    version TEXT NOT NULL,
    type TEXT NOT NULL,
    blob BYTEA,
    PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
);
insert into checkpoint_migrations(v) values (2) on conflict do nothing;
-- Official langgraph-checkpoint-postgres 3.2.0 migration 3; transactional index creation.
CREATE TABLE IF NOT EXISTS checkpoint_writes (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    channel TEXT NOT NULL,
    type TEXT,
    blob BYTEA NOT NULL,
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);
insert into checkpoint_migrations(v) values (3) on conflict do nothing;
-- Official langgraph-checkpoint-postgres 3.2.0 migration 4; transactional index creation.
ALTER TABLE checkpoint_blobs ALTER COLUMN blob DROP not null;
insert into checkpoint_migrations(v) values (4) on conflict do nothing;
-- Official langgraph-checkpoint-postgres 3.2.0 migration 5; transactional index creation.
SELECT 1;
insert into checkpoint_migrations(v) values (5) on conflict do nothing;
-- Official langgraph-checkpoint-postgres 3.2.0 migration 6; transactional index creation.

    CREATE INDEX IF NOT EXISTS checkpoints_thread_id_idx ON checkpoints(thread_id);
    
insert into checkpoint_migrations(v) values (6) on conflict do nothing;
-- Official langgraph-checkpoint-postgres 3.2.0 migration 7; transactional index creation.

    CREATE INDEX IF NOT EXISTS checkpoint_blobs_thread_id_idx ON checkpoint_blobs(thread_id);
    
insert into checkpoint_migrations(v) values (7) on conflict do nothing;
-- Official langgraph-checkpoint-postgres 3.2.0 migration 8; transactional index creation.

    CREATE INDEX IF NOT EXISTS checkpoint_writes_thread_id_idx ON checkpoint_writes(thread_id);
    
insert into checkpoint_migrations(v) values (8) on conflict do nothing;
-- Official langgraph-checkpoint-postgres 3.2.0 migration 9; transactional index creation.
ALTER TABLE checkpoint_writes ADD COLUMN IF NOT EXISTS task_path TEXT NOT NULL DEFAULT '';
insert into checkpoint_migrations(v) values (9) on conflict do nothing;
reset search_path;
alter table workflow_checkpoints.checkpoint_migrations enable row level security;
revoke all on workflow_checkpoints.checkpoint_migrations from public,anon,authenticated;
grant select,insert,update,delete on workflow_checkpoints.checkpoint_migrations to workflow_worker;
create policy worker_internal on workflow_checkpoints.checkpoint_migrations to workflow_worker using (true) with check (true);
alter table workflow_checkpoints.checkpoints enable row level security;
revoke all on workflow_checkpoints.checkpoints from public,anon,authenticated;
grant select,insert,update,delete on workflow_checkpoints.checkpoints to workflow_worker;
create policy worker_internal on workflow_checkpoints.checkpoints to workflow_worker using (true) with check (true);
alter table workflow_checkpoints.checkpoint_blobs enable row level security;
revoke all on workflow_checkpoints.checkpoint_blobs from public,anon,authenticated;
grant select,insert,update,delete on workflow_checkpoints.checkpoint_blobs to workflow_worker;
create policy worker_internal on workflow_checkpoints.checkpoint_blobs to workflow_worker using (true) with check (true);
alter table workflow_checkpoints.checkpoint_writes enable row level security;
revoke all on workflow_checkpoints.checkpoint_writes from public,anon,authenticated;
grant select,insert,update,delete on workflow_checkpoints.checkpoint_writes to workflow_worker;
create policy worker_internal on workflow_checkpoints.checkpoint_writes to workflow_worker using (true) with check (true);
create table public.workflow_execution_threads (
 thread_id uuid primary key, owner_user_id uuid not null references auth.users(id) on delete cascade,
 workflow_id text not null, revision integer not null,
 snapshot jsonb not null, launch_context jsonb,
 status text not null default 'active' check(status in ('active','waiting','closed','expired')),
 current_run_id uuid, checkpoint_id text, state jsonb, state_version integer not null default 0,
 node_executions integer not null default 0, tool_calls integer not null default 0, compute_ms bigint not null default 0,
 interrupts jsonb not null default '[]', wait_expires_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(owner_user_id,workflow_id,revision) references public.workflow_revisions(owner_user_id,workflow_id,revision) on delete cascade
);
alter table public.workflow_execution_threads enable row level security;
revoke all on public.workflow_execution_threads from public,anon,authenticated;
grant select on public.workflow_execution_threads to authenticated;
grant all on public.workflow_execution_threads to service_role;
create policy owner_read on public.workflow_execution_threads for select to authenticated using ((select auth.uid())=owner_user_id);
alter table public.workflow_live_runs add column thread_id uuid references public.workflow_execution_threads(thread_id) on delete set null;
alter table public.workflow_live_runs add column resume_of_run_id uuid;
alter table public.workflow_live_runs add column continuation_run_id uuid;
alter table public.workflow_live_runs add column resume_values jsonb;
alter table public.workflow_live_runs add column budget_updated_at timestamptz;

create function workflow_private.attach_thread() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.thread_id is null then
  new.thread_id:=new.run_id;
  insert into public.workflow_execution_threads(thread_id,owner_user_id,workflow_id,revision,snapshot,launch_context,current_run_id)
  values(new.thread_id,new.owner_user_id,new.workflow_id,new.revision,
   jsonb_build_object('definition_hash',new.definition_hash,'semantic_hash',new.semantic_hash,'compile_fingerprint',new.compile_fingerprint,
    'environment_ref',new.environment_ref,'environment_revision',new.environment_revision,'registry_snapshot',new.registry_snapshot,'input',new.input,'policy_version',new.policy_version),new.launch_context,new.run_id);
 end if;
 return new;
end $$;
revoke all on function workflow_private.attach_thread() from public,anon,authenticated;
create trigger attach_execution_thread before insert on public.workflow_live_runs for each row execute function workflow_private.attach_thread();

create table workflow_private.task_receipts (
 thread_id uuid not null references public.workflow_execution_threads(thread_id) on delete cascade,
 task_id text not null, checkpoint_id text not null, node_id text not null,
 source_run_id uuid not null, source_step_id uuid not null, invocation integer not null,
 input jsonb not null, output jsonb not null, patch jsonb not null, outlet text not null, usage jsonb,
 execution_identity jsonb not null, committed_checkpoint_id text,
 primary key(thread_id,task_id)
);
create table workflow_private.superstep_commits (
 thread_id uuid not null references public.workflow_execution_threads(thread_id) on delete cascade,
 checkpoint_id text not null, state_version integer not null,
 primary key(thread_id,checkpoint_id)
);
revoke all on workflow_private.task_receipts,workflow_private.superstep_commits from public,anon,authenticated;
alter table workflow_private.task_receipts enable row level security;
alter table workflow_private.superstep_commits enable row level security;

create function workflow_private.receipt(p_run uuid,p_token bigint,p_task text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform workflow_private.check_lease(p_run,p_token);
 return (select to_jsonb(t) from workflow_private.task_receipts t join public.workflow_live_runs r on r.thread_id=t.thread_id where r.run_id=p_run and t.task_id=p_task);
end $$;
create function workflow_private.prepare_step(p_run uuid,p_token bigint,p_step uuid,p_output jsonb,p_patch jsonb,p_outlet text,p_usage jsonb default null)
returns void language plpgsql security definer set search_path='' as $$
declare s public.workflow_run_steps; t uuid; begin
 perform workflow_private.check_lease(p_run,p_token);
 select * into s from public.workflow_run_steps where run_id=p_run and step_id=p_step and attempt=1 for update;
 if not found or s.status<>'running' or s.execution_identity is null then raise exception 'INVALID_STEP'; end if;
 select thread_id into t from public.workflow_live_runs where run_id=p_run;
 insert into workflow_private.task_receipts(thread_id,task_id,checkpoint_id,node_id,source_run_id,source_step_id,invocation,input,output,patch,outlet,usage,execution_identity)
 values(t,s.execution_identity->>'taskId',s.execution_identity->>'checkpointId',s.node_id,p_run,p_step,s.invocation,s.input,p_output,p_patch,p_outlet,p_usage,s.execution_identity)
 on conflict(thread_id,task_id) do nothing;
 if not exists(select from workflow_private.task_receipts where thread_id=t and task_id=s.execution_identity->>'taskId' and input=s.input and output=p_output and patch=p_patch and outlet=p_outlet) then raise exception 'TASK_RESULT_CONFLICT'; end if;
 update public.workflow_run_steps set status='prepared',output=p_output,usage=p_usage where run_id=p_run and step_id=p_step and attempt=1;
 perform workflow_private.event(p_run,'step.prepared',jsonb_build_object('taskId',s.execution_identity->>'taskId'),p_step,s.node_id,s.state_version_before);
end $$;
create function workflow_private.commit_superstep(p_run uuid,p_token bigint,p_checkpoint text,p_parent text,p_state jsonb,p_initialized boolean)
returns integer language plpgsql security definer set search_path='' as $$
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
  update workflow_private.task_receipts set committed_checkpoint_id=p_checkpoint where thread_id=t.thread_id and task_id=receipt.task_id;
 end loop;
 insert into workflow_private.superstep_commits values(t.thread_id,p_checkpoint,version);
 return version;
end $$;

create function workflow_private.delete_checkpoints() returns trigger language plpgsql security definer set search_path='' as $$ begin
 delete from workflow_checkpoints.checkpoint_writes where thread_id=old.thread_id::text;
 delete from workflow_checkpoints.checkpoint_blobs where thread_id=old.thread_id::text;
 delete from workflow_checkpoints.checkpoints where thread_id=old.thread_id::text;
 return old;
end $$;
create trigger delete_native_checkpoints after delete on public.workflow_execution_threads for each row execute function workflow_private.delete_checkpoints();
revoke all on function workflow_private.delete_checkpoints() from public,anon,authenticated;
revoke all on function workflow_private.receipt(uuid,bigint,text),workflow_private.prepare_step(uuid,bigint,uuid,jsonb,jsonb,text,jsonb),workflow_private.commit_superstep(uuid,bigint,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function workflow_private.receipt(uuid,bigint,text),workflow_private.prepare_step(uuid,bigint,uuid,jsonb,jsonb,text,jsonb),workflow_private.commit_superstep(uuid,bigint,text,text,jsonb,boolean) to workflow_worker;
commit;

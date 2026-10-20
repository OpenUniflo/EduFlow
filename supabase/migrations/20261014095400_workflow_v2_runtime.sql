-- Workflow V2 authority. PGMQ owns durable delivery; EduFlow owns run semantics.
create extension if not exists pgmq;
select pgmq.create('workflow_v2');
create schema if not exists workflow_private;
revoke all on schema workflow_private from public, anon, authenticated;
do $$ begin if not exists (select from pg_roles where rolname='workflow_worker') then create role workflow_worker login; end if; end $$;

create table public.workflow_v2_definitions (
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 workflow_id text not null, current_revision integer not null default 0,
 editor_revision integer not null default 0, archived boolean not null default false,
 provenance jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(owner_user_id,workflow_id)
);
create table public.workflow_revisions (
 owner_user_id uuid not null, workflow_id text not null, revision integer not null check(revision>0),
 definition jsonb not null, definition_hash text not null, editor_snapshot jsonb not null,
 created_at timestamptz not null default now(), primary key(owner_user_id,workflow_id,revision),
 foreign key(owner_user_id,workflow_id) references public.workflow_v2_definitions(owner_user_id,workflow_id) on delete restrict
);
create table public.workflow_editor_documents (
 owner_user_id uuid not null, workflow_id text not null, editor_revision integer not null,
 definition_revision integer not null, document jsonb not null,
 primary key(owner_user_id,workflow_id), foreign key(owner_user_id,workflow_id,definition_revision) references public.workflow_revisions(owner_user_id,workflow_id,revision)
);
create table public.workflow_live_runs (
 run_id uuid primary key default gen_random_uuid(), owner_user_id uuid not null,
 workflow_id text not null, revision integer not null, status text not null check(status in ('queued','running','success','failed','cancelled')),
 mode text not null default 'live' check(mode='live'), verification text not null default 'unverified' check(verification='unverified'),
 definition_hash text not null, semantic_hash text not null, compile_fingerprint text not null,
 environment_ref text not null, environment_revision text not null, policy_version text not null default 'm1.1',
 input jsonb not null, output jsonb, raw_state jsonb, state_version integer not null default 0,
 error jsonb, registry_snapshot jsonb not null, launch_context jsonb,
 created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
 cancel_requested_at timestamptz, last_seq bigint not null default 0,
 foreign key(owner_user_id,workflow_id,revision) references public.workflow_revisions(owner_user_id,workflow_id,revision)
);
create index workflow_live_runs_owner_workflow_idx on public.workflow_live_runs(owner_user_id,workflow_id,created_at desc);
create table public.workflow_run_jobs (
 run_id uuid primary key references public.workflow_live_runs(run_id) on delete cascade,
 queue_msg_id bigint not null, fencing_token bigint not null default 0,
 worker_id text, lease_until timestamptz, heartbeat_at timestamptz
);
create table public.workflow_run_steps (
 run_id uuid not null references public.workflow_live_runs(run_id) on delete cascade,
 step_id uuid not null, node_id text not null, invocation integer not null, attempt integer not null default 1,
 status text not null, input jsonb, output jsonb, state_version_before integer not null, state_version_after integer not null,
 started_at timestamptz not null default now(), finished_at timestamptz, error jsonb, usage jsonb, tool_call_ids jsonb not null default '[]',
 primary key(run_id,step_id,attempt)
);
create table public.workflow_run_events (
 run_id uuid not null references public.workflow_live_runs(run_id) on delete cascade,
 seq bigint not null, event_id uuid not null unique default gen_random_uuid(),
 type text not null, occurred_at timestamptz not null default now(),
 step_id uuid, node_id text, attempt integer, state_version integer, payload jsonb not null,
 primary key(run_id,seq)
);
create table public.workflow_idempotency (
 owner_user_id uuid not null references auth.users(id) on delete cascade, key text not null,
 request_hash text not null, run_id uuid not null, workflow_id text not null, revision integer not null,
 expires_at timestamptz not null default now()+interval '24 hours', primary key(owner_user_id,key)
);
create table public.workflow_run_tombstones (
 owner_user_id uuid not null references auth.users(id) on delete cascade, run_id uuid primary key,
 workflow_id text not null, expired_at timestamptz not null default now()
);
create table public.workflow_migration_reports (
 migration_id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id) on delete cascade,
 workflow_id text not null, source_digest text not null, migration_version integer not null default 1,
 report jsonb not null, source_snapshot jsonb not null, applied_revision integer,
 unique(owner_user_id,workflow_id,source_digest,migration_version)
);

-- Only non-sensitive authoring data is readable via authenticated Data API.
-- Raw input/state/trace are projected through the authorized application API.
do $$ declare t text; begin
 foreach t in array array['workflow_v2_definitions','workflow_revisions','workflow_editor_documents','workflow_live_runs','workflow_run_jobs','workflow_run_steps','workflow_run_events','workflow_idempotency','workflow_run_tombstones','workflow_migration_reports'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['workflow_v2_definitions','workflow_revisions','workflow_editor_documents','workflow_migration_reports'] loop
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid())=owner_user_id)',t);
 end loop;
end $$;

create function public.workflow_v2_save(p_owner uuid,p_workflow text,p_base integer,p_editor_base integer,p_definition jsonb,p_editor jsonb,p_definition_hash text,p_provenance jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare head public.workflow_v2_definitions; r integer; er integer; def jsonb; ed jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_workflow,0));
 select * into head from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=p_workflow for update;
 if not found then
  if p_base is not null or p_editor_base is not null then raise exception 'REVISION_CONFLICT'; end if;
  insert into public.workflow_v2_definitions(owner_user_id,workflow_id,provenance) values(p_owner,p_workflow,p_provenance);
  r:=1; er:=1;
 else
  if head.archived then raise exception 'WORKFLOW_ARCHIVED'; end if;
  if p_base is distinct from head.current_revision or p_editor_base is distinct from head.editor_revision then raise exception 'REVISION_CONFLICT'; end if;
  r:=head.current_revision+1; er:=head.editor_revision+1;
 end if;
 def:=jsonb_set(jsonb_set(p_definition,'{revision}',to_jsonb(r)),'{workflowId}',to_jsonb(p_workflow));
 ed:=jsonb_set(jsonb_set(jsonb_set(p_editor,'{definitionRevision}',to_jsonb(r)),'{editorRevision}',to_jsonb(er)),'{workflowId}',to_jsonb(p_workflow));
 insert into public.workflow_revisions(owner_user_id,workflow_id,revision,definition,definition_hash,editor_snapshot) values(p_owner,p_workflow,r,def,p_definition_hash,ed);
 insert into public.workflow_editor_documents values(p_owner,p_workflow,er,r,ed) on conflict(owner_user_id,workflow_id) do update set editor_revision=er,definition_revision=r,document=ed;
 update public.workflow_v2_definitions set current_revision=r,editor_revision=er,updated_at=now() where owner_user_id=p_owner and workflow_id=p_workflow;
 return jsonb_build_object('workflowId',p_workflow,'revision',r,'editorRevision',er);
end $$;

create function public.workflow_v2_save_editor(p_owner uuid,p_workflow text,p_base integer,p_editor jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare head public.workflow_v2_definitions; er integer; ed jsonb;
begin
 select * into head from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=p_workflow for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if head.archived then raise exception 'WORKFLOW_ARCHIVED'; end if;
 if p_base is distinct from head.editor_revision or (p_editor->>'definitionRevision')::integer is distinct from head.current_revision then raise exception 'REVISION_CONFLICT'; end if;
 er:=head.editor_revision+1; ed:=jsonb_set(p_editor,'{editorRevision}',to_jsonb(er));
 update public.workflow_editor_documents set document=ed,editor_revision=er where owner_user_id=p_owner and workflow_id=p_workflow;
 update public.workflow_v2_definitions set editor_revision=er,updated_at=now() where owner_user_id=p_owner and workflow_id=p_workflow;
 return jsonb_build_object('editorRevision',er);
end $$;

create function workflow_private.event(p_run uuid,p_type text,p_payload jsonb,p_step uuid default null,p_node text default null,p_version integer default null)
returns bigint language plpgsql security invoker set search_path='' as $$
declare s bigint; begin
 update public.workflow_live_runs set last_seq=last_seq+1 where run_id=p_run returning last_seq into s;
 insert into public.workflow_run_events(run_id,seq,type,payload,step_id,node_id,attempt,state_version) values(p_run,s,p_type,p_payload,p_step,p_node,case when p_step is null then null else 1 end,p_version);
 return s;
end $$;

create function public.workflow_v2_enqueue(p_owner uuid,p_workflow text,p_revision integer,p_input jsonb,p_environment text,p_environment_revision text,p_registry jsonb,p_semantic text,p_fingerprint text,p_request_hash text,p_key text,p_launch jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
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
 select count(*) filter(where status='running'),count(*) filter(where status='queued') into active,queued from public.workflow_live_runs where owner_user_id=p_owner;
 if queued>=5 then raise exception 'RUN_QUOTA_EXCEEDED'; end if;
 insert into public.workflow_live_runs(owner_user_id,workflow_id,revision,status,definition_hash,semantic_hash,compile_fingerprint,environment_ref,environment_revision,input,registry_snapshot,launch_context)
 values(p_owner,p_workflow,p_revision,'queued',hash,p_semantic,p_fingerprint,p_environment,p_environment_revision,p_input,p_registry,p_launch) returning run_id into run;
 msg:=pgmq.send('workflow_v2',jsonb_build_object('runId',run));
 insert into public.workflow_run_jobs(run_id,queue_msg_id) values(run,msg);
 insert into public.workflow_idempotency values(p_owner,p_key,p_request_hash,run,p_workflow,p_revision,now()+interval '24 hours') on conflict(owner_user_id,key) do update set request_hash=p_request_hash,run_id=run,workflow_id=p_workflow,revision=p_revision,expires_at=now()+interval '24 hours';
 perform workflow_private.event(run,'run.queued','{}');
 return jsonb_build_object('runId',run,'revision',p_revision,'status','queued','eventsCursor',0);
end $$;

create function public.workflow_v2_cancel(p_owner uuid,p_run uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.workflow_live_runs; begin
 select * into r from public.workflow_live_runs where owner_user_id=p_owner and run_id=p_run for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if r.status in ('success','failed','cancelled') then return jsonb_build_object('status',r.status,'terminal',true); end if;
 if r.cancel_requested_at is null then
  update public.workflow_live_runs set cancel_requested_at=now() where run_id=p_run;
  perform workflow_private.event(p_run,'run.cancel_requested','{}');
 end if;
 if r.status='queued' then
  update public.workflow_live_runs set status='cancelled',finished_at=now() where run_id=p_run;
  perform workflow_private.event(p_run,'run.cancelled','{}');
 end if;
 return jsonb_build_object('status',case when r.status='queued' then 'cancelled' else r.status end,'terminal',false);
end $$;

create function workflow_private.claim(p_worker text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare message record; r public.workflow_live_runs; j public.workflow_run_jobs; begin
 for message in select * from pgmq.read('workflow_v2',30,10) loop
  select * into r from public.workflow_live_runs where run_id=(message.message->>'runId')::uuid for update;
  if not found or r.status<>'queued' then perform pgmq.delete('workflow_v2',message.msg_id); continue; end if;
  perform pg_advisory_xact_lock(hashtextextended(r.owner_user_id::text,0));
  if (select count(*) from public.workflow_live_runs where owner_user_id=r.owner_user_id and status='running')>=2 then continue; end if;
  update public.workflow_run_jobs set fencing_token=fencing_token+1,worker_id=p_worker,lease_until=now()+interval '30 seconds',heartbeat_at=now() where run_id=r.run_id returning * into j;
  update public.workflow_live_runs set status='running',started_at=now() where run_id=r.run_id;
  perform workflow_private.event(r.run_id,'run.started','{}');
  return jsonb_build_object('run',to_jsonb(r)||jsonb_build_object('status','running'),'definition',(select definition from public.workflow_revisions where owner_user_id=r.owner_user_id and workflow_id=r.workflow_id and revision=r.revision),'token',j.fencing_token,'queueMessageId',message.msg_id);
 end loop;
 return null;
end $$;

create function workflow_private.check_lease(p_run uuid,p_token bigint,p_extend boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.workflow_live_runs; j public.workflow_run_jobs; begin
 select * into r from public.workflow_live_runs where run_id=p_run for update;
 select * into j from public.workflow_run_jobs where run_id=p_run for update;
 if r.status<>'running' or j.fencing_token<>p_token or j.lease_until<now() then raise exception 'LEASE_LOST'; end if;
 if p_extend then update public.workflow_run_jobs set lease_until=now()+interval '30 seconds',heartbeat_at=now() where run_id=p_run; end if;
 return jsonb_build_object('cancelled',r.cancel_requested_at is not null,'startedAt',r.started_at);
end $$;

create function workflow_private.initialize(p_run uuid,p_token bigint,p_state jsonb)
returns void language plpgsql security definer set search_path='' as $$ begin
 perform workflow_private.check_lease(p_run,p_token);
 update public.workflow_live_runs set raw_state=p_state,state_version=0 where run_id=p_run and raw_state is null;
end $$;

create function workflow_private.step_start(p_run uuid,p_token bigint,p_step uuid,p_node text,p_invocation integer,p_input jsonb,p_version integer)
returns void language plpgsql security definer set search_path='' as $$ begin
 if (workflow_private.check_lease(p_run,p_token)->>'cancelled')::boolean then raise exception 'RUN_CANCELLED'; end if;
 insert into public.workflow_run_steps(run_id,step_id,node_id,invocation,status,input,state_version_before,state_version_after) values(p_run,p_step,p_node,p_invocation,'running',p_input,p_version,p_version);
 perform workflow_private.event(p_run,'step.started','{}',p_step,p_node,p_version);
end $$;

create function workflow_private.step_complete(p_run uuid,p_token bigint,p_step uuid,p_output jsonb,p_state jsonb,p_patch jsonb,p_expected integer,p_usage jsonb default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare s public.workflow_run_steps; v integer; begin
 perform workflow_private.check_lease(p_run,p_token);
 select * into s from public.workflow_run_steps where run_id=p_run and step_id=p_step and attempt=1 for update;
 if s.status='completed' then return false; end if;
 if s.status<>'running' or (select state_version from public.workflow_live_runs where run_id=p_run)<>p_expected then raise exception 'STATE_VERSION_CONFLICT'; end if;
 if exists(select from public.workflow_live_runs where run_id=p_run and cancel_requested_at is not null) then raise exception 'RUN_CANCELLED'; end if;
 v:=p_expected+case when p_patch='{}'::jsonb then 0 else 1 end;
 update public.workflow_live_runs set raw_state=p_state,state_version=v where run_id=p_run;
 update public.workflow_run_steps set status='completed',output=p_output,state_version_after=v,usage=p_usage,finished_at=now() where run_id=p_run and step_id=p_step and attempt=1;
 if v<>p_expected then perform workflow_private.event(p_run,'state.updated',jsonb_build_object('patch',p_patch),p_step,s.node_id,v); end if;
 perform workflow_private.event(p_run,'step.completed',jsonb_build_object('output',p_output),p_step,s.node_id,v);
 return true;
end $$;

create function workflow_private.emit(p_run uuid,p_token bigint,p_type text,p_payload jsonb,p_step uuid default null,p_node text default null)
returns void language plpgsql security definer set search_path='' as $$ begin
 perform workflow_private.check_lease(p_run,p_token);
 if p_type not in ('tool.started','tool.completed','tool.failed','tool.skipped','step.failed') then raise exception 'INVALID_EVENT_TYPE'; end if;
 perform workflow_private.event(p_run,p_type,p_payload,p_step,p_node);
 if p_type='step.failed' then update public.workflow_run_steps set status='failed',error=p_payload->'error',finished_at=now() where run_id=p_run and step_id=p_step and attempt=1; end if;
end $$;

create function workflow_private.finish(p_run uuid,p_token bigint,p_status text,p_output jsonb default null,p_error jsonb default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.workflow_live_runs; begin
 perform workflow_private.check_lease(p_run,p_token);
 select * into r from public.workflow_live_runs where run_id=p_run for update;
 if p_status not in ('success','failed','cancelled') then raise exception 'INVALID_STATUS'; end if;
 if r.cancel_requested_at is not null then p_status:='cancelled'; p_output:=null; end if;
 update public.workflow_live_runs set status=p_status,output=p_output,error=p_error,finished_at=now() where run_id=p_run;
 perform workflow_private.event(p_run,case p_status when 'success' then 'run.completed' when 'failed' then 'run.failed' else 'run.cancelled' end,jsonb_strip_nulls(jsonb_build_object('output',p_output,'error',p_error)));
 perform pgmq.delete('workflow_v2',(select queue_msg_id from public.workflow_run_jobs where run_id=p_run));
 perform public.workflow_v2_prune(r.owner_user_id,r.workflow_id);
 return true;
end $$;

create function workflow_private.watchdog()
returns integer language plpgsql security definer set search_path='' as $$
declare r record; err text; n integer:=0; begin
 for r in select l.*,j.lease_until from public.workflow_live_runs l join public.workflow_run_jobs j using(run_id) where l.status in ('queued','running') for update of l skip locked loop
  err:=null;
  if r.status='queued' and r.created_at<now()-interval '60 seconds' then err:='QUEUE_TIMEOUT';
  elsif r.status='running' and r.lease_until<now() then err:='WORKER_LOST';
  elsif r.status='running' and r.started_at+(select ((definition->'policy'->>'timeoutMs')::integer::text||' milliseconds')::interval from public.workflow_revisions where owner_user_id=r.owner_user_id and workflow_id=r.workflow_id and revision=r.revision)<now() then err:='RUN_TIMEOUT'; end if;
  if r.cancel_requested_at is not null or err is not null then
   update public.workflow_live_runs set status=case when r.cancel_requested_at is not null then 'cancelled' else 'failed' end,finished_at=now(),error=case when err is null then null else jsonb_build_object('code',err,'category','infrastructure','message',err,'retryable',false,'effect','unknown') end where run_id=r.run_id;
   perform workflow_private.event(r.run_id,case when r.cancel_requested_at is not null then 'run.cancelled' else 'run.failed' end,jsonb_build_object('error',err));
   update public.workflow_run_steps set status='failed',finished_at=now(),error=jsonb_build_object('code',coalesce(err,'RUN_CANCELLED'),'category','infrastructure','message',coalesce(err,'RUN_CANCELLED'),'retryable',false,'effect','unknown') where run_id=r.run_id and status='running';
   perform pgmq.delete('workflow_v2',(select queue_msg_id from public.workflow_run_jobs where run_id=r.run_id)); n:=n+1;
  end if;
 end loop;
 return n;
end $$;

-- No runtime function may be called through browser Data API.
revoke all on all functions in schema workflow_private from public,anon,authenticated;
grant usage on schema workflow_private to service_role,workflow_worker;
grant execute on all functions in schema workflow_private to service_role;
grant execute on function workflow_private.claim(text),workflow_private.check_lease(uuid,bigint,boolean),workflow_private.initialize(uuid,bigint,jsonb),workflow_private.step_start(uuid,bigint,uuid,text,integer,jsonb,integer),workflow_private.step_complete(uuid,bigint,uuid,jsonb,jsonb,jsonb,integer,jsonb),workflow_private.emit(uuid,bigint,text,jsonb,uuid,text),workflow_private.finish(uuid,bigint,text,jsonb,jsonb),workflow_private.watchdog() to workflow_worker;
revoke all on function public.workflow_v2_save(uuid,text,integer,integer,jsonb,jsonb,text,jsonb),public.workflow_v2_save_editor(uuid,text,integer,jsonb),public.workflow_v2_enqueue(uuid,text,integer,jsonb,text,text,jsonb,text,text,text,text,jsonb),public.workflow_v2_cancel(uuid,uuid) from public,anon,authenticated;
grant execute on function public.workflow_v2_save(uuid,text,integer,integer,jsonb,jsonb,text,jsonb),public.workflow_v2_save_editor(uuid,text,integer,jsonb),public.workflow_v2_enqueue(uuid,text,integer,jsonb,text,text,jsonb,text,text,text,text,jsonb),public.workflow_v2_cancel(uuid,uuid) to service_role;

create function public.workflow_v2_apply_migration(p_owner uuid,p_migration uuid,p_digest text,p_definition jsonb,p_editor jsonb,p_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.workflow_migration_reports; saved jsonb; begin
 select * into m from public.workflow_migration_reports where migration_id=p_migration and owner_user_id=p_owner for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if m.source_digest<>p_digest then raise exception 'SOURCE_CHANGED'; end if;
 if m.applied_revision is not null then return jsonb_build_object('workflowId',m.workflow_id,'revision',m.applied_revision); end if;
 if m.report->>'sourceKind'='server' and m.report->>'sourceUpdatedAt' is not null then
  if not exists(select from public.user_workflow_definitions where owner_user_id=p_owner and id=m.report->>'sourceWorkflowId' and updated_at=(m.report->>'sourceUpdatedAt')::timestamptz) then raise exception 'SOURCE_CHANGED'; end if;
 end if;
 saved:=public.workflow_v2_save(p_owner,m.workflow_id,null,null,p_definition,p_editor,p_hash,m.report->'provenance');
 update public.workflow_migration_reports set applied_revision=(saved->>'revision')::integer where migration_id=p_migration;
 return saved;
end $$;
revoke all on function public.workflow_v2_apply_migration(uuid,uuid,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.workflow_v2_apply_migration(uuid,uuid,text,jsonb,jsonb,text) to service_role;

-- Preserve independently referenced minimum evidence before pruning terminal traces.
create table public.workflow_run_evidence_receipts (
 owner_user_id uuid not null references auth.users(id) on delete cascade, run_id text not null,
 workflow_id text not null, proof jsonb not null, created_at timestamptz not null default now(),primary key(owner_user_id,run_id)
);
alter table public.workflow_run_evidence_receipts enable row level security;
revoke all on public.workflow_run_evidence_receipts from anon,authenticated;
grant all on public.workflow_run_evidence_receipts to service_role;

create function public.workflow_v2_prune(p_owner uuid,p_workflow text)
returns integer language plpgsql security invoker set search_path='' as $$
declare item record; n integer:=0; begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_workflow,0));
 for item in select * from (
   select run_id::text as id,created_at,'live' as source from public.workflow_live_runs where owner_user_id=p_owner and workflow_id=p_workflow and status in ('success','failed','cancelled')
   union all select id,created_at,'legacy' as source from public.workflow_runs where owner_user_id=p_owner and workflow_id=p_workflow
  ) history order by created_at desc,id desc offset 20 loop
  if exists(select from public.knowledge_evidence where user_id=p_owner and event_type='workflow_passed' and source_entity_id=item.id) then
   insert into public.workflow_run_evidence_receipts(owner_user_id,run_id,workflow_id,proof)
   values(p_owner,item.id,p_workflow,case when item.source='live' then (select jsonb_build_object('runId',run_id,'revision',revision,'definitionHash',definition_hash,'semanticHash',semantic_hash,'status',status,'finishedAt',finished_at,'output',output) from public.workflow_live_runs where run_id=item.id::uuid) else (select jsonb_build_object('runId',id,'source','legacy_unknown','createdAt',created_at,'outputSummary',output_summary) from public.workflow_runs where owner_user_id=p_owner and id=item.id) end)
   on conflict do nothing;
  end if;
  if item.source='live' then
   insert into public.workflow_run_tombstones(owner_user_id,run_id,workflow_id) values(p_owner,item.id::uuid,p_workflow) on conflict do nothing;
   delete from public.workflow_live_runs where owner_user_id=p_owner and workflow_id=p_workflow and run_id=item.id::uuid;
  else delete from public.workflow_runs where owner_user_id=p_owner and workflow_id=p_workflow and id=item.id; end if;
  n:=n+1;
 end loop;
 delete from public.workflow_idempotency where owner_user_id=p_owner and expires_at<now();
 return n;
end $$;
revoke all on function public.workflow_v2_prune(uuid,text) from public,anon,authenticated;
grant execute on function public.workflow_v2_prune(uuid,text) to service_role;
grant usage on schema pgmq to service_role;
grant execute on all functions in schema pgmq to service_role;
grant all on all tables in schema pgmq to service_role;
grant usage,select on all sequences in schema pgmq to service_role;

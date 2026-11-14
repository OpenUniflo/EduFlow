-- P2: persisted, owner-scoped completion evaluation for terminal Workflow Runs.
--
-- Evaluation is deliberately separate from Run truth. A Run's status/output/error are
-- never changed by an evaluation; the evaluation job freezes its rubric/model snapshot
-- when the Run is created and can be retried without overwriting an older report.
begin;

create table public.workflow_evaluation_configs (
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 workflow_id text not null,
 version integer not null check(version>0),
 enabled boolean not null default true,
 goal text not null default '' check(length(goal)<=4000),
 criteria jsonb not null default '[]'::jsonb check(case when jsonb_typeof(criteria)='array' then jsonb_array_length(criteria)<=20 else false end),
 provider_ref text check(provider_ref is null or length(provider_ref)<=256),
 model_ref text check(model_ref is null or length(model_ref)<=256),
 environment_ref text check(environment_ref is null or length(environment_ref)<=256),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(owner_user_id,workflow_id),
 foreign key(owner_user_id,workflow_id) references public.workflow_v2_definitions(owner_user_id,workflow_id) on delete cascade
);

create table public.workflow_run_evaluations (
 evaluation_id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 run_id uuid not null references public.workflow_live_runs(run_id) on delete cascade,
 workflow_id text not null,
 revision integer not null,
 trigger_kind text not null check(trigger_kind in ('automatic','manual')),
 request_key text,
 status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 outcome text check(outcome is null or outcome in ('passed','needs_improvement','failed','insufficient_evidence','rules_passed')),
 mode text not null check(mode in ('rules','semantic')),
 semantic_status text not null default 'not_configured' check(semantic_status in ('pending','not_configured','completed','failed','skipped_hard_failure','insufficient_evidence','not_evaluated')),
 rubric_version integer not null default 0 check(rubric_version>=0),
 config_snapshot jsonb not null default '{}'::jsonb,
 provider_ref text,
 model_ref text,
 report jsonb,
 error_code text,
 error_message text,
 attempt_count integer not null default 0 check(attempt_count>=0),
 max_attempts integer not null default 3 check(max_attempts between 1 and 10),
 available_at timestamptz not null default now(),
 lease_until timestamptz,
 worker_id text,
 started_at timestamptz,
 finished_at timestamptz,
 supersedes_id uuid references public.workflow_run_evaluations(evaluation_id) on delete set null,
 created_at timestamptz not null default now()
);
create index workflow_run_evaluations_run_idx on public.workflow_run_evaluations(owner_user_id,run_id,created_at desc);
create index workflow_run_evaluations_claim_idx on public.workflow_run_evaluations(status,available_at,created_at);
create unique index workflow_run_evaluations_automatic_uidx on public.workflow_run_evaluations(run_id) where trigger_kind='automatic';
create unique index workflow_run_evaluations_manual_key_uidx on public.workflow_run_evaluations(owner_user_id,request_key) where request_key is not null;

alter table public.workflow_live_runs add column if not exists evaluation_snapshot jsonb;
update public.workflow_live_runs set evaluation_snapshot=jsonb_build_object(
 'schemaVersion',1,'enabled',true,'mode','rules','goal','','criteria','[]'::jsonb,
 'rubricVersion',0,'configVersion',0,'frozenAt',now())
where evaluation_snapshot is null;
alter table public.workflow_live_runs alter column evaluation_snapshot set default jsonb_build_object(
 'schemaVersion',1,'enabled',true,'mode','rules','goal','','criteria','[]'::jsonb,
 'rubricVersion',0,'configVersion',0,'frozenAt',now());

alter table public.workflow_evaluation_configs enable row level security;
alter table public.workflow_run_evaluations enable row level security;
revoke all on public.workflow_evaluation_configs,public.workflow_run_evaluations from public,anon,authenticated;
grant all on public.workflow_evaluation_configs,public.workflow_run_evaluations to service_role;

-- The Run freezes only safe identities and rubric text. Credentials remain in the
-- managed connection secret and are resolved by the Worker at evaluation time.
create function workflow_private.evaluation_snapshot(p_owner uuid,p_workflow text)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare c public.workflow_evaluation_configs; mode text:='rules';
begin
 select * into c from public.workflow_evaluation_configs where owner_user_id=p_owner and workflow_id=p_workflow;
 if not found then
  return jsonb_build_object('schemaVersion',1,'enabled',true,'mode','rules','goal','','criteria','[]'::jsonb,
   'rubricVersion',0,'configVersion',0,'providerRef',null,'modelRef',null,'environmentRef',null,'frozenAt',now());
 end if;
 if c.enabled and btrim(c.goal)<>'' and jsonb_array_length(c.criteria)>0
    and c.provider_ref is not null and btrim(c.provider_ref)<>''
    and c.model_ref is not null and btrim(c.model_ref)<>'' then mode:='semantic'; end if;
 return jsonb_build_object('schemaVersion',1,'enabled',c.enabled,'mode',mode,'goal',c.goal,
  'criteria',c.criteria,'rubricVersion',c.version,'configVersion',c.version,
  'providerRef',c.provider_ref,'modelRef',c.model_ref,'environmentRef',c.environment_ref,'frozenAt',now());
end $function$;
revoke all on function workflow_private.evaluation_snapshot(uuid,text) from public,anon,authenticated,workflow_worker;
grant execute on function workflow_private.evaluation_snapshot(uuid,text) to service_role;

-- Preserve the existing enqueue contract. The snapshot is read in the same transaction
-- that creates the Run, so later rubric edits cannot rewrite the Run's evaluation basis.
create or replace function public.workflow_v2_enqueue(
 p_owner uuid,p_workflow text,p_revision integer,p_input jsonb,p_environment text,
 p_environment_revision text,p_registry jsonb,p_semantic text,p_fingerprint text,
 p_request_hash text,p_key text,p_launch jsonb default null,p_variable_environment uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $function$
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
 if p_variable_environment is not null and not exists(select from public.workflow_variable_environments where id=p_variable_environment and owner_user_id=p_owner) then raise exception 'INVALID_VARIABLE_ENVIRONMENT'; end if;
 select count(*) filter(where status='running'),count(*) filter(where status='queued') into active,queued from public.workflow_live_runs where owner_user_id=p_owner;
 if queued>=5 then raise exception 'RUN_QUOTA_EXCEEDED'; end if;
 insert into public.workflow_live_runs(owner_user_id,workflow_id,revision,status,definition_hash,semantic_hash,compile_fingerprint,environment_ref,environment_revision,input,registry_snapshot,launch_context,variable_environment_id,evaluation_snapshot)
 values(p_owner,p_workflow,p_revision,'queued',hash,p_semantic,p_fingerprint,p_environment,p_environment_revision,p_input,p_registry,p_launch,p_variable_environment,workflow_private.evaluation_snapshot(p_owner,p_workflow)) returning run_id into run;
 msg:=pgmq.send('workflow_v2',jsonb_build_object('runId',run));
 insert into public.workflow_run_jobs(run_id,queue_msg_id) values(run,msg);
 insert into public.workflow_idempotency values(p_owner,p_key,p_request_hash,run,p_workflow,p_revision,now()+interval '24 hours') on conflict(owner_user_id,key) do update set request_hash=p_request_hash,run_id=run,workflow_id=p_workflow,revision=p_revision,expires_at=now()+interval '24 hours';
 perform workflow_private.event(run,'run.queued','{}');
 return jsonb_build_object('runId',run,'revision',p_revision,'status','queued','eventsCursor',0);
end $function$;

create function public.workflow_evaluation_config_save(
 p_owner uuid,p_workflow text,p_base_version integer,p_enabled boolean,p_goal text,
 p_criteria jsonb,p_provider_ref text default null,p_model_ref text default null,p_environment_ref text default null)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare current public.workflow_evaluation_configs; next integer; result public.workflow_evaluation_configs;
begin
 if p_goal is null or length(p_goal)>4000 then raise exception 'INVALID_EVALUATION_CONFIG'; end if;
 if p_criteria is null or jsonb_typeof(p_criteria)<>'array' or jsonb_array_length(p_criteria)>20 then raise exception 'INVALID_EVALUATION_CONFIG'; end if;
 if exists(select from jsonb_array_elements_text(p_criteria) item where btrim(item)='' or length(item)>1000) then raise exception 'INVALID_EVALUATION_CONFIG'; end if;
 if (p_provider_ref is null) <> (p_model_ref is null) then raise exception 'INVALID_EVALUATION_CONFIG'; end if;
 if p_provider_ref is not null and (btrim(p_provider_ref)='' or length(p_provider_ref)>256 or btrim(p_model_ref)='' or length(p_model_ref)>256) then raise exception 'INVALID_EVALUATION_CONFIG'; end if;
 if p_provider_ref is not null and (p_environment_ref is null or btrim(p_environment_ref)='') then raise exception 'INVALID_EVALUATION_CONFIG'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_workflow||':evaluation',0));
 if not exists(select from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=p_workflow) then raise exception 'NOT_FOUND'; end if;
 select * into current from public.workflow_evaluation_configs where owner_user_id=p_owner and workflow_id=p_workflow for update;
 if not found then
  if p_base_version<>0 then raise exception 'REVISION_CONFLICT'; end if;
  next:=1;
  insert into public.workflow_evaluation_configs(owner_user_id,workflow_id,version,enabled,goal,criteria,provider_ref,model_ref,environment_ref)
  values(p_owner,p_workflow,next,coalesce(p_enabled,true),btrim(p_goal),p_criteria,p_provider_ref,p_model_ref,p_environment_ref) returning * into result;
 else
  if p_base_version<>current.version then raise exception 'REVISION_CONFLICT'; end if;
  next:=current.version+1;
  update public.workflow_evaluation_configs set version=next,enabled=coalesce(p_enabled,true),goal=btrim(p_goal),criteria=p_criteria,
   provider_ref=p_provider_ref,model_ref=p_model_ref,environment_ref=p_environment_ref,updated_at=now()
  where owner_user_id=p_owner and workflow_id=p_workflow returning * into result;
 end if;
 return jsonb_build_object('workflowId',result.workflow_id,'version',result.version,'enabled',result.enabled,'goal',result.goal,
  'criteria',result.criteria,'providerRef',result.provider_ref,'modelRef',result.model_ref,'environmentRef',result.environment_ref,'updatedAt',result.updated_at);
end $function$;
revoke all on function public.workflow_evaluation_config_save(uuid,text,integer,boolean,text,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.workflow_evaluation_config_save(uuid,text,integer,boolean,text,jsonb,text,text,text) to service_role;

create function workflow_private.capture_run_evaluation()
returns trigger language plpgsql security definer set search_path='' as $function$
declare snapshot jsonb; mode text; rubric integer;
begin
 if new.status not in ('success','failed','cancelled') or old.status is not distinct from new.status then return new; end if;
 snapshot:=coalesce(new.evaluation_snapshot,jsonb_build_object('schemaVersion',1,'enabled',true,'mode','rules','goal','','criteria','[]'::jsonb,'rubricVersion',0,'configVersion',0));
 mode:=case when snapshot->>'mode'='semantic' then 'semantic' else 'rules' end;
 rubric:=coalesce(nullif(snapshot->>'rubricVersion','')::integer,0);
 insert into public.workflow_run_evaluations(owner_user_id,run_id,workflow_id,revision,trigger_kind,status,mode,semantic_status,rubric_version,config_snapshot,provider_ref,model_ref)
 values(new.owner_user_id,new.run_id,new.workflow_id,new.revision,'automatic','queued',mode,
  case when mode='semantic' then 'pending' else 'not_configured' end,rubric,snapshot,snapshot->>'providerRef',snapshot->>'modelRef')
 on conflict do nothing;
 return new;
end $function$;
drop trigger if exists workflow_live_runs_evaluation_trigger on public.workflow_live_runs;
create trigger workflow_live_runs_evaluation_trigger after update of status on public.workflow_live_runs
for each row execute function workflow_private.capture_run_evaluation();

create function public.workflow_evaluation_retry(p_owner uuid,p_run uuid,p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare r public.workflow_live_runs; prior public.workflow_run_evaluations; created public.workflow_run_evaluations; snapshot jsonb; latest uuid; mode text;
begin
 if p_key is null or btrim(p_key)='' or length(p_key)>200 then raise exception 'INVALID_REQUEST'; end if;
 select * into r from public.workflow_live_runs where owner_user_id=p_owner and run_id=p_run for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if r.status not in ('success','failed','cancelled') then raise exception 'RUN_NOT_TERMINAL'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':evaluation:'||p_run::text,0));
 select * into prior from public.workflow_run_evaluations where owner_user_id=p_owner and request_key=p_key;
 if found then
  if prior.run_id<>p_run then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return to_jsonb(prior);
 end if;
 snapshot:=coalesce(r.evaluation_snapshot,workflow_private.evaluation_snapshot(p_owner,r.workflow_id));
 mode:=case when snapshot->>'mode'='semantic' then 'semantic' else 'rules' end;
 select evaluation_id into latest from public.workflow_run_evaluations where owner_user_id=p_owner and run_id=p_run order by created_at desc limit 1;
 insert into public.workflow_run_evaluations(owner_user_id,run_id,workflow_id,revision,trigger_kind,request_key,status,mode,semantic_status,rubric_version,config_snapshot,provider_ref,model_ref,supersedes_id)
 values(p_owner,p_run,r.workflow_id,r.revision,'manual',p_key,'queued',mode,
  case when mode='semantic' then 'pending' else 'not_configured' end,
  coalesce(nullif(snapshot->>'rubricVersion','')::integer,0),snapshot,snapshot->>'providerRef',snapshot->>'modelRef',latest)
 returning * into created;
 return to_jsonb(created);
end $function$;
revoke all on function public.workflow_evaluation_retry(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.workflow_evaluation_retry(uuid,uuid,text) to service_role;

create function workflow_private.evaluation_claim(p_worker text)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare e public.workflow_run_evaluations; r public.workflow_live_runs; d jsonb; payload jsonb;
begin
 if p_worker is null or length(p_worker)=0 then raise exception 'INVALID_WORKER'; end if;
 for e in
  select * from public.workflow_run_evaluations
  where (status='queued' and available_at<=now()) or (status='running' and lease_until<now())
  order by created_at for update skip locked
 loop
  if e.attempt_count>=e.max_attempts then
   update public.workflow_run_evaluations set status='failed',finished_at=now(),lease_until=null,worker_id=null,
    error_code=coalesce(error_code,'EVALUATION_RETRY_EXHAUSTED'),error_message=coalesce(error_message,'Evaluation retry budget exhausted')
    where evaluation_id=e.evaluation_id;
   continue;
  end if;
  select * into r from public.workflow_live_runs where run_id=e.run_id;
  if not found then
   update public.workflow_run_evaluations set status='failed',finished_at=now(),lease_until=null,worker_id=null,
    error_code='RUN_EVIDENCE_EXPIRED',error_message='The Run is no longer available for evaluation' where evaluation_id=e.evaluation_id;
   continue;
  end if;
  select definition into d from public.workflow_revisions where owner_user_id=e.owner_user_id and workflow_id=e.workflow_id and revision=e.revision;
  if d is null then
   update public.workflow_run_evaluations set status='failed',finished_at=now(),lease_until=null,worker_id=null,
    error_code='EVALUATION_DEFINITION_MISSING',error_message='The frozen Workflow revision is unavailable' where evaluation_id=e.evaluation_id;
   continue;
  end if;
  update public.workflow_run_evaluations set status='running',attempt_count=attempt_count+1,worker_id=p_worker,
   lease_until=now()+interval '120 seconds',started_at=coalesce(started_at,now()),error_code=null,error_message=null
   where evaluation_id=e.evaluation_id returning * into e;
  payload:=jsonb_build_object(
   'evaluationId',e.evaluation_id,'ownerId',e.owner_user_id,'runId',e.run_id,'workflowId',e.workflow_id,
   'revision',e.revision,'triggerKind',e.trigger_kind,'attempt',e.attempt_count,'maxAttempts',e.max_attempts,
   'config',e.config_snapshot,
   'run',jsonb_build_object('status',r.status,'output',r.output,'input',r.input,'error',r.error,
    'createdAt',r.created_at,'startedAt',r.started_at,'finishedAt',r.finished_at,
    'definitionHash',r.definition_hash,'semanticHash',r.semantic_hash,'environmentRef',r.environment_ref),
   'definition',jsonb_build_object('name',d->>'name','outputSchema',d->'outputSchema',
    'nodes',coalesce((select jsonb_agg(jsonb_build_object('id',n->>'id','type',n->>'type','label',n->>'label')) from jsonb_array_elements(d->'nodes') n),'[]'::jsonb)),
   'steps',coalesce((select jsonb_agg(step) from (
    select jsonb_build_object('nodeId',node_id,'invocation',invocation,'status',status,'error',error,
     'inputExcerpt',left(coalesce(input::text,''),1200),'outputExcerpt',left(coalesce(output::text,''),2400),
     'startedAt',started_at,'finishedAt',finished_at) step
    from public.workflow_run_steps where run_id=e.run_id order by invocation limit 80) s),'[]'::jsonb),
   'events',coalesce((select jsonb_agg(jsonb_build_object('type',type,'nodeId',node_id,'stepId',step_id,
    'payload',left(payload::text,3000),'occurredAt',occurred_at)) from (
    select * from public.workflow_run_events where run_id=e.run_id and type like 'tool.%' order by seq limit 60) ev),'[]'::jsonb));
  return payload;
 end loop;
 return null;
end $function$;
revoke all on function workflow_private.evaluation_claim(text) from public,anon,authenticated;
grant execute on function workflow_private.evaluation_claim(text) to workflow_worker,service_role;

create function workflow_private.evaluation_heartbeat(p_evaluation uuid,p_worker text)
returns boolean language plpgsql security definer set search_path='' as $function$
begin
 update public.workflow_run_evaluations set lease_until=now()+interval '120 seconds'
 where evaluation_id=p_evaluation and worker_id=p_worker and status='running';
 return found;
end $function$;
revoke all on function workflow_private.evaluation_heartbeat(uuid,text) from public,anon,authenticated;
grant execute on function workflow_private.evaluation_heartbeat(uuid,text) to workflow_worker,service_role;

create function workflow_private.evaluation_finish(p_evaluation uuid,p_worker text,p_status text,p_outcome text,
 p_semantic_status text,p_report jsonb,p_error_code text default null,p_error_message text default null,p_retryable boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare e public.workflow_run_evaluations; delay_seconds integer; next_status text;
begin
 if p_status not in ('completed','failed') then raise exception 'INVALID_STATUS'; end if;
 if p_report is not null and pg_column_size(p_report)>500000 then raise exception 'EVALUATION_REPORT_TOO_LARGE'; end if;
 select * into e from public.workflow_run_evaluations where evaluation_id=p_evaluation for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if e.status<>'running' or e.worker_id<>p_worker then raise exception 'LEASE_LOST'; end if;
 if p_status='completed' then
  update public.workflow_run_evaluations set status='completed',outcome=p_outcome,semantic_status=p_semantic_status,
   report=p_report,error_code=null,error_message=null,finished_at=now(),lease_until=null,worker_id=null
   where evaluation_id=p_evaluation;
  return jsonb_build_object('status','completed','evaluationId',p_evaluation);
 end if;
 if p_retryable and e.attempt_count<e.max_attempts then
  delay_seconds:=case e.attempt_count when 1 then 5 else 20 end;
  update public.workflow_run_evaluations set status='queued',report=p_report,error_code=p_error_code,
   error_message=left(coalesce(p_error_message,'Evaluation attempt failed'),500),semantic_status='pending',
   available_at=now()+make_interval(secs=>delay_seconds),lease_until=null,worker_id=null
   where evaluation_id=p_evaluation;
  return jsonb_build_object('status','queued','evaluationId',p_evaluation,'retryAfterSeconds',delay_seconds);
 end if;
 update public.workflow_run_evaluations set status='failed',outcome=coalesce(p_outcome,'rules_passed'),semantic_status=p_semantic_status,
  report=p_report,error_code=coalesce(p_error_code,'EVALUATION_FAILED'),error_message=left(coalesce(p_error_message,'Evaluation failed'),500),
  finished_at=now(),lease_until=null,worker_id=null where evaluation_id=p_evaluation;
 return jsonb_build_object('status','failed','evaluationId',p_evaluation);
end $function$;
revoke all on function workflow_private.evaluation_finish(uuid,text,text,text,text,jsonb,text,text,boolean) from public,anon,authenticated;
grant execute on function workflow_private.evaluation_finish(uuid,text,text,text,text,jsonb,text,text,boolean) to workflow_worker,service_role;

commit;

-- Nullable references preserve old Production bindings and RPC signatures.
-- Missing references are unavailable to the new executor, never guessed by target.
alter table public.course_action_bindings
  add column micro_path_id text references public.micro_learning_paths(id) on delete restrict,
  add column assignment_id text,
  add constraint action_binding_assignment foreign key(course_id,assignment_id)
    references public.course_assignments(course_id,id) on delete restrict,
  add constraint action_binding_one_executor check(micro_path_id is null or assignment_id is null);
create index action_binding_micro on public.course_action_bindings(micro_path_id) where micro_path_id is not null;
create index action_binding_assignment on public.course_action_bindings(course_id,assignment_id) where assignment_id is not null;

alter table public.edge_action_runs
  add column execution_version integer not null default 1 check(execution_version in (1,2)),
  add column assignment_id text,
  add constraint action_run_assignment foreign key(course_id,assignment_id)
    references public.course_assignments(course_id,id) on delete restrict;
create index action_run_assignment on public.edge_action_runs(course_id,assignment_id) where assignment_id is not null;

-- This is an execution guard, not a state mutation or a replacement mastery policy.
create function public.require_action_source(p_user_id uuid,p_edge_id text) returns void
language plpgsql security invoker set search_path=public as $$
begin
  if not exists(select 1 from knowledge_edges e join knowledge_nodes n on n.id=e.source_node_id
    join user_knowledge_states s on s.node_id=n.id and s.user_id=p_user_id
    where e.id=p_edge_id and e.lifecycle_status='active' and n.status='active'
      and s.status in ('learned','practicing','mastered')) then
    raise exception 'Source capability required' using errcode='23514';
  end if;
end $$;

create function public.require_action_execution_conditions(p_user_id uuid,p_course_id text,p_action_id uuid,p_binding_id uuid) returns void
language plpgsql security invoker set search_path=public as $$
declare a knowledge_edge_actions; b course_action_bindings; e knowledge_edges;
begin
  select * into a from knowledge_edge_actions where id=p_action_id and status='active' for share;
  if not found then raise exception 'Action unavailable' using errcode='23514'; end if;
  select * into e from knowledge_edges where id=a.edge_id and lifecycle_status='active' for share;
  if not found then raise exception 'Edge unavailable' using errcode='23514'; end if;
  select * into b from course_action_bindings where id=p_binding_id and course_id=p_course_id and action_id=p_action_id and available for share;
  if not found then raise exception 'Executor unavailable' using errcode='23514'; end if;
  perform require_action_source(p_user_id,e.id);
  if exists(select 1 from unnest(a.required_capability_ids) required(node_id) where not exists(select 1 from user_knowledge_states s join knowledge_nodes n on n.id=s.node_id where s.user_id=p_user_id and s.node_id=required.node_id and s.status in ('learned','practicing','mastered') and n.status='active' and n.scope='global')) then raise exception 'Execution capability missing' using errcode='23514'; end if;
  if exists(select 1 from unnest(a.resource_requirements) required(resource_key) where not exists(select 1 from jsonb_array_elements(coalesce(b.resources,'[]')) resource where resource->>'key'=required.resource_key and resource->>'available'='true' and length(trim(resource->>'reference'))>0)) then raise exception 'Execution resource missing' using errcode='23514'; end if;
  -- Recheck real hard prerequisites in the mutation transaction. Enables never gate.
  if not exists(select 1 from user_knowledge_states where user_id=p_user_id and node_id=e.target_node_id and status in ('learned','practicing','mastered'))
    and exists(select 1 from knowledge_edges p where p.target_node_id=e.target_node_id and p.relation='prerequisite' and p.prerequisite_strength='hard' and p.lifecycle_status='active'
      and not exists(select 1 from user_knowledge_states s join knowledge_nodes n on n.id=s.node_id where s.user_id=p_user_id and s.node_id=p.source_node_id and s.status in ('learned','practicing','mastered') and n.status='active')) then
    raise exception 'Target hard prerequisite required' using errcode='23514';
  end if;
  if a.type='practice_task' then
    if not exists(select 1 from course_assignments where course_id=p_course_id and id=b.assignment_id and mode<>'workflow' and coalesce(experience->>'type','answer')<>'workflow') then raise exception 'Assignment executor unsupported' using errcode='23514'; end if;
    if b.assignment_id is null or not exists(select 1 from assignment_coverages where course_id=p_course_id and assignment_id=b.assignment_id and node_id=e.target_node_id) then raise exception 'Assignment coverage required' using errcode='23514'; end if;
    if exists(select 1 from assignment_coverages c left join knowledge_nodes n on n.id=c.node_id
      where c.course_id=p_course_id and c.assignment_id=b.assignment_id and (n.id is null or n.status<>'active' or not(n.scope='global' or (n.scope='user' and n.owner_id=p_user_id::text))
        or (c.node_id<>e.target_node_id and not exists(select 1 from user_knowledge_states s where s.user_id=p_user_id and s.node_id=c.node_id and s.status in ('learned','practicing','mastered'))))) then raise exception 'Assignment Knowledge readiness required' using errcode='23514'; end if;
    if exists(select 1 from assignment_dependencies d where d.course_id=p_course_id and d.target_assignment_id=b.assignment_id and d.strength='hard'
      and not exists(select 1 from user_assignment_states s where s.user_id=p_user_id and s.course_id=p_course_id and s.assignment_id=d.source_assignment_id and s.status='accepted')) then raise exception 'Assignment dependency required' using errcode='23514'; end if;
  end if;
end $$;
revoke all on function public.require_action_execution_conditions(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.require_action_execution_conditions(uuid,text,uuid,uuid) to service_role;

create function public.select_edge_action_v2(
  p_user_id uuid,p_course_id text,p_action_id uuid,p_selection_key uuid,
  p_action_version timestamptz,p_binding_version timestamptz,
  p_expected_active_run_id uuid default null,p_repeat_run_id uuid default null
) returns public.edge_action_runs language plpgsql security invoker set search_path=public as $$
declare a knowledge_edge_actions; b course_action_bindings; e knowledge_edges; r edge_action_runs; active_run edge_action_runs;
begin
  select * into a from knowledge_edge_actions where id=p_action_id for share;
  if not found then raise exception 'Action unavailable' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_course_id||':'||a.edge_id,0));
  select * into r from edge_action_runs where user_id=p_user_id and selection_key=p_selection_key;
  if found then
    if r.action_id<>p_action_id or r.course_id<>p_course_id or r.execution_version<>2 then raise exception 'Selection key conflict' using errcode='23514'; end if;
    return r;
  end if;
  if p_repeat_run_id is not null and not exists(select 1 from edge_action_runs where id=p_repeat_run_id and user_id=p_user_id and course_id=p_course_id and action_id=p_action_id and edge_id=a.edge_id and status='completed') then raise exception 'Repeated execution unavailable' using errcode='P0002'; end if;
  select * into e from knowledge_edges where id=a.edge_id for share;
  perform require_action_source(p_user_id,e.id);
  select * into b from course_action_bindings where course_id=p_course_id and action_id=p_action_id for share;
  if not found or not b.available or b.updated_at is distinct from p_binding_version then raise exception 'Execution binding changed' using errcode='PT409'; end if;
  perform require_action_execution_conditions(p_user_id,p_course_id,a.id,b.id);
  if a.type='micro_learning' then
    if b.micro_path_id is null or b.assignment_id is not null then raise exception 'Explicit Micro resource required' using errcode='23514'; end if;
  elsif b.assignment_id is null or b.micro_path_id is not null or not exists(
    select 1 from assignment_coverages where course_id=p_course_id and assignment_id=b.assignment_id and node_id=e.target_node_id
  ) then raise exception 'Explicit Assignment target coverage required' using errcode='23514'; end if;
  select * into active_run from edge_action_runs where user_id=p_user_id and course_id=p_course_id and edge_id=a.edge_id and status in ('selected','in_progress') for update;
  if active_run.id is not null and active_run.action_id=a.id and active_run.execution_version=2
    and active_run.execution_snapshot->'action'->>'updated_at'=to_jsonb(a)->>'updated_at'
    and active_run.execution_snapshot->'binding'->>'updated_at'=to_jsonb(b)->>'updated_at' then return active_run; end if;
  if active_run.id is distinct from p_expected_active_run_id then raise exception 'Confirm current active action before switching' using errcode='PT409'; end if;
  -- Cancel only the specifically confirmed record. Legacy callers cannot cancel v2 work.
  if active_run.id is not null then update edge_action_runs set status='cancelled',updated_at=now() where id=active_run.id; end if;
  -- Existing selection owns immutable snapshots, resource checks and active-choice uniqueness.
  r := select_edge_action(p_user_id,p_course_id,p_action_id,p_selection_key,p_action_version,p_binding_version,b.micro_path_id);
  update edge_action_runs set execution_version=2,assignment_id=b.assignment_id,execution_snapshot=execution_snapshot||jsonb_build_object('repeatedFromRunId',p_repeat_run_id) where id=r.id returning * into r;
  return r;
end $$;

create function public.transition_edge_action_run_v2(p_user_id uuid,p_run_id uuid,p_operation text)
returns public.edge_action_runs language plpgsql security invoker set search_path=public as $$
declare r edge_action_runs;
begin
  select * into r from edge_action_runs where id=p_run_id and user_id=p_user_id for update;
  if not found then raise exception 'Run unavailable' using errcode='P0002'; end if;
  if p_operation='start' then
    perform require_action_execution_conditions(p_user_id,r.course_id,r.action_id,r.binding_id);
    if not exists(select 1 from knowledge_edge_actions template join course_action_bindings b on b.id=r.binding_id where template.id=r.action_id and template.updated_at=(r.execution_snapshot->'action'->>'updated_at')::timestamptz and b.updated_at=(r.execution_snapshot->'binding'->>'updated_at')::timestamptz) then raise exception 'Execution snapshot changed' using errcode='PT409'; end if;
    if r.execution_version<>2 then raise exception 'Select an explicitly configured action to start' using errcode='PT409'; end if;
    return transition_edge_action_run(p_user_id,p_run_id,'start',null);
  elsif p_operation='sync-micro' then
    if r.execution_version=2 then return sync_action_micro_run(p_user_id,p_run_id); end if;
    if r.status='completed' then return r; end if;
    if r.execution_version<>2 or r.status<>'in_progress' or r.micro_path_id is null then raise exception 'Micro is not running' using errcode='23514'; end if;
    return sync_action_micro_run(p_user_id,p_run_id);
  else raise exception 'Practice results must use Assignment execution' using errcode='23514'; end if;
end $$;
revoke all on function public.require_action_source(uuid,text) from public,anon,authenticated;
revoke all on function public.select_edge_action_v2(uuid,text,uuid,uuid,timestamptz,timestamptz,uuid,uuid) from public,anon,authenticated;
revoke all on function public.transition_edge_action_run_v2(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.require_action_source(uuid,text) to service_role;
grant execute on function public.select_edge_action_v2(uuid,text,uuid,uuid,timestamptz,timestamptz,uuid,uuid) to service_role;
grant execute on function public.transition_edge_action_run_v2(uuid,uuid,text) to service_role;

-- Reuse Assignment Attempt / PerformanceResult / Evidence; only add execution lineage.
alter table public.edge_action_runs add constraint action_run_owned_assignment unique(id,user_id,course_id,assignment_id);
alter table public.learning_attempts add column action_run_id uuid,
  add constraint attempt_action_run foreign key(action_run_id,user_id,course_id,assignment_id)
    references public.edge_action_runs(id,user_id,course_id,assignment_id) on delete restrict,
  add constraint attempt_owned_assignment unique(id,user_id,course_id,assignment_id);
create index attempt_action_run on public.learning_attempts(action_run_id) where action_run_id is not null;
alter table public.edge_action_runs add column assignment_attempt_id uuid,
  add constraint run_assignment_attempt foreign key(assignment_attempt_id,user_id,course_id,assignment_id)
    references public.learning_attempts(id,user_id,course_id,assignment_id) on delete restrict;
create index run_assignment_attempt on public.edge_action_runs(assignment_attempt_id) where assignment_attempt_id is not null;
alter table public.edge_action_runs drop constraint edge_action_runs_check;
alter table public.edge_action_runs add constraint edge_action_runs_check check(status<>'completed' or
  (completed_at is not null and (evidence_source_id is not null or micro_path_id is not null or assignment_attempt_id is not null)));

create function public.record_action_assignment_attempt(
  p_user_id uuid,p_run_id uuid,p_idempotency_key text,p_response jsonb,
  p_outcome text,p_score numeric,p_feedback jsonb,p_evaluator_kind text
) returns table(attempt_id uuid,result_id uuid,outcome text,duplicate boolean)
language plpgsql security invoker set search_path=public as $$
declare r edge_action_runs; saved record; existing learning_attempts;
begin
  select * into r from edge_action_runs where id=p_run_id and user_id=p_user_id;
  if not found or r.assignment_id is null then raise exception 'Assignment action unavailable' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || r.course_id || ':' || r.assignment_id,0));
  select * into r from edge_action_runs where id=p_run_id and user_id=p_user_id for update;
  if not found or r.execution_version<>2 or r.assignment_id is null then raise exception 'Assignment action unavailable' using errcode='P0002'; end if;
  select * into existing from learning_attempts where user_id=p_user_id and course_id=r.course_id and assignment_id=r.assignment_id and idempotency_key=p_idempotency_key;
  if existing.id is not null and existing.action_run_id is distinct from r.id then raise exception 'Attempt belongs to another execution' using errcode='23505'; end if;
  if existing.id is not null then
    if existing.response is distinct from p_response then raise exception 'idempotency_key_reused_with_different_response' using errcode='23505'; end if;
    return query select existing.id,pr.id,pr.outcome,true from performance_results pr where pr.attempt_id=existing.id order by pr.version desc limit 1;
    return;
  end if;
  if existing.id is null and exists(select 1 from performance_results pr where pr.attempt_id=r.assignment_attempt_id and pr.version=(select max(v.version) from performance_results v where v.attempt_id=r.assignment_attempt_id) and pr.outcome='pending') then raise exception 'Current attempt awaits review' using errcode='23514'; end if;
  if existing.id is null and r.status<>'in_progress' then raise exception 'Assignment action is not running' using errcode='23514'; end if;
  perform require_action_execution_conditions(p_user_id,r.course_id,r.action_id,r.binding_id);
  if not exists(select 1 from knowledge_edge_actions template join course_action_bindings b on b.id=r.binding_id where template.id=r.action_id and template.updated_at=(r.execution_snapshot->'action'->>'updated_at')::timestamptz and b.updated_at=(r.execution_snapshot->'binding'->>'updated_at')::timestamptz) then raise exception 'Execution snapshot changed' using errcode='PT409'; end if;
  select * into saved from record_assignment_attempt(p_user_id,r.course_id,r.assignment_id,p_idempotency_key,p_response,p_outcome,p_score,p_feedback,p_evaluator_kind);
  if not saved.duplicate then
    update learning_attempts set action_run_id=r.id where id=saved.attempt_id;
    update edge_action_runs set assignment_attempt_id=saved.attempt_id,
      status=case when saved.outcome='passed' then 'completed' else status end,
      completed_at=case when saved.outcome='passed' then coalesce(completed_at,now()) else completed_at end,updated_at=now() where id=r.id;
  end if;
  attempt_id:=saved.attempt_id;result_id:=saved.result_id;outcome:=saved.outcome;duplicate:=saved.duplicate;return next;
end $$;
revoke all on function public.record_action_assignment_attempt(uuid,uuid,text,jsonb,text,numeric,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_action_assignment_attempt(uuid,uuid,text,jsonb,text,numeric,jsonb,text) to service_role;

alter table public.edge_action_runs add constraint action_run_owned_micro unique(id,user_id,course_id,micro_path_id);
alter table public.micro_step_attempts add column action_run_id uuid,
  add constraint micro_attempt_action_run foreign key(action_run_id,user_id,course_id,path_id)
    references public.edge_action_runs(id,user_id,course_id,micro_path_id) on delete restrict;
create index micro_attempt_action_run on public.micro_step_attempts(action_run_id) where action_run_id is not null;

create function public.sync_action_micro_run(p_user_id uuid,p_run_id uuid) returns public.edge_action_runs
language plpgsql security invoker set search_path=public as $$
declare r edge_action_runs;
begin
  select * into r from edge_action_runs where id=p_run_id and user_id=p_user_id for update;
  if not found or r.execution_version<>2 or r.micro_path_id is null then raise exception 'Micro action unavailable' using errcode='P0002'; end if;
  if r.status='in_progress' and exists(select 1 from micro_units where path_id=r.micro_path_id and required)
    and not exists(select 1 from micro_units u join micro_steps s on s.unit_id=u.id where u.path_id=r.micro_path_id and u.required
      and not exists(select 1 from micro_step_attempts a where a.action_run_id=r.id and a.step_id=s.id and a.completion_accepted)) then
    update edge_action_runs set status='completed',completed_at=now(),updated_at=now() where id=r.id returning * into r;
  end if;
  return r;
end $$;

create function public.record_action_micro_step(
  p_user_id uuid,p_path_id text,p_unit_id text,p_step_id text,p_context_course_id text,p_key text,
  p_response jsonb,p_correct boolean,p_outcome text,p_step_hash text,p_duration integer,p_decision_id uuid,
  p_expected_step jsonb,p_route_node_ids text[],p_expected_version_id uuid,p_run_id uuid
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare r edge_action_runs; result jsonb; prior micro_step_attempts; a micro_step_attempts; p micro_learning_paths; s micro_steps; next_number integer;
begin
  -- Same evidence lock as the existing Micro writer; no competing sequence authority.
  perform pg_advisory_xact_lock(hashtextextended('criterion-evidence:'||p_user_id::text,0));
  select * into r from edge_action_runs where id=p_run_id and user_id=p_user_id and course_id=p_context_course_id and micro_path_id=p_path_id for update;
  if not found or r.execution_version<>2 then raise exception 'Micro action context mismatch' using errcode='23514'; end if;
  select * into prior from micro_step_attempts where user_id=p_user_id and idempotency_key=p_key;
  if prior.id is not null and prior.action_run_id is distinct from r.id then raise exception 'Attempt belongs to another execution' using errcode='23505'; end if;
  if prior.id is null and r.status<>'in_progress' then raise exception 'Micro action is not running' using errcode='23514'; end if;
  perform require_action_execution_conditions(p_user_id,r.course_id,r.action_id,r.binding_id);
  if not exists(select 1 from knowledge_edge_actions template join course_action_bindings b on b.id=r.binding_id where template.id=r.action_id and template.updated_at=(r.execution_snapshot->'action'->>'updated_at')::timestamptz and b.updated_at=(r.execution_snapshot->'binding'->>'updated_at')::timestamptz and b.micro_path_id=r.micro_path_id) then raise exception 'Execution snapshot changed' using errcode='PT409'; end if;
  result := record_micro_step_attempt_v2(p_user_id,p_path_id,p_unit_id,p_step_id,p_context_course_id,p_key,p_response,p_correct,p_outcome,p_step_hash,p_duration,p_decision_id,p_expected_step,p_route_node_ids,p_expected_version_id);
  if result->'attempt' is not null and result->'attempt'<>'null'::jsonb then
    update micro_step_attempts set action_run_id=r.id where id=(result->'attempt'->>'id')::uuid returning * into a;
  else
    -- Completed content is deliberate repeated work. Keep the existing evaluator,
    -- store a run-scoped observation, and do not duplicate completion/mastery evidence.
    select * into p from micro_learning_paths where id=p_path_id;
    select * into s from micro_steps where id=p_step_id;
    select coalesce(max(attempt_number),0)+1 into next_number from micro_step_attempts where user_id=p_user_id and path_id=p_path_id and step_id=p_step_id;
    insert into micro_step_attempts(user_id,course_id,knowledge_id,path_id,unit_id,step_id,path_revision,step_hash,criterion_refs,interaction_type,attempt_number,idempotency_key,response,outcome,completion_accepted,client_duration_ms,decision_id,action_run_id)
      values(p_user_id,r.course_id,p.knowledge_id,p_path_id,p_unit_id,p_step_id,p.revision,p_step_hash,'[]'::jsonb,coalesce(s.interaction->>'type','instruction'),next_number,p_key,p_response,p_outcome,p_correct,p_duration,p_decision_id,r.id) returning * into a;
  end if;
  r := sync_action_micro_run(p_user_id,r.id);
  return result || jsonb_build_object('duplicate',prior.id is not null,'attempt',to_jsonb(a),'actionRun',to_jsonb(r),'actionStepIds',
    (select coalesce(jsonb_agg(distinct step_id),'[]'::jsonb) from micro_step_attempts where action_run_id=r.id and completion_accepted));
end $$;
revoke all on function public.sync_action_micro_run(uuid,uuid) from public,anon,authenticated;
revoke all on function public.record_action_micro_step(uuid,text,text,text,text,text,jsonb,boolean,text,text,integer,uuid,jsonb,text[],uuid,uuid) from public,anon,authenticated;
grant execute on function public.sync_action_micro_run(uuid,uuid) to service_role;
grant execute on function public.record_action_micro_step(uuid,text,text,text,text,text,jsonb,boolean,text,text,integer,uuid,jsonb,text[],uuid,uuid) to service_role;

-- One evaluator, optionally addressed by an exact attempt for repeated execution.
create or replace function public.record_manual_assignment_review(
  p_learner_user_id uuid,p_course_id text,p_assignment_id text,p_reviewer_user_id uuid,p_attempt_id uuid
) returns table(attempt_id uuid,result_id uuid,outcome text)
language plpgsql security invoker set search_path = public as $$
declare target_attempt uuid;target_result uuid;next_version integer;now_at timestamptz:=now();state_status text;
begin
  if not exists(select 1 from profiles where id=p_reviewer_user_id and role in ('admin','teacher')) then raise exception 'Reviewer authority required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_learner_user_id::text || ':' || p_course_id || ':' || p_assignment_id,0));
  select a.id into target_attempt from learning_attempts a where a.id=p_attempt_id and a.user_id=p_learner_user_id and a.course_id=p_course_id and a.assignment_id=p_assignment_id for update;
  if target_attempt is null then raise exception 'formal_attempt_not_found' using errcode='P0002'; end if;
  select pr.outcome into state_status from performance_results pr where pr.attempt_id=target_attempt order by pr.version desc limit 1;
  if state_status is distinct from 'pending' then raise exception 'Only pending attempts can be reviewed' using errcode='23514'; end if;
  select coalesce(max(pr.version),0)+1 into next_version from performance_results pr where pr.attempt_id=target_attempt;
  insert into performance_results(attempt_id,user_id,course_id,assignment_id,version,outcome,score,feedback,evaluator_kind,evaluated_by,evaluated_at)
    values(target_attempt,p_learner_user_id,p_course_id,p_assignment_id,next_version,'passed',1,jsonb_build_object('code','teacher_accepted','message','Teacher accepted the submitted evidence.'),'manual',p_reviewer_user_id,now_at) returning id into target_result;
  insert into learning_events(user_id,event_type,course_id,assignment_id,attempt_id,result_id,payload,occurred_at)
    values(p_learner_user_id,'assignment_reviewed',p_course_id,p_assignment_id,target_attempt,target_result,jsonb_build_object('outcome','passed','reviewedBy',p_reviewer_user_id),now_at);
  update user_assignment_states set status='accepted',progress=100,accepted_at=coalesce(accepted_at,now_at),updated_at=now_at where user_id=p_learner_user_id and course_id=p_course_id and assignment_id=p_assignment_id;
  insert into knowledge_evidence(user_id,node_id,event_type,source_entity_id,outcome,context,occurred_at)
    select p_learner_user_id,ac.node_id,'assignment_accepted',target_result::text,'accepted',jsonb_build_object('courseId',p_course_id,'assignmentId',p_assignment_id,'attemptId',target_attempt,'resultId',target_result,'evaluatorKind','manual','acceptedBy',p_reviewer_user_id),now_at
    from assignment_coverages ac where ac.course_id=p_course_id and ac.assignment_id=p_assignment_id on conflict(user_id,node_id,event_type,source_entity_id) do nothing;
  perform finalize_assignment_mastery(p_learner_user_id,p_course_id,p_assignment_id);
  update edge_action_runs r set status='completed',assignment_attempt_id=target_attempt,completed_at=coalesce(r.completed_at,now_at),updated_at=now_at
    from learning_attempts a where a.id=target_attempt and r.id=a.action_run_id and r.user_id=p_learner_user_id and r.status='in_progress';
  attempt_id:=target_attempt;result_id:=target_result;outcome:='passed';return next;
end $$;


-- Keep the original signature and submitted/latest semantics for old Production.
create or replace function public.record_manual_assignment_review(
  p_learner_user_id uuid,p_course_id text,p_assignment_id text,p_reviewer_user_id uuid
) returns table(attempt_id uuid,result_id uuid,outcome text)
language plpgsql security definer set search_path=public as $$
declare target_attempt uuid; state_status text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_learner_user_id::text || ':' || p_course_id || ':' || p_assignment_id,0));
  select status into state_status from user_assignment_states where user_id=p_learner_user_id and course_id=p_course_id and assignment_id=p_assignment_id for update;
  if state_status is distinct from 'submitted' then raise exception 'assignment_not_submitted' using errcode='23514'; end if;
  select a.id into target_attempt from learning_attempts a where a.user_id=p_learner_user_id and a.course_id=p_course_id and a.assignment_id=p_assignment_id order by a.attempt_number desc limit 1;
  return query select * from record_manual_assignment_review(p_learner_user_id,p_course_id,p_assignment_id,p_reviewer_user_id,target_attempt);
end $$;
revoke all on function public.record_manual_assignment_review(uuid,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_manual_assignment_review(uuid,text,text,uuid,uuid) to service_role;

-- Keep legacy observer behavior; v2 never treats a historical completion as this run.
create or replace function public.complete_matching_micro_action_runs() returns trigger language plpgsql set search_path=public as $$
begin
  update edge_action_runs set status='completed',completed_at=coalesce(new.completed_at,now()),updated_at=now()
  where user_id=new.user_id and micro_path_id=new.path_id and status='in_progress'
    and execution_version=1;
  return new;
end $$;

-- Legacy RPCs preserve v1 behavior and cannot bypass v2 confirmation/result authority.
create or replace function public.select_edge_action(p_user_id uuid,p_course_id text,p_action_id uuid,p_selection_key uuid,p_action_version timestamptz,p_binding_version timestamptz,p_micro_path_id text default null)
returns public.edge_action_runs language plpgsql set search_path=public as $$
declare a knowledge_edge_actions; b course_action_bindings; e knowledge_edges; r edge_action_runs;
begin
  select * into a from knowledge_edge_actions where id=p_action_id for share;
  if not found or a.status<>'active' or a.updated_at<>p_action_version then raise exception 'Action changed' using errcode='PT409'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_course_id||':'||a.edge_id,0));
  select * into r from edge_action_runs where user_id=p_user_id and selection_key=p_selection_key;
  if found then
    if r.action_id<>p_action_id or r.course_id<>p_course_id then raise exception 'Selection key conflict' using errcode='23514'; end if;
    return r;
  end if;
  if not exists(select 1 from courses where id=p_course_id and lifecycle='published' and (course_type='standard' or owner_user_id=p_user_id)) then raise exception 'Course unavailable' using errcode='P0002'; end if;
  select * into e from knowledge_edges where id=a.edge_id and lifecycle_status='active' for share;
  if not found or e.relation not in ('prerequisite','enables') or (select count(*) from knowledge_nodes where id in(e.source_node_id,e.target_node_id) and scope='global' and status='active')<>2 then raise exception 'Edge unavailable' using errcode='23514'; end if;
  select * into b from course_action_bindings where course_id=p_course_id and action_id=a.id for share;
  if (b.id is not null and (not b.available or b.updated_at is distinct from p_binding_version)) or (b.id is null and p_binding_version is not null) then raise exception 'Resources changed' using errcode='PT409'; end if;
  if exists(select 1 from unnest(a.required_capability_ids) required(node_id) where not exists(select 1 from user_knowledge_states s join knowledge_nodes n on n.id=s.node_id where s.user_id=p_user_id and s.node_id=required.node_id and s.status in ('learned','practicing','mastered') and n.status='active' and n.scope='global')) then raise exception 'Execution capability missing' using errcode='23514'; end if;
  if exists(select 1 from unnest(a.resource_requirements) required(resource_key) where not exists(select 1 from jsonb_array_elements(coalesce(b.resources,'[]')) resource where resource->>'key'=required.resource_key and resource->>'available'='true' and length(trim(resource->>'reference'))>0)) then raise exception 'Execution resource missing' using errcode='23514'; end if;
  if a.type='micro_learning' then
    if not exists(select 1 from micro_learning_paths p where p.id=p_micro_path_id and p.knowledge_id=e.target_node_id and p.status='published' and p.mode='learn' and (p.course_id is null or p.course_id=p_course_id)) then raise exception 'Micro unavailable' using errcode='23514'; end if;
  elsif p_micro_path_id is not null then raise exception 'Practice cannot use Micro' using errcode='23514'; end if;
  select * into r from edge_action_runs where user_id=p_user_id and course_id=p_course_id and edge_id=a.edge_id and status in ('selected','in_progress') for update;
  if found and r.action_id=a.id and r.execution_snapshot->'action'->>'updated_at'=to_jsonb(a)->>'updated_at' and r.binding_id is not distinct from b.id and (b.id is null or r.execution_snapshot->'binding'->>'updated_at'=to_jsonb(b)->>'updated_at') and r.micro_path_id is not distinct from p_micro_path_id then return r; end if;
  if r.id is not null and r.execution_version=2 then raise exception 'Confirm current action in the current client' using errcode='PT409'; end if;
  update edge_action_runs set status='cancelled',updated_at=now() where user_id=p_user_id and course_id=p_course_id and edge_id=a.edge_id and status in ('selected','in_progress');
  insert into edge_action_runs(user_id,course_id,action_id,edge_id,binding_id,status,selection_key,execution_snapshot,micro_path_id)
    values(p_user_id,p_course_id,a.id,a.edge_id,b.id,'selected',p_selection_key,jsonb_build_object('action',to_jsonb(a),'binding',case when b.id is null then 'null'::jsonb else to_jsonb(b) end,'sourceId',e.source_node_id,'targetId',e.target_node_id),p_micro_path_id) returning * into r;
  return r;
end $$;

create or replace function public.transition_edge_action_run(p_user_id uuid,p_run_id uuid,p_operation text,p_source_id uuid default null)
returns public.edge_action_runs language plpgsql set search_path=public as $$
declare r edge_action_runs; s user_evidence_sources;
begin
  select * into r from edge_action_runs where id=p_run_id and user_id=p_user_id for update;
  if not found then raise exception 'Run unavailable' using errcode='P0002'; end if;
  if p_operation='start' then
    if r.status in ('in_progress','completed') then return r; end if;
    if r.status<>'selected' then raise exception 'Run cancelled' using errcode='23514'; end if;
    -- Revalidate governed availability immediately before execution.
    if not exists(select 1 from knowledge_edge_actions a join knowledge_edges e on e.id=a.edge_id join knowledge_nodes n on n.id=e.source_node_id join knowledge_nodes t on t.id=e.target_node_id where a.id=r.action_id and a.status='active' and a.updated_at=(r.execution_snapshot->'action'->>'updated_at')::timestamptz and e.lifecycle_status='active' and e.source_node_id=r.execution_snapshot->>'sourceId' and e.target_node_id=r.execution_snapshot->>'targetId' and n.status='active' and t.status='active' and n.scope='global' and t.scope='global') then raise exception 'Action changed; select again' using errcode='PT409'; end if;
    if r.binding_id is null and exists(select 1 from course_action_bindings where course_id=r.course_id and action_id=r.action_id) then raise exception 'Resources added; select again' using errcode='PT409'; end if;
    if r.micro_path_id is not null and not exists(select 1 from micro_learning_paths p where p.id=r.micro_path_id and p.knowledge_id=r.execution_snapshot->>'targetId' and p.status='published' and p.mode='learn' and (p.course_id is null or p.course_id=r.course_id)) then raise exception 'Selected Micro changed' using errcode='PT409'; end if;
    if r.binding_id is not null and not exists(select 1 from course_action_bindings b where b.id=r.binding_id and b.available and b.updated_at=(r.execution_snapshot->'binding'->>'updated_at')::timestamptz) then raise exception 'Resources changed; select again' using errcode='PT409'; end if;
    if exists(select 1 from jsonb_array_elements_text(r.execution_snapshot->'action'->'required_capability_ids') required(node_id) where not exists(select 1 from user_knowledge_states k join knowledge_nodes n on n.id=k.node_id where k.user_id=p_user_id and k.node_id=required.node_id and k.status in ('learned','practicing','mastered') and n.scope='global' and n.status='active')) then raise exception 'Required capability changed' using errcode='23514'; end if;
    update edge_action_runs set status='in_progress',started_at=now(),updated_at=now() where id=r.id returning * into r;
  elsif p_operation='submit' then
    if r.execution_version=2 then raise exception 'Use Assignment execution for this action' using errcode='23514'; end if;
    if r.status='completed' and r.evidence_source_id=p_source_id then return r; end if;
    if r.status<>'in_progress' or r.execution_snapshot->'action'->>'type'<>'practice_task' then raise exception 'Practice is not running' using errcode='23514'; end if;
    select * into s from user_evidence_sources where id=p_source_id and user_id=p_user_id for update;
    if not found or s.parse_status<>'ready' or s.archived_at is not null or s.source_sha256 is null or s.created_at<r.started_at then raise exception 'Result source unavailable' using errcode='23514'; end if;
    update edge_action_runs set status='completed',evidence_source_id=s.id,completed_at=now(),updated_at=now() where id=r.id returning * into r;
    update user_evidence_sources set provenance=provenance||jsonb_build_object('kind','action-result','actionRunId',r.id,'actionId',r.action_id,'courseId',r.course_id) where id=s.id;
  elsif p_operation='sync-micro' then
    if r.execution_version=2 then return sync_action_micro_run(p_user_id,p_run_id); end if;
    if r.status='completed' then return r; end if;
    if r.status<>'in_progress' or r.micro_path_id is null then raise exception 'Micro is not running' using errcode='23514'; end if;
    if exists(select 1 from user_micro_path_progress where user_id=p_user_id and path_id=r.micro_path_id and status='completed' and (r.execution_version=1 or completed_at>=r.started_at)) then
      update edge_action_runs set status='completed',completed_at=now(),updated_at=now() where id=r.id returning * into r;
    end if;
  else raise exception 'Unknown run operation' using errcode='23514'; end if;
  return r;
end $$;

-- Stage 2: Assignment entry and accepted results use the centralized learner-state
-- policy, and AI evaluation becomes a real server-only PerformanceResult producer.
--
-- Forward-only. Existing higher Knowledge states, Attempts, Results and route
-- history are preserved. No destructive backfill is performed.

-- ---------------------------------------------------------------------------
-- 1. Central learner-state policy: assignment entry may raise `practicing`.
-- ---------------------------------------------------------------------------

create or replace function public.raise_user_knowledge_state(
  p_user_id uuid, p_node_id text, p_minimum_status text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  resulting_status text;
  state_order constant text[] := array['explore','learning','learned','practicing','mastered'];
begin
  if p_user_id is null or p_node_id is null then
    raise exception 'invalid_learning_state_input' using errcode='22023';
  end if;
  -- Micro callers still pass only `learning`/`learned`. Assignment entry adds
  -- `practicing`, and the mastery policy adds `mastered`. Monotonic and idempotent.
  if p_minimum_status is null or p_minimum_status not in ('learning','learned','practicing','mastered') then
    raise exception 'invalid_learning_state_target' using errcode='22023';
  end if;
  if not exists(select 1 from knowledge_nodes where id=p_node_id and status='active') then
    raise exception 'knowledge_unavailable' using errcode='P0002';
  end if;
  insert into user_knowledge_states(user_id,node_id,status,updated_at)
  values(p_user_id,p_node_id,p_minimum_status,now())
  on conflict(user_id,node_id) do update set
    status=case
      when array_position(state_order,user_knowledge_states.status) >= array_position(state_order,excluded.status)
        then user_knowledge_states.status
      else excluded.status
    end,
    updated_at=case
      when array_position(state_order,user_knowledge_states.status) >= array_position(state_order,excluded.status)
        then user_knowledge_states.updated_at
      else excluded.updated_at
    end
  returning status into resulting_status;
  return resulting_status;
end $$;
revoke all on function public.raise_user_knowledge_state(uuid,text,text) from public,anon,authenticated;
grant execute on function public.raise_user_knowledge_state(uuid,text,text) to service_role;

-- Server-only entry point. The handler revalidates eligibility first; this RPC
-- revalidates the published Course/Assignment pair and raises every covered
-- Knowledge to at least `practicing` in one transaction.
create or replace function public.start_assignment_learning_state(
  p_user_id uuid, p_course_id text, p_assignment_id text
) returns text[]
language plpgsql security definer set search_path = public as $$
declare covered_node text; raised text[] := '{}';
begin
  if p_user_id is null or p_course_id is null or p_assignment_id is null then
    raise exception 'invalid_learning_state_input' using errcode='22023';
  end if;
  if not exists(
    select 1 from courses c join course_assignments a on a.course_id=c.id
    where c.id=p_course_id and a.id=p_assignment_id and c.lifecycle='published'
  ) then
    raise exception 'assignment_not_found' using errcode='P0002';
  end if;
  for covered_node in
    select distinct node_id from assignment_coverages
    where course_id=p_course_id and assignment_id=p_assignment_id
    order by node_id
  loop
    perform public.raise_user_knowledge_state(p_user_id,covered_node,'practicing');
    raised := array_append(raised,covered_node);
  end loop;
  return raised;
end $$;
revoke all on function public.start_assignment_learning_state(uuid,text,text) from public,anon,authenticated;
grant execute on function public.start_assignment_learning_state(uuid,text,text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Mastery. Required Assignments are `assignment_coverages.required`.
--    A required Learn Path is course-specific when present; otherwise the
--    published Global required Learn Path is the fallback. No required
--    Assignment means no mastery (the Knowledge remains `learned`).
-- ---------------------------------------------------------------------------

create or replace function public.recompute_knowledge_mastery(
  p_user_id uuid, p_node_id text, p_course_id text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare paths_ready boolean := false; assignments_ready boolean := false;
begin
  if p_user_id is null or p_node_id is null or p_course_id is null then
    return false;
  end if;

  select count(*) > 0 and bool_and(coalesce(progress.status='completed',false)) into paths_ready
  from micro_learning_paths path
  left join user_micro_path_progress progress
    on progress.path_id=path.id and progress.user_id=p_user_id
  where path.knowledge_id=p_node_id
    and path.mode='learn' and path.required and path.status='published'
    and (
      path.course_id=p_course_id
      or (
        path.course_id is null and path.scope='global'
        and not exists(
          select 1 from micro_learning_paths course_path
          where course_path.knowledge_id=path.knowledge_id
            and course_path.course_id=p_course_id
            and course_path.mode='learn' and course_path.required and course_path.status='published'
        )
      )
    );

  -- Every explicitly required Assignment covering this Knowledge in this
  -- Course must have a committed passed Result. Result authority is evaluator-
  -- agnostic: rule, manual teacher acceptance and AI use the same row.
  select count(*) > 0 and bool_and(
    exists(
      select 1
      from learning_attempts attempt
      where attempt.user_id=p_user_id
        and attempt.course_id=coverage.course_id
        and attempt.assignment_id=coverage.assignment_id
        and (
          select result.outcome from performance_results result
          where result.attempt_id=attempt.id
          order by result.version desc limit 1
        ) = 'passed'
    )
  ) into assignments_ready
  from assignment_coverages coverage
  where coverage.node_id=p_node_id and coverage.course_id=p_course_id and coverage.required;

  if paths_ready and assignments_ready then
    perform public.raise_user_knowledge_state(p_user_id,p_node_id,'mastered');
    return true;
  end if;
  return false;
end $$;
revoke all on function public.recompute_knowledge_mastery(uuid,text,text) from public,anon,authenticated;
grant execute on function public.recompute_knowledge_mastery(uuid,text,text) to service_role;

create or replace function public.finalize_assignment_mastery(
  p_user_id uuid, p_course_id text, p_assignment_id text
) returns void
language plpgsql security definer set search_path = public as $$
declare covered_node text;
begin
  for covered_node in
    select node_id from assignment_coverages
    where course_id=p_course_id and assignment_id=p_assignment_id
    order by node_id
  loop
    perform public.recompute_knowledge_mastery(p_user_id,covered_node,p_course_id);
  end loop;
end $$;
revoke all on function public.finalize_assignment_mastery(uuid,text,text) from public,anon,authenticated;
grant execute on function public.finalize_assignment_mastery(uuid,text,text) to service_role;

-- Every evaluator (rule, manual teacher, AI) appends a PerformanceResult. The
-- trigger is evaluator-agnostic and runs in the same transaction as the result.
create or replace function public.after_performance_result_mastery()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.outcome='passed' then
    perform public.finalize_assignment_mastery(new.user_id,new.course_id,new.assignment_id);
  end if;
  return new;
end $$;
revoke all on function public.after_performance_result_mastery() from public,anon,authenticated;
grant execute on function public.after_performance_result_mastery() to service_role;
drop trigger if exists performance_results_mastery on public.performance_results;
create trigger performance_results_mastery
after insert on public.performance_results
for each row execute function public.after_performance_result_mastery();

-- Required Learn Path completion can be the second half of mastery when the
-- required Assignment was already accepted. Guarded so repeated progress writes
-- do not re-run the policy.
create or replace function public.after_required_micro_path_completion()
returns trigger language plpgsql security definer set search_path = public as $$
declare completed_node text; candidate_course text;
begin
  if new.status='completed' and (tg_op='INSERT' or old.status is distinct from 'completed') then
    select path.knowledge_id into completed_node
    from micro_learning_paths path
    where path.id=new.path_id and path.status='published' and path.mode='learn' and path.required;
    if completed_node is not null then
      for candidate_course in
        select distinct course_id from assignment_coverages
        where node_id=completed_node and required
      loop
        perform public.recompute_knowledge_mastery(new.user_id,completed_node,candidate_course);
      end loop;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.after_required_micro_path_completion() from public,anon,authenticated;
grant execute on function public.after_required_micro_path_completion() to service_role;
drop trigger if exists user_micro_path_progress_mastery on public.user_micro_path_progress;
create trigger user_micro_path_progress_mastery
after insert or update of status on public.user_micro_path_progress
for each row execute function public.after_required_micro_path_completion();

-- ---------------------------------------------------------------------------
-- 3. AI evaluator kind and submission recording.
-- ---------------------------------------------------------------------------

alter table public.performance_results
  drop constraint if exists performance_results_evaluator_kind_check;
alter table public.performance_results
  add constraint performance_results_evaluator_kind_check
  check (evaluator_kind = any (array['rule','manual','ai']));

-- Latest service-owned conversation submission writer. Only the allowed
-- evaluator kinds change; the Attempt + pending Result stay one transaction.
create or replace function public.record_conversation_assignment_attempt(
  p_learner_user_id uuid,
  p_course_id text,p_assignment_id text,p_idempotency_key text,p_response jsonb,
  p_outcome text,p_score numeric,p_feedback jsonb,p_evaluator_kind text
) returns table(attempt_id uuid,result_id uuid,outcome text,duplicate boolean)
language plpgsql security invoker set search_path = public as $$
declare
  actor uuid := p_learner_user_id; target_attempt uuid; target_result uuid; target_response jsonb;
  next_attempt integer; now_at timestamptz := now();
begin
  if p_response->>'submissionMode' is distinct from 'conversation' then raise exception 'Conversation authority required' using errcode='22023'; end if;
  if actor is null then raise exception 'learner_not_found' using errcode='P0002'; end if;
  if length(coalesce(p_idempotency_key,'')) not between 8 and 160 then raise exception 'invalid_idempotency_key' using errcode='22023'; end if;
  if jsonb_typeof(p_response) <> 'object' or p_outcome not in ('passed','failed','pending') or p_evaluator_kind not in ('rule','manual','ai') then raise exception 'invalid_attempt_result' using errcode='22023'; end if;
  if not exists (select 1 from courses c join course_assignments a on a.course_id=c.id where c.id=p_course_id and a.id=p_assignment_id and c.lifecycle='published') then raise exception 'assignment_not_found' using errcode='P0002'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_course_id || ':' || p_assignment_id,0));
  select a.id,r.id,r.outcome,a.response into target_attempt,target_result,outcome,target_response
  from learning_attempts a join lateral (select * from performance_results pr where pr.attempt_id=a.id order by pr.version desc limit 1) r on true
  where a.user_id=actor and a.course_id=p_course_id and a.assignment_id=p_assignment_id and a.idempotency_key=p_idempotency_key;
  if target_attempt is not null then
    if target_response <> p_response then raise exception 'idempotency_key_reused_with_different_response' using errcode='23505'; end if;
    attempt_id:=target_attempt;result_id:=target_result;duplicate:=true;return next;return;
  end if;

  perform 1 from user_evidence_sources where id in (select value::uuid from jsonb_array_elements_text(coalesce(p_response->'attachmentSourceIds','[]'))) order by id for update;
  if exists(select 1 from jsonb_array_elements_text(coalesce(p_response->'attachmentSourceIds','[]')) id
    where not exists(select 1 from user_evidence_sources s where s.id=id.value::uuid and s.user_id=actor and s.parse_status='ready' and s.archived_at is null and s.source_sha256 is not null)) then raise exception 'Owned ready attachment required' using errcode='23514'; end if;
  select coalesce(max(a.attempt_number),0)+1 into next_attempt from learning_attempts a where a.user_id=actor and a.course_id=p_course_id and a.assignment_id=p_assignment_id;
  insert into learning_attempts(user_id,course_id,assignment_id,attempt_number,idempotency_key,response,submitted_at)
    values(actor,p_course_id,p_assignment_id,next_attempt,p_idempotency_key,p_response,now_at) returning id into target_attempt;
  insert into learning_events(user_id,event_type,course_id,assignment_id,attempt_id,payload,occurred_at)
    values(actor,'assignment_attempted',p_course_id,p_assignment_id,target_attempt,jsonb_build_object('attemptNumber',next_attempt),now_at);
  insert into performance_results(attempt_id,user_id,course_id,assignment_id,version,outcome,score,feedback,evaluator_kind,evaluated_at)
    values(target_attempt,actor,p_course_id,p_assignment_id,1,p_outcome,p_score,coalesce(p_feedback,'{}'::jsonb),p_evaluator_kind,now_at) returning id into target_result;
  insert into learning_events(user_id,event_type,course_id,assignment_id,attempt_id,result_id,payload,occurred_at)
    values(actor,'performance_resulted',p_course_id,p_assignment_id,target_attempt,target_result,jsonb_build_object('outcome',p_outcome,'evaluatorKind',p_evaluator_kind),now_at);
  insert into user_assignment_states(user_id,course_id,assignment_id,status,progress,started_at,submitted_at,accepted_at,updated_at)
    values(actor,p_course_id,p_assignment_id,case p_outcome when 'passed' then 'accepted' when 'failed' then 'needs_revision' else 'submitted' end,case p_outcome when 'passed' then 100 when 'failed' then 50 else 75 end,now_at,now_at,case when p_outcome='passed' then now_at end,now_at)
  on conflict(user_id,course_id,assignment_id) do update set
    status=case when user_assignment_states.status='accepted' then 'accepted' else excluded.status end,
    progress=greatest(user_assignment_states.progress,excluded.progress),started_at=coalesce(user_assignment_states.started_at,excluded.started_at),
    submitted_at=excluded.submitted_at,accepted_at=coalesce(user_assignment_states.accepted_at,excluded.accepted_at),updated_at=excluded.updated_at;
  if p_outcome='passed' then
    insert into knowledge_evidence(user_id,node_id,event_type,source_entity_id,outcome,context,occurred_at)
    select actor,ac.node_id,'assignment_accepted',target_result::text,'accepted',jsonb_build_object('courseId',p_course_id,'assignmentId',p_assignment_id,'attemptId',target_attempt,'resultId',target_result,'evaluatorKind',p_evaluator_kind),now_at
    from assignment_coverages ac where ac.course_id=p_course_id and ac.assignment_id=p_assignment_id
    on conflict(user_id,node_id,event_type,source_entity_id) do nothing;
  end if;
  attempt_id:=target_attempt;result_id:=target_result;outcome:=p_outcome;duplicate:=false;return next;
end $$;
revoke all on function public.record_conversation_assignment_attempt(uuid,text,text,text,jsonb,text,numeric,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_conversation_assignment_attempt(uuid,text,text,text,jsonb,text,numeric,jsonb,text) to service_role;

-- Service-role/admin writer kept consistent with the same evaluator kinds.
create or replace function public.record_assignment_attempt(
  p_learner_user_id uuid,
  p_course_id text,p_assignment_id text,p_idempotency_key text,p_response jsonb,
  p_outcome text,p_score numeric,p_feedback jsonb,p_evaluator_kind text
) returns table(attempt_id uuid,result_id uuid,outcome text,duplicate boolean)
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := p_learner_user_id; target_attempt uuid; target_result uuid; target_response jsonb;
  next_attempt integer; now_at timestamptz := now();
begin
  if actor is null or not exists(select 1 from auth.users where id=actor) then raise exception 'learner_not_found' using errcode='P0002'; end if;
  if length(coalesce(p_idempotency_key,'')) not between 8 and 160 then raise exception 'invalid_idempotency_key' using errcode='22023'; end if;
  if jsonb_typeof(p_response) <> 'object' or p_outcome not in ('passed','failed','pending') or p_evaluator_kind not in ('rule','manual','ai') then raise exception 'invalid_attempt_result' using errcode='22023'; end if;
  if not exists (select 1 from courses c join course_assignments a on a.course_id=c.id where c.id=p_course_id and a.id=p_assignment_id and c.lifecycle='published') then raise exception 'assignment_not_found' using errcode='P0002'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_course_id || ':' || p_assignment_id,0));
  select a.id,r.id,r.outcome,a.response into target_attempt,target_result,outcome,target_response
  from learning_attempts a join lateral (select * from performance_results pr where pr.attempt_id=a.id order by pr.version desc limit 1) r on true
  where a.user_id=actor and a.course_id=p_course_id and a.assignment_id=p_assignment_id and a.idempotency_key=p_idempotency_key;
  if target_attempt is not null then
    if target_response <> p_response then raise exception 'idempotency_key_reused_with_different_response' using errcode='23505'; end if;
    attempt_id:=target_attempt;result_id:=target_result;duplicate:=true;return next;return;
  end if;

  select coalesce(max(a.attempt_number),0)+1 into next_attempt from learning_attempts a where a.user_id=actor and a.course_id=p_course_id and a.assignment_id=p_assignment_id;
  insert into learning_attempts(user_id,course_id,assignment_id,attempt_number,idempotency_key,response,submitted_at)
    values(actor,p_course_id,p_assignment_id,next_attempt,p_idempotency_key,p_response,now_at) returning id into target_attempt;
  insert into learning_events(user_id,event_type,course_id,assignment_id,attempt_id,payload,occurred_at)
    values(actor,'assignment_attempted',p_course_id,p_assignment_id,target_attempt,jsonb_build_object('attemptNumber',next_attempt),now_at);
  insert into performance_results(attempt_id,user_id,course_id,assignment_id,version,outcome,score,feedback,evaluator_kind,evaluated_at)
    values(target_attempt,actor,p_course_id,p_assignment_id,1,p_outcome,p_score,coalesce(p_feedback,'{}'::jsonb),p_evaluator_kind,now_at) returning id into target_result;
  insert into learning_events(user_id,event_type,course_id,assignment_id,attempt_id,result_id,payload,occurred_at)
    values(actor,'performance_resulted',p_course_id,p_assignment_id,target_attempt,target_result,jsonb_build_object('outcome',p_outcome,'evaluatorKind',p_evaluator_kind),now_at);
  insert into user_assignment_states(user_id,course_id,assignment_id,status,progress,started_at,submitted_at,accepted_at,updated_at)
    values(actor,p_course_id,p_assignment_id,case p_outcome when 'passed' then 'accepted' when 'failed' then 'needs_revision' else 'submitted' end,case p_outcome when 'passed' then 100 when 'failed' then 50 else 75 end,now_at,now_at,case when p_outcome='passed' then now_at end,now_at)
  on conflict(user_id,course_id,assignment_id) do update set
    status=case when user_assignment_states.status='accepted' then 'accepted' else excluded.status end,
    progress=greatest(user_assignment_states.progress,excluded.progress),started_at=coalesce(user_assignment_states.started_at,excluded.started_at),
    submitted_at=excluded.submitted_at,accepted_at=coalesce(user_assignment_states.accepted_at,excluded.accepted_at),updated_at=excluded.updated_at;
  if p_outcome='passed' then
    insert into knowledge_evidence(user_id,node_id,event_type,source_entity_id,outcome,context,occurred_at)
    select actor,ac.node_id,'assignment_accepted',target_result::text,'accepted',jsonb_build_object('courseId',p_course_id,'assignmentId',p_assignment_id,'attemptId',target_attempt,'resultId',target_result,'evaluatorKind',p_evaluator_kind),now_at
    from assignment_coverages ac where ac.course_id=p_course_id and ac.assignment_id=p_assignment_id
    on conflict(user_id,node_id,event_type,source_entity_id) do nothing;
  end if;
  attempt_id:=target_attempt;result_id:=target_result;outcome:=p_outcome;duplicate:=false;return next;
end $$;
revoke all on function public.record_assignment_attempt(uuid,text,text,text,jsonb,text,numeric,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_assignment_attempt(uuid,text,text,text,jsonb,text,numeric,jsonb,text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. AI evaluation run log. One row per actual model request; handoff rows do
--    not count toward the model rate limit. The table is learner-readable only.
-- ---------------------------------------------------------------------------

create table if not exists public.assignment_ai_evaluations (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.learning_attempts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,
  assignment_id text not null,
  status text not null check (status in ('running','succeeded','failed','handed_off')),
  model text,
  prompt_version text,
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists assignment_ai_evaluations_attempt_idx
  on public.assignment_ai_evaluations(attempt_id, created_at desc);
create index if not exists assignment_ai_evaluations_user_idx
  on public.assignment_ai_evaluations(user_id, created_at desc);
create index if not exists assignment_ai_evaluations_practice_idx
  on public.assignment_ai_evaluations(user_id, course_id, assignment_id, created_at desc);

alter table public.assignment_ai_evaluations enable row level security;
drop policy if exists assignment_ai_evaluations_own_read on public.assignment_ai_evaluations;
create policy assignment_ai_evaluations_own_read on public.assignment_ai_evaluations
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on table public.assignment_ai_evaluations from anon, authenticated;
grant select on table public.assignment_ai_evaluations to authenticated;
grant all on table public.assignment_ai_evaluations to service_role;

-- Claim one model request. Serialized per Attempt. A fresh running row or a
-- succeeded row returns `in_progress`; a committed Result returns `final`; a
-- handed-off row returns `handed_off`; only a failed/stale run is retried.
create or replace function public.claim_assignment_ai_evaluation(
  p_user_id uuid, p_attempt_id uuid
) returns table(status text, run_id uuid, attempt_id uuid, result_id uuid, outcome text, error_code text)
language plpgsql security definer set search_path = public as $$
declare
  attempt_record learning_attempts%rowtype;
  latest_result performance_results%rowtype;
  last_run assignment_ai_evaluations%rowtype;
  user_requests integer; practice_requests integer; new_run uuid;
begin
  if p_user_id is null or p_attempt_id is null then
    return query select 'unavailable'::text,null::uuid,p_attempt_id,null::uuid,null::text,null::text; return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('assignment-ai-eval:'||p_attempt_id::text,0));

  select * into attempt_record from learning_attempts
  where id=p_attempt_id and user_id=p_user_id;
  if attempt_record.id is null then
    return query select 'unavailable'::text,null::uuid,p_attempt_id,null::uuid,null::text,null::text; return;
  end if;
  if not exists(
    select 1 from courses c join course_assignments a on a.course_id=c.id
    where c.id=attempt_record.course_id and a.id=attempt_record.assignment_id and c.lifecycle='published'
  ) then
    return query select 'unavailable'::text,null::uuid,p_attempt_id,null::uuid,null::text,null::text; return;
  end if;

  select * into latest_result from performance_results result_row
  where result_row.attempt_id=p_attempt_id order by result_row.version desc limit 1;
  if latest_result.id is null then
    return query select 'unavailable'::text,null::uuid,p_attempt_id,null::uuid,null::text,null::text; return;
  end if;
  if latest_result.evaluator_kind <> 'ai' then
    return query select 'not_ai'::text,null::uuid,p_attempt_id,latest_result.id,latest_result.outcome,null::text; return;
  end if;
  if latest_result.outcome <> 'pending' then
    return query select 'final'::text,null::uuid,p_attempt_id,latest_result.id,latest_result.outcome,null::text; return;
  end if;

  select * into last_run from assignment_ai_evaluations run_row
  where run_row.attempt_id=p_attempt_id order by run_row.created_at desc limit 1;
  if last_run.id is not null then
    if last_run.status='handed_off' then
      return query select 'handed_off'::text,last_run.id,p_attempt_id,null::uuid,null::text,null::text; return;
    end if;
    if last_run.status='succeeded' then
      return query select 'in_progress'::text,last_run.id,p_attempt_id,null::uuid,null::text,null::text; return;
    end if;
    if last_run.status='running' and last_run.started_at > now()-interval '3 minutes' then
      return query select 'in_progress'::text,last_run.id,p_attempt_id,null::uuid,null::text,null::text; return;
    end if;
  end if;

  select count(*) into user_requests from assignment_ai_evaluations rate_row
  where rate_row.user_id=p_user_id and rate_row.status <> 'handed_off' and rate_row.created_at > now()-interval '10 minutes';
  select count(*) into practice_requests from assignment_ai_evaluations rate_row
  where rate_row.user_id=p_user_id and rate_row.course_id=attempt_record.course_id
    and rate_row.assignment_id=attempt_record.assignment_id
    and rate_row.status <> 'handed_off' and rate_row.created_at > now()-interval '10 minutes';
  if user_requests >= 20 or practice_requests >= 8 then
    return query select 'rate_limited'::text,null::uuid,p_attempt_id,null::uuid,null::text,null::text; return;
  end if;

  insert into assignment_ai_evaluations(attempt_id,user_id,course_id,assignment_id,status,started_at)
  values(p_attempt_id,p_user_id,attempt_record.course_id,attempt_record.assignment_id,'running',now())
  returning id into new_run;
  return query select 'claimed'::text,new_run,p_attempt_id,null::uuid,null::text,null::text;
end $$;
revoke all on function public.claim_assignment_ai_evaluation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_assignment_ai_evaluation(uuid,uuid) to service_role;

-- Finalize a claimed AI run atomically: append a new PerformanceResult version,
-- update the same learner states/evidence as every other evaluator, and close
-- the run. If another evaluator already finalized the Attempt, return that
-- result rather than appending a conflicting one.
create or replace function public.record_assignment_ai_evaluation(
  p_user_id uuid, p_run_id uuid, p_outcome text, p_score numeric,
  p_feedback jsonb, p_model text, p_prompt_version text
) returns table(result_id uuid, outcome text, version integer)
language plpgsql security definer set search_path = public as $$
declare
  run_record assignment_ai_evaluations%rowtype;
  attempt_record learning_attempts%rowtype;
  latest_result performance_results%rowtype;
  target_result uuid; next_version integer; now_at timestamptz := now();
begin
  if p_outcome not in ('passed','failed') then raise exception 'invalid_ai_outcome' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_feedback,'{}'::jsonb)) <> 'object' then raise exception 'invalid_ai_feedback' using errcode='22023'; end if;
  select * into run_record from assignment_ai_evaluations
  where id=p_run_id and user_id=p_user_id for update;
  if run_record.id is null or run_record.status <> 'running' then
    raise exception 'ai_evaluation_run_unavailable' using errcode='P0002';
  end if;
  select * into attempt_record from learning_attempts
  where id=run_record.attempt_id and user_id=p_user_id;
  if attempt_record.id is null then raise exception 'ai_evaluation_attempt_unavailable' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('assignment-ai-eval:'||attempt_record.id::text,0));

  select * into latest_result from performance_results
  where attempt_id=attempt_record.id order by version desc limit 1;
  if latest_result.id is null then raise exception 'ai_evaluation_result_unavailable' using errcode='P0002'; end if;
  if latest_result.evaluator_kind <> 'ai' then
    update assignment_ai_evaluations set status='failed',error_code='not_ai',completed_at=now_at,model=p_model,prompt_version=p_prompt_version
    where id=run_record.id;
    raise exception 'ai_evaluation_not_requested' using errcode='23514';
  end if;
  if latest_result.outcome <> 'pending' then
    update assignment_ai_evaluations set status='succeeded',completed_at=now_at,model=p_model,prompt_version=p_prompt_version
    where id=run_record.id;
    result_id:=latest_result.id; outcome:=latest_result.outcome; version:=latest_result.version; return next; return;
  end if;

  select coalesce(max(pr.version),0)+1 into next_version from performance_results pr where pr.attempt_id=attempt_record.id;
  insert into performance_results(attempt_id,user_id,course_id,assignment_id,version,outcome,score,feedback,evaluator_kind,evaluated_at)
  values(attempt_record.id,p_user_id,attempt_record.course_id,attempt_record.assignment_id,next_version,p_outcome,p_score,p_feedback,'ai',now_at)
  returning id into target_result;

  insert into learning_events(user_id,event_type,course_id,assignment_id,attempt_id,result_id,payload,occurred_at)
  values(p_user_id,'assignment_reviewed',attempt_record.course_id,attempt_record.assignment_id,attempt_record.id,target_result,
    jsonb_build_object('outcome',p_outcome,'evaluatorKind','ai','model',p_model,'promptVersion',p_prompt_version),now_at);

  insert into user_assignment_states(user_id,course_id,assignment_id,status,progress,started_at,submitted_at,accepted_at,updated_at)
  values(p_user_id,attempt_record.course_id,attempt_record.assignment_id,
    case p_outcome when 'passed' then 'accepted' else 'needs_revision' end,
    case p_outcome when 'passed' then 100 else 50 end,
    coalesce(attempt_record.submitted_at,now_at),coalesce(attempt_record.submitted_at,now_at),
    case when p_outcome='passed' then now_at end,now_at)
  on conflict(user_id,course_id,assignment_id) do update set
    status=case when user_assignment_states.status='accepted' then 'accepted' else excluded.status end,
    progress=greatest(user_assignment_states.progress,excluded.progress),
    submitted_at=coalesce(user_assignment_states.submitted_at,excluded.submitted_at),
    accepted_at=coalesce(user_assignment_states.accepted_at,excluded.accepted_at),
    updated_at=excluded.updated_at;

  if p_outcome='passed' then
    insert into knowledge_evidence(user_id,node_id,event_type,source_entity_id,outcome,context,occurred_at)
    select p_user_id,ac.node_id,'assignment_accepted',target_result::text,'accepted',
      jsonb_build_object('courseId',attempt_record.course_id,'assignmentId',attempt_record.assignment_id,'attemptId',attempt_record.id,'resultId',target_result,'evaluatorKind','ai','model',p_model,'promptVersion',p_prompt_version),now_at
    from assignment_coverages ac
    where ac.course_id=attempt_record.course_id and ac.assignment_id=attempt_record.assignment_id
    on conflict(user_id,node_id,event_type,source_entity_id) do nothing;
    update edge_action_runs r set status='completed',assignment_attempt_id=attempt_record.id,
      completed_at=coalesce(r.completed_at,now_at),updated_at=now_at
    from learning_attempts a
    where a.id=attempt_record.id and r.id=a.action_run_id and r.user_id=p_user_id and r.status='in_progress';
  end if;

  update assignment_ai_evaluations
  set status='succeeded',completed_at=now_at,model=p_model,prompt_version=p_prompt_version,error_code=null
  where id=run_record.id;
  result_id:=target_result; outcome:=p_outcome; version:=next_version; return next;
end $$;
revoke all on function public.record_assignment_ai_evaluation(uuid,uuid,text,numeric,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.record_assignment_ai_evaluation(uuid,uuid,text,numeric,jsonb,text,text) to service_role;

create or replace function public.fail_assignment_ai_evaluation(
  p_user_id uuid, p_run_id uuid, p_error_code text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare changed integer;
begin
  update assignment_ai_evaluations
  set status='failed',error_code=left(coalesce(p_error_code,'unknown'),120),completed_at=now()
  where id=p_run_id and user_id=p_user_id and status='running';
  get diagnostics changed = row_count;
  return changed > 0;
end $$;
revoke all on function public.fail_assignment_ai_evaluation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.fail_assignment_ai_evaluation(uuid,uuid,text) to service_role;

-- Explicit "改交老师": no Result is appended; the pending Attempt remains for
-- manual review and future AI claims stop.
create or replace function public.handoff_assignment_ai_evaluation(
  p_user_id uuid, p_attempt_id uuid
) returns text
language plpgsql security definer set search_path = public as $$
declare attempt_record learning_attempts%rowtype; latest_result performance_results%rowtype; last_run assignment_ai_evaluations%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('assignment-ai-eval:'||p_attempt_id::text,0));
  select * into attempt_record from learning_attempts where id=p_attempt_id and user_id=p_user_id;
  if attempt_record.id is null then return 'unavailable'; end if;
  select * into latest_result from performance_results where attempt_id=p_attempt_id order by version desc limit 1;
  if latest_result.id is null then return 'unavailable'; end if;
  if latest_result.evaluator_kind <> 'ai' then return 'not_ai'; end if;
  if latest_result.outcome <> 'pending' then return 'final'; end if;
  select * into last_run from assignment_ai_evaluations where attempt_id=p_attempt_id order by created_at desc limit 1;
  if last_run.id is not null and last_run.status='handed_off' then return 'handed_off'; end if;
  insert into assignment_ai_evaluations(attempt_id,user_id,course_id,assignment_id,status,started_at,completed_at)
  values(p_attempt_id,p_user_id,attempt_record.course_id,attempt_record.assignment_id,'handed_off',now(),now());
  return 'handed_off';
end $$;
revoke all on function public.handoff_assignment_ai_evaluation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.handoff_assignment_ai_evaluation(uuid,uuid) to service_role;

-- Additive conversation submission API. Existing Production RPC signatures are preserved.
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
  if p_response->>'submissionMode'  is distinct from 'conversation' then raise exception 'Conversation authority required' using errcode='22023'; end if;
  if actor is null or not exists(select 1 from auth.users where id=actor) then raise exception 'learner_not_found' using errcode='P0002'; end if;
  if length(coalesce(p_idempotency_key,'')) not between 8 and 160 then raise exception 'invalid_idempotency_key' using errcode='22023'; end if;
  if jsonb_typeof(p_response) <> 'object' or p_outcome not in ('passed','failed','pending') or p_evaluator_kind not in ('rule','manual') then raise exception 'invalid_attempt_result' using errcode='22023'; end if;
  if not exists (select 1 from courses c join course_assignments a on a.course_id=c.id where c.id=p_course_id and a.id=p_assignment_id and c.lifecycle='published') then raise exception 'assignment_not_found' using errcode='P0002'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_course_id || ':' || p_assignment_id,0));
  select a.id,r.id,r.outcome,a.response into target_attempt,target_result,outcome,target_response
  from learning_attempts a join lateral (select * from performance_results pr where pr.attempt_id=a.id order by pr.version desc limit 1) r on true
  where a.user_id=actor and a.course_id=p_course_id and a.assignment_id=p_assignment_id and a.idempotency_key=p_idempotency_key;
  if target_attempt is not null then
    if target_response <> p_response then raise exception 'idempotency_key_reused_with_different_response' using errcode='23505'; end if;
    attempt_id:=target_attempt;result_id:=target_result;duplicate:=true;return next;return;
  end if;

  -- Lock selected original sources so archive cannot race the formal write.
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
create function public.record_conversation_action_assignment_attempt(
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
  select * into saved from record_conversation_assignment_attempt(p_user_id,r.course_id,r.assignment_id,p_idempotency_key,p_response,p_outcome,p_score,p_feedback,p_evaluator_kind);
  if not saved.duplicate then
    update learning_attempts set action_run_id=r.id where id=saved.attempt_id;
    update edge_action_runs set assignment_attempt_id=saved.attempt_id,
      status=case when saved.outcome='passed' then 'completed' else status end,
      completed_at=case when saved.outcome='passed' then coalesce(completed_at,now()) else completed_at end,updated_at=now() where id=r.id;
  end if;
  attempt_id:=saved.attempt_id;result_id:=saved.result_id;outcome:=saved.outcome;duplicate:=saved.duplicate;return next;
end $$;
revoke all on function public.record_conversation_action_assignment_attempt(uuid,uuid,text,jsonb,text,numeric,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_conversation_action_assignment_attempt(uuid,uuid,text,jsonb,text,numeric,jsonb,text) to service_role;

create or replace function public.recompute_knowledge_mastery(
  p_user_id uuid, p_node_id text, p_course_id text
) returns boolean language plpgsql security definer set search_path = public as $$
declare paths_ready boolean := false; assignments_ready boolean := false;
begin
  if exists(select 1 from micro_learning_paths where knowledge_id=p_node_id and course_id=p_course_id and mode='learn' and required and status='published') then
    select count(*) > 0 and bool_and(coalesce(progress.status='completed',false)) into paths_ready
    from micro_learning_paths path left join user_micro_path_progress progress on progress.path_id=path.id and progress.user_id=p_user_id
    where path.knowledge_id=p_node_id and path.course_id=p_course_id and path.mode='learn' and path.required and path.status='published';
  else
    select count(*) > 0 and bool_and(coalesce(progress.status='completed',false)) into paths_ready
    from micro_learning_paths path left join user_micro_path_progress progress on progress.path_id=path.id and progress.user_id=p_user_id
    where path.knowledge_id=p_node_id and path.course_id is null and path.scope='global' and path.mode='learn' and path.required and path.status='published';
  end if;
  select count(*) > 0 and bool_and(coalesce(state.status='accepted',false) and coalesce(accepted.response->>'submissionMode','')<>'conversation') into assignments_ready
  from assignment_coverages coverage left join user_assignment_states state
    on state.user_id=p_user_id and state.course_id=coverage.course_id and state.assignment_id=coverage.assignment_id
  left join lateral (select a.response from learning_attempts a
    join lateral (select outcome from performance_results r where r.attempt_id=a.id order by version desc limit 1) result on result.outcome='passed'
    where a.user_id=p_user_id and a.course_id=coverage.course_id and a.assignment_id=coverage.assignment_id order by a.attempt_number desc limit 1) accepted on true
  where coverage.node_id=p_node_id and coverage.course_id=p_course_id and coverage.required;
  if paths_ready and assignments_ready then
    insert into user_knowledge_states(user_id,node_id,status,updated_at) values(p_user_id,p_node_id,'mastered',now())
    on conflict(user_id,node_id) do update set status='mastered',updated_at=excluded.updated_at;
    return true;
  end if;
  return false;
end $$;

revoke all on function public.recompute_knowledge_mastery(uuid,text,text) from public,anon,authenticated;
grant execute on function public.recompute_knowledge_mastery(uuid,text,text) to service_role;

-- Conversation review is still authoritative for Result, never capability.
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
  if (select response->>'submissionMode' from learning_attempts where id=target_attempt) is distinct from 'conversation' then
    perform finalize_assignment_mastery(p_learner_user_id,p_course_id,p_assignment_id);
  end if;
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

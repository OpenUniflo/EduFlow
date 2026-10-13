-- Practice completion is a saved performance, independent of its quality. No UKS or Route writes.
create or replace function public.record_conversation_action_assignment_attempt(
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
  if existing.id is null and r.status<>'in_progress' then raise exception 'Assignment action is not running' using errcode='23514'; end if;
  perform require_action_execution_conditions(p_user_id,r.course_id,r.action_id,r.binding_id);
  if not exists(select 1 from knowledge_edge_actions template join course_action_bindings b on b.id=r.binding_id where template.id=r.action_id and template.updated_at=(r.execution_snapshot->'action'->>'updated_at')::timestamptz and b.updated_at=(r.execution_snapshot->'binding'->>'updated_at')::timestamptz) then raise exception 'Execution snapshot changed' using errcode='PT409'; end if;
  select * into saved from record_conversation_assignment_attempt(p_user_id,r.course_id,r.assignment_id,p_idempotency_key,p_response,p_outcome,p_score,p_feedback,p_evaluator_kind);
  if not saved.duplicate then
    update learning_attempts set action_run_id=r.id where id=saved.attempt_id;
    update edge_action_runs set assignment_attempt_id=saved.attempt_id,
      status='completed',
      completed_at=coalesce(completed_at,now()),updated_at=now() where id=r.id;
  end if;
  attempt_id:=saved.attempt_id;result_id:=saved.result_id;outcome:=saved.outcome;duplicate:=saved.duplicate;return next;
end $$;
revoke all on function public.record_conversation_action_assignment_attempt(uuid,uuid,text,jsonb,text,numeric,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_conversation_action_assignment_attempt(uuid,uuid,text,jsonb,text,numeric,jsonb,text) to service_role;

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


create or replace function public.record_action_assignment_attempt(
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
  if existing.id is null and r.status<>'in_progress' then raise exception 'Assignment action is not running' using errcode='23514'; end if;
  perform require_action_execution_conditions(p_user_id,r.course_id,r.action_id,r.binding_id);
  if not exists(select 1 from knowledge_edge_actions template join course_action_bindings b on b.id=r.binding_id where template.id=r.action_id and template.updated_at=(r.execution_snapshot->'action'->>'updated_at')::timestamptz and b.updated_at=(r.execution_snapshot->'binding'->>'updated_at')::timestamptz) then raise exception 'Execution snapshot changed' using errcode='PT409'; end if;
  select * into saved from record_assignment_attempt(p_user_id,r.course_id,r.assignment_id,p_idempotency_key,p_response,p_outcome,p_score,p_feedback,p_evaluator_kind);
  if not saved.duplicate then
    update learning_attempts set action_run_id=r.id where id=saved.attempt_id;
    update edge_action_runs set assignment_attempt_id=saved.attempt_id,
      status='completed',
      completed_at=coalesce(completed_at,now()),updated_at=now() where id=r.id;
  end if;
  attempt_id:=saved.attempt_id;result_id:=saved.result_id;outcome:=saved.outcome;duplicate:=saved.duplicate;return next;
end $$;
revoke all on function public.record_action_assignment_attempt(uuid,uuid,text,jsonb,text,numeric,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_action_assignment_attempt(uuid,uuid,text,jsonb,text,numeric,jsonb,text) to service_role;

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

  update edge_action_runs r set status='completed',assignment_attempt_id=target_attempt,completed_at=coalesce(r.completed_at,now_at),updated_at=now_at
    from learning_attempts a where a.id=target_attempt and r.id=a.action_run_id and r.user_id=p_learner_user_id and r.status='in_progress';
  attempt_id:=target_attempt;result_id:=target_result;outcome:='passed';return next;
end $$;



create or replace function public.recompute_knowledge_mastery(p_user_id uuid,p_node_id text,p_course_id text)
returns boolean language sql security invoker set search_path=public as $$ select false $$;

-- Preserve existing submitted attempts/results; complete their execution record without granting capability.
update public.edge_action_runs r set status='completed', completed_at=coalesce(r.completed_at,a.submitted_at),updated_at=now()
from public.learning_attempts a where a.id=r.assignment_attempt_id and a.action_run_id=r.id and r.status='in_progress'
and exists(select 1 from public.performance_results pr where pr.attempt_id=a.id);

-- Learning activity is progress, never formal capability authority. Existing UKS history is preserved.
create or replace function public.start_micro_for_route_v2(p_user_id uuid,p_path_id text,p_context_course_id text,p_expected_version_id uuid,p_route_node_ids text[])
returns jsonb language plpgsql security invoker set search_path='public' as $$
declare p micro_learning_paths%rowtype; effective_course text; first_unit text; first_step text; progress user_micro_path_progress%rowtype;
begin
  select * into p from micro_learning_paths where id=p_path_id and status='published';
  if p.id is null then raise exception 'micro_path_not_found' using errcode='P0002'; end if;
  effective_course:=coalesce(p_context_course_id,p.course_id);
  if p.course_id is not null and p.course_id is distinct from effective_course then raise exception 'micro_context_mismatch' using errcode='23514'; end if;
  if effective_course is null and p.scope<>'global' then raise exception 'standalone_path_unavailable' using errcode='42501'; end if;
  perform assert_personal_route_micro_v2(p_user_id,effective_course,p.knowledge_id,p_expected_version_id,p_route_node_ids);
  select id into first_unit from micro_units where path_id=p_path_id order by position,id limit 1;
  select id into first_step from micro_steps where unit_id=first_unit order by position,id limit 1;
  insert into user_micro_path_progress(user_id,path_id,status,current_unit_id,current_step_id,started_at,updated_at)
    values(p_user_id,p_path_id,'in_progress',first_unit,first_step,now(),now()) on conflict(user_id,path_id) do nothing;
  if effective_course is not null then insert into user_course_states(user_id,course_id,is_active,updated_at) values(p_user_id,effective_course,true,now())
    on conflict(user_id,course_id) do update set is_active=true,updated_at=excluded.updated_at; end if;
  select * into progress from user_micro_path_progress where user_id=p_user_id and path_id=p_path_id;
  return to_jsonb(progress);
end $$;

CREATE OR REPLACE FUNCTION public.record_micro_step_completion_v2(p_user_id uuid, p_path_id text, p_unit_id text, p_step_id text, p_context_course_id text, p_route_node_ids text[], p_expected_version_id uuid)
 RETURNS TABLE(path_completed boolean, current_unit_id text, current_step_id text, started_at timestamp with time zone, completed_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  path_record micro_learning_paths%rowtype; unit_record micro_units%rowtype;
  completed_ids jsonb; unit_done boolean; path_done boolean; now_at timestamptz:=now();
  next_step text; next_unit text; path_started timestamptz; path_finished timestamptz;
  effective_course text;
begin
  select * into path_record from micro_learning_paths where id=p_path_id and status='published';
  select * into unit_record from micro_units where id=p_unit_id and path_id=p_path_id;
  if path_record.id is null or unit_record.id is null or not exists(select 1 from micro_steps where id=p_step_id and unit_id=p_unit_id) then
    raise exception 'micro_step_not_found' using errcode='P0002';
  end if;
  if path_record.course_id is not null and p_context_course_id is not null and path_record.course_id<>p_context_course_id then raise exception 'micro_context_mismatch' using errcode='23514'; end if;
  effective_course:=coalesce(p_context_course_id,path_record.course_id);
  perform assert_personal_route_micro_v2(p_user_id,effective_course,path_record.knowledge_id,p_expected_version_id,p_route_node_ids);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_path_id,0));
  select coalesce(progress.completed_step_ids,'[]'::jsonb) into completed_ids from user_micro_unit_progress progress where progress.user_id=p_user_id and progress.unit_id=p_unit_id;
  completed_ids:=coalesce(completed_ids,'[]'::jsonb);
  if not completed_ids ? p_step_id then completed_ids:=completed_ids || to_jsonb(p_step_id); end if;
  select count(*) > 0 and bool_and(completed_ids ? step.id) into unit_done from micro_steps step where step.unit_id=p_unit_id;
  select step.id into next_step from micro_steps step where step.unit_id=p_unit_id and not completed_ids ? step.id order by step.position,step.id limit 1;
  insert into user_micro_unit_progress(user_id,unit_id,path_id,status,current_step_id,completed_step_ids,started_at,completed_at,updated_at)
  values(p_user_id,p_unit_id,p_path_id,case when unit_done then 'completed' else 'in_progress' end,next_step,completed_ids,now_at,case when unit_done then now_at end,now_at)
  on conflict(user_id,unit_id) do update set status=excluded.status,current_step_id=excluded.current_step_id,completed_step_ids=excluded.completed_step_ids,
    started_at=coalesce(user_micro_unit_progress.started_at,excluded.started_at),completed_at=coalesce(user_micro_unit_progress.completed_at,excluded.completed_at),updated_at=excluded.updated_at;
  select count(*) > 0 and bool_and(coalesce(progress.status='completed',false)) into path_done
  from micro_units path_unit left join user_micro_unit_progress progress on progress.user_id=p_user_id and progress.unit_id=path_unit.id
  where path_unit.path_id=p_path_id and path_unit.required;
  select path_unit.id into next_unit from micro_units path_unit left join user_micro_unit_progress progress on progress.user_id=p_user_id and progress.unit_id=path_unit.id
  where path_unit.path_id=p_path_id and coalesce(progress.status,'not_started') <> 'completed' order by path_unit.position,path_unit.id limit 1;
  if next_step is null and next_unit is not null then select step.id into next_step from micro_steps step where step.unit_id=next_unit order by step.position,step.id limit 1; end if;
  select progress.started_at,progress.completed_at into path_started,path_finished from user_micro_path_progress progress where progress.user_id=p_user_id and progress.path_id=p_path_id;
  path_started:=coalesce(path_started,now_at); if path_done then path_finished:=coalesce(path_finished,now_at); else path_finished:=null; end if;
  insert into user_micro_path_progress(user_id,path_id,status,current_unit_id,current_step_id,started_at,completed_at,updated_at)
  values(p_user_id,p_path_id,case when path_done then 'completed' else 'in_progress' end,case when path_done then null else next_unit end,case when path_done then null else next_step end,path_started,path_finished,now_at)
  on conflict(user_id,path_id) do update set status=excluded.status,current_unit_id=excluded.current_unit_id,current_step_id=excluded.current_step_id,
    started_at=coalesce(user_micro_path_progress.started_at,excluded.started_at),completed_at=coalesce(user_micro_path_progress.completed_at,excluded.completed_at),updated_at=excluded.updated_at;
  if path_done and path_record.mode='learn' and path_record.required then
    insert into knowledge_evidence(user_id,node_id,event_type,source_entity_id,outcome,context,occurred_at)
    values(p_user_id,path_record.knowledge_id,'micro_path_completed',p_path_id,'completed',jsonb_build_object('pathId',p_path_id,'courseId',effective_course),now_at)
    on conflict(user_id,node_id,event_type,source_entity_id) do nothing;
  end if;
  path_completed:=path_done;current_unit_id:=case when path_done then null else next_unit end;current_step_id:=case when path_done then null else next_step end;
  started_at:=path_started;completed_at:=path_finished;updated_at:=now_at;return next;
end $function$;

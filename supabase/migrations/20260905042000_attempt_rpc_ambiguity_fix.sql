alter table public.learning_attempts drop constraint if exists learning_attempts_user_id_idempotency_key_key;
alter table public.learning_attempts drop constraint if exists learning_attempts_scoped_idempotency_key;
alter table public.learning_attempts add constraint learning_attempts_scoped_idempotency_key
  unique(user_id,course_id,assignment_id,idempotency_key);

drop function if exists public.record_assignment_attempt(text,text,text,jsonb,text,numeric,jsonb,text);
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
    perform finalize_assignment_mastery(actor,p_course_id,p_assignment_id);
  end if;
  attempt_id:=target_attempt;result_id:=target_result;outcome:=p_outcome;duplicate:=false;return next;
end $$;

create or replace function public.record_manual_assignment_review(
  p_learner_user_id uuid,p_course_id text,p_assignment_id text,p_reviewer_user_id uuid
) returns table(attempt_id uuid,result_id uuid,outcome text)
language plpgsql security definer set search_path = public as $$
declare target_attempt uuid;target_result uuid;next_version integer;now_at timestamptz:=now();state_status text;
begin
  select status into state_status from user_assignment_states where user_id=p_learner_user_id and course_id=p_course_id and assignment_id=p_assignment_id for update;
  if state_status is distinct from 'submitted' then raise exception 'assignment_not_submitted' using errcode='23514'; end if;
  select a.id into target_attempt from learning_attempts a where a.user_id=p_learner_user_id and a.course_id=p_course_id and a.assignment_id=p_assignment_id order by a.attempt_number desc limit 1 for update;
  if target_attempt is null then raise exception 'formal_attempt_not_found' using errcode='P0002'; end if;
  select coalesce(max(pr.version),0)+1 into next_version from performance_results pr where pr.attempt_id=target_attempt;
  insert into performance_results(attempt_id,user_id,course_id,assignment_id,version,outcome,score,feedback,evaluator_kind,evaluated_by,evaluated_at)
    values(target_attempt,p_learner_user_id,p_course_id,p_assignment_id,next_version,'passed',1,jsonb_build_object('code','teacher_accepted','message','Teacher accepted the submitted evidence.'),'manual',p_reviewer_user_id,now_at) returning id into target_result;
  insert into learning_events(user_id,event_type,course_id,assignment_id,attempt_id,result_id,payload,occurred_at)
    values(p_learner_user_id,'assignment_reviewed',p_course_id,p_assignment_id,target_attempt,target_result,jsonb_build_object('outcome','passed','reviewedBy',p_reviewer_user_id),now_at);
  update user_assignment_states set status='accepted',progress=100,accepted_at=now_at,updated_at=now_at where user_id=p_learner_user_id and course_id=p_course_id and assignment_id=p_assignment_id;
  insert into knowledge_evidence(user_id,node_id,event_type,source_entity_id,outcome,context,occurred_at)
    select p_learner_user_id,ac.node_id,'assignment_accepted',target_result::text,'accepted',jsonb_build_object('courseId',p_course_id,'assignmentId',p_assignment_id,'attemptId',target_attempt,'resultId',target_result,'evaluatorKind','manual','acceptedBy',p_reviewer_user_id),now_at
    from assignment_coverages ac where ac.course_id=p_course_id and ac.assignment_id=p_assignment_id on conflict(user_id,node_id,event_type,source_entity_id) do nothing;
  perform finalize_assignment_mastery(p_learner_user_id,p_course_id,p_assignment_id);
  attempt_id:=target_attempt;result_id:=target_result;outcome:='passed';return next;
end $$;

revoke all on function public.record_assignment_attempt(uuid,text,text,text,jsonb,text,numeric,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_assignment_attempt(uuid,text,text,text,jsonb,text,numeric,jsonb,text) to service_role;
revoke all on function public.record_manual_assignment_review(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.record_manual_assignment_review(uuid,text,text,uuid) to service_role;

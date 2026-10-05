-- Service-only caller supplies its authenticated user. Existing Attempt foreign keys validate user identity.
-- Avoid granting service_role access to auth.users solely for this explicit submission path.
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
  if actor is null then raise exception 'learner_not_found' using errcode='P0002'; end if;
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

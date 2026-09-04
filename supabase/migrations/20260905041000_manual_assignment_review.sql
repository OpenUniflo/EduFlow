create or replace function public.record_manual_assignment_review(
  p_learner_user_id uuid,
  p_course_id text,
  p_assignment_id text,
  p_reviewer_user_id uuid
) returns table(attempt_id uuid,result_id uuid,outcome text)
language plpgsql security definer set search_path = public as $$
declare
  target_attempt uuid;
  target_result uuid;
  next_version integer;
  now_at timestamptz := now();
begin
  select a.id into target_attempt from learning_attempts a
  where a.user_id=p_learner_user_id and a.course_id=p_course_id and a.assignment_id=p_assignment_id
  order by a.attempt_number desc limit 1 for update;
  if target_attempt is null then raise exception 'formal_attempt_not_found' using errcode='P0002'; end if;
  select coalesce(max(pr.version),0)+1 into next_version from performance_results pr where pr.attempt_id=target_attempt;
  insert into performance_results(attempt_id,user_id,course_id,assignment_id,version,outcome,score,feedback,evaluator_kind,evaluated_by,evaluated_at)
    values(target_attempt,p_learner_user_id,p_course_id,p_assignment_id,next_version,'passed',1,jsonb_build_object('code','teacher_accepted','message','Teacher accepted the submitted evidence.'),'manual',p_reviewer_user_id,now_at)
    returning id into target_result;
  insert into learning_events(user_id,event_type,course_id,assignment_id,attempt_id,result_id,payload,occurred_at)
    values(p_learner_user_id,'assignment_reviewed',p_course_id,p_assignment_id,target_attempt,target_result,jsonb_build_object('outcome','passed','reviewedBy',p_reviewer_user_id),now_at);
  update user_assignment_states set status='accepted',progress=100,accepted_at=now_at,updated_at=now_at
    where user_id=p_learner_user_id and course_id=p_course_id and assignment_id=p_assignment_id;
  insert into knowledge_evidence(user_id,node_id,event_type,source_entity_id,outcome,context,occurred_at)
    select p_learner_user_id,ac.node_id,'assignment_accepted',target_result::text,'accepted',jsonb_build_object('courseId',p_course_id,'assignmentId',p_assignment_id,'attemptId',target_attempt,'resultId',target_result,'evaluatorKind','manual','acceptedBy',p_reviewer_user_id),now_at
    from assignment_coverages ac where ac.course_id=p_course_id and ac.assignment_id=p_assignment_id
    on conflict(user_id,node_id,event_type,source_entity_id) do nothing;
  attempt_id:=target_attempt;result_id:=target_result;outcome:='passed';return next;
end $$;

revoke all on function public.record_manual_assignment_review(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.record_manual_assignment_review(uuid,text,text,uuid) to service_role;

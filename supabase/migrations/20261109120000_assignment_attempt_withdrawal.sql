-- Batch 2 / segment 1: learner-owned Assignment Attempt withdrawal.
--
-- An Attempt is never deleted. Withdrawal marks the Attempt, removes only the
-- Evidence produced by that Attempt, restores the Assignment state to the
-- latest remaining Attempt, reverts the Action run completion it caused, and
-- asks the centralized learner-state policy to reconcile mastery downward
-- when the withdrawn result was the only thing holding it up.

alter table public.learning_attempts
  add column if not exists withdrawn_at timestamptz,
  add column if not exists withdrawn_by uuid references auth.users(id) on delete set null,
  add column if not exists withdrawal_source text;

alter table public.learning_attempts
  drop constraint if exists learning_attempts_withdrawal_source_check;
alter table public.learning_attempts
  add constraint learning_attempts_withdrawal_source_check
  check (withdrawal_source is null or withdrawal_source in ('panel','assistant'));

create index if not exists learning_attempts_withdrawn_idx
  on public.learning_attempts(user_id,course_id,assignment_id,withdrawn_at)
  where withdrawn_at is not null;

alter table public.learning_events
  drop constraint if exists learning_events_event_type_check;
alter table public.learning_events
  add constraint learning_events_event_type_check
  check (event_type in ('assignment_attempted','performance_resulted','assignment_reviewed','assignment_withdrawn'));

-- The centralized mastery rule ignores withdrawn Attempts. This is the only
-- place that decides mastery, so every later evaluator inherits the rule.
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

  select count(*) > 0 and bool_and(
    exists(
      select 1
      from learning_attempts attempt
      where attempt.user_id=p_user_id
        and attempt.course_id=coverage.course_id
        and attempt.assignment_id=coverage.assignment_id
        and attempt.withdrawn_at is null
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

-- One centralized downward reconciliation, used only by withdrawal. It keeps
-- every non-mastered state exactly as it was and never invents completion.
create or replace function public.reconcile_knowledge_state_after_withdrawal(
  p_user_id uuid, p_node_id text, p_course_id text
) returns text
language plpgsql security definer set search_path = public as $$
declare current_status text; has_practice boolean := false; has_completed_path boolean := false; has_progress boolean := false;
begin
  select status into current_status from public.user_knowledge_states
  where user_id=p_user_id and node_id=p_node_id for update;
  if current_status is distinct from 'mastered' then
    return coalesce(current_status,'explore');
  end if;
  if public.recompute_knowledge_mastery(p_user_id,p_node_id,p_course_id) then
    return 'mastered';
  end if;

  select exists(
    select 1 from public.user_assignment_states state
    join public.assignment_coverages coverage
      on coverage.course_id=state.course_id and coverage.assignment_id=state.assignment_id
    where state.user_id=p_user_id and state.course_id=p_course_id
      and coverage.node_id=p_node_id
      and state.status in ('started','submitted','needs_revision','accepted')
  ) into has_practice;
  if has_practice then
    update public.user_knowledge_states set status='practicing',updated_at=now()
    where user_id=p_user_id and node_id=p_node_id;
    return 'practicing';
  end if;

  select exists(
    select 1 from public.user_micro_path_progress progress
    join public.micro_learning_paths path on path.id=progress.path_id
    where progress.user_id=p_user_id and path.knowledge_id=p_node_id
      and path.status='published' and path.mode='learn'
      and progress.status='completed'
  ) into has_completed_path;
  if has_completed_path then
    update public.user_knowledge_states set status='learned',updated_at=now()
    where user_id=p_user_id and node_id=p_node_id;
    return 'learned';
  end if;

  select exists(
    select 1 from public.user_micro_path_progress progress
    join public.micro_learning_paths path on path.id=progress.path_id
    where progress.user_id=p_user_id and path.knowledge_id=p_node_id
      and path.status='published' and path.mode='learn'
  ) into has_progress;
  if has_progress then
    update public.user_knowledge_states set status='learning',updated_at=now()
    where user_id=p_user_id and node_id=p_node_id;
    return 'learning';
  end if;

  update public.user_knowledge_states set status='explore',updated_at=now()
  where user_id=p_user_id and node_id=p_node_id;
  return 'explore';
end $$;
revoke all on function public.reconcile_knowledge_state_after_withdrawal(uuid,text,text) from public,anon,authenticated;
grant execute on function public.reconcile_knowledge_state_after_withdrawal(uuid,text,text) to service_role;

-- Model late results cannot resurrect a withdrawn Attempt.
create or replace function public.after_performance_result_mastery()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.outcome='passed' and not exists(
    select 1 from public.learning_attempts attempt
    where attempt.id=new.attempt_id and attempt.withdrawn_at is not null
  ) then
    perform public.finalize_assignment_mastery(new.user_id,new.course_id,new.assignment_id);
  end if;
  return new;
end $$;
revoke all on function public.after_performance_result_mastery() from public,anon,authenticated;
grant execute on function public.after_performance_result_mastery() to service_role;

create or replace function public.withdraw_learning_attempt(
  p_user_id uuid, p_attempt_id uuid, p_source text
) returns table(
  attempt_id uuid, course_id text, assignment_id text,
  already_withdrawn boolean, restored_status text
)
language plpgsql security definer set search_path = public as $$
declare
  attempt_record public.learning_attempts%rowtype;
  latest_attempt public.learning_attempts%rowtype;
  latest_result public.performance_results%rowtype;
  node_id text; now_at timestamptz := now();
begin
  if p_user_id is null or p_attempt_id is null then
    raise exception 'invalid_withdrawal_input' using errcode='22023';
  end if;
  if p_source is null or p_source not in ('panel','assistant') then
    raise exception 'invalid_withdrawal_source' using errcode='22023';
  end if;
  -- Serialize with AI finalization for the same Attempt.
  perform pg_advisory_xact_lock(hashtextextended('assignment-ai-eval:'||p_attempt_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_attempt_id::text,0));
  select * into attempt_record from public.learning_attempts
  where id=p_attempt_id and user_id=p_user_id for update;
  if attempt_record.id is null then
    raise exception 'attempt_not_found' using errcode='P0002';
  end if;
  if attempt_record.withdrawn_at is not null then
    attempt_id:=attempt_record.id; course_id:=attempt_record.course_id; assignment_id:=attempt_record.assignment_id;
    already_withdrawn:=true; restored_status:=null; return next; return;
  end if;

  update public.learning_attempts
  set withdrawn_at=now_at, withdrawn_by=p_user_id, withdrawal_source=p_source
  where id=attempt_record.id;

  -- Evidence produced by this Attempt's Results is no longer evidence.
  delete from public.knowledge_evidence evidence
  where evidence.user_id=p_user_id
    and evidence.source_entity_id in (
      select result.id::text from public.performance_results result
      where result.attempt_id=attempt_record.id
    );

  -- Restore the Assignment state to the latest Attempt that still counts.
  select * into latest_attempt from public.learning_attempts attempt
  where attempt.user_id=p_user_id and attempt.course_id=attempt_record.course_id
    and attempt.assignment_id=attempt_record.assignment_id
    and attempt.withdrawn_at is null
  order by attempt.attempt_number desc limit 1;

  if latest_attempt.id is not null then
    select * into latest_result from public.performance_results result
    where result.attempt_id=latest_attempt.id order by result.version desc limit 1;
    update public.user_assignment_states state set
      status=case latest_result.outcome when 'passed' then 'accepted' when 'failed' then 'needs_revision' else 'submitted' end,
      progress=case latest_result.outcome when 'passed' then 100 when 'failed' then 50 else 75 end,
      submitted_at=latest_attempt.submitted_at,
      accepted_at=case when latest_result.outcome='passed' then latest_result.evaluated_at else null end,
      updated_at=now_at
    where state.user_id=p_user_id and state.course_id=attempt_record.course_id
      and state.assignment_id=attempt_record.assignment_id;
    restored_status:=case latest_result.outcome when 'passed' then 'accepted' when 'failed' then 'needs_revision' else 'submitted' end;
  else
    update public.user_assignment_states state set
      status='started', progress=1, submitted_at=null, accepted_at=null, updated_at=now_at
    where state.user_id=p_user_id and state.course_id=attempt_record.course_id
      and state.assignment_id=attempt_record.assignment_id;
    restored_status:='started';
  end if;

  -- A completed Action belongs to the Attempt that completed it. Withdrawal
  -- puts it back into execution instead of leaving a phantom completion.
  update public.edge_action_runs run set
    status='in_progress', assignment_attempt_id=null, completed_at=null, updated_at=now_at
  where run.user_id=p_user_id and run.assignment_attempt_id=attempt_record.id and run.status='completed';

  for node_id in
    select distinct coverage.node_id from public.assignment_coverages coverage
    where coverage.course_id=attempt_record.course_id
      and coverage.assignment_id=attempt_record.assignment_id
    order by coverage.node_id
  loop
    perform public.reconcile_knowledge_state_after_withdrawal(p_user_id,node_id,attempt_record.course_id);
  end loop;

  insert into public.learning_events(user_id,event_type,course_id,assignment_id,attempt_id,payload,occurred_at)
  values(
    p_user_id,'assignment_withdrawn',attempt_record.course_id,attempt_record.assignment_id,attempt_record.id,
    jsonb_build_object('attemptNumber',attempt_record.attempt_number,'source',p_source,'withdrawnBy',p_user_id,'restoredStatus',restored_status),
    now_at
  );

  attempt_id:=attempt_record.id; course_id:=attempt_record.course_id; assignment_id:=attempt_record.assignment_id;
  already_withdrawn:=false; return next;
end $$;
revoke all on function public.withdraw_learning_attempt(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.withdraw_learning_attempt(uuid,uuid,text) to service_role;

-- AI evaluation cannot be claimed or finalized after withdrawal.
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
  if attempt_record.id is null or attempt_record.withdrawn_at is not null then
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
    if last_run.status='failed' and last_run.error_code='attempt_withdrawn' then
      return query select 'unavailable'::text,last_run.id,p_attempt_id,null::uuid,null::text,null::text; return;
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

  if attempt_record.withdrawn_at is not null then
    update assignment_ai_evaluations set status='failed',error_code='attempt_withdrawn',completed_at=now_at,model=p_model,prompt_version=p_prompt_version
    where id=run_record.id;
    raise exception 'ai_evaluation_attempt_withdrawn' using errcode='23514';
  end if;

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

-- Manual review follows the same rule; a withdrawn Attempt is not reviewable.
create or replace function public.record_manual_assignment_review(
  p_learner_user_id uuid,p_course_id text,p_assignment_id text,p_reviewer_user_id uuid,p_attempt_id uuid
) returns table(attempt_id uuid,result_id uuid,outcome text)
language plpgsql security invoker set search_path = public as $$
declare target_attempt uuid;target_result uuid;next_version integer;now_at timestamptz:=now();state_status text;
begin
  if not exists(select 1 from profiles where id=p_reviewer_user_id and role in ('admin','teacher')) then raise exception 'Reviewer authority required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_learner_user_id::text || ':' || p_course_id || ':' || p_assignment_id,0));
  select a.id into target_attempt from learning_attempts a where a.id=p_attempt_id and a.user_id=p_learner_user_id and a.course_id=p_course_id and a.assignment_id=p_assignment_id and a.withdrawn_at is null for update;
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
revoke all on function public.record_manual_assignment_review(uuid,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_manual_assignment_review(uuid,text,text,uuid,uuid) to service_role;

create or replace function public.record_manual_assignment_review(
  p_learner_user_id uuid,p_course_id text,p_assignment_id text,p_reviewer_user_id uuid
) returns table(attempt_id uuid,result_id uuid,outcome text)
language plpgsql security definer set search_path=public as $$
declare target_attempt uuid; state_status text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_learner_user_id::text || ':' || p_course_id || ':' || p_assignment_id,0));
  select status into state_status from user_assignment_states where user_id=p_learner_user_id and course_id=p_course_id and assignment_id=p_assignment_id for update;
  if state_status is distinct from 'submitted' then raise exception 'assignment_not_submitted' using errcode='23514'; end if;
  select a.id into target_attempt from learning_attempts a where a.user_id=p_learner_user_id and a.course_id=p_course_id and a.assignment_id=p_assignment_id and a.withdrawn_at is null order by a.attempt_number desc limit 1;
  if target_attempt is null then raise exception 'formal_attempt_not_found' using errcode='P0002'; end if;
  return query select * from record_manual_assignment_review(p_learner_user_id,p_course_id,p_assignment_id,p_reviewer_user_id,target_attempt);
end $$;
revoke all on function public.record_manual_assignment_review(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.record_manual_assignment_review(uuid,text,text,uuid) to service_role;

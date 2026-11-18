-- Forward fix: qualify columns that collide with the claim function's OUT
-- parameters. The initial Stage 2 migration is repaired in place for fresh
-- databases; this file keeps already-applied environments forward-only and
-- idempotent.

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

-- Completion, evidence, and mastery are one server-owned transaction. The
-- browser may submit evaluated work, but cannot call these service-only RPCs.
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
  select count(*) > 0 and bool_and(coalesce(state.status='accepted',false)) into assignments_ready
  from assignment_coverages coverage left join user_assignment_states state
    on state.user_id=p_user_id and state.course_id=coverage.course_id and state.assignment_id=coverage.assignment_id
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

drop function if exists public.record_micro_step_completion(uuid,text,text,text);
create or replace function public.record_micro_step_completion(
  p_user_id uuid, p_path_id text, p_unit_id text, p_step_id text, p_context_course_id text
) returns table(path_completed boolean,current_unit_id text,current_step_id text,started_at timestamptz,completed_at timestamptz,updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  path_record micro_learning_paths%rowtype; unit_record micro_units%rowtype;
  completed_ids jsonb; unit_done boolean; path_done boolean; now_at timestamptz:=now();
  next_step text; next_unit text; path_started timestamptz; path_finished timestamptz;
  candidate_course text; effective_course text;
begin
  select * into path_record from micro_learning_paths where id=p_path_id and status='published';
  select * into unit_record from micro_units where id=p_unit_id and path_id=p_path_id;
  if path_record.id is null or unit_record.id is null or not exists(select 1 from micro_steps where id=p_step_id and unit_id=p_unit_id) then
    raise exception 'micro_step_not_found' using errcode='P0002';
  end if;
  if path_record.course_id is not null and p_context_course_id is not null and path_record.course_id<>p_context_course_id then raise exception 'micro_context_mismatch' using errcode='23514'; end if;
  effective_course:=coalesce(p_context_course_id,path_record.course_id);
  if effective_course is not null and not exists(select 1 from curriculum_coverages where course_id=effective_course and node_id=path_record.knowledge_id) then raise exception 'micro_course_coverage_missing' using errcode='23514'; end if;
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
    insert into user_knowledge_states(user_id,node_id,status,updated_at) values(p_user_id,path_record.knowledge_id,'learned',now_at)
    on conflict(user_id,node_id) do update set status=case when user_knowledge_states.status in ('practicing','mastered') then user_knowledge_states.status else 'learned' end,updated_at=excluded.updated_at;
    if effective_course is not null then perform recompute_knowledge_mastery(p_user_id,path_record.knowledge_id,effective_course);
    else for candidate_course in select distinct course_id from assignment_coverages where node_id=path_record.knowledge_id and required loop perform recompute_knowledge_mastery(p_user_id,path_record.knowledge_id,candidate_course); end loop; end if;
  end if;
  path_completed:=path_done;current_unit_id:=case when path_done then null else next_unit end;current_step_id:=case when path_done then null else next_step end;
  started_at:=path_started;completed_at:=path_finished;updated_at:=now_at;return next;
end $$;

revoke all on function public.record_micro_step_completion(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_micro_step_completion(uuid,text,text,text,text) to service_role;

-- Rebind the existing Assignment functions to the same transactional policy.
-- These calls execute before their surrounding RPC commits.
create or replace function public.finalize_assignment_mastery(p_user_id uuid,p_course_id text,p_assignment_id text)
returns void language plpgsql security definer set search_path=public as $$
declare covered_node text;
begin for covered_node in select node_id from assignment_coverages where course_id=p_course_id and assignment_id=p_assignment_id loop
  perform recompute_knowledge_mastery(p_user_id,covered_node,p_course_id);
end loop; end $$;
revoke all on function public.finalize_assignment_mastery(uuid,text,text) from public,anon,authenticated;
grant execute on function public.finalize_assignment_mastery(uuid,text,text) to service_role;

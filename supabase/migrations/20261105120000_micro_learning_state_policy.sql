-- Plan A: starting a Micro raises the Knowledge to at least `learning`; completing
-- the effective required Learn Path raises it to `learned`. The centralized policy
-- is monotonic, never writes `mastered`, and never creates a Route Version.
-- recompute_knowledge_mastery intentionally remains a no-op; Micro never claims mastery.

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
  -- Micro learning may only propose these two levels. Higher levels remain owned by
  -- the existing Evidence -> Diagnosis -> Proposal -> confirmation authority.
  if p_minimum_status is null or p_minimum_status not in ('learning','learned') then
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
  perform public.raise_user_knowledge_state(p_user_id,p.knowledge_id,'learning');
  if effective_course is not null then insert into user_course_states(user_id,course_id,is_active,updated_at) values(p_user_id,effective_course,true,now())
    on conflict(user_id,course_id) do update set is_active=true,updated_at=excluded.updated_at; end if;
  select * into progress from user_micro_path_progress where user_id=p_user_id and path_id=p_path_id;
  return to_jsonb(progress);
end $$;
revoke all on function public.start_micro_for_route_v2(uuid,text,text,uuid,text[]) from public,anon,authenticated;
grant execute on function public.start_micro_for_route_v2(uuid,text,text,uuid,text[]) to service_role;

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
  effective_course text; required_learn_path boolean;
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
  -- Course-specific required Learn Path takes precedence; a published Global required
  -- Learn Path is the fallback only when that Course has no matching required path.
  required_learn_path:=exists(
    select 1 from micro_learning_paths path
    where path.id=p_path_id and path.status='published' and path.mode='learn' and path.required
      and (
        (path.course_id is not null and path.course_id=effective_course)
        or (path.course_id is null and path.scope='global' and (effective_course is null or not exists(
          select 1 from micro_learning_paths course_path
          where course_path.knowledge_id=path.knowledge_id and course_path.course_id=effective_course
            and course_path.mode='learn' and course_path.required and course_path.status='published'
        )))
      )
  );
  if path_done then
    perform public.raise_user_knowledge_state(p_user_id,path_record.knowledge_id,'learning');
    if path_record.mode='learn' and path_record.required then
      insert into knowledge_evidence(user_id,node_id,event_type,source_entity_id,outcome,context,occurred_at)
      values(p_user_id,path_record.knowledge_id,'micro_path_completed',p_path_id,'completed',jsonb_build_object('pathId',p_path_id,'courseId',effective_course),now_at)
      on conflict(user_id,node_id,event_type,source_entity_id) do nothing;
      if required_learn_path then
        perform public.raise_user_knowledge_state(p_user_id,path_record.knowledge_id,'learned');
      end if;
    end if;
  end if;
  path_completed:=path_done;current_unit_id:=case when path_done then null else next_unit end;current_step_id:=case when path_done then null else next_step end;
  started_at:=path_started;completed_at:=path_finished;updated_at:=now_at;return next;
end $function$;
revoke all on function public.record_micro_step_completion_v2(uuid,text,text,text,text,text[],uuid) from public,anon,authenticated;
grant execute on function public.record_micro_step_completion_v2(uuid,text,text,text,text,text[],uuid) to service_role;

-- Idempotent backfill for learners who already completed a required Learn Path before
-- this policy existed. Existing learned/practicing/mastered rows are preserved.
create or replace function public.backfill_micro_learning_state() returns integer
language plpgsql security definer set search_path = public as $$
declare
  candidate record; before_status text; after_status text; raised integer := 0;
begin
  for candidate in
    select distinct e.user_id, e.node_id
    from knowledge_evidence e
    join micro_learning_paths path on path.id=e.source_entity_id
    where e.event_type='micro_path_completed'
      and path.status='published' and path.mode='learn' and path.required
      and (
        path.course_id is not null
        or (path.course_id is null and path.scope='global' and not exists(
          select 1 from micro_learning_paths course_path
          where course_path.knowledge_id=path.knowledge_id
            and course_path.course_id=nullif(e.context->>'courseId','')
            and course_path.mode='learn' and course_path.required and course_path.status='published'
        ))
      )
  loop
    select status into before_status from user_knowledge_states where user_id=candidate.user_id and node_id=candidate.node_id;
    after_status:=public.raise_user_knowledge_state(candidate.user_id,candidate.node_id,'learned');
    if before_status is distinct from after_status then raised:=raised+1; end if;
  end loop;
  return raised;
end $$;
revoke all on function public.backfill_micro_learning_state() from public,anon,authenticated;
grant execute on function public.backfill_micro_learning_state() to service_role;

select public.backfill_micro_learning_state();

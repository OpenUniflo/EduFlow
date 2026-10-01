-- Personal route authority stays in the authenticated API and shared TypeScript core.
-- The extra IDs are trusted server output, never request-body input. Both RPCs remain
-- service_role-only. No route persistence, RLS changes, or curriculum writes.
-- Legacy signatures retain coverage-only behavior and delegate to the same implementation.
CREATE OR REPLACE FUNCTION public.record_micro_step_completion_for_route(p_user_id uuid, p_path_id text, p_unit_id text, p_step_id text, p_context_course_id text, p_route_node_ids text[])
 RETURNS TABLE(path_completed boolean, current_unit_id text, current_step_id text, started_at timestamp with time zone, completed_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if effective_course is not null and not (coalesce(path_record.knowledge_id=any(p_route_node_ids),false) or exists(select 1 from curriculum_coverages where course_id=effective_course and node_id=path_record.knowledge_id)) then raise exception 'micro_course_coverage_missing' using errcode='23514'; end if;
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
end $function$;
CREATE OR REPLACE FUNCTION public.record_micro_step_attempt_for_route(p_user_id uuid, p_path_id text, p_unit_id text, p_step_id text, p_context_course_id text, p_key text, p_response jsonb, p_correct boolean, p_outcome text, p_step_hash text, p_duration integer, p_decision_id uuid, p_expected_step jsonb, p_route_node_ids text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p micro_learning_paths%rowtype; s micro_steps%rowtype; previous micro_step_attempts%rowtype;
  attempt micro_step_attempts%rowtype; effective_course text; refs jsonb; next_number integer;
  completion jsonb; progress user_micro_path_progress%rowtype;
begin
  if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then raise exception 'learner_not_found'; end if;
  -- Serialize per learner, including evidence sequence allocation, so historical cutoffs
  -- never acquire a late-committing observation with an earlier sequence.
  perform pg_advisory_xact_lock(hashtextextended('criterion-evidence:'||p_user_id::text,0));
  select * into previous from micro_step_attempts where user_id=p_user_id and idempotency_key=p_key;
  if previous.id is not null then
    if previous.path_id<>p_path_id or previous.unit_id<>p_unit_id or previous.step_id<>p_step_id
      or previous.response is distinct from p_response
      or previous.course_id is distinct from p_context_course_id
      or previous.decision_id is distinct from p_decision_id then raise exception 'micro_idempotency_conflict' using errcode='23505'; end if;
    select to_jsonb(x) into completion from user_micro_path_progress x where x.user_id=p_user_id and x.path_id=p_path_id;
    return jsonb_build_object('attempt',to_jsonb(previous),'progress',completion,'duplicate',true);
  end if;
  select * into p from micro_learning_paths where id=p_path_id and status='published' for share;
  select * into s from micro_steps where id=p_step_id and unit_id=p_unit_id for share;
  if p.id is null or s.id is null or not exists(select 1 from micro_units where id=p_unit_id and path_id=p_path_id) then raise exception 'micro_step_not_found'; end if;
  if p_expected_step is distinct from jsonb_build_object('interaction',s.interaction,'kind',s.kind,'revision',p.revision) then
    raise exception 'micro_content_changed' using errcode='40001';
  end if;
  if not exists(select 1 from knowledge_nodes where id=p.knowledge_id and status='active') then raise exception 'knowledge_unavailable'; end if;
  effective_course:=coalesce(p_context_course_id,p.course_id);
  if p.course_id is not null and p.course_id is distinct from effective_course then raise exception 'micro_context_mismatch'; end if;
  if effective_course is not null then
    if not exists(select 1 from courses c where c.id=effective_course and c.lifecycle='published'
      and (c.course_type='standard' or c.owner_user_id=p_user_id)) then raise exception 'course_unavailable'; end if;
    if not (coalesce(p.knowledge_id=any(p_route_node_ids),false) or exists(select 1 from curriculum_coverages where course_id=effective_course and node_id=p.knowledge_id)) then raise exception 'knowledge_not_in_course'; end if;
    if not exists(select 1 from user_knowledge_states own_state where own_state.user_id=p_user_id and own_state.node_id=p.knowledge_id and own_state.status in ('learned','practicing','mastered')) and exists(select 1 from knowledge_edges e where e.target_node_id=p.knowledge_id and e.relation='prerequisite' and e.lifecycle_status='active'
      and ((p_route_node_ids is not null and e.source_node_id=any(p_route_node_ids)) or (p_route_node_ids is null and exists(select 1 from curriculum_coverages cc where cc.course_id=effective_course and cc.node_id=e.source_node_id)))
      and not exists(select 1 from user_knowledge_states st where st.user_id=p_user_id and st.node_id=e.source_node_id and st.status in ('learned','practicing','mastered'))) then
      raise exception 'teaching_prerequisite_required' using errcode='42501';
    end if;
  elsif p.scope<>'global' then raise exception 'standalone_path_unavailable'; end if;
  if p_decision_id is not null and not exists(select 1 from navigation_decisions d where d.id=p_decision_id
    and d.user_id=p_user_id and d.course_id=effective_course and d.selected_action->>'kind'='micro'
    and d.selected_action->>'resourceId'=p_path_id and d.selected_action->>'knowledgeId'=p.knowledge_id) then
    raise exception 'recommendation_action_mismatch' using errcode='42501';
  end if;
  -- An old/completed step is review, not a new formal observation.
  if exists(select 1 from user_micro_unit_progress u where u.user_id=p_user_id and u.unit_id=p_unit_id and u.completed_step_ids ? p_step_id) then
    select * into progress from user_micro_path_progress where user_id=p_user_id and path_id=p_path_id;
    return jsonb_build_object('attempt',null,'progress',to_jsonb(progress),'duplicate',true);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('criterionId',c.id,'version',c.version) order by c.id),'[]'::jsonb) into refs
    from micro_step_criteria m join mastery_criteria c on c.id=m.criterion_id and c.version=m.criterion_version
    where m.step_id=p_step_id and m.purpose='evidence' and c.status='active' and c.knowledge_id=p.knowledge_id
      and p_outcome in ('correct','incorrect');
  select coalesce(max(a.attempt_number),0)+1 into next_number from micro_step_attempts a where a.user_id=p_user_id and a.path_id=p_path_id and a.step_id=p_step_id;
  insert into micro_step_attempts(user_id,course_id,knowledge_id,path_id,unit_id,step_id,path_revision,step_hash,criterion_refs,
    interaction_type,attempt_number,idempotency_key,response,outcome,completion_accepted,client_duration_ms,decision_id)
  values(p_user_id,effective_course,p.knowledge_id,p_path_id,p_unit_id,p_step_id,p.revision,p_step_hash,refs,
    coalesce(s.interaction->>'type','instruction'),next_number,p_key,p_response,p_outcome,p_correct,p_duration,p_decision_id) returning * into attempt;
  if effective_course is not null then
    insert into user_course_states(user_id,course_id,is_active,updated_at) values(p_user_id,effective_course,true,now())
      on conflict(user_id,course_id) do update set is_active=true,updated_at=excluded.updated_at;
  end if;
  if p_correct then
    perform * from record_micro_step_completion_for_route(p_user_id,p_path_id,p_unit_id,p_step_id,effective_course,p_route_node_ids);
  end if;
  select to_jsonb(x) into completion from user_micro_path_progress x where x.user_id=p_user_id and x.path_id=p_path_id;
  return jsonb_build_object('attempt',to_jsonb(attempt),'progress',completion,'duplicate',false);
end $function$;
CREATE OR REPLACE FUNCTION public.record_micro_step_completion(p_user_id uuid, p_path_id text, p_unit_id text, p_step_id text, p_context_course_id text)
 RETURNS TABLE(path_completed boolean, current_unit_id text, current_step_id text, started_at timestamp with time zone, completed_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$begin return query select * from public.record_micro_step_completion_for_route(p_user_id,p_path_id,p_unit_id,p_step_id,p_context_course_id,null); end; $function$;
CREATE OR REPLACE FUNCTION public.record_micro_step_attempt(p_user_id uuid, p_path_id text, p_unit_id text, p_step_id text, p_context_course_id text, p_key text, p_response jsonb, p_correct boolean, p_outcome text, p_step_hash text, p_duration integer, p_decision_id uuid, p_expected_step jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$begin return public.record_micro_step_attempt_for_route(p_user_id,p_path_id,p_unit_id,p_step_id,p_context_course_id,p_key,p_response,p_correct,p_outcome,p_step_hash,p_duration,p_decision_id,p_expected_step,null); end; $function$;
revoke all on function public.record_micro_step_completion(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_micro_step_completion(uuid,text,text,text,text) to service_role;
revoke all on function public.record_micro_step_completion_for_route(uuid,text,text,text,text,text[]) from public,anon,authenticated;
grant execute on function public.record_micro_step_completion_for_route(uuid,text,text,text,text,text[]) to service_role;
revoke all on function public.record_micro_step_attempt(uuid,text,text,text,text,text,jsonb,boolean,text,text,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_micro_step_attempt(uuid,text,text,text,text,text,jsonb,boolean,text,text,integer,uuid,jsonb) to service_role;
revoke all on function public.record_micro_step_attempt_for_route(uuid,text,text,text,text,text,jsonb,boolean,text,text,integer,uuid,jsonb,text[]) from public,anon,authenticated;
grant execute on function public.record_micro_step_attempt_for_route(uuid,text,text,text,text,text,jsonb,boolean,text,text,integer,uuid,jsonb,text[]) to service_role;

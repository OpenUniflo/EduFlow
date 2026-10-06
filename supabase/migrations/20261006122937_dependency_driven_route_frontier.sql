-- Forward-only frontier derivation. No tables, history, UKS or Evidence writes.
create or replace function public.route_execution_reachable_nodes(p_user_id uuid,p_course_id text)
returns text[] language plpgsql stable security invoker set search_path=public as $$
declare v personal_course_route_versions; step jsonb; reachable text[]; changed boolean;
begin
 select coalesce(array_agg(s.node_id order by s.node_id),'{}') into reachable from user_knowledge_states s join knowledge_nodes n on n.id=s.node_id where s.user_id=p_user_id and s.status in ('learned','practicing','mastered') and n.status='active';
 select versions.* into v from personal_course_routes r join personal_course_route_versions versions on versions.id=r.active_version_id where r.user_id=p_user_id and r.course_id=p_course_id;
 if v.id is null or coalesce(v.snapshot->>'valid','false')<>'true' or not(v.snapshot?'executionSteps') then return reachable;end if;
 changed:=true;
 while changed loop
  changed:=false;
  for step in select value from jsonb_array_elements(v.snapshot->'executionSteps') order by (value->>'order')::int loop
   if (step->>'targetNodeId')=any(reachable) or not((step->>'sourceNodeId')=any(reachable)) then continue;end if;
   if not exists(select 1 from knowledge_edges e join knowledge_nodes source on source.id=e.source_node_id join knowledge_nodes target on target.id=e.target_node_id where e.id=step->>'edgeId' and e.source_node_id=step->>'sourceNodeId' and e.target_node_id=step->>'targetNodeId' and e.lifecycle_status='active' and e.relation in ('prerequisite','enables') and source.status='active' and target.status='active') then continue;end if;
   if exists(select 1 from jsonb_array_elements(v.snapshot->'executionSteps') selected where selected->>'edgeId'=step->>'edgeId' and not exists(select 1 from edge_action_runs done where done.user_id=p_user_id and done.course_id=p_course_id and done.status='completed' and done.edge_id=selected->>'edgeId' and done.action_id::text=selected->>'actionId')) then continue;end if;
   -- Selected hard incoming groups form the target conjunction. Optional/enables
   -- groups do not gate an independent incoming group's own execution.
   if exists(select 1 from jsonb_array_elements(v.snapshot->'executionSteps') incoming
     left join knowledge_edges hard on hard.id=incoming->>'edgeId'
     where incoming->>'targetNodeId'=step->>'targetNodeId'
     and ((hard.relation='prerequisite' and hard.prerequisite_strength='hard') or exists(select 1 from jsonb_array_elements(coalesce(v.snapshot->'prerequisiteEdges','[]')) frozen where frozen->>'id'=incoming->>'edgeId' and frozen->>'strength'='hard'))
     and (hard.id is null or hard.relation<>'prerequisite' or hard.prerequisite_strength is distinct from 'hard'
       or hard.lifecycle_status<>'active' or hard.source_node_id<>incoming->>'sourceNodeId' or hard.target_node_id<>incoming->>'targetNodeId' or not(hard.source_node_id=any(reachable))
       or not exists(select 1 from knowledge_nodes n where n.id=hard.source_node_id and n.status='active')
       or not exists(select 1 from edge_action_runs done where done.user_id=p_user_id and done.course_id=p_course_id and done.status='completed' and done.edge_id=incoming->>'edgeId' and done.action_id::text=incoming->>'actionId'))) then continue;end if;
   reachable:=array_append(reachable,step->>'targetNodeId');changed:=true;
  end loop;
 end loop;
 return array(select distinct id from unnest(reachable) id order by id);
end $$;

create or replace function public.assert_route_action_choice(
  p_user_id uuid,p_course_id text,p_action_id uuid,p_expected_version_id uuid,p_retained boolean default false
) returns uuid language plpgsql security invoker set search_path=public as $$
declare v personal_course_route_versions; e knowledge_edges; frontier_step jsonb;
begin
  -- Serialize with existing Micro writers before taking any route/run lock.
  perform pg_advisory_xact_lock(hashtextextended('criterion-evidence:'||p_user_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('personal-route:'||p_user_id::text||':'||p_course_id,0));
  select versions.* into v from personal_course_routes r join personal_course_route_versions versions on versions.id=r.active_version_id
    where r.user_id=p_user_id and r.course_id=p_course_id;
  if v.id is null then raise exception 'Route unavailable' using errcode='PT409'; end if;
  select edge.* into e from knowledge_edge_actions a join knowledge_edges edge on edge.id=a.edge_id where a.id=p_action_id;
  if e.id is null or e.source_node_id=any(v.exclude_node_ids) or e.target_node_id=any(v.exclude_node_ids) then
    raise exception 'Action excluded from route' using errcode='23514';
  end if;
  if not p_retained and v.id is distinct from p_expected_version_id then raise exception 'Route version changed' using errcode='PT409';end if;
  if v.snapshot?'executionSteps' then
    if p_retained and exists(select 1 from edge_action_runs done where done.user_id=p_user_id and done.course_id=p_course_id and done.edge_id=e.id and done.action_id=p_action_id and done.status='completed') then return v.id;end if;
    if coalesce(v.snapshot->>'valid','false')<>'true' or not exists(select 1 from jsonb_array_elements(v.snapshot->'executionSteps') step where step->>'edgeId'=e.id and step->>'actionId'=p_action_id::text and step->>'sourceNodeId'=e.source_node_id and step->>'targetNodeId'=e.target_node_id) then raise exception 'Action not selected in formal route' using errcode='23514';end if;
    if exists(select 1 from edge_action_runs done where done.user_id=p_user_id and done.course_id=p_course_id and done.edge_id=e.id and done.action_id=p_action_id and done.status='completed') then raise exception 'Completed Step requires explicit Repeat' using errcode='PT409';end if;
    select step into frontier_step from jsonb_array_elements(v.snapshot->'executionSteps') as steps(step) where step->>'edgeId'=e.id and not exists(select 1 from edge_action_runs done where done.user_id=p_user_id and done.course_id=p_course_id and done.status='completed' and done.edge_id=e.id and done.action_id::text=step->>'actionId') order by (step->>'order')::int limit 1;
    if frontier_step is null or frontier_step->>'actionId'<>p_action_id::text then raise exception 'Same Edge earlier Action required' using errcode='PT409';end if;
    if not(e.source_node_id=any(route_execution_reachable_nodes(p_user_id,p_course_id))) then raise exception 'Source execution reachability required' using errcode='23514';end if;
  end if;
  return v.id;
end $$;

create or replace function public.require_action_execution_conditions(p_user_id uuid,p_course_id text,p_action_id uuid,p_binding_id uuid) returns void
language plpgsql security invoker set search_path=public as $$
declare a knowledge_edge_actions; b course_action_bindings; e knowledge_edges; reachable text[];
begin
  select * into a from knowledge_edge_actions where id=p_action_id and status='active' for share;
  if not found then raise exception 'Action unavailable' using errcode='23514'; end if;
  select * into e from knowledge_edges where id=a.edge_id and lifecycle_status='active' for share;
  if not found then raise exception 'Edge unavailable' using errcode='23514'; end if;
  select * into b from course_action_bindings where id=p_binding_id and course_id=p_course_id and action_id=p_action_id and available for share;
  if not found then raise exception 'Executor unavailable' using errcode='23514'; end if;
  perform assert_route_action_choice(p_user_id,p_course_id,p_action_id,(select active_version_id from personal_course_routes where user_id=p_user_id and course_id=p_course_id),true);
  reachable:=route_execution_reachable_nodes(p_user_id,p_course_id);
  if not(e.source_node_id=any(reachable)) then raise exception 'Source execution reachability required' using errcode='23514';end if;
  if exists(select 1 from unnest(a.required_capability_ids) required(node_id) where not(required.node_id=any(reachable))) then raise exception 'Execution capability missing' using errcode='23514'; end if;
  if exists(select 1 from unnest(a.resource_requirements) required(resource_key) where not exists(select 1 from jsonb_array_elements(coalesce(b.resources,'[]')) resource where resource->>'key'=required.resource_key and resource->>'available'='true' and length(trim(resource->>'reference'))>0)) then raise exception 'Execution resource missing' using errcode='23514'; end if;
  -- Legacy node-only routes retain their existing teaching gate. Formal Route
  -- Actions gate by their own source/local order; hard conjunction gates reachability.
  if not exists(select 1 from personal_course_routes route join personal_course_route_versions version on version.id=route.active_version_id where route.user_id=p_user_id and route.course_id=p_course_id and version.snapshot?'executionSteps')
    and not(e.target_node_id=any(reachable)) and exists(select 1 from knowledge_edges hard where hard.target_node_id=e.target_node_id and hard.relation='prerequisite' and hard.prerequisite_strength='hard' and hard.lifecycle_status='active' and not(hard.source_node_id=any(reachable))) then raise exception 'Target hard prerequisite required' using errcode='23514';end if;
  if a.type='practice_task' then
    if not exists(select 1 from course_assignments where course_id=p_course_id and id=b.assignment_id and mode<>'workflow' and coalesce(experience->>'type','answer')<>'workflow') then raise exception 'Assignment executor unsupported' using errcode='23514'; end if;
    if b.assignment_id is null or not exists(select 1 from assignment_coverages where course_id=p_course_id and assignment_id=b.assignment_id and node_id=e.target_node_id) then raise exception 'Assignment coverage required' using errcode='23514'; end if;
    if exists(select 1 from assignment_coverages c left join knowledge_nodes n on n.id=c.node_id
      where c.course_id=p_course_id and c.assignment_id=b.assignment_id and (n.id is null or n.status<>'active' or not(n.scope='global' or (n.scope='user' and n.owner_id=p_user_id::text))
        or (c.node_id<>e.target_node_id and not(c.node_id=any(reachable))))) then raise exception 'Assignment Knowledge readiness required' using errcode='23514'; end if;
    if exists(select 1 from assignment_dependencies d where d.course_id=p_course_id and d.target_assignment_id=b.assignment_id and d.strength='hard'
      and not exists(select 1 from user_assignment_states s where s.user_id=p_user_id and s.course_id=p_course_id and s.assignment_id=d.source_assignment_id and s.status='accepted')) then raise exception 'Assignment dependency required' using errcode='23514'; end if;
  end if;
end $$;

create or replace function public.adopt_personal_course_route(
  p_user_id uuid,p_course_id text,p_base_version_id uuid,p_source text,
  p_include_node_ids text[],p_exclude_node_ids text[],p_snapshot jsonb,p_structure_fingerprint text,p_restored_from_version_id uuid default null
) returns jsonb language plpgsql security invoker set search_path='public' as $$
declare r personal_course_routes%rowtype; v personal_course_route_versions%rowtype; previous_number integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('personal-route:'||p_user_id::text||':'||p_course_id,0));
  if not exists(select 1 from courses where id=p_course_id and lifecycle='published' and (course_type='standard' or owner_user_id=p_user_id)) then
    raise exception 'course_unavailable' using errcode='42501';
  end if;
  insert into personal_course_routes(user_id,course_id) values(p_user_id,p_course_id) on conflict(user_id,course_id) do nothing;
  select * into r from personal_course_routes where user_id=p_user_id and course_id=p_course_id for update;
  if p_source='initial' and r.active_version_id is not null then
    select * into v from personal_course_route_versions where id=r.active_version_id;
    return to_jsonb(v);
  end if;
  if r.active_version_id is distinct from p_base_version_id then raise exception 'route_version_conflict' using errcode='PT409'; end if;
  if (r.active_version_id is null) <> (p_source='initial') then raise exception 'route_source_invalid' using errcode='23514'; end if;
  if p_source='restore' and not exists(select 1 from personal_course_route_versions where id=p_restored_from_version_id and route_id=r.id and include_node_ids=p_include_node_ids and exclude_node_ids=p_exclude_node_ids) then
    raise exception 'route_restore_invalid' using errcode='23514';
  end if;
  if p_snapshot?'executionSteps' then
    if exists(select 1 from jsonb_array_elements(p_snapshot->'executionSteps') with ordinality as steps(step,position) where (step->>'order')::int<>position-1)
      or exists(select 1 from jsonb_array_elements(p_snapshot->'executionSteps') step group by step->>'edgeId',step->>'actionId' having count(*)>1)
      or exists(select 1 from jsonb_array_elements(p_snapshot->'executionSteps') with ordinality as steps(step,position) group by step->>'edgeId' having max(position)-min(position)+1<>count(*)) then raise exception 'Invalid ordered Action groups' using errcode='23514';end if;
    if exists(select 1 from edge_action_runs running where running.user_id=p_user_id and running.course_id=p_course_id and running.status in ('selected','in_progress') and (
      not exists(select 1 from jsonb_array_elements(p_snapshot->'executionSteps') step where step->>'edgeId'=running.edge_id and step->>'actionId'=running.action_id::text and exists(select 1 from knowledge_edges fact join knowledge_edge_actions action on action.edge_id=fact.id where action.id=running.action_id and action.status='active' and fact.lifecycle_status='active' and fact.relation in ('prerequisite','enables') and fact.source_node_id=step->>'sourceNodeId' and fact.target_node_id=step->>'targetNodeId'))
      or (not exists(select 1 from edge_action_runs done where done.user_id=p_user_id and done.course_id=p_course_id and done.edge_id=running.edge_id and done.action_id=running.action_id and done.status='completed')
        and running.action_id::text is distinct from (select step->>'actionId' from jsonb_array_elements(p_snapshot->'executionSteps') with ordinality as steps(step,position) where step->>'edgeId'=running.edge_id and not exists(select 1 from edge_action_runs done where done.user_id=p_user_id and done.course_id=p_course_id and done.status='completed' and done.edge_id=step->>'edgeId' and done.action_id::text=step->>'actionId') order by position limit 1)))) then
      raise exception 'Active Action conflicts with Route adjustment' using errcode='PT409';
    end if;
  end if;
  select version_number into previous_number from personal_course_route_versions where id=r.active_version_id;
  insert into personal_course_route_versions(route_id,user_id,course_id,version_number,parent_version_id,source,include_node_ids,exclude_node_ids,snapshot,structure_fingerprint,restored_from_version_id)
  values(r.id,p_user_id,p_course_id,coalesce(previous_number,0)+1,r.active_version_id,p_source,p_include_node_ids,p_exclude_node_ids,p_snapshot,p_structure_fingerprint,p_restored_from_version_id) returning * into v;
  update personal_course_routes set active_version_id=v.id where id=r.id;
  return to_jsonb(v);
end $$;

create or replace function public.assert_personal_route_micro_v2(p_user_id uuid,p_course_id text,p_node_id text,p_expected_version_id uuid,p_route_node_ids text[])
returns void language plpgsql security invoker set search_path='public' as $$
declare v personal_course_route_versions%rowtype; active_run edge_action_runs;
begin
  if p_course_id is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('personal-route:'||p_user_id::text||':'||p_course_id,0));
  select versions.* into v from personal_course_routes r join personal_course_route_versions versions on versions.id=r.active_version_id
    where r.user_id=p_user_id and r.course_id=p_course_id;
  if v.id is null or v.id is distinct from p_expected_version_id then raise exception 'route_version_conflict' using errcode='PT409'; end if;
  if not exists(select 1 from courses where id=p_course_id and lifecycle='published' and (course_type='standard' or owner_user_id=p_user_id)) then raise exception 'course_unavailable' using errcode='42501'; end if;
  if not coalesce(p_node_id=any(p_route_node_ids),false) or v.exclude_node_ids && p_route_node_ids then raise exception 'knowledge_not_in_route' using errcode='42501'; end if;
  if not exists(select 1 from knowledge_nodes where id=p_node_id and status='active' and (scope='global' or (scope='user' and owner_id=p_user_id::text))) then raise exception 'knowledge_unavailable' using errcode='42501'; end if;
  if v.snapshot?'executionSteps' then
    for active_run in select r.* from edge_action_runs r join micro_learning_paths path on path.id=r.micro_path_id where r.user_id=p_user_id and r.course_id=p_course_id and r.execution_version=2 and r.status='in_progress' and path.status='published' and path.knowledge_id=p_node_id and r.execution_snapshot->>'targetId'=p_node_id loop
      -- Exact submitting Run was checked by record_action_micro_step. Another
      -- same-target independent Run must not veto its valid teaching gate.
      begin
        perform require_action_execution_conditions(p_user_id,p_course_id,active_run.action_id,active_run.binding_id);
        return;
      exception when sqlstate 'PT409' or check_violation or no_data_found then
        continue;
      end;
    end loop;
  end if;
  if not exists(select 1 from user_knowledge_states where user_id=p_user_id and node_id=p_node_id and status in ('learned','practicing','mastered')) and exists(
    select 1 from knowledge_edges e join knowledge_nodes source on source.id=e.source_node_id
    where e.target_node_id=p_node_id and e.relation='prerequisite' and e.prerequisite_strength='hard' and e.lifecycle_status='active'
      and (source.scope='global' or (source.scope='user' and source.owner_id=p_user_id::text))
      and (source.status<>'active' or e.source_node_id=any(v.exclude_node_ids) or not coalesce(e.source_node_id=any(p_route_node_ids),false)
        or not exists(select 1 from user_knowledge_states s where s.user_id=p_user_id and s.node_id=e.source_node_id and s.status in ('learned','practicing','mastered')))
  ) then raise exception 'teaching_prerequisite_required' using errcode='42501'; end if;
end $$;

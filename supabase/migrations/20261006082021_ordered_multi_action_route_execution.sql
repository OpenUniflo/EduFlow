-- Forward-only execution gates. Immutable snapshots and formal UKS are unchanged.
create or replace function public.route_execution_reachable_nodes(p_user_id uuid,p_course_id text)
returns text[] language plpgsql stable security invoker set search_path=public as $$
declare v personal_course_route_versions; step jsonb; reachable text[]; prefix jsonb:='[]'::jsonb;
begin
 select coalesce(array_agg(s.node_id),'{}') into reachable from user_knowledge_states s join knowledge_nodes n on n.id=s.node_id where s.user_id=p_user_id and s.status in ('learned','practicing','mastered') and n.status='active';
 select versions.* into v from personal_course_routes r join personal_course_route_versions versions on versions.id=r.active_version_id where r.user_id=p_user_id and r.course_id=p_course_id;
 if v.id is null or coalesce(v.snapshot->>'valid','false')<>'true' or not(v.snapshot?'executionSteps') then return reachable;end if;
 for step in select value from jsonb_array_elements(v.snapshot->'executionSteps') loop
  if not exists(select 1 from edge_action_runs r where r.user_id=p_user_id and r.course_id=p_course_id and r.status='completed' and r.edge_id=step->>'edgeId' and r.action_id::text=step->>'actionId') then exit;end if;
  prefix:=prefix||jsonb_build_array(step);
  if (step->>'sourceNodeId')=any(reachable) and exists(select 1 from knowledge_edges e join knowledge_nodes n on n.id=e.target_node_id where e.id=step->>'edgeId' and e.source_node_id=step->>'sourceNodeId' and e.target_node_id=step->>'targetNodeId' and e.lifecycle_status='active' and n.status='active' and e.relation in ('prerequisite','enables'))
    and not exists(select 1 from jsonb_array_elements(v.snapshot->'executionSteps') incoming where incoming->>'targetNodeId'=step->>'targetNodeId' and not exists(select 1 from jsonb_array_elements(prefix) done where done->>'edgeId'=incoming->>'edgeId' and done->>'actionId'=incoming->>'actionId')) then
    if not((step->>'targetNodeId')=any(reachable)) then reachable:=array_append(reachable,step->>'targetNodeId');end if;
  end if;
 end loop;
 return reachable;
end $$;
revoke all on function public.route_execution_reachable_nodes(uuid,text) from public,anon,authenticated;
grant execute on function public.route_execution_reachable_nodes(uuid,text) to service_role;



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
  -- Recheck real hard prerequisites in the mutation transaction. Enables never gate.
  if not(e.target_node_id=any(reachable))
    and exists(select 1 from knowledge_edges p where p.target_node_id=e.target_node_id and p.relation='prerequisite' and p.prerequisite_strength='hard' and p.lifecycle_status='active'
      and not(p.source_node_id=any(reachable))) then
    raise exception 'Target hard prerequisite required' using errcode='23514';
  end if;
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

create or replace function public.select_edge_action_v2(
  p_user_id uuid,p_course_id text,p_action_id uuid,p_selection_key uuid,
  p_action_version timestamptz,p_binding_version timestamptz,
  p_expected_active_run_id uuid default null,p_repeat_run_id uuid default null
) returns public.edge_action_runs language plpgsql security invoker set search_path=public as $$
declare a knowledge_edge_actions; b course_action_bindings; e knowledge_edges; r edge_action_runs; active_run edge_action_runs;
begin
  select * into a from knowledge_edge_actions where id=p_action_id for share;
  if not found then raise exception 'Action unavailable' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_course_id||':'||a.edge_id,0));
  select * into r from edge_action_runs where user_id=p_user_id and selection_key=p_selection_key;
  if found then
    if r.action_id<>p_action_id or r.course_id<>p_course_id or r.execution_version<>2 then raise exception 'Selection key conflict' using errcode='23514'; end if;
    return r;
  end if;
  if p_repeat_run_id is not null and not exists(select 1 from edge_action_runs where id=p_repeat_run_id and user_id=p_user_id and course_id=p_course_id and action_id=p_action_id and edge_id=a.edge_id and status='completed') then raise exception 'Repeated execution unavailable' using errcode='P0002'; end if;
  select * into e from knowledge_edges where id=a.edge_id for share;
  -- Source authority is checked with course-scoped reachability below.
  select * into b from course_action_bindings where course_id=p_course_id and action_id=p_action_id for share;
  if not found or not b.available or b.updated_at is distinct from p_binding_version then raise exception 'Execution binding changed' using errcode='PT409'; end if;
  perform require_action_execution_conditions(p_user_id,p_course_id,a.id,b.id);
  if a.type='micro_learning' then
    if b.micro_path_id is null or b.assignment_id is not null then raise exception 'Explicit Micro resource required' using errcode='23514'; end if;
  elsif b.assignment_id is null or b.micro_path_id is not null or not exists(
    select 1 from assignment_coverages where course_id=p_course_id and assignment_id=b.assignment_id and node_id=e.target_node_id
  ) then raise exception 'Explicit Assignment target coverage required' using errcode='23514'; end if;
  select * into active_run from edge_action_runs where user_id=p_user_id and course_id=p_course_id and edge_id=a.edge_id and status in ('selected','in_progress') for update;
  if active_run.id is not null and active_run.action_id=a.id and active_run.execution_version=2
    and active_run.execution_snapshot->'action'->>'updated_at'=to_jsonb(a)->>'updated_at'
    and active_run.execution_snapshot->'binding'->>'updated_at'=to_jsonb(b)->>'updated_at' then return active_run; end if;
  if active_run.id is distinct from p_expected_active_run_id then raise exception 'Confirm current active action before switching' using errcode='PT409'; end if;
  -- Cancel only the specifically confirmed record. Legacy callers cannot cancel v2 work.
  if active_run.id is not null then update edge_action_runs set status='cancelled',updated_at=now() where id=active_run.id; end if;
  -- Existing selection owns immutable snapshots, resource checks and active-choice uniqueness.
  r := select_edge_action(p_user_id,p_course_id,p_action_id,p_selection_key,p_action_version,p_binding_version,b.micro_path_id);
  update edge_action_runs set execution_version=2,assignment_id=b.assignment_id,execution_snapshot=execution_snapshot||jsonb_build_object('repeatedFromRunId',p_repeat_run_id) where id=r.id returning * into r;
  return r;
end $$;

create or replace function public.select_edge_action(p_user_id uuid,p_course_id text,p_action_id uuid,p_selection_key uuid,p_action_version timestamptz,p_binding_version timestamptz,p_micro_path_id text default null)
returns public.edge_action_runs language plpgsql set search_path=public as $$
declare a knowledge_edge_actions; b course_action_bindings; e knowledge_edges; r edge_action_runs;
begin
  select * into a from knowledge_edge_actions where id=p_action_id for share;
  if not found or a.status<>'active' or a.updated_at<>p_action_version then raise exception 'Action changed' using errcode='PT409'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_course_id||':'||a.edge_id,0));
  select * into r from edge_action_runs where user_id=p_user_id and selection_key=p_selection_key;
  if found then
    if r.action_id<>p_action_id or r.course_id<>p_course_id then raise exception 'Selection key conflict' using errcode='23514'; end if;
    return r;
  end if;
  if not exists(select 1 from courses where id=p_course_id and lifecycle='published' and (course_type='standard' or owner_user_id=p_user_id)) then raise exception 'Course unavailable' using errcode='P0002'; end if;
  select * into e from knowledge_edges where id=a.edge_id and lifecycle_status='active' for share;
  if not found or e.relation not in ('prerequisite','enables') or (select count(*) from knowledge_nodes where id in(e.source_node_id,e.target_node_id) and scope='global' and status='active')<>2 then raise exception 'Edge unavailable' using errcode='23514'; end if;
  select * into b from course_action_bindings where course_id=p_course_id and action_id=a.id for share;
  if (b.id is not null and (not b.available or b.updated_at is distinct from p_binding_version)) or (b.id is null and p_binding_version is not null) then raise exception 'Resources changed' using errcode='PT409'; end if;
  if exists(select 1 from unnest(a.required_capability_ids) required(node_id) where not(required.node_id=any(route_execution_reachable_nodes(p_user_id,p_course_id)))) then raise exception 'Execution capability missing' using errcode='23514'; end if;
  if exists(select 1 from unnest(a.resource_requirements) required(resource_key) where not exists(select 1 from jsonb_array_elements(coalesce(b.resources,'[]')) resource where resource->>'key'=required.resource_key and resource->>'available'='true' and length(trim(resource->>'reference'))>0)) then raise exception 'Execution resource missing' using errcode='23514'; end if;
  if a.type='micro_learning' then
    if not exists(select 1 from micro_learning_paths p where p.id=p_micro_path_id and p.knowledge_id=e.target_node_id and p.status='published' and p.mode='learn' and (p.course_id is null or p.course_id=p_course_id)) then raise exception 'Micro unavailable' using errcode='23514'; end if;
  elsif p_micro_path_id is not null then raise exception 'Practice cannot use Micro' using errcode='23514'; end if;
  select * into r from edge_action_runs where user_id=p_user_id and course_id=p_course_id and edge_id=a.edge_id and status in ('selected','in_progress') for update;
  if found and r.action_id=a.id and r.execution_snapshot->'action'->>'updated_at'=to_jsonb(a)->>'updated_at' and r.binding_id is not distinct from b.id and (b.id is null or r.execution_snapshot->'binding'->>'updated_at'=to_jsonb(b)->>'updated_at') and r.micro_path_id is not distinct from p_micro_path_id then return r; end if;
  if r.id is not null and r.execution_version=2 then raise exception 'Confirm current action in the current client' using errcode='PT409'; end if;
  update edge_action_runs set status='cancelled',updated_at=now() where user_id=p_user_id and course_id=p_course_id and edge_id=a.edge_id and status in ('selected','in_progress');
  insert into edge_action_runs(user_id,course_id,action_id,edge_id,binding_id,status,selection_key,execution_snapshot,micro_path_id)
    values(p_user_id,p_course_id,a.id,a.edge_id,b.id,'selected',p_selection_key,jsonb_build_object('action',to_jsonb(a),'binding',case when b.id is null then 'null'::jsonb else to_jsonb(b) end,'sourceId',e.source_node_id,'targetId',e.target_node_id),p_micro_path_id) returning * into r;
  return r;
end $$;

create or replace function public.transition_edge_action_run(p_user_id uuid,p_run_id uuid,p_operation text,p_source_id uuid default null)
returns public.edge_action_runs language plpgsql set search_path=public as $$
declare r edge_action_runs; s user_evidence_sources;
begin
  select * into r from edge_action_runs where id=p_run_id and user_id=p_user_id for update;
  if not found then raise exception 'Run unavailable' using errcode='P0002'; end if;
  if p_operation='start' then
    if r.status in ('in_progress','completed') then return r; end if;
    if r.status<>'selected' then raise exception 'Run cancelled' using errcode='23514'; end if;
    -- Revalidate governed availability immediately before execution.
    if not exists(select 1 from knowledge_edge_actions a join knowledge_edges e on e.id=a.edge_id join knowledge_nodes n on n.id=e.source_node_id join knowledge_nodes t on t.id=e.target_node_id where a.id=r.action_id and a.status='active' and a.updated_at=(r.execution_snapshot->'action'->>'updated_at')::timestamptz and e.lifecycle_status='active' and e.source_node_id=r.execution_snapshot->>'sourceId' and e.target_node_id=r.execution_snapshot->>'targetId' and n.status='active' and t.status='active' and n.scope='global' and t.scope='global') then raise exception 'Action changed; select again' using errcode='PT409'; end if;
    if r.binding_id is null and exists(select 1 from course_action_bindings where course_id=r.course_id and action_id=r.action_id) then raise exception 'Resources added; select again' using errcode='PT409'; end if;
    if r.micro_path_id is not null and not exists(select 1 from micro_learning_paths p where p.id=r.micro_path_id and p.knowledge_id=r.execution_snapshot->>'targetId' and p.status='published' and p.mode='learn' and (p.course_id is null or p.course_id=r.course_id)) then raise exception 'Selected Micro changed' using errcode='PT409'; end if;
    if r.binding_id is not null and not exists(select 1 from course_action_bindings b where b.id=r.binding_id and b.available and b.updated_at=(r.execution_snapshot->'binding'->>'updated_at')::timestamptz) then raise exception 'Resources changed; select again' using errcode='PT409'; end if;
    if exists(select 1 from jsonb_array_elements_text(r.execution_snapshot->'action'->'required_capability_ids') required(node_id) where not(required.node_id=any(route_execution_reachable_nodes(p_user_id,r.course_id)))) then raise exception 'Required capability changed' using errcode='23514'; end if;
    update edge_action_runs set status='in_progress',started_at=now(),updated_at=now() where id=r.id returning * into r;
  elsif p_operation='submit' then
    if r.execution_version=2 then raise exception 'Use Assignment execution for this action' using errcode='23514'; end if;
    if r.status='completed' and r.evidence_source_id=p_source_id then return r; end if;
    if r.status<>'in_progress' or r.execution_snapshot->'action'->>'type'<>'practice_task' then raise exception 'Practice is not running' using errcode='23514'; end if;
    select * into s from user_evidence_sources where id=p_source_id and user_id=p_user_id for update;
    if not found or s.parse_status<>'ready' or s.archived_at is not null or s.source_sha256 is null or s.created_at<r.started_at then raise exception 'Result source unavailable' using errcode='23514'; end if;
    update edge_action_runs set status='completed',evidence_source_id=s.id,completed_at=now(),updated_at=now() where id=r.id returning * into r;
    update user_evidence_sources set provenance=provenance||jsonb_build_object('kind','action-result','actionRunId',r.id,'actionId',r.action_id,'courseId',r.course_id) where id=s.id;
  elsif p_operation='sync-micro' then
    if r.execution_version=2 then return sync_action_micro_run(p_user_id,p_run_id); end if;
    if r.status='completed' then return r; end if;
    if r.status<>'in_progress' or r.micro_path_id is null then raise exception 'Micro is not running' using errcode='23514'; end if;
    if exists(select 1 from user_micro_path_progress where user_id=p_user_id and path_id=r.micro_path_id and status='completed' and (r.execution_version=1 or completed_at>=r.started_at)) then
      update edge_action_runs set status='completed',completed_at=now(),updated_at=now() where id=r.id returning * into r;
    end if;
  else raise exception 'Unknown run operation' using errcode='23514'; end if;
  return r;
end $$;

create or replace function public.assert_route_action_choice(
  p_user_id uuid,p_course_id text,p_action_id uuid,p_expected_version_id uuid,p_retained boolean default false
) returns uuid language plpgsql security invoker set search_path=public as $$
declare v personal_course_route_versions; e knowledge_edges; current_step jsonb;
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
  if not p_retained then
    if v.id is distinct from p_expected_version_id then raise exception 'Route version changed' using errcode='PT409'; end if;
    -- Undefined executionSteps is a legacy snapshot. Preserve its old execution API.
    if v.snapshot ? 'executionSteps' and (coalesce(v.snapshot->>'valid','false')<>'true'
      or not exists(select 1 from jsonb_array_elements(v.snapshot->'executionSteps') step
        where step->>'edgeId'=e.id and step->>'actionId'=p_action_id::text
          and step->>'sourceNodeId'=e.source_node_id and step->>'targetNodeId'=e.target_node_id)) then
      raise exception 'Action not selected in formal route' using errcode='23514';
    end if;
  end if;
  if v.snapshot?'executionSteps' and not exists(select 1 from edge_action_runs done where done.user_id=p_user_id and done.course_id=p_course_id and done.edge_id=e.id and done.action_id=p_action_id and done.status='completed') then
    select step into current_step from jsonb_array_elements(v.snapshot->'executionSteps') with ordinality as steps(step,position)
      where not exists(select 1 from edge_action_runs done where done.user_id=p_user_id and done.course_id=p_course_id and done.status='completed' and done.edge_id=step->>'edgeId' and done.action_id::text=step->>'actionId') order by position limit 1;
    if current_step is null or current_step->>'edgeId'<>e.id or current_step->>'actionId'<>p_action_id::text then raise exception 'Route Step is not current' using errcode='PT409';end if;
  elsif v.snapshot?'executionSteps' and not p_retained then
    raise exception 'Completed Step requires explicit Repeat' using errcode='PT409';
  end if;
  return v.id;
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
      not exists(select 1 from jsonb_array_elements(p_snapshot->'executionSteps') step where step->>'edgeId'=running.edge_id and step->>'actionId'=running.action_id::text)
      or (not exists(select 1 from edge_action_runs done where done.user_id=p_user_id and done.course_id=p_course_id and done.edge_id=running.edge_id and done.action_id=running.action_id and done.status='completed')
        and running.action_id::text is distinct from (select step->>'actionId' from jsonb_array_elements(p_snapshot->'executionSteps') with ordinality as steps(step,position) where not exists(select 1 from edge_action_runs done where done.user_id=p_user_id and done.course_id=p_course_id and done.status='completed' and done.edge_id=step->>'edgeId' and done.action_id::text=step->>'actionId') order by position limit 1)))) then
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
declare v personal_course_route_versions%rowtype;
begin
  if p_course_id is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('personal-route:'||p_user_id::text||':'||p_course_id,0));
  select versions.* into v from personal_course_routes r join personal_course_route_versions versions on versions.id=r.active_version_id
    where r.user_id=p_user_id and r.course_id=p_course_id;
  if v.id is null or v.id is distinct from p_expected_version_id then raise exception 'route_version_conflict' using errcode='PT409'; end if;
  if not exists(select 1 from courses where id=p_course_id and lifecycle='published' and (course_type='standard' or owner_user_id=p_user_id)) then raise exception 'course_unavailable' using errcode='42501'; end if;
  if not coalesce(p_node_id=any(p_route_node_ids),false) or v.exclude_node_ids && p_route_node_ids then raise exception 'knowledge_not_in_route' using errcode='42501'; end if;
  if not exists(select 1 from knowledge_nodes where id=p_node_id and status='active' and (scope='global' or (scope='user' and owner_id=p_user_id::text))) then raise exception 'knowledge_unavailable' using errcode='42501'; end if;
  if v.snapshot?'executionSteps' and exists(select 1 from edge_action_runs r join course_action_bindings b on b.id=r.binding_id join micro_learning_paths path on path.id=r.micro_path_id where r.user_id=p_user_id and r.course_id=p_course_id and r.execution_version=2 and r.status='in_progress' and b.available and path.status='published' and path.knowledge_id=p_node_id and (
    exists(select 1 from edge_action_runs done where done.user_id=p_user_id and done.course_id=p_course_id and done.edge_id=r.edge_id and done.action_id=r.action_id and done.status='completed')
    or r.action_id::text=(select step->>'actionId' from jsonb_array_elements(v.snapshot->'executionSteps') with ordinality as steps(step,position) where not exists(select 1 from edge_action_runs done where done.user_id=p_user_id and done.course_id=p_course_id and done.edge_id=step->>'edgeId' and done.action_id::text=step->>'actionId' and done.status='completed') order by position limit 1)
  )) then
    if exists(select 1 from knowledge_edges e where e.target_node_id=p_node_id and e.relation='prerequisite' and e.prerequisite_strength='hard' and e.lifecycle_status='active' and not(e.source_node_id=any(route_execution_reachable_nodes(p_user_id,p_course_id)))) and not(p_node_id=any(route_execution_reachable_nodes(p_user_id,p_course_id))) then raise exception 'Action teaching prerequisite required' using errcode='42501';end if;
    return;
  end if;
  if not exists(select 1 from user_knowledge_states where user_id=p_user_id and node_id=p_node_id and status in ('learned','practicing','mastered')) and exists(
    select 1 from knowledge_edges e join knowledge_nodes source on source.id=e.source_node_id
    where e.target_node_id=p_node_id and e.relation='prerequisite' and e.prerequisite_strength='hard' and e.lifecycle_status='active'
      and (source.scope='global' or (source.scope='user' and source.owner_id=p_user_id::text))
      and (source.status<>'active' or e.source_node_id=any(v.exclude_node_ids) or not coalesce(e.source_node_id=any(p_route_node_ids),false)
        or not exists(select 1 from user_knowledge_states s where s.user_id=p_user_id and s.node_id=e.source_node_id and s.status in ('learned','practicing','mastered')))
  ) then raise exception 'teaching_prerequisite_required' using errcode='42501'; end if;
end $$;

-- Revalidate ordered execution in the same submission transaction.
create or replace function public.record_action_assignment_attempt(
  p_user_id uuid,p_run_id uuid,p_idempotency_key text,p_response jsonb,
  p_outcome text,p_score numeric,p_feedback jsonb,p_evaluator_kind text
) returns table(attempt_id uuid,result_id uuid,outcome text,duplicate boolean)
language plpgsql security invoker set search_path=public as $$
declare r edge_action_runs; saved record; existing learning_attempts;
begin
  select * into r from edge_action_runs where id=p_run_id and user_id=p_user_id;
  if not found or r.assignment_id is null then raise exception 'Assignment action unavailable' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('criterion-evidence:'||p_user_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('personal-route:'||p_user_id::text||':'||r.course_id,0));
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

-- Revalidate ordered execution in the same submission transaction.
create or replace function public.record_conversation_action_assignment_attempt(
  p_user_id uuid,p_run_id uuid,p_idempotency_key text,p_response jsonb,
  p_outcome text,p_score numeric,p_feedback jsonb,p_evaluator_kind text
) returns table(attempt_id uuid,result_id uuid,outcome text,duplicate boolean)
language plpgsql security invoker set search_path=public as $$
declare r edge_action_runs; saved record; existing learning_attempts;
begin
  select * into r from edge_action_runs where id=p_run_id and user_id=p_user_id;
  if not found or r.assignment_id is null then raise exception 'Assignment action unavailable' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('criterion-evidence:'||p_user_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('personal-route:'||p_user_id::text||':'||r.course_id,0));
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

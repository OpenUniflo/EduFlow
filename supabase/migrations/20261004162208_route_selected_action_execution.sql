-- Additive service-only wrappers. Existing clients/RPCs and immutable JSON snapshots
-- remain readable; new clients serialize adoption and first execution on one route lock.
create or replace function public.assert_route_action_choice(
  p_user_id uuid,p_course_id text,p_action_id uuid,p_expected_version_id uuid,p_retained boolean default false
) returns uuid language plpgsql security invoker set search_path=public as $$
declare v personal_course_route_versions; e knowledge_edges;
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
  return v.id;
end $$;

create or replace function public.select_route_action_v3(
  p_user_id uuid,p_course_id text,p_action_id uuid,p_selection_key uuid,
  p_action_version timestamptz,p_binding_version timestamptz,p_expected_version_id uuid,
  p_expected_active_run_id uuid default null,p_repeat_run_id uuid default null
) returns public.edge_action_runs language plpgsql security invoker set search_path=public as $$
declare r edge_action_runs; version_id uuid;
begin
  -- Serialize with existing Micro writers before taking any route/run lock.
  perform pg_advisory_xact_lock(hashtextextended('criterion-evidence:'||p_user_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('personal-route:'||p_user_id::text||':'||p_course_id,0));
  -- A committed request stays idempotent after adoption or resource changes.
  select * into r from edge_action_runs where user_id=p_user_id and selection_key=p_selection_key;
  if found then
    if r.action_id<>p_action_id or r.course_id<>p_course_id or r.execution_version<>2 then raise exception 'Selection key conflict' using errcode='23514'; end if;
    return r;
  end if;
  if p_repeat_run_id is not null and not exists(select 1 from edge_action_runs old
    join knowledge_edge_actions a on a.id=p_action_id where old.id=p_repeat_run_id and old.user_id=p_user_id
      and old.course_id=p_course_id and old.action_id=p_action_id and old.edge_id=a.edge_id and old.status='completed') then
    raise exception 'Repeated execution unavailable' using errcode='P0002';
  end if;
  version_id:=assert_route_action_choice(p_user_id,p_course_id,p_action_id,p_expected_version_id,p_repeat_run_id is not null);
  r:=select_edge_action_v2(p_user_id,p_course_id,p_action_id,p_selection_key,p_action_version,p_binding_version,p_expected_active_run_id,p_repeat_run_id);
  -- Preserve a reused active Run's original lineage.
  if r.selection_key=p_selection_key then
    update edge_action_runs set execution_snapshot=execution_snapshot||jsonb_build_object('routeVersionId',version_id)
      where id=r.id returning * into r;
  end if;
  return r;
end $$;

create or replace function public.transition_route_action_v3(p_user_id uuid,p_run_id uuid,p_operation text,p_expected_version_id uuid default null)
returns public.edge_action_runs language plpgsql security invoker set search_path=public as $$
declare r edge_action_runs; retained boolean;
begin
  select * into r from edge_action_runs where id=p_run_id and user_id=p_user_id;
  if not found then raise exception 'Run unavailable' using errcode='P0002'; end if;
  -- Evidence -> Route -> Run avoids the existing Micro writer lock cycle.
  -- Serialize with existing Micro writers before taking any route/run lock.
  perform pg_advisory_xact_lock(hashtextextended('criterion-evidence:'||p_user_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('personal-route:'||p_user_id::text||':'||r.course_id,0));
  select * into r from edge_action_runs where id=p_run_id and user_id=p_user_id for update;
  if p_operation='start' and r.status in ('selected','in_progress') then
    retained:=r.status='in_progress' or exists(select 1 from edge_action_runs old
      where old.id::text=r.execution_snapshot->>'repeatedFromRunId' and old.user_id=p_user_id
        and old.course_id=r.course_id and old.action_id=r.action_id and old.edge_id=r.edge_id and old.status='completed');
    perform assert_route_action_choice(p_user_id,r.course_id,r.action_id,p_expected_version_id,retained);
  end if;
  return transition_edge_action_run_v2(p_user_id,p_run_id,p_operation);
end $$;

revoke all on function public.assert_route_action_choice(uuid,text,uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.select_route_action_v3(uuid,text,uuid,uuid,timestamptz,timestamptz,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.transition_route_action_v3(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.assert_route_action_choice(uuid,text,uuid,uuid,boolean) to service_role;
grant execute on function public.select_route_action_v3(uuid,text,uuid,uuid,timestamptz,timestamptz,uuid,uuid,uuid) to service_role;
grant execute on function public.transition_route_action_v3(uuid,uuid,text,uuid) to service_role;

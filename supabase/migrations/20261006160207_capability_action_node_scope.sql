-- Forward-only scope extension. No graph, UKS, Evidence or historical snapshot writes.
alter table public.knowledge_edge_actions add column node_id text references public.knowledge_nodes(id) on delete restrict;
alter table public.knowledge_edge_actions alter column edge_id drop not null;
alter table public.knowledge_edge_actions add constraint capability_action_exact_scope check ((edge_id is null) <> (node_id is null));
create index knowledge_edge_actions_node_idx on public.knowledge_edge_actions(node_id) where node_id is not null;
alter table public.edge_action_runs add column node_id text references public.knowledge_nodes(id) on delete restrict;
alter table public.edge_action_runs alter column edge_id drop not null;
alter table public.edge_action_runs add constraint action_run_exact_scope check ((edge_id is null) <> (node_id is null));
create unique index node_action_runs_active_choice on public.edge_action_runs(user_id,course_id,node_id) where node_id is not null and status in ('selected','in_progress');
create index edge_action_runs_node_idx on public.edge_action_runs(node_id) where node_id is not null;

-- Exact scope keys preserve the legacy Edge identity and never invent a fact.
create function public.capability_scope_key(p_edge_id text,p_node_id text) returns jsonb
language sql immutable security invoker set search_path=public as $$
 select case when p_node_id is not null then jsonb_build_array('node',p_node_id) else jsonb_build_array('edge',p_edge_id) end
$$;
create function public.route_step_scope_key(p_step jsonb) returns jsonb
language sql immutable security invoker set search_path=public as $$
 select capability_scope_key(p_step->>'edgeId',case when p_step->>'scope'='node' then p_step->>'nodeId' end)
$$;
create function public.is_capability_action_root(p_node_id text) returns boolean
language sql stable security invoker set search_path=public as $$
 select exists(select 1 from knowledge_nodes where id=p_node_id and scope='global' and status='active')
 and not exists(select 1 from knowledge_edges where target_node_id=p_node_id and lifecycle_status='active' and relation in ('prerequisite','enables'))
$$;
revoke all on function public.capability_scope_key(text,text),public.route_step_scope_key(jsonb),public.is_capability_action_root(text) from public,anon,authenticated;
grant execute on function public.capability_scope_key(text,text),public.route_step_scope_key(jsonb),public.is_capability_action_root(text) to service_role;

create or replace function public.validate_edge_action() returns trigger language plpgsql set search_path=public as $$
begin
 if TG_OP='UPDATE' then
  if new.edge_id is distinct from old.edge_id or new.node_id is distinct from old.node_id or new.type<>old.type then raise exception 'Action scope and execution type are immutable' using errcode='23514';end if;
  if new.status='archived' then new.updated_at=now();return new;end if;
 end if;
 if (new.edge_id is null)=(new.node_id is null) then raise exception 'Exactly one Action scope required' using errcode='23514';end if;
 if new.node_id is not null then
  if not exists(select 1 from knowledge_nodes where id=new.node_id and scope='global' and status='active') then raise exception 'Action requires active Global Knowledge' using errcode='23514';end if;
 elsif not exists(select 1 from knowledge_edges e join knowledge_nodes s on s.id=e.source_node_id join knowledge_nodes t on t.id=e.target_node_id where e.id=new.edge_id and e.lifecycle_status='active' and e.relation in ('prerequisite','enables') and s.scope='global' and t.scope='global' and s.status='active' and t.status='active') then raise exception 'Action requires active Global directed KnowledgeEdge' using errcode='23514';end if;
 if exists(select 1 from unnest(new.required_capability_ids) required(node_id) where not exists(select 1 from knowledge_nodes n where n.id=required.node_id and n.scope='global' and n.status='active')) then raise exception 'Invalid execution capability' using errcode='23514';end if;
 new.updated_at=now();return new;
end $$;
drop policy edge_actions_read on public.knowledge_edge_actions;
create policy edge_actions_read on public.knowledge_edge_actions for select to authenticated using (
 (node_id is not null and exists(select 1 from public.knowledge_nodes n where n.id=node_id and n.scope='global' and n.status='active'))
 or exists(select 1 from public.knowledge_edges e join public.knowledge_nodes s on s.id=e.source_node_id join public.knowledge_nodes t on t.id=e.target_node_id where e.id=edge_id and e.lifecycle_status='active' and s.scope='global' and t.scope='global' and s.status='active' and t.status='active')
);
create function public.validate_action_run_scope() returns trigger language plpgsql set search_path=public as $$
begin
 if not exists(select 1 from knowledge_edge_actions a where a.id=new.action_id and a.edge_id is not distinct from new.edge_id and a.node_id is not distinct from new.node_id) then raise exception 'Run and template scopes differ' using errcode='23514';end if;
 if TG_OP='UPDATE' and (new.edge_id is distinct from old.edge_id or new.node_id is distinct from old.node_id or new.action_id<>old.action_id or new.user_id<>old.user_id or new.course_id<>old.course_id or new.execution_snapshot - 'routeVersionId' - 'repeatedFromRunId' is distinct from old.execution_snapshot - 'routeVersionId' - 'repeatedFromRunId') then raise exception 'Run scope and context are immutable' using errcode='23514';end if;
 return new;
end $$;
revoke all on function public.validate_action_run_scope() from public,anon,authenticated;
create trigger action_run_scope_guard before insert or update on public.edge_action_runs for each row execute function public.validate_action_run_scope();


create or replace function public.select_edge_action(p_user_id uuid,p_course_id text,p_action_id uuid,p_selection_key uuid,p_action_version timestamptz,p_binding_version timestamptz,p_micro_path_id text default null)
returns public.edge_action_runs language plpgsql set search_path=public as $$
declare a knowledge_edge_actions; b course_action_bindings; e knowledge_edges; r edge_action_runs;
begin
  select * into a from knowledge_edge_actions where id=p_action_id for share;
  if not found or a.status<>'active' or a.updated_at<>p_action_version then raise exception 'Action changed' using errcode='PT409'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_course_id||':'||capability_scope_key(a.edge_id,a.node_id)::text,0));
  select * into r from edge_action_runs where user_id=p_user_id and selection_key=p_selection_key;
  if found then
    if r.action_id<>p_action_id or r.course_id<>p_course_id then raise exception 'Selection key conflict' using errcode='23514'; end if;
    return r;
  end if;
  if not exists(select 1 from courses where id=p_course_id and lifecycle='published' and (course_type='standard' or owner_user_id=p_user_id)) then raise exception 'Course unavailable' using errcode='P0002'; end if;
  select * into e from knowledge_edges where id=a.edge_id and lifecycle_status='active' for share;
  if a.node_id is not null and not is_capability_action_root(a.node_id) or a.node_id is null and (e.id is null or e.relation not in ('prerequisite','enables') or (select count(*) from knowledge_nodes where id in(e.source_node_id,e.target_node_id) and scope='global' and status='active')<>2) then raise exception 'Edge unavailable' using errcode='23514'; end if;
  if a.node_id is not null then perform assert_route_action_choice(p_user_id,p_course_id,a.id,(select active_version_id from personal_course_routes where user_id=p_user_id and course_id=p_course_id),true);end if;
  select * into b from course_action_bindings where course_id=p_course_id and action_id=a.id for share;
  if (b.id is not null and (not b.available or b.updated_at is distinct from p_binding_version)) or (b.id is null and p_binding_version is not null) then raise exception 'Resources changed' using errcode='PT409'; end if;
  if exists(select 1 from unnest(a.required_capability_ids) required(node_id) where not(required.node_id=any(route_execution_reachable_nodes(p_user_id,p_course_id)))) then raise exception 'Execution capability missing' using errcode='23514'; end if;
  if exists(select 1 from unnest(a.resource_requirements) required(resource_key) where not exists(select 1 from jsonb_array_elements(coalesce(b.resources,'[]')) resource where resource->>'key'=required.resource_key and resource->>'available'='true' and length(trim(resource->>'reference'))>0)) then raise exception 'Execution resource missing' using errcode='23514'; end if;
  if a.type='micro_learning' then
    if not exists(select 1 from micro_learning_paths p where p.id=p_micro_path_id and p.knowledge_id=coalesce(a.node_id,e.target_node_id) and p.status='published' and p.mode='learn' and (p.course_id is null or p.course_id=p_course_id)) then raise exception 'Micro unavailable' using errcode='23514'; end if;
  elsif p_micro_path_id is not null then raise exception 'Practice cannot use Micro' using errcode='23514'; end if;
  select * into r from edge_action_runs where user_id=p_user_id and course_id=p_course_id and edge_id is not distinct from a.edge_id and node_id is not distinct from a.node_id and status in ('selected','in_progress') for update;
  if found and r.action_id=a.id and r.execution_snapshot->'action'->>'updated_at'=to_jsonb(a)->>'updated_at' and r.binding_id is not distinct from b.id and (b.id is null or r.execution_snapshot->'binding'->>'updated_at'=to_jsonb(b)->>'updated_at') and r.micro_path_id is not distinct from p_micro_path_id then return r; end if;
  if r.id is not null and r.execution_version=2 then raise exception 'Confirm current action in the current client' using errcode='PT409'; end if;
  update edge_action_runs set status='cancelled',updated_at=now() where user_id=p_user_id and course_id=p_course_id and edge_id is not distinct from a.edge_id and node_id is not distinct from a.node_id and status in ('selected','in_progress');
  insert into edge_action_runs(user_id,course_id,action_id,edge_id,node_id,binding_id,status,selection_key,execution_snapshot,micro_path_id)
    values(p_user_id,p_course_id,a.id,a.edge_id,a.node_id,b.id,'selected',p_selection_key,jsonb_build_object('action',to_jsonb(a),'binding',case when b.id is null then 'null'::jsonb else to_jsonb(b) end,'sourceId',e.source_node_id,'targetId',coalesce(a.node_id,e.target_node_id)),p_micro_path_id) returning * into r;
  return r;
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
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_course_id||':'||capability_scope_key(a.edge_id,a.node_id)::text,0));
  select * into r from edge_action_runs where user_id=p_user_id and selection_key=p_selection_key;
  if found then
    if r.action_id<>p_action_id or r.course_id<>p_course_id or r.execution_version<>2 then raise exception 'Selection key conflict' using errcode='23514'; end if;
    return r;
  end if;
  if p_repeat_run_id is not null and not exists(select 1 from edge_action_runs where id=p_repeat_run_id and user_id=p_user_id and course_id=p_course_id and action_id=p_action_id and edge_id is not distinct from a.edge_id and node_id is not distinct from a.node_id and status='completed') then raise exception 'Repeated execution unavailable' using errcode='P0002'; end if;
  select * into e from knowledge_edges where id=a.edge_id for share;
  -- Source authority is checked with course-scoped reachability below.
  select * into b from course_action_bindings where course_id=p_course_id and action_id=p_action_id for share;
  if not found or not b.available or b.updated_at is distinct from p_binding_version then raise exception 'Execution binding changed' using errcode='PT409'; end if;
  perform require_action_execution_conditions(p_user_id,p_course_id,a.id,b.id);
  if a.type='micro_learning' then
    if b.micro_path_id is null or b.assignment_id is not null then raise exception 'Explicit Micro resource required' using errcode='23514'; end if;
  elsif b.assignment_id is null or b.micro_path_id is not null or not exists(
    select 1 from assignment_coverages where course_id=p_course_id and assignment_id=b.assignment_id and node_id=coalesce(a.node_id,e.target_node_id)
  ) then raise exception 'Explicit Assignment target coverage required' using errcode='23514'; end if;
  select * into active_run from edge_action_runs where user_id=p_user_id and course_id=p_course_id and edge_id is not distinct from a.edge_id and node_id is not distinct from a.node_id and status in ('selected','in_progress') for update;
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
    if not exists(select 1 from knowledge_edge_actions a left join knowledge_edges e on e.id=a.edge_id where a.id=r.action_id and a.status='active' and a.updated_at=(r.execution_snapshot->'action'->>'updated_at')::timestamptz and a.edge_id is not distinct from r.edge_id and a.node_id is not distinct from r.node_id
      and ((a.node_id is not null and is_capability_action_root(a.node_id) and a.node_id=r.execution_snapshot->>'targetId' and r.execution_snapshot->>'sourceId' is null)
        or (a.node_id is null and e.lifecycle_status='active' and e.source_node_id=r.execution_snapshot->>'sourceId' and e.target_node_id=r.execution_snapshot->>'targetId' and (select count(*) from knowledge_nodes where id in(e.source_node_id,e.target_node_id) and status='active' and scope='global')=2))) then raise exception 'Action changed; select again' using errcode='PT409';end if;
    if r.node_id is not null then perform require_action_execution_conditions(p_user_id,r.course_id,r.action_id,r.binding_id);end if;
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

create or replace function public.require_action_execution_conditions(p_user_id uuid,p_course_id text,p_action_id uuid,p_binding_id uuid) returns void
language plpgsql security invoker set search_path=public as $$
declare a knowledge_edge_actions; b course_action_bindings; e knowledge_edges; reachable text[]; target_id text;
begin
  select * into a from knowledge_edge_actions where id=p_action_id and status='active' for share;
  if not found then raise exception 'Action unavailable' using errcode='23514'; end if;
  select * into e from knowledge_edges where id=a.edge_id and lifecycle_status='active' for share;
  if a.node_id is null and e.id is null then raise exception 'Edge unavailable' using errcode='23514';end if;
  target_id:=coalesce(a.node_id,e.target_node_id);
  select * into b from course_action_bindings where id=p_binding_id and course_id=p_course_id and action_id=p_action_id and available for share;
  if not found then raise exception 'Executor unavailable' using errcode='23514'; end if;
  perform assert_route_action_choice(p_user_id,p_course_id,p_action_id,(select active_version_id from personal_course_routes where user_id=p_user_id and course_id=p_course_id),true);
  reachable:=route_execution_reachable_nodes(p_user_id,p_course_id);
  if a.node_id is null and not(e.source_node_id=any(reachable)) then raise exception 'Source execution reachability required' using errcode='23514';end if;
  if exists(select 1 from unnest(a.required_capability_ids) required(node_id) where not(required.node_id=any(reachable))) then raise exception 'Execution capability missing' using errcode='23514'; end if;
  if exists(select 1 from unnest(a.resource_requirements) required(resource_key) where not exists(select 1 from jsonb_array_elements(coalesce(b.resources,'[]')) resource where resource->>'key'=required.resource_key and resource->>'available'='true' and length(trim(resource->>'reference'))>0)) then raise exception 'Execution resource missing' using errcode='23514'; end if;
  -- Legacy node-only routes retain their existing teaching gate. Formal Route
  -- Actions gate by their own source/local order; hard conjunction gates reachability.
  if not exists(select 1 from personal_course_routes route join personal_course_route_versions version on version.id=route.active_version_id where route.user_id=p_user_id and route.course_id=p_course_id and version.snapshot?'executionSteps')
    and not(target_id=any(reachable)) and exists(select 1 from knowledge_edges hard where hard.target_node_id=target_id and hard.relation='prerequisite' and hard.prerequisite_strength='hard' and hard.lifecycle_status='active' and not(hard.source_node_id=any(reachable))) then raise exception 'Target hard prerequisite required' using errcode='23514';end if;
  if a.type='micro_learning' and not exists(select 1 from micro_learning_paths p where p.id=b.micro_path_id and p.knowledge_id=target_id and p.status='published' and p.mode='learn' and (p.course_id is null or p.course_id=p_course_id)) then raise exception 'Explicit Micro target required' using errcode='23514';end if;
  if a.type='practice_task' then
    if not exists(select 1 from course_assignments where course_id=p_course_id and id=b.assignment_id and mode<>'workflow' and coalesce(experience->>'type','answer')<>'workflow') then raise exception 'Assignment executor unsupported' using errcode='23514'; end if;
    if b.assignment_id is null or not exists(select 1 from assignment_coverages where course_id=p_course_id and assignment_id=b.assignment_id and node_id=target_id) then raise exception 'Assignment coverage required' using errcode='23514'; end if;
    if exists(select 1 from assignment_coverages c left join knowledge_nodes n on n.id=c.node_id
      where c.course_id=p_course_id and c.assignment_id=b.assignment_id and (n.id is null or n.status<>'active' or not(n.scope='global' or (n.scope='user' and n.owner_id=p_user_id::text))
        or (c.node_id<>target_id and not(c.node_id=any(reachable))))) then raise exception 'Assignment Knowledge readiness required' using errcode='23514'; end if;
    if exists(select 1 from assignment_dependencies d where d.course_id=p_course_id and d.target_assignment_id=b.assignment_id and d.strength='hard'
      and not exists(select 1 from user_assignment_states s where s.user_id=p_user_id and s.course_id=p_course_id and s.assignment_id=d.source_assignment_id and s.status='accepted')) then raise exception 'Assignment dependency required' using errcode='23514'; end if;
  end if;
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
      and old.course_id=p_course_id and old.action_id=p_action_id and old.edge_id is not distinct from a.edge_id and old.node_id is not distinct from a.node_id and old.status='completed') then
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
        and old.course_id=r.course_id and old.action_id=r.action_id and old.edge_id is not distinct from r.edge_id and old.node_id is not distinct from r.node_id and old.status='completed');
    perform assert_route_action_choice(p_user_id,r.course_id,r.action_id,p_expected_version_id,retained);
  end if;
  return transition_edge_action_run_v2(p_user_id,p_run_id,p_operation);
end $$;

create or replace function public.validate_artifact_practice_bindings() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('artifact-practice-bindings',0));
 if exists(select 1 from public.course_action_bindings b
   join public.knowledge_edge_actions a on a.id=b.action_id
   left join public.course_assignments assignment on assignment.course_id=b.course_id and assignment.id=b.assignment_id
   where b.available and a.status='active' and a.type='practice_task'
   and (assignment.id is null or assignment.mode='workflow' or b.micro_path_id is not null
     or coalesce(assignment.experience->>'type','answer') not in ('answer','code'))) then
   raise exception 'Active Practice requires an artifact Assignment executor' using errcode='23514';
 end if;
 if exists(select 1 from public.course_action_bindings b join public.knowledge_edge_actions a on a.id=b.action_id
   where b.available and a.status='active' and a.type='practice_task'
   group by b.course_id,b.assignment_id having count(distinct capability_scope_key(a.edge_id,a.node_id))>1) then
   raise exception 'Practice Assignment requires one canonical execution scope per Course' using errcode='23514';
 end if;
 if exists(select 1 from course_action_bindings b join knowledge_edge_actions a on a.id=b.action_id left join knowledge_edges e on e.id=a.edge_id where b.available and a.status='active' and a.node_id is not null and (
  (a.type='micro_learning' and (b.assignment_id is not null or not exists(select 1 from micro_learning_paths p where p.id=b.micro_path_id and p.knowledge_id=a.node_id and (p.course_id is null or p.course_id=b.course_id))))
  or (a.type='practice_task' and not exists(select 1 from assignment_coverages c where c.course_id=b.course_id and c.assignment_id=b.assignment_id and c.node_id=a.node_id)))) then raise exception 'Node Action executor must cover its exact Knowledge' using errcode='23514';end if;
 return null;
end $$;

create constraint trigger node_executor_path_guard after insert or update on public.micro_learning_paths deferrable initially immediate for each row execute function public.validate_artifact_practice_bindings();
create constraint trigger node_executor_coverage_guard after insert or update or delete on public.assignment_coverages deferrable initially immediate for each row execute function public.validate_artifact_practice_bindings();

create or replace function public.assert_route_action_choice(p_user_id uuid,p_course_id text,p_action_id uuid,p_expected_version_id uuid,p_retained boolean default false)
returns uuid language plpgsql security invoker set search_path=public as $$
declare v personal_course_route_versions; a knowledge_edge_actions; e knowledge_edges; frontier_step jsonb; key jsonb; repeated boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('criterion-evidence:'||p_user_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended('personal-route:'||p_user_id::text||':'||p_course_id,0));
 select versions.* into v from personal_course_routes r join personal_course_route_versions versions on versions.id=r.active_version_id where r.user_id=p_user_id and r.course_id=p_course_id;
 if v.id is null then raise exception 'Route unavailable' using errcode='PT409';end if;
 select * into a from knowledge_edge_actions where id=p_action_id and status='active';
 if a.id is null then raise exception 'Action unavailable' using errcode='23514';end if;
 select * into e from knowledge_edges where id=a.edge_id and lifecycle_status='active';
 key:=capability_scope_key(a.edge_id,a.node_id);
 if a.node_id is not null then
  if not is_capability_action_root(a.node_id) or not coalesce(v.snapshot->'selectedNodeIds' ? a.node_id,false) or a.node_id=any(v.exclude_node_ids) then raise exception 'Node Action requires a real formal Route root' using errcode='23514';end if;
 elsif e.id is null or e.source_node_id=any(v.exclude_node_ids) or e.target_node_id=any(v.exclude_node_ids) then raise exception 'Action excluded from route' using errcode='23514';end if;
 if not p_retained and v.id is distinct from p_expected_version_id then raise exception 'Route version changed' using errcode='PT409';end if;
 if v.snapshot?'executionSteps' then
  repeated:=exists(select 1 from edge_action_runs done where done.user_id=p_user_id and done.course_id=p_course_id and done.status='completed' and done.action_id=a.id and capability_scope_key(done.edge_id,done.node_id)=key);
  if p_retained and repeated then return v.id;end if;
  if coalesce(v.snapshot->>'valid','false')<>'true' or not exists(select 1 from jsonb_array_elements(v.snapshot->'executionSteps') step where route_step_scope_key(step)=key and step->>'actionId'=a.id::text and (a.node_id is not null or (step->>'sourceNodeId'=e.source_node_id and step->>'targetNodeId'=e.target_node_id))) then raise exception 'Action not selected in formal route' using errcode='23514';end if;
  if repeated then raise exception 'Completed Step requires explicit Repeat' using errcode='PT409';end if;
  select step into frontier_step from jsonb_array_elements(v.snapshot->'executionSteps') steps(step) where route_step_scope_key(step)=key and not exists(select 1 from edge_action_runs done where done.user_id=p_user_id and done.course_id=p_course_id and done.status='completed' and capability_scope_key(done.edge_id,done.node_id)=key and done.action_id::text=step->>'actionId') order by (step->>'order')::int limit 1;
  if frontier_step is null or frontier_step->>'actionId'<>a.id::text then raise exception 'Same scope earlier Action required' using errcode='PT409';end if;
  if a.node_id is null and not(e.source_node_id=any(route_execution_reachable_nodes(p_user_id,p_course_id))) then raise exception 'Source execution reachability required' using errcode='23514';end if;
  if a.node_id is not null and exists(select 1 from user_knowledge_states where user_id=p_user_id and node_id=a.node_id and status in ('learned','practicing','mastered')) then raise exception 'Acquired Node is satisfied; no ordinary execution required' using errcode='PT409';end if;
 elsif a.node_id is not null then raise exception 'Node Action requires formal execution Step' using errcode='23514';end if;
 return v.id;
end $$;


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
   if step->>'scope'='node' then
    if not((step->>'nodeId')=any(reachable)) and is_capability_action_root(step->>'nodeId') and coalesce(v.snapshot->'selectedNodeIds' ? (step->>'nodeId'),false)
      and not exists(select 1 from jsonb_array_elements(v.snapshot->'executionSteps') selected where route_step_scope_key(selected)=route_step_scope_key(step) and not exists(select 1 from edge_action_runs done where done.user_id=p_user_id and done.course_id=p_course_id and done.status='completed' and done.node_id=step->>'nodeId' and done.edge_id is null and done.action_id::text=selected->>'actionId')) then
      reachable:=array_append(reachable,step->>'nodeId');changed:=true;
    end if;
    continue;
   end if;
   -- New in-scope hard facts cannot be bypassed by a stale selected group.
   if exists(select 1 from knowledge_edges hard where hard.target_node_id=step->>'targetNodeId' and hard.relation='prerequisite' and hard.prerequisite_strength='hard' and hard.lifecycle_status='active'
     and (coalesce(v.snapshot->'selectedNodeIds' ? hard.source_node_id,false) or exists(select 1 from jsonb_array_elements(v.snapshot->'executionSteps') member where hard.source_node_id in(member->>'sourceNodeId',member->>'targetNodeId',member->>'nodeId')))
     and not exists(select 1 from jsonb_array_elements(v.snapshot->'executionSteps') selected where selected->>'edgeId'=hard.id)) then continue;end if;
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
    if exists(select 1 from jsonb_array_elements(p_snapshot->'executionSteps') step where
       coalesce(step->>'scope','edge') not in ('node','edge')
       or (step->>'scope'='node' and (step->>'edgeId' is not null or step->>'sourceNodeId' is not null or step->>'targetNodeId' is not null or not is_capability_action_root(step->>'nodeId') or not coalesce(p_snapshot->'selectedNodeIds' ? (step->>'nodeId'),false)))
       or (coalesce(step->>'scope','edge')='edge' and (step->>'nodeId' is not null or not exists(select 1 from knowledge_edges fact where fact.id=step->>'edgeId' and fact.lifecycle_status='active' and fact.relation in ('prerequisite','enables') and fact.source_node_id=step->>'sourceNodeId' and fact.target_node_id=step->>'targetNodeId')))
       or not exists(select 1 from knowledge_edge_actions a where a.id::text=step->>'actionId' and a.status='active' and capability_scope_key(a.edge_id,a.node_id)=route_step_scope_key(step))) then raise exception 'Invalid real Action scope' using errcode='23514';end if;
    if exists(select 1 from jsonb_array_elements(p_snapshot->'executionSteps') with ordinality as steps(step,position) where (step->>'order')::int<>position-1)
      or exists(select 1 from jsonb_array_elements(p_snapshot->'executionSteps') step group by route_step_scope_key(step),step->>'actionId' having count(*)>1)
      or exists(select 1 from jsonb_array_elements(p_snapshot->'executionSteps') with ordinality as steps(step,position) group by route_step_scope_key(step) having max(position)-min(position)+1<>count(*)) then raise exception 'Invalid ordered Action groups' using errcode='23514';end if;
    if exists(select 1 from edge_action_runs running where running.user_id=p_user_id and running.course_id=p_course_id and running.status in ('selected','in_progress') and (
      not exists(select 1 from jsonb_array_elements(p_snapshot->'executionSteps') step where route_step_scope_key(step)=capability_scope_key(running.edge_id,running.node_id) and step->>'actionId'=running.action_id::text and exists(select 1 from knowledge_edge_actions action left join knowledge_edges fact on fact.id=action.edge_id where action.id=running.action_id and action.status='active' and ((running.node_id is not null and action.node_id=running.node_id and is_capability_action_root(running.node_id)) or (running.node_id is null and fact.lifecycle_status='active' and fact.relation in ('prerequisite','enables') and fact.source_node_id=step->>'sourceNodeId' and fact.target_node_id=step->>'targetNodeId'))))
      or (not exists(select 1 from edge_action_runs done where done.user_id=p_user_id and done.course_id=p_course_id and capability_scope_key(done.edge_id,done.node_id)=capability_scope_key(running.edge_id,running.node_id) and done.action_id=running.action_id and done.status='completed')
        and running.action_id::text is distinct from (select step->>'actionId' from jsonb_array_elements(p_snapshot->'executionSteps') with ordinality as steps(step,position) where route_step_scope_key(step)=capability_scope_key(running.edge_id,running.node_id) and not exists(select 1 from edge_action_runs done where done.user_id=p_user_id and done.course_id=p_course_id and done.status='completed' and capability_scope_key(done.edge_id,done.node_id)=route_step_scope_key(step) and done.action_id::text=step->>'actionId') order by position limit 1)))) then
      raise exception 'Active Action conflicts with Route adjustment' using errcode='PT409';
    end if;
  end if;
  select version_number into previous_number from personal_course_route_versions where id=r.active_version_id;
  insert into personal_course_route_versions(route_id,user_id,course_id,version_number,parent_version_id,source,include_node_ids,exclude_node_ids,snapshot,structure_fingerprint,restored_from_version_id)
  values(r.id,p_user_id,p_course_id,coalesce(previous_number,0)+1,r.active_version_id,p_source,p_include_node_ids,p_exclude_node_ids,p_snapshot,p_structure_fingerprint,p_restored_from_version_id) returning * into v;
  update personal_course_routes set active_version_id=v.id where id=r.id;
  return to_jsonb(v);
end $$;

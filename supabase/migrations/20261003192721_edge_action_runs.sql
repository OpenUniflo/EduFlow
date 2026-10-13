create table public.edge_action_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  course_id text not null references public.courses(id) on delete restrict,
  action_id uuid not null references public.knowledge_edge_actions(id) on delete restrict,
  edge_id text not null references public.knowledge_edges(id) on delete restrict,
  binding_id uuid references public.course_action_bindings(id) on delete restrict,
  status text not null check(status in ('selected','in_progress','completed','cancelled')),
  selection_key uuid not null,
  -- Immutable execution context, not a second authoritative action definition.
  execution_snapshot jsonb not null,
  micro_path_id text references public.micro_learning_paths(id) on delete restrict,
  evidence_source_id uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(user_id,selection_key),
  foreign key(evidence_source_id,user_id) references public.user_evidence_sources(id,user_id) on delete restrict,
  check(status<>'completed' or (completed_at is not null and (evidence_source_id is not null or micro_path_id is not null)))
);
create unique index edge_action_runs_active_choice on public.edge_action_runs(user_id,course_id,edge_id) where status in ('selected','in_progress');
create unique index edge_action_runs_result on public.edge_action_runs(evidence_source_id) where evidence_source_id is not null;
create index edge_action_runs_course on public.edge_action_runs(course_id);
create index edge_action_runs_action on public.edge_action_runs(action_id);
create index edge_action_runs_edge on public.edge_action_runs(edge_id);
create index edge_action_runs_binding on public.edge_action_runs(binding_id);
create index edge_action_runs_micro on public.edge_action_runs(micro_path_id);
alter table public.edge_action_runs enable row level security;
revoke all on public.edge_action_runs from anon, authenticated;
grant select on public.edge_action_runs to authenticated;
grant all on public.edge_action_runs to service_role;
create policy action_runs_owner_read on public.edge_action_runs for select to authenticated using(user_id=(select auth.uid()));

-- Authenticated API supplies user identity; only service_role may invoke these transitions.
-- These functions never write KnowledgeEvidence, UserKnowledgeState or route versions.
create function public.select_edge_action(p_user_id uuid,p_course_id text,p_action_id uuid,p_selection_key uuid,p_action_version timestamptz,p_binding_version timestamptz,p_micro_path_id text default null)
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
  if exists(select 1 from unnest(a.required_capability_ids) required(node_id) where not exists(select 1 from user_knowledge_states s join knowledge_nodes n on n.id=s.node_id where s.user_id=p_user_id and s.node_id=required.node_id and s.status in ('learned','practicing','mastered') and n.status='active' and n.scope='global')) then raise exception 'Execution capability missing' using errcode='23514'; end if;
  if exists(select 1 from unnest(a.resource_requirements) required(resource_key) where not exists(select 1 from jsonb_array_elements(coalesce(b.resources,'[]')) resource where resource->>'key'=required.resource_key and resource->>'available'='true' and length(trim(resource->>'reference'))>0)) then raise exception 'Execution resource missing' using errcode='23514'; end if;
  if a.type='micro_learning' then
    if not exists(select 1 from micro_learning_paths p where p.id=p_micro_path_id and p.knowledge_id=e.target_node_id and p.status='published' and p.mode='learn' and (p.course_id is null or p.course_id=p_course_id)) then raise exception 'Micro unavailable' using errcode='23514'; end if;
  elsif p_micro_path_id is not null then raise exception 'Practice cannot use Micro' using errcode='23514'; end if;
  select * into r from edge_action_runs where user_id=p_user_id and course_id=p_course_id and edge_id=a.edge_id and status in ('selected','in_progress') for update;
  if found and r.action_id=a.id and r.execution_snapshot->'action'->>'updated_at'=to_jsonb(a)->>'updated_at' and r.binding_id is not distinct from b.id and (b.id is null or r.execution_snapshot->'binding'->>'updated_at'=to_jsonb(b)->>'updated_at') and r.micro_path_id is not distinct from p_micro_path_id then return r; end if;
  update edge_action_runs set status='cancelled',updated_at=now() where user_id=p_user_id and course_id=p_course_id and edge_id=a.edge_id and status in ('selected','in_progress');
  insert into edge_action_runs(user_id,course_id,action_id,edge_id,binding_id,status,selection_key,execution_snapshot,micro_path_id)
    values(p_user_id,p_course_id,a.id,a.edge_id,b.id,'selected',p_selection_key,jsonb_build_object('action',to_jsonb(a),'binding',case when b.id is null then 'null'::jsonb else to_jsonb(b) end,'sourceId',e.source_node_id,'targetId',e.target_node_id),p_micro_path_id) returning * into r;
  return r;
end $$;

create function public.transition_edge_action_run(p_user_id uuid,p_run_id uuid,p_operation text,p_source_id uuid default null)
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
    if exists(select 1 from jsonb_array_elements_text(r.execution_snapshot->'action'->'required_capability_ids') required(node_id) where not exists(select 1 from user_knowledge_states k join knowledge_nodes n on n.id=k.node_id where k.user_id=p_user_id and k.node_id=required.node_id and k.status in ('learned','practicing','mastered') and n.scope='global' and n.status='active')) then raise exception 'Required capability changed' using errcode='23514'; end if;
    update edge_action_runs set status='in_progress',started_at=now(),updated_at=now() where id=r.id returning * into r;
  elsif p_operation='submit' then
    if r.status='completed' and r.evidence_source_id=p_source_id then return r; end if;
    if r.status<>'in_progress' or r.execution_snapshot->'action'->>'type'<>'practice_task' then raise exception 'Practice is not running' using errcode='23514'; end if;
    select * into s from user_evidence_sources where id=p_source_id and user_id=p_user_id for update;
    if not found or s.parse_status<>'ready' or s.archived_at is not null or s.source_sha256 is null or s.created_at<r.started_at then raise exception 'Result source unavailable' using errcode='23514'; end if;
    update edge_action_runs set status='completed',evidence_source_id=s.id,completed_at=now(),updated_at=now() where id=r.id returning * into r;
    update user_evidence_sources set provenance=provenance||jsonb_build_object('kind','action-result','actionRunId',r.id,'actionId',r.action_id,'courseId',r.course_id) where id=s.id;
  elsif p_operation='sync-micro' then
    if r.status='completed' then return r; end if;
    if r.status<>'in_progress' or r.micro_path_id is null then raise exception 'Micro is not running' using errcode='23514'; end if;
    if exists(select 1 from user_micro_path_progress where user_id=p_user_id and path_id=r.micro_path_id and status='completed') then
      update edge_action_runs set status='completed',completed_at=now(),updated_at=now() where id=r.id returning * into r;
    end if;
  else raise exception 'Unknown run operation' using errcode='23514'; end if;
  return r;
end $$;
revoke all on function public.select_edge_action(uuid,text,uuid,uuid,timestamptz,timestamptz,text) from public,anon,authenticated;
revoke all on function public.transition_edge_action_run(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.select_edge_action(uuid,text,uuid,uuid,timestamptz,timestamptz,text) to service_role;
grant execute on function public.transition_edge_action_run(uuid,uuid,text,uuid) to service_role;

-- Observe the existing Micro authority; do not replace its assessment or mastery policy.
create function public.complete_matching_micro_action_runs() returns trigger language plpgsql set search_path=public as $$
begin
  update edge_action_runs set status='completed',completed_at=coalesce(new.completed_at,now()),updated_at=now()
  where user_id=new.user_id and micro_path_id=new.path_id and status='in_progress';
  return new;
end $$;
revoke all on function public.complete_matching_micro_action_runs() from public,anon,authenticated;
create trigger micro_completion_action_observer after insert or update of status on public.user_micro_path_progress
  for each row when (new.status='completed') execute function public.complete_matching_micro_action_runs();

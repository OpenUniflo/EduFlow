-- Global action templates reference existing facts. No graph/state duplication.
create table public.knowledge_edge_actions (
  id uuid primary key default gen_random_uuid(),
  edge_id text not null references public.knowledge_edges(id) on delete restrict,
  type text not null check (type in ('micro_learning','practice_task')),
  title text not null check (length(trim(title)) between 1 and 240),
  description text not null,
  estimated_minutes integer not null check (estimated_minutes between 1 and 10080),
  difficulty integer not null check (difficulty between 1 and 5),
  resource_requirements text[] not null default '{}',
  required_capability_ids text[] not null default '{}',
  expected_evidence text not null,
  status text not null default 'active' check (status in ('active','archived')),
  provenance jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index knowledge_edge_actions_edge_idx on public.knowledge_edge_actions(edge_id);
create table public.course_action_bindings (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses(id) on delete restrict,
  action_id uuid not null references public.knowledge_edge_actions(id) on delete restrict,
  context text not null default '',
  contact text not null default '',
  instructions text not null default '',
  resources jsonb not null default '[]' check (jsonb_typeof(resources)='array'),
  available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(course_id,action_id)
);
create index course_action_bindings_action_idx on public.course_action_bindings(action_id);
alter table public.knowledge_edge_actions enable row level security;
alter table public.course_action_bindings enable row level security;
revoke all on public.knowledge_edge_actions, public.course_action_bindings from anon, authenticated;
grant select on public.knowledge_edge_actions, public.course_action_bindings to authenticated;
grant all on public.knowledge_edge_actions, public.course_action_bindings to service_role;
create policy edge_actions_read on public.knowledge_edge_actions for select to authenticated using (
  exists(select 1 from public.knowledge_edges e
    join public.knowledge_nodes s on s.id=e.source_node_id
    join public.knowledge_nodes t on t.id=e.target_node_id
    where e.id=edge_id and e.lifecycle_status='active' and s.scope='global' and t.scope='global' and s.status='active' and t.status='active')
);
create policy course_action_bindings_read on public.course_action_bindings for select to authenticated
  using (public.can_read_course(course_id));
-- Writes only through the authenticated API, with administrator/template and teacher/binding authority.
-- The trigger also prevents service-side bugs from attaching templates to non-global/inactive facts.
create function public.validate_edge_action() returns trigger language plpgsql set search_path=public as $$
begin
  if TG_OP='UPDATE' then
    if new.edge_id<>old.edge_id or new.type<>old.type then
      raise exception 'Action edge and execution type are immutable' using errcode='23514';
    end if;
    -- Retire stale templates without requiring their former execution context to stay active.
    if new.status='archived' then new.updated_at=now(); return new; end if;
  end if;
  if not exists(select 1 from knowledge_edges e join knowledge_nodes s on s.id=e.source_node_id join knowledge_nodes t on t.id=e.target_node_id
    where e.id=new.edge_id and e.lifecycle_status='active' and e.relation in ('prerequisite','enables')
      and s.scope='global' and t.scope='global' and s.status='active' and t.status='active') then
    raise exception 'Action requires an active global directed KnowledgeEdge' using errcode='23514';
  end if;
  if exists(select 1 from unnest(new.required_capability_ids) as required(node_id) where not exists(select 1 from knowledge_nodes n where n.id=required.node_id and n.scope='global' and n.status='active')) then
    raise exception 'Invalid execution capability' using errcode='23514';
  end if;
  new.updated_at=now();
  return new;
end $$;
revoke all on function public.validate_edge_action() from public,anon,authenticated;
create trigger validate_edge_action before insert or update on public.knowledge_edge_actions for each row execute function public.validate_edge_action();

create table public.domain_assignment_candidates (
  node_id text not null references public.knowledge_nodes(id) on delete cascade,
  domain_id text not null references public.knowledge_domains(id) on delete cascade,
  score numeric not null check (score between 0 and 1),
  semantic_score numeric not null check (semantic_score between 0 and 1),
  structural_score numeric not null check (structural_score between 0 and 1),
  algorithm_version text not null,
  generated_at timestamptz not null,
  primary key (node_id, domain_id)
);

create table public.domain_proposals (
  id text primary key,
  suggested_name text not null,
  suggested_description text,
  suggested_color text not null,
  suggested_node_ids jsonb not null check (jsonb_typeof(suggested_node_ids) = 'array'),
  confidence numeric not null check (confidence between 0 and 1),
  status text not null check (status in ('pending', 'accepted', 'rejected')),
  algorithm_version text not null,
  generated_at timestamptz not null
);

create table public.domain_governance_metadata (
  singleton boolean primary key default true check (singleton),
  revision integer not null default 1 check (revision >= 0),
  updated_at timestamptz not null default now()
);
insert into public.domain_governance_metadata (singleton, revision) values (true, 1);

alter table public.domain_assignment_candidates enable row level security;
alter table public.domain_proposals enable row level security;
alter table public.domain_governance_metadata enable row level security;

create policy domain_assignment_candidates_authenticated_read on public.domain_assignment_candidates for select to authenticated using (true);
create policy domain_proposals_authenticated_read on public.domain_proposals for select to authenticated using (true);
create policy domain_governance_metadata_authenticated_read on public.domain_governance_metadata for select to authenticated using (true);

grant select on public.domain_assignment_candidates, public.domain_proposals, public.domain_governance_metadata to authenticated;
grant all privileges on public.domain_assignment_candidates, public.domain_proposals, public.domain_governance_metadata to service_role;
revoke all on public.domain_assignment_candidates, public.domain_proposals, public.domain_governance_metadata from anon;

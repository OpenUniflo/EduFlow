create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'student' check (role in ('student')),
  capabilities text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.knowledge_nodes (
  id text primary key,
  title text not null,
  description text not null,
  node_type text not null check (node_type in ('conceptual', 'procedural', 'representational', 'language', 'meta')),
  mastery_criteria jsonb not null default '[]'::jsonb check (jsonb_typeof(mastery_criteria) = 'array'),
  scope text not null check (scope in ('global', 'tenant', 'user')),
  owner_id text,
  provenance jsonb not null default '[]'::jsonb check (jsonb_typeof(provenance) = 'array'),
  current_revision_id text not null,
  status text not null default 'active' check (status in ('active', 'deprecated', 'superseded')),
  superseded_by jsonb,
  split_from text,
  merged_from jsonb,
  tags jsonb,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'global' and owner_id is null) or (scope <> 'global' and owner_id is not null))
);

create table public.knowledge_node_revisions (
  id text primary key,
  node_id text not null references public.knowledge_nodes(id) on delete cascade,
  version integer not null check (version > 0),
  title text not null,
  description text not null,
  node_type text not null check (node_type in ('conceptual', 'procedural', 'representational', 'language', 'meta')),
  mastery_criteria jsonb not null default '[]'::jsonb check (jsonb_typeof(mastery_criteria) = 'array'),
  created_by text,
  created_at timestamptz not null default now(),
  previous_revision_id text references public.knowledge_node_revisions(id),
  change_reason text,
  unique (node_id, version)
);

alter table public.knowledge_nodes
  add constraint knowledge_nodes_current_revision_fk
  foreign key (current_revision_id) references public.knowledge_node_revisions(id)
  deferrable initially deferred;

create table public.knowledge_edges (
  id text primary key,
  source_node_id text not null references public.knowledge_nodes(id),
  target_node_id text not null references public.knowledge_nodes(id),
  relation text not null check (relation in ('prerequisite', 'enables', 'related')),
  reason text not null,
  prerequisite_strength text,
  associative_strength numeric,
  created_at timestamptz not null default now(),
  check (source_node_id <> target_node_id),
  check ((relation = 'prerequisite' and prerequisite_strength in ('hard', 'soft') and associative_strength is null)
    or (relation in ('enables', 'related') and prerequisite_strength is null and associative_strength between 0 and 1)),
  check (relation <> 'related' or source_node_id < target_node_id),
  unique (source_node_id, target_node_id, relation)
);
create index knowledge_edges_target_idx on public.knowledge_edges(target_node_id);

create table public.knowledge_domains (
  id text primary key,
  name text not null unique,
  description text,
  canonical_color text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_by text not null,
  updated_at timestamptz not null default now()
);

create table public.domain_assignments (
  node_id text primary key references public.knowledge_nodes(id) on delete cascade,
  domain_id text not null references public.knowledge_domains(id),
  source text not null check (source in ('auto', 'admin')),
  confidence numeric check (confidence between 0 and 1),
  pinned boolean not null default false,
  assigned_by text,
  assigned_at timestamptz not null default now(),
  check ((source = 'admin' and pinned) or source = 'auto')
);
create index domain_assignments_domain_idx on public.domain_assignments(domain_id);

create table public.workflow_templates (
  id text primary key,
  name text not null,
  description text not null,
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courses (
  id text primary key,
  title text not null,
  subtitle text,
  description text not null,
  accent_color text,
  revision text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.course_curricula (
  course_id text primary key references public.courses(id) on delete cascade,
  id text not null,
  generation_mode text not null check (generation_mode in ('auto', 'auto-fixed-count', 'follow-source', 'manual')),
  requested_chapter_count integer check (requested_chapter_count > 0),
  source_structure_id text,
  unique (course_id, id)
);

create table public.curriculum_chapters (
  course_id text not null references public.courses(id) on delete cascade,
  id text not null,
  title text not null,
  description text not null,
  display_order integer not null check (display_order >= 0),
  color text not null,
  outcome text not null,
  primary key (course_id, id),
  unique (course_id, display_order)
);

create table public.curriculum_lessons (
  course_id text not null references public.courses(id) on delete cascade,
  id text not null,
  chapter_id text not null,
  title text not null,
  display_order integer not null check (display_order >= 0),
  primary key (course_id, id),
  foreign key (course_id, chapter_id) references public.curriculum_chapters(course_id, id),
  unique (course_id, display_order)
);
create index curriculum_lessons_chapter_idx on public.curriculum_lessons(course_id, chapter_id);

create table public.curriculum_coverages (
  course_id text not null,
  id text not null,
  lesson_id text not null,
  node_id text not null references public.knowledge_nodes(id),
  role text not null check (role in ('introduce', 'reinforce', 'apply', 'assess')),
  display_order integer not null check (display_order >= 0),
  primary key (course_id, id),
  foreign key (course_id, lesson_id) references public.curriculum_lessons(course_id, id) on delete cascade,
  unique (course_id, lesson_id, display_order)
);
create index curriculum_coverages_node_idx on public.curriculum_coverages(node_id);

create table public.curriculum_sequences (
  course_id text not null,
  id text not null,
  source_lesson_id text not null,
  target_lesson_id text not null,
  primary key (course_id, id),
  foreign key (course_id, source_lesson_id) references public.curriculum_lessons(course_id, id) on delete cascade,
  foreign key (course_id, target_lesson_id) references public.curriculum_lessons(course_id, id) on delete cascade,
  check (source_lesson_id <> target_lesson_id),
  unique (course_id, source_lesson_id, target_lesson_id)
);

create table public.course_assignments (
  course_id text not null references public.courses(id) on delete cascade,
  id text not null,
  display_order integer not null check (display_order >= 0),
  title text not null,
  description text not null,
  requirements jsonb not null check (jsonb_typeof(requirements) = 'array'),
  expected_output text not null,
  acceptance_criteria jsonb not null check (jsonb_typeof(acceptance_criteria) = 'array'),
  mode text not null check (mode in ('instruction', 'workflow')),
  workflow_template_id text references public.workflow_templates(id),
  estimated_minutes integer check (estimated_minutes > 0),
  project_contribution text,
  primary key (course_id, id),
  unique (course_id, display_order),
  check ((mode = 'workflow' and workflow_template_id is not null) or mode = 'instruction')
);

create table public.assignment_coverages (
  course_id text not null,
  id text not null,
  assignment_id text not null,
  node_id text not null references public.knowledge_nodes(id),
  role text not null check (role in ('practice', 'apply', 'assess')),
  primary key (course_id, id),
  foreign key (course_id, assignment_id) references public.course_assignments(course_id, id) on delete cascade,
  unique (course_id, assignment_id, node_id)
);
create index assignment_coverages_node_idx on public.assignment_coverages(node_id);

create table public.materials (
  course_id text not null references public.courses(id) on delete cascade,
  id text not null,
  lesson_id text not null,
  display_order integer not null check (display_order >= 0),
  title text not null,
  description text,
  material_type text not null check (material_type in ('pdf', 'pptx', 'docx', 'document', 'article')),
  storage_path text,
  page_count integer check (page_count > 0),
  duration text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, id),
  foreign key (course_id, lesson_id) references public.curriculum_lessons(course_id, id),
  unique (course_id, lesson_id, display_order),
  unique (storage_path),
  check ((material_type = 'pdf' and storage_path is not null and page_count is not null) or material_type <> 'pdf')
);

create table public.material_segments (
  course_id text not null,
  material_id text not null,
  id text not null,
  display_order integer not null check (display_order >= 0),
  page integer check (page > 0),
  title text,
  section text,
  content jsonb,
  primary key (course_id, material_id, id),
  foreign key (course_id, material_id) references public.materials(course_id, id) on delete cascade,
  unique (course_id, material_id, display_order)
);
create unique index material_segments_pdf_page_unique
  on public.material_segments(course_id, material_id, page)
  where page is not null;

create table public.material_knowledge_coverages (
  course_id text not null,
  id text not null,
  material_id text not null,
  segment_id text not null,
  node_id text not null references public.knowledge_nodes(id),
  role text not null check (role in ('introduce', 'explain', 'example', 'practice-reference')),
  primary key (course_id, id),
  foreign key (course_id, material_id, segment_id) references public.material_segments(course_id, material_id, id) on delete cascade,
  unique (course_id, material_id, segment_id, node_id, role)
);
create index material_knowledge_coverages_node_idx on public.material_knowledge_coverages(node_id);

create table public.user_knowledge_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  node_id text not null references public.knowledge_nodes(id) on delete cascade,
  status text not null check (status in ('mastered', 'learning')),
  mastery numeric check (mastery between 0 and 100),
  mastery_origin text check (mastery_origin in ('direct', 'inherited-from-split', 'inherited-from-merge', 'inferred')),
  source_node_id text references public.knowledge_nodes(id),
  source_node_ids jsonb,
  evidence jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, node_id)
);

create table public.user_course_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null references public.courses(id) on delete cascade,
  recent_lesson_id text,
  updated_at timestamptz not null default now(),
  primary key (user_id, course_id),
  foreign key (course_id, recent_lesson_id) references public.curriculum_lessons(course_id, id)
);

create table public.user_assignment_states (
  user_id uuid not null,
  course_id text not null,
  assignment_id text not null,
  status text not null check (status in ('not-started', 'in-progress', 'completed')),
  progress integer check (progress between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, course_id, assignment_id),
  foreign key (user_id, course_id) references public.user_course_states(user_id, course_id) on delete cascade,
  foreign key (course_id, assignment_id) references public.course_assignments(course_id, id) on delete cascade
);

create table public.user_material_states (
  user_id uuid not null,
  course_id text not null,
  material_id text not null,
  recent_segment_id text,
  viewed_segment_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(viewed_segment_ids) = 'array'),
  completed_segment_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(completed_segment_ids) = 'array'),
  progress integer check (progress between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, course_id, material_id),
  foreign key (user_id, course_id) references public.user_course_states(user_id, course_id) on delete cascade,
  foreign key (course_id, material_id) references public.materials(course_id, id) on delete cascade,
  foreign key (course_id, material_id, recent_segment_id) references public.material_segments(course_id, material_id, id)
);

create table public.user_workflow_definitions (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  description text not null,
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, id)
);

create table public.user_workflow_state (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  active_template_id text,
  workflow_description text,
  schema_saved boolean not null default false,
  node_positions jsonb not null default '{}'::jsonb,
  state_values jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.workflow_runs (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  workflow_id text not null,
  workflow_template_id text not null,
  course_id text,
  assignment_id text,
  workflow_name text not null,
  created_at timestamptz not null,
  status text not null check (status in ('success')),
  node_count integer not null check (node_count >= 0),
  output_summary text not null,
  final_state jsonb not null check (jsonb_typeof(final_state) = 'object'),
  nodes jsonb not null check (jsonb_typeof(nodes) = 'array'),
  primary key (owner_user_id, id),
  foreign key (course_id, assignment_id) references public.course_assignments(course_id, id),
  check ((course_id is null and assignment_id is null) or (course_id is not null and assignment_id is not null))
);
create index workflow_runs_owner_created_idx on public.workflow_runs(owner_user_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-materials',
  'course-materials',
  false,
  52428800,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.profiles enable row level security;
alter table public.knowledge_nodes enable row level security;
alter table public.knowledge_node_revisions enable row level security;
alter table public.knowledge_edges enable row level security;
alter table public.knowledge_domains enable row level security;
alter table public.domain_assignments enable row level security;
alter table public.workflow_templates enable row level security;
alter table public.courses enable row level security;
alter table public.course_curricula enable row level security;
alter table public.curriculum_chapters enable row level security;
alter table public.curriculum_lessons enable row level security;
alter table public.curriculum_coverages enable row level security;
alter table public.curriculum_sequences enable row level security;
alter table public.course_assignments enable row level security;
alter table public.assignment_coverages enable row level security;
alter table public.materials enable row level security;
alter table public.material_segments enable row level security;
alter table public.material_knowledge_coverages enable row level security;
alter table public.user_knowledge_states enable row level security;
alter table public.user_course_states enable row level security;
alter table public.user_assignment_states enable row level security;
alter table public.user_material_states enable row level security;
alter table public.user_workflow_definitions enable row level security;
alter table public.user_workflow_state enable row level security;
alter table public.workflow_runs enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);

create policy knowledge_nodes_read_visible on public.knowledge_nodes for select to authenticated
  using (scope = 'global' or (scope = 'user' and owner_id = (select auth.uid())::text));
create policy knowledge_node_revisions_read_visible on public.knowledge_node_revisions for select to authenticated
  using (exists (select 1 from public.knowledge_nodes n where n.id = node_id));
create policy knowledge_edges_read_visible on public.knowledge_edges for select to authenticated
  using (exists (select 1 from public.knowledge_nodes s where s.id = source_node_id)
    and exists (select 1 from public.knowledge_nodes t where t.id = target_node_id));

create policy knowledge_domains_authenticated_read on public.knowledge_domains for select to authenticated using (true);
create policy domain_assignments_authenticated_read on public.domain_assignments for select to authenticated
  using (exists (select 1 from public.knowledge_nodes n where n.id = node_id));
create policy workflow_templates_authenticated_read on public.workflow_templates for select to authenticated using (true);
create policy courses_authenticated_read on public.courses for select to authenticated using (true);
create policy course_curricula_authenticated_read on public.course_curricula for select to authenticated using (true);
create policy curriculum_chapters_authenticated_read on public.curriculum_chapters for select to authenticated using (true);
create policy curriculum_lessons_authenticated_read on public.curriculum_lessons for select to authenticated using (true);
create policy curriculum_coverages_authenticated_read on public.curriculum_coverages for select to authenticated using (true);
create policy curriculum_sequences_authenticated_read on public.curriculum_sequences for select to authenticated using (true);
create policy course_assignments_authenticated_read on public.course_assignments for select to authenticated using (true);
create policy assignment_coverages_authenticated_read on public.assignment_coverages for select to authenticated using (true);
create policy materials_authenticated_read on public.materials for select to authenticated using (true);
create policy material_segments_authenticated_read on public.material_segments for select to authenticated using (true);
create policy material_knowledge_coverages_authenticated_read on public.material_knowledge_coverages for select to authenticated using (true);

create policy user_knowledge_states_own_all on public.user_knowledge_states for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_course_states_own_all on public.user_course_states for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_assignment_states_own_all on public.user_assignment_states for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_material_states_own_all on public.user_material_states for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_workflow_definitions_own_all on public.user_workflow_definitions for all to authenticated
  using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create policy user_workflow_state_own_all on public.user_workflow_state for all to authenticated
  using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create policy workflow_runs_own_all on public.workflow_runs for all to authenticated
  using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);

create policy course_materials_authenticated_read on storage.objects for select to authenticated
  using (bucket_id = 'course-materials' and ((storage.foldername(name))[1] = 'shared' or (storage.foldername(name))[1] = (select auth.uid())::text));
create policy course_materials_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'course-materials' and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and 'global-domain-admin' = any(p.capabilities)));
create policy course_materials_own_update on storage.objects for update to authenticated
  using (bucket_id = 'course-materials' and owner_id = (select auth.uid())::text)
  with check (bucket_id = 'course-materials' and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and 'global-domain-admin' = any(p.capabilities)));
create policy course_materials_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'course-materials' and owner_id = (select auth.uid())::text);

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select on public.knowledge_nodes, public.knowledge_node_revisions, public.knowledge_edges,
  public.knowledge_domains, public.domain_assignments, public.workflow_templates, public.courses,
  public.course_curricula, public.curriculum_chapters, public.curriculum_lessons,
  public.curriculum_coverages, public.curriculum_sequences, public.course_assignments,
  public.assignment_coverages, public.materials, public.material_segments,
  public.material_knowledge_coverages to authenticated;
grant select, insert, update, delete on public.user_knowledge_states, public.user_course_states,
  public.user_assignment_states, public.user_material_states, public.user_workflow_definitions,
  public.user_workflow_state, public.workflow_runs to authenticated;

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;

revoke all on all tables in schema public from anon;

-- Non-AI learning foundation.  Product state is user-owned and never inferred
-- from browser storage or fixture identity.

alter table public.user_knowledge_states
  drop constraint if exists user_knowledge_states_status_check;
alter table public.user_knowledge_states
  add constraint user_knowledge_states_status_check
  check (status in ('explore', 'learning', 'learned', 'practicing', 'mastered'));

alter table public.user_assignment_states
  drop constraint if exists user_assignment_states_status_check;
update public.user_assignment_states set status = 'not_started' where status = 'not-started';
update public.user_assignment_states set status = 'started' where status = 'in-progress';
-- Historical prototype completion did not carry an acceptance decision.
update public.user_assignment_states set status = 'submitted' where status = 'completed';
alter table public.user_assignment_states
  add constraint user_assignment_states_status_check
  check (status in ('not_started', 'started', 'submitted', 'accepted', 'needs_revision'));
alter table public.user_assignment_states
  add column if not exists started_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists accepted_at timestamptz;

alter table public.assignment_coverages
  add column if not exists required boolean not null default false;
-- Existing data only expressed assessment intent through role.  Preserve that
-- explicit signal; ordinary practice remains optional until authored as required.
update public.assignment_coverages set required = true where role = 'assess';

alter table public.courses
  add column if not exists lifecycle text not null default 'published'
    check (lifecycle in ('draft', 'published', 'archived')),
  add column if not exists author_user_id uuid references auth.users(id) on delete set null;
create index courses_lifecycle_idx on public.courses(lifecycle);
create policy courses_teacher_update on public.courses for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('teacher', 'admin')))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('teacher', 'admin')));

create table public.micro_learning_paths (
  id text primary key,
  knowledge_id text not null references public.knowledge_nodes(id) on delete cascade,
  course_id text references public.courses(id) on delete cascade,
  scope text not null check (scope in ('global', 'course')),
  title text not null check (length(btrim(title)) > 0),
  description text,
  mode text not null check (mode in ('learn', 'review', 'apply', 'transfer')),
  estimated_minutes integer not null check (estimated_minutes > 0),
  required boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'global' and course_id is null) or (scope = 'course' and course_id is not null))
);
create index micro_learning_paths_knowledge_idx on public.micro_learning_paths(knowledge_id, mode, status);
create index micro_learning_paths_course_idx on public.micro_learning_paths(course_id, mode, status) where course_id is not null;

create table public.micro_units (
  id text primary key,
  path_id text not null references public.micro_learning_paths(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  description text,
  position integer not null check (position >= 0),
  estimated_minutes integer not null check (estimated_minutes > 0),
  required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (path_id, position)
);

create table public.micro_steps (
  id text primary key,
  unit_id text not null references public.micro_units(id) on delete cascade,
  position integer not null check (position >= 0),
  kind text not null check (kind in ('challenge', 'feedback', 'explanation', 'interaction', 'application', 'check', 'summary')),
  title text not null check (length(btrim(title)) > 0),
  content text not null,
  interaction jsonb,
  success_feedback text,
  retry_feedback text,
  transition jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, position),
  check (interaction is null or jsonb_typeof(interaction) = 'object'),
  check (transition is null or jsonb_typeof(transition) = 'object')
);

create table public.user_micro_path_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  path_id text not null references public.micro_learning_paths(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  current_unit_id text references public.micro_units(id) on delete set null,
  current_step_id text references public.micro_steps(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, path_id),
  check ((status = 'completed' and completed_at is not null) or status <> 'completed')
);

create table public.user_micro_unit_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  unit_id text not null references public.micro_units(id) on delete cascade,
  path_id text not null references public.micro_learning_paths(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  current_step_id text references public.micro_steps(id) on delete set null,
  completed_step_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(completed_step_ids) = 'array'),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, unit_id),
  foreign key (path_id) references public.micro_learning_paths(id) on delete cascade,
  check ((status = 'completed' and completed_at is not null) or status <> 'completed')
);
create index user_micro_path_progress_user_idx on public.user_micro_path_progress(user_id, updated_at desc);

create table public.knowledge_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  node_id text not null references public.knowledge_nodes(id) on delete cascade,
  event_type text not null check (event_type in ('micro_path_completed', 'assignment_accepted', 'workflow_passed')),
  source_entity_id text not null,
  outcome text not null check (outcome in ('completed', 'accepted', 'passed')),
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  occurred_at timestamptz not null default now(),
  unique (user_id, node_id, event_type, source_entity_id)
);
create index knowledge_evidence_user_node_idx on public.knowledge_evidence(user_id, node_id, occurred_at desc);

alter table public.micro_learning_paths enable row level security;
alter table public.micro_units enable row level security;
alter table public.micro_steps enable row level security;
alter table public.user_micro_path_progress enable row level security;
alter table public.user_micro_unit_progress enable row level security;
alter table public.knowledge_evidence enable row level security;

create policy micro_learning_paths_authenticated_read on public.micro_learning_paths for select to authenticated using (status = 'published');
create policy micro_units_authenticated_read on public.micro_units for select to authenticated using (exists (select 1 from public.micro_learning_paths p where p.id = path_id and p.status = 'published'));
create policy micro_steps_authenticated_read on public.micro_steps for select to authenticated using (exists (select 1 from public.micro_units u join public.micro_learning_paths p on p.id = u.path_id where u.id = unit_id and p.status = 'published'));
create policy user_micro_path_progress_own_all on public.user_micro_path_progress for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_micro_unit_progress_own_all on public.user_micro_unit_progress for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy knowledge_evidence_own_read on public.knowledge_evidence for select to authenticated using ((select auth.uid()) = user_id);
create policy knowledge_evidence_own_insert on public.knowledge_evidence for insert to authenticated with check ((select auth.uid()) = user_id);

grant select on public.micro_learning_paths, public.micro_units, public.micro_steps to authenticated;
grant all on public.user_micro_path_progress, public.user_micro_unit_progress to authenticated;
grant select, insert on public.knowledge_evidence to authenticated;

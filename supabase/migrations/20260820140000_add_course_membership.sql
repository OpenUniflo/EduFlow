alter table public.user_course_states
  add column if not exists is_active boolean;

-- A persisted row predating explicit membership represents real Course-scoped
-- progress/activity. Client-only placeholders never reach this table.
update public.user_course_states
set is_active = true
where is_active is null;

alter table public.user_course_states
  alter column is_active set default true,
  alter column is_active set not null;

create index if not exists user_course_states_active_updated_idx
  on public.user_course_states(user_id, updated_at desc)
  where is_active;

create unique index if not exists micro_learning_paths_one_required_learn_per_context_idx
  on public.micro_learning_paths(knowledge_id, coalesce(course_id, ''))
  where status = 'published' and required and mode = 'learn';

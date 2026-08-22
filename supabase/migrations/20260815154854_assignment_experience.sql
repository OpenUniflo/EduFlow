alter table public.course_assignments
  add column experience jsonb,
  add column inherited_outputs jsonb not null default '[]'::jsonb check (jsonb_typeof(inherited_outputs) = 'array'),
  add column dependency_rationale text;

alter table public.course_assignments
  add constraint course_assignments_experience_type_check
  check (experience is null or experience->>'type' in ('answer', 'code', 'trace', 'workflow'));

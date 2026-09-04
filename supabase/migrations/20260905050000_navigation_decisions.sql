create table public.navigation_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null references public.courses(id) on delete cascade,
  policy_version text not null,
  input_hash text not null check (length(input_hash) = 64),
  path jsonb not null check (jsonb_typeof(path) = 'array'),
  next_action jsonb not null check (jsonb_typeof(next_action) = 'object'),
  reason_code text not null,
  decided_at timestamptz not null default now(),
  unique (user_id,course_id,policy_version,input_hash)
);

create index navigation_decisions_user_course_idx on public.navigation_decisions(user_id,course_id,decided_at desc);
alter table public.navigation_decisions enable row level security;
create policy navigation_decisions_own_read on public.navigation_decisions for select to authenticated using (user_id = (select auth.uid()));
grant select on public.navigation_decisions to authenticated;

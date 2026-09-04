create table public.assistant_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (title is null or length(btrim(title)) between 1 and 120)
);
create index assistant_sessions_user_updated_idx on public.assistant_sessions(user_id, updated_at desc);

create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assistant_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(btrim(content)) between 1 and 20000),
  context_snapshot jsonb not null check (jsonb_typeof(context_snapshot) = 'object'),
  created_at timestamptz not null default now()
);
create index assistant_messages_session_created_idx on public.assistant_messages(session_id, created_at, id);

alter table public.assistant_sessions enable row level security;
alter table public.assistant_messages enable row level security;

create policy assistant_sessions_own_all on public.assistant_sessions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy assistant_messages_own_all on public.assistant_messages for all to authenticated
  using (exists (select 1 from public.assistant_sessions session where session.id = session_id and session.user_id = (select auth.uid())))
  with check (exists (select 1 from public.assistant_sessions session where session.id = session_id and session.user_id = (select auth.uid())));

grant select, insert, update, delete on public.assistant_sessions, public.assistant_messages to authenticated;
grant all privileges on public.assistant_sessions, public.assistant_messages to service_role;

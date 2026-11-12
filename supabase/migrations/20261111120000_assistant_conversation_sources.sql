-- Conversation source: Home keeps the mainline; contextual Assistant surfaces
-- and the Archive panel open or resume their own conversation. The value is a
-- partition, not authority; the API validates its shape again.
alter table public.assistant_sessions
  add column if not exists source text not null default 'home'
  check (length(source) between 1 and 160);

update public.assistant_sessions
set source = 'workspace'
where source = 'home' and title like 'workspace:%';

create index if not exists assistant_sessions_user_source_updated_idx
  on public.assistant_sessions(user_id, source, updated_at desc);

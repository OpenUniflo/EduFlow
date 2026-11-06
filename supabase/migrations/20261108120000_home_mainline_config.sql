-- Stage 4: data-driven Home mainline entry points.
--
-- Structure only. This migration intentionally inserts no Course identifier,
-- prompt or label: Home content is product data and is written per environment
-- through the admin/content import boundary.
--
-- `home_mainline_config` is a singleton row. `starter_course_id` names the one
-- Course the "start from the simplest" entry uses. When it is null, Home shows
-- neither the starter entry nor the configured examples; the conversation and
-- composer keep working.
--
-- `home_mainline_examples` owns the fresh-Home prompt buttons. `kind=start`
-- invokes the starter route instead of sending a model request.

create table if not exists public.home_mainline_config (
  id text primary key default 'default',
  starter_course_id text references public.courses(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_mainline_config_singleton check (id = 'default')
);

create table if not exists public.home_mainline_examples (
  id text primary key,
  display_order integer not null unique,
  kind text not null,
  label text not null,
  prompt text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_mainline_examples_kind check (kind in ('product', 'knowledge', 'start')),
  constraint home_mainline_examples_label check (length(btrim(label)) > 0),
  constraint home_mainline_examples_prompt check (length(btrim(prompt)) > 0),
  constraint home_mainline_examples_order check (display_order >= 0)
);

alter table public.home_mainline_config enable row level security;
alter table public.home_mainline_examples enable row level security;

drop policy if exists home_mainline_config_public_read on public.home_mainline_config;
create policy home_mainline_config_public_read
  on public.home_mainline_config for select
  to anon, authenticated
  using (true);

drop policy if exists home_mainline_examples_public_read on public.home_mainline_examples;
create policy home_mainline_examples_public_read
  on public.home_mainline_examples for select
  to anon, authenticated
  using (enabled);

grant select on public.home_mainline_config to anon, authenticated;
grant select on public.home_mainline_examples to anon, authenticated;
revoke insert, update, delete on public.home_mainline_config from anon, authenticated;
revoke insert, update, delete on public.home_mainline_examples from anon, authenticated;

comment on table public.home_mainline_config is
  'Stage 4 Home singleton: starter Course identity only; no product content in the repository.';
comment on table public.home_mainline_examples is
  'Stage 4 Home fresh-state example prompts. Written per environment; not a repository seed.';

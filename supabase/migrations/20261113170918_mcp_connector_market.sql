-- P1 MCP connector marketplace. Catalog rows are populated from the official MCP
-- Registry (or an administrator supplement); no product content or market seeds live
-- in the repository. Every table is service-role only: browser access flows through
-- the authenticated /api/workflows boundary, never through PostgREST directly.
create table public.mcp_market_servers (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('registry','admin')),
  source_id text not null check (char_length(source_id) between 1 and 220),
  name text not null check (char_length(name) between 1 and 220),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  version text not null default '' check (char_length(version) <= 255),
  url text not null check (char_length(url) between 1 and 2048),
  transport text not null default 'streamable-http' check (transport in ('streamable-http','sse')),
  auth_hint text not null default 'unknown' check (auth_hint in ('none','oauth','api-key','bearer','unknown')),
  header_hints jsonb not null default '[]'::jsonb check (jsonb_typeof(header_hints)='array'),
  category text not null default 'other' check (char_length(category) between 1 and 40),
  icon_url text check (icon_url is null or char_length(icon_url) <= 2048),
  website_url text check (website_url is null or char_length(website_url) <= 2048),
  repository_url text check (repository_url is null or char_length(repository_url) <= 2048),
  featured boolean not null default false,
  registry_status text check (registry_status is null or char_length(registry_status) <= 40),
  published_at timestamptz,
  updated_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (source, source_id)
);
create index mcp_market_servers_category_idx on public.mcp_market_servers (category, title);
create index mcp_market_servers_search_idx on public.mcp_market_servers (source, updated_at desc);

create table public.mcp_market_sync (
  id integer primary key check (id=1),
  status text not null default 'idle' check (status in ('idle','running','ok','error')),
  cursor text,
  full_sync_completed boolean not null default false,
  page_count integer not null default 0 check (page_count>=0),
  server_count integer not null default 0 check (server_count>=0),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  updated_at timestamptz not null default now()
);
insert into public.mcp_market_sync(id) values (1) on conflict (id) do nothing;

-- One short-lived OAuth authorization-code flow. The verifier/client secret never
-- reaches the browser; only the opaque state is carried through the redirect.
create table public.mcp_oauth_flows (
  flow_id uuid primary key,
  state_hash text not null unique check (char_length(state_hash)=64),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  environment_ref text not null check (char_length(environment_ref) between 1 and 160),
  connection_ref text not null check (char_length(connection_ref) between 1 and 80),
  connection_version integer not null check (connection_version>0),
  payload jsonb not null,
  code_verifier text not null check (char_length(code_verifier) between 43 and 128),
  client_id text not null check (char_length(client_id) between 1 and 500),
  client_secret text check (client_secret is null or char_length(client_secret) <= 4000),
  token_endpoint text not null check (char_length(token_endpoint) <= 2048),
  authorization_endpoint text not null check (char_length(authorization_endpoint) <= 2048),
  resource text check (resource is null or char_length(resource) <= 2048),
  redirect_uri text not null check (char_length(redirect_uri) <= 2048),
  return_to text not null default '/',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index mcp_oauth_flows_expiry_idx on public.mcp_oauth_flows (expires_at);

alter table public.mcp_market_servers enable row level security;
alter table public.mcp_market_sync enable row level security;
alter table public.mcp_oauth_flows enable row level security;
revoke all on public.mcp_market_servers, public.mcp_market_sync, public.mcp_oauth_flows from public, anon, authenticated;
grant all on public.mcp_market_servers, public.mcp_market_sync, public.mcp_oauth_flows to service_role;

-- Refreshed OAuth bundles are written back to the vault secret referenced by an
-- active MCP connection. The worker is the only role allowed to mutate it.
create function workflow_private.mcp_oauth_secret_update(p_ref text,p_secret text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_ref is null or p_ref !~ '^vault:[0-9a-f-]{36}$' then raise exception 'INVALID_SECRET_REFERENCE'; end if;
  if p_secret is null or length(p_secret)>16000 then raise exception 'INVALID_SECRET'; end if;
  if not exists(
    select from workflow_private.p4_catalog
    where kind='connection' and not disabled
      and content->>'type'='mcp-http'
      and content->>'authType'='oauth'
      and content->>'secretRef'=p_ref
  ) then raise exception 'SECRET_REVOKED'; end if;
  perform vault.update_secret(substring(p_ref from 7)::uuid,p_secret);
end $$;
revoke all on function workflow_private.mcp_oauth_secret_update(text,text) from public,anon,authenticated;
grant execute on function workflow_private.mcp_oauth_secret_update(text,text) to workflow_worker;

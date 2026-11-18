-- Recommendation placement and connect behavior are administrator-configured
-- catalog metadata, not client code or seeds. A featured row keeps the ordinary
-- configuration flow by default; only an explicit compatible quick/login mode
-- changes what the market card does.
alter table public.mcp_market_servers
  add column if not exists connect_mode text not null default 'config',
  add column if not exists oauth_scopes jsonb not null default '[]'::jsonb;

alter table public.mcp_market_servers
  drop constraint if exists mcp_market_servers_connect_mode_check,
  add constraint mcp_market_servers_connect_mode_check
    check (connect_mode in ('config','quick','login')),
  drop constraint if exists mcp_market_servers_oauth_scopes_check,
  add constraint mcp_market_servers_oauth_scopes_check
    check (jsonb_typeof(oauth_scopes) = 'array' and jsonb_array_length(oauth_scopes) <= 20),
  drop constraint if exists mcp_market_servers_recommendation_check,
  add constraint mcp_market_servers_recommendation_check
    check (
      connect_mode = 'config'
      or (featured and connect_mode = 'quick' and auth_hint = 'none')
      or (featured and connect_mode = 'login' and auth_hint = 'oauth' and jsonb_array_length(oauth_scopes) > 0)
    );

create index if not exists mcp_market_servers_featured_idx
  on public.mcp_market_servers (featured, title)
  where featured;

comment on column public.mcp_market_servers.connect_mode is
  'Admin-configured recommendation action: config (default), quick guest connect, or provider login.';
comment on column public.mcp_market_servers.oauth_scopes is
  'Exact OAuth scopes an administrator verified for a login recommendation.';

-- The MCP market classifier changed from substring scoring to word-aware
-- evidence. Existing cached rows must follow the same rules as new imports.
alter table public.mcp_market_sync
  add column if not exists classifier_version integer not null default 0;

-- One bounded batch from the server-side classifier. Service-role only: the
-- browser never writes the shared catalog.
create or replace function public.mcp_market_reclassify(p_updates jsonb)
returns integer language sql security definer set search_path='' as $$
  with changed as (
    update public.mcp_market_servers server
       set category = update_row.category
      from jsonb_to_recordset(coalesce(p_updates, '[]'::jsonb)) as update_row(id uuid, category text)
     where server.id = update_row.id
       and server.source = 'registry'
       and update_row.category is not null
       and char_length(update_row.category) between 1 and 40
       and server.category <> update_row.category
    returning 1
  )
  select count(*)::integer from changed;
$$;

revoke all on function public.mcp_market_reclassify(jsonb) from public, anon, authenticated;
grant execute on function public.mcp_market_reclassify(jsonb) to service_role;
comment on function public.mcp_market_reclassify(jsonb) is 'Reclassify cached MCP Registry rows in bounded batches; service-role only.';

-- Shared discovery stays bounded even if owners create many connection versions.
create or replace function workflow_private.p6_catalog_put(p_key text,p_digest text,p_tools jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if length(p_key)>512 or length(p_digest)<>64 or jsonb_typeof(p_tools)<>'array' then raise exception 'INVALID_CATALOG';end if;
 if octet_length(p_tools::text)>262144 then raise exception 'CATALOG_PAYLOAD_TOO_LARGE';end if;
 perform pg_advisory_xact_lock(hashtextextended('workflow:p6:catalog-capacity',0));
 if not exists(select from workflow_private.p6_discovery where key=p_key) and (select count(*) from workflow_private.p6_discovery)>=128 then raise exception 'CATALOG_QUOTA_EXCEEDED';end if;
 insert into workflow_private.p6_discovery(key,connector_digest,tools) values(p_key,p_digest,p_tools)
 on conflict(key) do update set connector_digest=excluded.connector_digest,tools=excluded.tools,updated_at=now();
 return true;
end $$;

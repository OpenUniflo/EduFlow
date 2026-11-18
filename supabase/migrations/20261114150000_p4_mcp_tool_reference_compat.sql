-- MCP tool references append the tool name to the immutable connection ref
-- (p4:owner:logical:version:tool). Connection validation must resolve the
-- connection prefix without weakening owner/environment/version checks.
create or replace function workflow_private.p4_validate_definition_connections(
  p_owner uuid,
  p_environment text,
  p_definition jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare
  use_row record;
  parts text[];
  logical_ref text;
  connection_version integer;
  target_environment text := nullif(p_environment,'');
begin
  for use_row in select * from workflow_private.p4_definition_connection_uses(p_definition) loop
    parts:=string_to_array(use_row.ref,':');
    if cardinality(parts)<4
      or parts[1]<>'p4'
      or parts[2]<>p_owner::text
      or parts[3]=''
      or parts[4] !~ '^[1-9][0-9]*$'
      or (use_row.usage='providerRef' and cardinality(parts)<>4)
      or (cardinality(parts)>4 and coalesce(parts[5],'')='')
    then
      raise exception 'INVALID_CONNECTION_REFERENCE';
    end if;
    logical_ref:=parts[3];
    connection_version:=parts[4]::integer;
    -- Resolve the exact owner/environment/version. A function version with a
    -- coincidental p4 ref is not a model/tool connection and must not satisfy it.
    if not exists(
      select from workflow_private.p4_catalog
      where owner_user_id=p_owner
        and kind='connection'
        and ref=logical_ref
        and version=connection_version
        and (target_environment is null or environment_ref=target_environment)
    ) then
      raise exception 'CONNECTION_UNAVAILABLE';
    end if;
  end loop;
end $$;

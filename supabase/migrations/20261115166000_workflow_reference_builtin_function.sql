-- Built-in registered functions (for example edu.scale@1) live in the Worker
-- catalog, not in the owner's p4 catalog. The closure resource validator must
-- not reject them as missing owner resources.
create or replace function workflow_private.p4_validate_definition_functions(
  p_owner uuid,
  p_environment text,
  p_definition jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare
  use_row record;
  target_environment text := nullif(p_environment,'');
begin
  for use_row in select * from workflow_private.p4_definition_registered_functions(p_definition) loop
    if use_row.ref like 'edu.%' then continue; end if;
    if use_row.version is null or use_row.version < 1 then
      raise exception 'INVALID_FUNCTION_VERSION';
    end if;
    if not exists(
      select from workflow_private.p4_catalog
      where owner_user_id=p_owner
        and kind='function'
        and ref=use_row.ref
        and version=use_row.version
        and not disabled
        and (target_environment is null or environment_ref=target_environment)
    ) then
      raise exception 'FUNCTION_UNAVAILABLE';
    end if;
  end loop;
end $$;

revoke all on function workflow_private.p4_validate_definition_functions(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function workflow_private.p4_validate_definition_functions(uuid,text,jsonb) to workflow_worker,service_role;
notify pgrst, 'reload schema';

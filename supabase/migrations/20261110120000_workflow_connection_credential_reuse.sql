-- Editing only a provider's enabled models publishes a new version without
-- re-entering the key. The Worker resolves the previous version's managed
-- secret server-side; this function only accepts a reference that already
-- belongs to an earlier version with the same provider type and address.
create or replace function workflow_private.p4_connection_save(p_owner uuid,p_environment text,p_ref text,p_version integer,p_content jsonb,p_credential text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid; c jsonb; begin
 if p_content ? 'headerSecretRefs' then raise exception 'INVALID_SECRET_REFERENCE'; end if;
 if p_content ? 'secretRef' then
  if not exists(
   select from workflow_private.p4_catalog
   where owner_user_id=p_owner and environment_ref=p_environment and kind='connection' and ref=p_ref
     and not disabled
     and content->>'secretRef'=p_content->>'secretRef'
     and content->>'type'=p_content->>'type'
     and rtrim(coalesce(content->>'baseUrl',content->>'url',''),'/')=rtrim(coalesce(p_content->>'baseUrl',p_content->>'url',''),'/')
  ) then raise exception 'INVALID_SECRET_REFERENCE'; end if;
 end if;
 if exists(select from workflow_private.p4_catalog where owner_user_id=p_owner and environment_ref=p_environment and kind='connection' and ref=p_ref and version=p_version) then raise exception 'IMMUTABLE_VERSION'; end if;
 c:=p_content;
 if coalesce(p_credential,'')<>'' then
  if length(p_credential)>8000 then raise exception 'CREDENTIAL_TOO_LARGE'; end if;
  sid:=vault.create_secret(p_credential);
  c:=c||jsonb_build_object('secretRef','vault:'||sid::text);
 end if;
 return workflow_private.p4_catalog_save(p_owner,p_environment,'connection',p_ref,p_version,c,false);
end $$;
revoke all on function workflow_private.p4_connection_save(uuid,text,text,integer,jsonb,text) from public,anon,authenticated;
grant execute on function workflow_private.p4_connection_save(uuid,text,text,integer,jsonb,text) to workflow_worker;

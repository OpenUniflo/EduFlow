-- Vault encrypts connection credentials; only the worker can resolve active references.
create function workflow_private.p4_connection_save(p_owner uuid,p_environment text,p_ref text,p_version integer,p_content jsonb,p_credential text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid; c jsonb; begin
 if p_content ? 'secretRef' or p_content ? 'headerSecretRefs' then raise exception 'INVALID_SECRET_REFERENCE'; end if;
 if exists(select from workflow_private.p4_catalog where owner_user_id=p_owner and environment_ref=p_environment and kind='connection' and ref=p_ref and version=p_version) then raise exception 'IMMUTABLE_VERSION'; end if;
 c:=p_content;
 if coalesce(p_credential,'')<>'' then
  if length(p_credential)>8000 then raise exception 'CREDENTIAL_TOO_LARGE'; end if;
  sid:=vault.create_secret(p_credential);
  c:=c||jsonb_build_object('secretRef','vault:'||sid::text);
 end if;
 return workflow_private.p4_catalog_save(p_owner,p_environment,'connection',p_ref,p_version,c,false);
end $$;
create function workflow_private.p4_secret(p_ref text) returns text language plpgsql security definer set search_path='' as $$
declare value text; begin
 if not exists(select from workflow_private.p4_catalog where kind='connection' and not disabled and content->>'secretRef'=p_ref) then raise exception 'SECRET_REVOKED'; end if;
 select decrypted_secret into value from vault.decrypted_secrets where id=substring(p_ref from 7)::uuid;
 if value is null then raise exception 'SECRET_REVOKED'; end if;
 return value;
end $$;
revoke all on function workflow_private.p4_connection_save(uuid,text,text,integer,jsonb,text),workflow_private.p4_secret(text) from public,anon,authenticated;
grant execute on function workflow_private.p4_connection_save(uuid,text,text,integer,jsonb,text),workflow_private.p4_secret(text) to workflow_worker;

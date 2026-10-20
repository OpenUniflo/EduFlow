begin;
-- The internal worker receives only the authenticated owner's ordinary variables.
-- No public schema or browser-accessible privileged RPC is added.
create function workflow_private.environment_variables(p_owner uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('revision',revision,'variables',variables)
 from public.workflow_workspace_configuration where owner_user_id=p_owner
$$;
revoke all on function workflow_private.environment_variables(uuid) from public,anon,authenticated;
grant execute on function workflow_private.environment_variables(uuid) to workflow_worker;
revoke select on public.workflow_workspace_configuration from workflow_worker;
commit;

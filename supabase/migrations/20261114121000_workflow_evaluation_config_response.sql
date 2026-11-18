-- Keep the RPC response aligned with the table row shape consumed by the API DTO.
begin;
create or replace function public.workflow_evaluation_config_save(
 p_owner uuid,p_workflow text,p_base_version integer,p_enabled boolean,p_goal text,
 p_criteria jsonb,p_provider_ref text default null,p_model_ref text default null,p_environment_ref text default null)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare current public.workflow_evaluation_configs; next integer; result public.workflow_evaluation_configs;
begin
 if p_goal is null or length(p_goal)>4000 then raise exception 'INVALID_EVALUATION_CONFIG'; end if;
 if p_criteria is null or jsonb_typeof(p_criteria)<>'array' or jsonb_array_length(p_criteria)>20 then raise exception 'INVALID_EVALUATION_CONFIG'; end if;
 if exists(select from jsonb_array_elements_text(p_criteria) item where btrim(item)='' or length(item)>1000) then raise exception 'INVALID_EVALUATION_CONFIG'; end if;
 if (p_provider_ref is null) <> (p_model_ref is null) then raise exception 'INVALID_EVALUATION_CONFIG'; end if;
 if p_provider_ref is not null and (btrim(p_provider_ref)='' or length(p_provider_ref)>256 or btrim(p_model_ref)='' or length(p_model_ref)>256) then raise exception 'INVALID_EVALUATION_CONFIG'; end if;
 if p_provider_ref is not null and (p_environment_ref is null or btrim(p_environment_ref)='') then raise exception 'INVALID_EVALUATION_CONFIG'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_workflow||':evaluation',0));
 if not exists(select from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=p_workflow) then raise exception 'NOT_FOUND'; end if;
 select * into current from public.workflow_evaluation_configs where owner_user_id=p_owner and workflow_id=p_workflow for update;
 if not found then
  if p_base_version<>0 then raise exception 'REVISION_CONFLICT'; end if;
  next:=1;
  insert into public.workflow_evaluation_configs(owner_user_id,workflow_id,version,enabled,goal,criteria,provider_ref,model_ref,environment_ref)
  values(p_owner,p_workflow,next,coalesce(p_enabled,true),btrim(p_goal),p_criteria,p_provider_ref,p_model_ref,p_environment_ref) returning * into result;
 else
  if p_base_version<>current.version then raise exception 'REVISION_CONFLICT'; end if;
  next:=current.version+1;
  update public.workflow_evaluation_configs set version=next,enabled=coalesce(p_enabled,true),goal=btrim(p_goal),criteria=p_criteria,
   provider_ref=p_provider_ref,model_ref=p_model_ref,environment_ref=p_environment_ref,updated_at=now()
  where owner_user_id=p_owner and workflow_id=p_workflow returning * into result;
 end if;
 return jsonb_build_object('workflow_id',result.workflow_id,'version',result.version,'enabled',result.enabled,'goal',result.goal,
  'criteria',result.criteria,'provider_ref',result.provider_ref,'model_ref',result.model_ref,'environment_ref',result.environment_ref,'updated_at',result.updated_at);
end $function$;
revoke all on function public.workflow_evaluation_config_save(uuid,text,integer,boolean,text,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.workflow_evaluation_config_save(uuid,text,integer,boolean,text,jsonb,text,text,text) to service_role;
commit;

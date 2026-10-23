begin;

-- M13: user-owned variable environments (development / staging / production ...) are a
-- workspace resource. Variables keep their default value on the configuration row, and
-- overrides are keyed by variable-environment id instead of a platform environment ref.
create table public.workflow_variable_environments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  description text not null default '' check (char_length(description) <= 300),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, name)
);
create index workflow_variable_environments_owner_idx
  on public.workflow_variable_environments(owner_user_id, position, created_at, id);

alter table public.workflow_variable_environments enable row level security;
create policy workflow_variable_environment_owner_read on public.workflow_variable_environments
  for select to authenticated using ((select auth.uid()) = owner_user_id);
create policy workflow_variable_environment_owner_insert on public.workflow_variable_environments
  for insert to authenticated with check ((select auth.uid()) = owner_user_id);
create policy workflow_variable_environment_owner_update on public.workflow_variable_environments
  for update to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create policy workflow_variable_environment_owner_delete on public.workflow_variable_environments
  for delete to authenticated using ((select auth.uid()) = owner_user_id);
-- Browser clients keep using the application API; no direct Data API table grants.
revoke all on public.workflow_variable_environments from anon, authenticated;
grant all on public.workflow_variable_environments to service_role;

alter table public.workflow_workspace_configuration
  add column default_environment_id uuid null references public.workflow_variable_environments(id) on delete set null;

-- R10/M13: legacy overrides keyed by platform environment ref are not translated. Clear
-- them once, preserve keys/default values/descriptions, and bump the revision so an open
-- editor does not silently overwrite the migration with stale state.
update public.workflow_workspace_configuration c
set variables = (
  select jsonb_agg(
    case when jsonb_typeof(variable->'overrides') = 'object'
      then jsonb_set(variable, '{overrides}', '{}'::jsonb)
      else variable end
    order by ord)
  from jsonb_array_elements(c.variables) with ordinality as item(variable, ord)
), revision = c.revision + 1, updated_at = now()
where jsonb_typeof(c.variables) = 'array'
  and exists (
    select 1 from jsonb_array_elements(c.variables) variable
    where jsonb_typeof(variable->'overrides') = 'object' and variable->'overrides' <> '{}'::jsonb
  );

-- Runs freeze the selected variable environment by identity; the display name is frozen in
-- registry_snapshot so deleted environments still render on historical Runs.
alter table public.workflow_live_runs
  add column variable_environment_id uuid null references public.workflow_variable_environments(id) on delete set null;
create index workflow_live_runs_variable_environment_idx
  on public.workflow_live_runs(owner_user_id, variable_environment_id);

-- The Worker resolves ordinary variables for one selected variable environment (or the
-- owner's default). Existing keys stay valid; environments/default_environment_id are new.
create or replace function workflow_private.environment_variables(p_owner uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(
  (select jsonb_build_object(
     'revision', c.revision,
     'variables', c.variables,
     'environments', coalesce((
       select jsonb_agg(jsonb_build_object(
         'id', e.id, 'name', e.name, 'description', e.description, 'order', e.position
       ) order by e.position, e.created_at, e.id)
       from public.workflow_variable_environments e
       where e.owner_user_id = c.owner_user_id
     ), '[]'::jsonb),
     'default_environment_id', c.default_environment_id
   ) from public.workflow_workspace_configuration c where c.owner_user_id = p_owner),
  jsonb_build_object('revision', 0, 'variables', '[]'::jsonb, 'environments', '[]'::jsonb, 'default_environment_id', null)
 );
$$;
revoke all on function workflow_private.environment_variables(uuid) from public, anon, authenticated;
grant execute on function workflow_private.environment_variables(uuid) to workflow_worker;

-- Configuration reads lazily materialize the owner's configuration row and one default
-- variable environment, then return the full camelCase shape used by the application API.
create function public.workflow_v2_configuration_read(p_owner uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  cfg public.workflow_workspace_configuration;
  environments jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || ':configuration', 0));
  insert into public.workflow_workspace_configuration(owner_user_id) values (p_owner)
    on conflict (owner_user_id) do nothing;
  insert into public.workflow_variable_environments(owner_user_id, name, description, position)
    select p_owner, '默认环境', '', 0
    where not exists (select 1 from public.workflow_variable_environments where owner_user_id = p_owner);
  update public.workflow_workspace_configuration c
    set default_environment_id = first_environment.id
    from (select id from public.workflow_variable_environments where owner_user_id = p_owner
          order by position, created_at, id limit 1) first_environment
    where c.owner_user_id = p_owner and c.default_environment_id is null;
  select * into cfg from public.workflow_workspace_configuration where owner_user_id = p_owner;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'name', e.name, 'description', e.description, 'order', e.position
    ) order by e.position, e.created_at, e.id), '[]'::jsonb)
    into environments
    from public.workflow_variable_environments e where e.owner_user_id = p_owner;
  return jsonb_build_object(
    'revision', cfg.revision,
    'variables', cfg.variables,
    'environments', environments,
    'defaultEnvironmentId', cfg.default_environment_id
  );
end $$;
revoke all on function public.workflow_v2_configuration_read(uuid) from public, anon, authenticated;
grant execute on function public.workflow_v2_configuration_read(uuid) to service_role;

-- Whole-table save: create/rename/reorder/delete variable environments, prune overrides for
-- deleted environments, keep the default pointer valid, and bump the optimistic revision in
-- one transaction. Callers pass the complete submitted arrays.
create function public.workflow_v2_configuration_save(p_owner uuid, p_base integer, p_variables jsonb, p_environments jsonb, p_default uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  cfg public.workflow_workspace_configuration;
  next_revision integer;
  entry record;
  item jsonb;
  environment_id uuid;
  kept uuid[] := '{}';
  cleaned_variables jsonb;
  chosen uuid;
  environments jsonb;
begin
  if p_base is null or p_base < 0 then raise exception 'INVALID_CONFIGURATION'; end if;
  if jsonb_typeof(p_variables) is distinct from 'array' or jsonb_typeof(p_environments) is distinct from 'array' then
    raise exception 'INVALID_CONFIGURATION';
  end if;
  if jsonb_array_length(p_environments) > 20 then raise exception 'INVALID_CONFIGURATION'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || ':configuration', 0));
  select * into cfg from public.workflow_workspace_configuration where owner_user_id = p_owner for update;
  if p_base = 0 then
    if found then raise exception 'REVISION_CONFLICT'; end if;
  elsif not found or cfg.revision <> p_base then
    raise exception 'REVISION_CONFLICT';
  end if;

  for entry in
    select ord::integer - 1 as ordinal, value
    from jsonb_array_elements(p_environments) with ordinality as submitted(value, ord)
  loop
    item := entry.value;
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'INVALID_CONFIGURATION'; end if;
    if coalesce(item->>'id', '') <> '' then
      begin
        environment_id := (item->>'id')::uuid;
      exception when others then
        raise exception 'INVALID_CONFIGURATION';
      end;
      update public.workflow_variable_environments e
        set name = coalesce(item->>'name', ''),
            description = coalesce(item->>'description', ''),
            position = coalesce((item->>'order')::integer, entry.ordinal),
            updated_at = now()
        where e.id = environment_id and e.owner_user_id = p_owner;
      -- Client-generated ids are stable before the first save; insert unknown ids instead of rejecting them.
      if not found then
        begin
          insert into public.workflow_variable_environments(id, owner_user_id, name, description, position)
            values (environment_id, p_owner, coalesce(item->>'name', ''), coalesce(item->>'description', ''),
                    coalesce((item->>'order')::integer, entry.ordinal));
        exception when unique_violation then
          raise exception 'INVALID_CONFIGURATION';
        end;
      end if;
    else
      insert into public.workflow_variable_environments(owner_user_id, name, description, position)
        values (p_owner, coalesce(item->>'name', ''), coalesce(item->>'description', ''),
                coalesce((item->>'order')::integer, entry.ordinal))
        returning id into environment_id;
    end if;
    kept := kept || environment_id;
  end loop;

  delete from public.workflow_variable_environments e
    where e.owner_user_id = p_owner and not (e.id = any(kept));

  select coalesce(jsonb_agg(
      case when jsonb_typeof(variable->'overrides') = 'object'
        then jsonb_set(variable, '{overrides}', coalesce((
          select jsonb_object_agg(override.key, override.value)
          from jsonb_each(variable->'overrides') override
          where override.key in (select kept_environment::text from unnest(kept) as kept_environment)
        ), '{}'::jsonb))
        else variable end
      order by ord)
    , '[]'::jsonb)
    into cleaned_variables
    from jsonb_array_elements(p_variables) with ordinality as submitted_variable(variable, ord);

  chosen := null;
  if p_default is not null and p_default = any(kept) then
    chosen := p_default;
  elsif array_length(kept, 1) is not null then
    select e.id into chosen from public.workflow_variable_environments e
      where e.id = any(kept) order by e.position, e.created_at, e.id limit 1;
  end if;

  if p_base = 0 then
    insert into public.workflow_workspace_configuration(owner_user_id, revision, variables, default_environment_id, updated_at)
      values (p_owner, 1, cleaned_variables, chosen, now());
    next_revision := 1;
  else
    next_revision := p_base + 1;
    update public.workflow_workspace_configuration c
      set revision = next_revision, variables = cleaned_variables,
          default_environment_id = chosen, updated_at = now()
      where c.owner_user_id = p_owner;
  end if;

  select * into cfg from public.workflow_workspace_configuration where owner_user_id = p_owner;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'name', e.name, 'description', e.description, 'order', e.position
    ) order by e.position, e.created_at, e.id), '[]'::jsonb)
    into environments
    from public.workflow_variable_environments e where e.owner_user_id = p_owner;
  return jsonb_build_object(
    'revision', cfg.revision,
    'variables', cfg.variables,
    'environments', environments,
    'defaultEnvironmentId', cfg.default_environment_id
  );
end $$;
revoke all on function public.workflow_v2_configuration_save(uuid, integer, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.workflow_v2_configuration_save(uuid, integer, jsonb, jsonb, uuid) to service_role;

-- Run creation records the frozen variable-environment identity. The Worker receives the
-- same id in /v1/validate and freezes {id, name} inside registry_snapshot.
drop function if exists public.workflow_v2_enqueue(uuid, text, integer, jsonb, text, text, jsonb, text, text, text, text, jsonb);
create function public.workflow_v2_enqueue(p_owner uuid, p_workflow text, p_revision integer, p_input jsonb, p_environment text, p_environment_revision text, p_registry jsonb, p_semantic text, p_fingerprint text, p_request_hash text, p_key text, p_launch jsonb default null, p_variable_environment uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare previous public.workflow_idempotency; run uuid; msg bigint; hash text; active integer; queued integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into previous from public.workflow_idempotency where owner_user_id=p_owner and key=p_key and expires_at>now();
 if found then
  if previous.request_hash<>p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('runId',previous.run_id,'revision',previous.revision,'status',coalesce((select status from public.workflow_live_runs where run_id=previous.run_id),'expired'),'historyExpired',not exists(select from public.workflow_live_runs where run_id=previous.run_id));
 end if;
 if not exists(select from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=p_workflow and not archived) then raise exception 'WORKFLOW_ARCHIVED'; end if;
 select definition_hash into hash from public.workflow_revisions where owner_user_id=p_owner and workflow_id=p_workflow and revision=p_revision;
 if hash is null then raise exception 'NOT_FOUND'; end if;
 if p_variable_environment is not null and not exists(select from public.workflow_variable_environments where id=p_variable_environment and owner_user_id=p_owner) then raise exception 'INVALID_VARIABLE_ENVIRONMENT'; end if;
 select count(*) filter(where status='running'),count(*) filter(where status='queued') into active,queued from public.workflow_live_runs where owner_user_id=p_owner;
 if queued>=5 then raise exception 'RUN_QUOTA_EXCEEDED'; end if;
 insert into public.workflow_live_runs(owner_user_id,workflow_id,revision,status,definition_hash,semantic_hash,compile_fingerprint,environment_ref,environment_revision,input,registry_snapshot,launch_context,variable_environment_id)
 values(p_owner,p_workflow,p_revision,'queued',hash,p_semantic,p_fingerprint,p_environment,p_environment_revision,p_input,p_registry,p_launch,p_variable_environment) returning run_id into run;
 msg:=pgmq.send('workflow_v2',jsonb_build_object('runId',run));
 insert into public.workflow_run_jobs(run_id,queue_msg_id) values(run,msg);
 insert into public.workflow_idempotency values(p_owner,p_key,p_request_hash,run,p_workflow,p_revision,now()+interval '24 hours') on conflict(owner_user_id,key) do update set request_hash=p_request_hash,run_id=run,workflow_id=p_workflow,revision=p_revision,expires_at=now()+interval '24 hours';
 perform workflow_private.event(run,'run.queued','{}');
 return jsonb_build_object('runId',run,'revision',p_revision,'status','queued','eventsCursor',0);
end $$;
revoke all on function public.workflow_v2_enqueue(uuid,text,integer,jsonb,text,text,jsonb,text,text,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.workflow_v2_enqueue(uuid,text,integer,jsonb,text,text,jsonb,text,text,text,text,jsonb,uuid) to service_role;

commit;

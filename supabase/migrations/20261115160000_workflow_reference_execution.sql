-- Phase 3: execute fixed independent Workflow references.
--
-- The server resolves the complete reachable fixed-revision closure from the
-- immutable Definitions. The resolver is reused by API validation/run
-- preflight, by the Worker authorization guard, by the definition save and by
-- the connection/function lifecycle transactions. A missing target is never a
-- leaf. Resolution bounds are the same as save validation (8 hops, 32 target
-- revisions, 256 reference nodes, 64 direct references).
--
-- The frozen closure is stored in the Run's registry_snapshot by the Worker;
-- this migration only owns database authority and resource protection.

-- Return every reachable target revision and its complete Definition. The
-- queue walks Definitions, not the derived index, so a target FK cascade or a
-- stale index cannot hide a missing transitive target.
create or replace function workflow_private.workflow_reference_resolve(
  p_owner uuid,
  p_definition jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  edge record;
  item jsonb;
  queue jsonb := '[]'::jsonb;
  targets jsonb := '[]'::jsonb;
  edges jsonb := '[]'::jsonb;
  direct_count integer := 0;
  walked integer := 0;
  unique_targets integer := 0;
  seen_targets text[] := '{}';
  seen_keys text[] := '{}';
  target_definition jsonb;
  target_archived boolean;
  target_identity text;
  target_key text;
  target_revision integer;
  item_depth integer;
  root_identity text;
begin
  if jsonb_typeof(p_definition) <> 'object' then
    raise exception 'INVALID_SUBGRAPH_REFERENCE';
  end if;
  perform workflow_private.workflow_reference_shape_check(p_definition);
  root_identity := coalesce(p_definition->>'workflowId','') || ':' || coalesce(p_definition->>'revision','');

  for edge in
    select reference_edge.*,
      coalesce(mapping.inputs,'{}'::jsonb) as inputs,
      coalesce(mapping.writes,'{}'::jsonb) as writes
    from workflow_private.workflow_reference_edges(p_definition) reference_edge
    left join workflow_private.workflow_reference_node_mappings(p_definition) mapping
      on mapping.graph_path=reference_edge.graph_path and mapping.node_id=reference_edge.node_id
  loop
    direct_count := direct_count + 1;
    if direct_count > 64 then
      raise exception 'WORKFLOW_REFERENCE_LIMIT: more than 64 direct reference nodes';
    end if;
    if edge.node_id is null or btrim(edge.node_id)=''
      or edge.target_workflow_id is null or btrim(edge.target_workflow_id)=''
      or edge.target_revision is null or edge.target_revision < 1
      or edge.target_environment_ref is null or btrim(edge.target_environment_ref)=''
    then
      raise exception 'INVALID_SUBGRAPH_REFERENCE';
    end if;
    queue := queue || jsonb_build_array(jsonb_build_object(
      'graphPath', to_jsonb(edge.graph_path),
      'nodeId', edge.node_id,
      'fromWorkflowId', coalesce(p_definition->>'workflowId',''),
      'fromRevision', coalesce(p_definition->>'revision',''),
      'targetWorkflowId', edge.target_workflow_id,
      'targetRevision', edge.target_revision,
      'environmentRef', edge.target_environment_ref,
      'inputs', edge.inputs,
      'writes', edge.writes,
      'depth', 1,
      'path', jsonb_build_array(root_identity)
    ));
  end loop;

  while jsonb_array_length(queue) > 0 loop
    item := queue->0;
    queue := queue - 0;
    walked := walked + 1;
    if walked > 256 then
      raise exception 'WORKFLOW_REFERENCE_LIMIT: more than 256 reference nodes in closure';
    end if;
    target_revision := (item->>'targetRevision')::integer;
    if target_revision < 1 then raise exception 'INVALID_SUBGRAPH_REFERENCE'; end if;
    target_identity := (item->>'targetWorkflowId') || ':' || target_revision::text;
    target_key := target_identity || ':' || (item->>'environmentRef');

    select definition.archived into target_archived
    from public.workflow_v2_definitions definition
    where definition.owner_user_id=p_owner
      and definition.workflow_id=item->>'targetWorkflowId';
    if not found then raise exception 'WORKFLOW_REFERENCE_UNAVAILABLE: %', target_identity; end if;
    if target_archived then raise exception 'WORKFLOW_REFERENCE_ARCHIVED: %', target_identity; end if;
    select revision.definition into target_definition
    from public.workflow_revisions revision
    where revision.owner_user_id=p_owner
      and revision.workflow_id=item->>'targetWorkflowId'
      and revision.revision=target_revision;
    if not found then raise exception 'WORKFLOW_REFERENCE_UNAVAILABLE: %', target_identity; end if;

    if (item->'path') ? target_identity then
      raise exception 'WORKFLOW_REFERENCE_CYCLE: %', target_identity;
    end if;
    perform workflow_private.workflow_reference_mapping_check(
      target_definition,
      coalesce(item->'inputs','{}'::jsonb),
      coalesce(item->'writes','{}'::jsonb)
    );

    if not (target_identity = any(seen_targets)) then
      seen_targets := seen_targets || target_identity;
      unique_targets := unique_targets + 1;
      if unique_targets > 32 then
        raise exception 'WORKFLOW_REFERENCE_LIMIT: more than 32 target revisions in closure';
      end if;
    end if;
    if not (target_key = any(seen_keys)) then
      seen_keys := seen_keys || target_key;
      targets := targets || jsonb_build_array(jsonb_build_object(
        'workflowId', item->>'targetWorkflowId',
        'revision', target_revision,
        'environmentRef', item->>'environmentRef',
        'definition', target_definition
      ));
    end if;
    edges := edges || jsonb_build_array(jsonb_build_object(
      'graphPath', item->'graphPath',
      'nodeId', item->>'nodeId',
      'fromWorkflowId', item->>'fromWorkflowId',
      'fromRevision', item->>'fromRevision',
      'targetWorkflowId', item->>'targetWorkflowId',
      'targetRevision', target_revision,
      'environmentRef', item->>'environmentRef',
      'depth', (item->>'depth')::integer,
      'path', (item->'path') || to_jsonb(target_identity)
    ));

    item_depth := (item->>'depth')::integer;
    for edge in
      select reference_edge.*,
        coalesce(mapping.inputs,'{}'::jsonb) as inputs,
        coalesce(mapping.writes,'{}'::jsonb) as writes
      from workflow_private.workflow_reference_edges(target_definition) reference_edge
      left join workflow_private.workflow_reference_node_mappings(target_definition) mapping
        on mapping.graph_path=reference_edge.graph_path and mapping.node_id=reference_edge.node_id
    loop
      if item_depth >= 8 then
        raise exception 'WORKFLOW_REFERENCE_LIMIT: more than 8 reference hops';
      end if;
      if edge.node_id is null or btrim(edge.node_id)=''
        or edge.target_workflow_id is null or btrim(edge.target_workflow_id)=''
        or edge.target_revision is null or edge.target_revision < 1
        or edge.target_environment_ref is null or btrim(edge.target_environment_ref)=''
      then
        raise exception 'INVALID_SUBGRAPH_REFERENCE';
      end if;
      queue := queue || jsonb_build_array(jsonb_build_object(
        'graphPath', to_jsonb(edge.graph_path),
        'nodeId', edge.node_id,
        'fromWorkflowId', item->>'targetWorkflowId',
        'fromRevision', target_revision,
        'targetWorkflowId', edge.target_workflow_id,
        'targetRevision', edge.target_revision,
        'environmentRef', edge.target_environment_ref,
        'inputs', edge.inputs,
        'writes', edge.writes,
        'depth', item_depth + 1,
        'path', (item->'path') || to_jsonb(target_identity)
      ));
    end loop;
  end loop;

  return jsonb_build_object(
    'version', 1,
    'root', jsonb_build_object(
      'workflowId', coalesce(p_definition->>'workflowId',''),
      'revision', coalesce(p_definition->>'revision','')
    ),
    'edges', edges,
    'targets', targets,
    'referenceCount', walked,
    'targetCount', unique_targets
  );
end $$;

-- Runtime reauthorization. New target versions do not matter; a missing,
-- archived or deleted target revision does. The Worker calls this on every
-- guard, so freezing execution definitions never freezes authorization.
create or replace function workflow_private.workflow_reference_authorize(
  p_owner uuid,
  p_references jsonb
) returns boolean language plpgsql security definer set search_path='' as $$
declare
  target jsonb;
  target_archived boolean;
begin
  if p_references is null then return true; end if;
  if jsonb_typeof(p_references) <> 'object' or jsonb_typeof(coalesce(p_references->'targets','[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_SUBGRAPH_REFERENCE';
  end if;
  for target in select value from jsonb_array_elements(coalesce(p_references->'targets','[]'::jsonb)) loop
    if jsonb_typeof(target) <> 'object'
      or coalesce(target->>'workflowId','')=''
      or coalesce(target->>'environmentRef','')=''
      or jsonb_typeof(target->'revision') <> 'number'
      or (target->>'revision')::integer < 1
    then
      raise exception 'INVALID_SUBGRAPH_REFERENCE';
    end if;
    select definition.archived into target_archived
    from public.workflow_v2_definitions definition
    where definition.owner_user_id=p_owner
      and definition.workflow_id=target->>'workflowId';
    if not found then raise exception 'WORKFLOW_REFERENCE_UNAVAILABLE'; end if;
    if target_archived then raise exception 'WORKFLOW_REFERENCE_ARCHIVED'; end if;
    if not exists(
      select from public.workflow_revisions revision
      where revision.owner_user_id=p_owner
        and revision.workflow_id=target->>'workflowId'
        and revision.revision=(target->>'revision')::integer
    ) then raise exception 'WORKFLOW_REFERENCE_UNAVAILABLE'; end if;
  end loop;
  return true;
end $$;

-- API-facing read-only projection for resource reference scans. The browser
-- still authenticates; the service-role caller passes its authenticated owner.
create or replace function public.workflow_v2_reference_closure(
  p_owner uuid,
  p_workflow text,
  p_revision integer
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare definition jsonb;
begin
  select revision.definition into definition
  from public.workflow_revisions revision
  where revision.owner_user_id=p_owner
    and revision.workflow_id=p_workflow
    and revision.revision=p_revision;
  if definition is null then raise exception 'NOT_FOUND'; end if;
  return workflow_private.workflow_reference_resolve(p_owner, definition);
end $$;

-- Registered functions used by a Definition (including nested embedded
-- graphs). Version identity is explicit; a bare reference cannot satisfy it.
create or replace function workflow_private.p4_definition_registered_functions(p_definition jsonb)
returns table(ref text, version integer, usage text) language sql immutable security invoker set search_path='' as $$
with recursive graphs(graph, depth) as (
  select case when jsonb_typeof(p_definition)='object' then p_definition else '{}'::jsonb end, 0
  union all
  select node_row.node->'config'->'graph', g.depth+1
  from graphs g
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(g.graph->'nodes')='array' then g.graph->'nodes' else '[]'::jsonb end
  ) as node_row(node)
  where g.depth < 8
    and node_row.node->>'type'='core.subgraph'
    and jsonb_typeof(node_row.node->'config'->'graph')='object'
)
select distinct r.ref, r.version, r.usage
from graphs g
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(g.graph->'nodes')='array' then g.graph->'nodes' else '[]'::jsonb end
) as node_row(node)
cross join lateral (
  select node_row.node->'config'->>'functionRef' as ref,
    case when node_row.node->'config'->>'functionVersion' ~ '^[1-9][0-9]*$'
      then (node_row.node->'config'->>'functionVersion')::integer end as version,
    'functionRef'::text as usage
  where node_row.node->>'type'='core.function'
    and node_row.node->'config'->>'implementation'='registered'
    and nullif(node_row.node->'config'->>'functionRef','') is not null
  union all
  select node_row.node->'config'->'authoring'->'errorHandler'->>'functionRef' as ref,
    case when node_row.node->'config'->'authoring'->'errorHandler'->>'functionVersion' ~ '^[1-9][0-9]*$'
      then (node_row.node->'config'->'authoring'->'errorHandler'->>'functionVersion')::integer end as version,
    'errorHandler'::text as usage
  where jsonb_typeof(node_row.node->'config'->'authoring'->'errorHandler')='object'
    and nullif(node_row.node->'config'->'authoring'->'errorHandler'->>'functionRef','') is not null
) r;
$$;

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

create or replace function workflow_private.p4_validate_definition_resources(
  p_owner uuid,
  p_environment text,
  p_definition jsonb
) returns void language plpgsql security definer set search_path='' as $$
begin
  perform workflow_private.p4_validate_definition_connections(p_owner,p_environment,p_definition);
  perform workflow_private.p4_validate_definition_functions(p_owner,p_environment,p_definition);
end $$;

-- Save-time closure resource validation. The target Definition is resolved
-- from the immutable revision, never from a browser payload, and its own
-- environmentRef selects the catalog environment/version.
create or replace function workflow_private.p4_validate_definition_closure_resources(
  p_owner uuid,
  p_environment text,
  p_definition jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare
  target jsonb;
  resolved jsonb;
begin
  perform workflow_private.p4_validate_definition_resources(p_owner,p_environment,p_definition);
  resolved := workflow_private.workflow_reference_resolve(p_owner,p_definition);
  for target in select value from jsonb_array_elements(coalesce(resolved->'targets','[]'::jsonb)) loop
    perform workflow_private.p4_validate_definition_resources(
      p_owner,
      target->>'environmentRef',
      target->'definition'
    );
  end loop;
end $$;

-- Run insertion validates the exact frozen definitions supplied by the
-- Worker. It does not re-resolve the target's latest revision.
create or replace function workflow_private.p4_validate_frozen_resources(
  p_owner uuid,
  p_environment text,
  p_definition jsonb,
  p_snapshot jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare
  target jsonb;
begin
  perform workflow_private.p4_validate_definition_resources(p_owner,p_environment,p_definition);
  for target in select value from jsonb_array_elements(coalesce(p_snapshot->'workflowReferences'->'targets','[]'::jsonb)) loop
    perform workflow_private.p4_validate_definition_resources(
      p_owner,
      target->>'environmentRef',
      target->'definition'
    );
  end loop;
end $$;

-- Resource scans include current roots and every fixed old revision reachable
-- from them. Historical revisions that no current root reaches stay ignored.
create or replace function workflow_private.p4_connection_reference_count(p_owner uuid,p_ref text)
returns integer language sql security definer set search_path='' as $$
with current_defs as (
  select r.definition
  from public.workflow_v2_definitions d
  join public.workflow_revisions r
    on r.owner_user_id=d.owner_user_id
   and r.workflow_id=d.workflow_id
   and r.revision=d.current_revision
  where d.owner_user_id=p_owner and not d.archived
), all_defs as (
  select definition from current_defs
  union all
  select target.value->'definition'
  from current_defs root
  cross join lateral jsonb_array_elements(
    coalesce(workflow_private.workflow_reference_resolve(p_owner,root.definition)->'targets','[]'::jsonb)
  ) target
)
select count(*)::integer
from all_defs d
cross join lateral workflow_private.p4_definition_connection_uses(d.definition) uses
where split_part(uses.ref, ':', 3)=p_ref;
$$;

create or replace function workflow_private.p4_function_reference_count(p_owner uuid,p_ref text)
returns integer language sql security definer set search_path='' as $$
with current_defs as (
  select r.definition
  from public.workflow_v2_definitions d
  join public.workflow_revisions r
    on r.owner_user_id=d.owner_user_id
   and r.workflow_id=d.workflow_id
   and r.revision=d.current_revision
  where d.owner_user_id=p_owner and not d.archived
), all_defs as (
  select definition from current_defs
  union all
  select target.value->'definition'
  from current_defs root
  cross join lateral jsonb_array_elements(
    coalesce(workflow_private.workflow_reference_resolve(p_owner,root.definition)->'targets','[]'::jsonb)
  ) target
)
select count(*)::integer
from all_defs d
cross join lateral workflow_private.p4_definition_function_uses(d.definition) uses
where uses.ref=p_ref;
$$;

-- Replace deletion functions so queued/running/waiting frozen closures keep
-- their resources protected even if the current root has moved on.
create or replace function workflow_private.p4_connection_delete(
  p_owner uuid,
  p_environment text,
  p_ref text,
  p_expected_version integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  latest integer;
  deleted integer;
  secret_ref text;
  secret_refs text[];
begin
  perform pg_advisory_xact_lock(hashtextextended('workflow:p4:connection-lifecycle',0));
  lock table public.workflow_v2_definitions, public.workflow_revisions in share row exclusive mode;
  lock table workflow_private.p4_catalog in share row exclusive mode;

  select max(version) into latest
  from workflow_private.p4_catalog
  where owner_user_id=p_owner and environment_ref=p_environment
    and kind='connection' and ref=p_ref;

  if latest is null then raise exception 'CATALOG_NOT_FOUND'; end if;
  if p_expected_version is distinct from latest then raise exception 'CONNECTION_VERSION_CONFLICT'; end if;
  if workflow_private.p4_connection_reference_count(p_owner,p_ref)>0 then
    raise exception 'CONNECTION_IN_USE';
  end if;

  if exists(
    select from public.workflow_live_runs r
    join public.workflow_revisions rev
      on rev.owner_user_id=r.owner_user_id
     and rev.workflow_id=r.workflow_id
     and rev.revision=r.revision
    cross join lateral workflow_private.p4_definition_connection_uses(rev.definition) u
    where r.owner_user_id=p_owner
      and r.status in ('queued','running','waiting')
      and (case when u.ref like 'p4:%' then split_part(u.ref,':',3) else u.ref end)=p_ref
  ) or exists(
    select from public.workflow_live_runs r
    cross join lateral jsonb_array_elements(
      coalesce(r.registry_snapshot->'workflowReferences'->'targets','[]'::jsonb)
    ) target
    cross join lateral workflow_private.p4_definition_connection_uses(target.value->'definition') u
    where r.owner_user_id=p_owner
      and r.status in ('queued','running','waiting')
      and (case when u.ref like 'p4:%' then split_part(u.ref,':',3) else u.ref end)=p_ref
  ) then raise exception 'CONNECTION_BUSY'; end if;
  if exists(
    select from public.workflow_execution_threads t
    join public.workflow_revisions rev
      on rev.owner_user_id=t.owner_user_id
     and rev.workflow_id=t.workflow_id
     and rev.revision=t.revision
    cross join lateral workflow_private.p4_definition_connection_uses(rev.definition) u
    where t.owner_user_id=p_owner
      and t.status='waiting'
      and (case when u.ref like 'p4:%' then split_part(u.ref,':',3) else u.ref end)=p_ref
  ) or exists(
    select from public.workflow_execution_threads t
    cross join lateral jsonb_array_elements(
      coalesce(t.snapshot->'registry_snapshot'->'workflowReferences'->'targets','[]'::jsonb)
    ) target
    cross join lateral workflow_private.p4_definition_connection_uses(target.value->'definition') u
    where t.owner_user_id=p_owner
      and t.status='waiting'
      and (case when u.ref like 'p4:%' then split_part(u.ref,':',3) else u.ref end)=p_ref
  ) then raise exception 'CONNECTION_BUSY'; end if;

  select array_agg(distinct content->>'secretRef')
  into secret_refs
  from workflow_private.p4_catalog
  where owner_user_id=p_owner and environment_ref=p_environment
    and kind='connection' and ref=p_ref
    and content->>'secretRef' like 'vault:%';

  delete from workflow_private.p4_catalog
  where owner_user_id=p_owner and environment_ref=p_environment
    and kind='connection' and ref=p_ref;
  get diagnostics deleted = row_count;

  foreach secret_ref in array coalesce(secret_refs, array[]::text[]) loop
    if secret_ref ~ '^vault:[0-9a-f-]{36}$'
      and not exists(select from workflow_private.p4_catalog where content->>'secretRef'=secret_ref)
    then
      delete from vault.secrets where id=substring(secret_ref from 7)::uuid;
    end if;
  end loop;

  return jsonb_build_object('ref',p_ref,'deleted',deleted,'version',latest,'credentialsDeleted',coalesce(array_length(secret_refs,1),0));
end $$;

create or replace function workflow_private.p4_function_delete(
  p_owner uuid,
  p_environment text,
  p_ref text,
  p_expected_version integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  latest integer;
  deleted integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('workflow:p4:connection-lifecycle',0));
  lock table public.workflow_v2_definitions, public.workflow_revisions in share row exclusive mode;
  lock table workflow_private.p4_catalog in share row exclusive mode;

  select max(version) into latest
  from workflow_private.p4_catalog
  where owner_user_id=p_owner and environment_ref=p_environment
    and kind='function' and ref=p_ref;

  if latest is null then raise exception 'CATALOG_NOT_FOUND'; end if;
  if p_expected_version is distinct from latest then raise exception 'FUNCTION_VERSION_CONFLICT'; end if;
  if workflow_private.p4_function_reference_count(p_owner,p_ref)>0 then
    raise exception 'FUNCTION_IN_USE';
  end if;

  if exists(
    select from public.workflow_live_runs r
    join public.workflow_revisions rev
      on rev.owner_user_id=r.owner_user_id
     and rev.workflow_id=r.workflow_id
     and rev.revision=r.revision
    cross join lateral workflow_private.p4_definition_function_uses(rev.definition) u
    where r.owner_user_id=p_owner
      and r.status in ('queued','running','waiting')
      and u.ref=p_ref
  ) or exists(
    select from public.workflow_live_runs r
    cross join lateral jsonb_array_elements(
      coalesce(r.registry_snapshot->'workflowReferences'->'targets','[]'::jsonb)
    ) target
    cross join lateral workflow_private.p4_definition_function_uses(target.value->'definition') u
    where r.owner_user_id=p_owner
      and r.status in ('queued','running','waiting')
      and u.ref=p_ref
  ) then raise exception 'FUNCTION_BUSY'; end if;
  if exists(
    select from public.workflow_execution_threads t
    join public.workflow_revisions rev
      on rev.owner_user_id=t.owner_user_id
     and rev.workflow_id=t.workflow_id
     and rev.revision=t.revision
    cross join lateral workflow_private.p4_definition_function_uses(rev.definition) u
    where t.owner_user_id=p_owner
      and t.status='waiting'
      and u.ref=p_ref
  ) or exists(
    select from public.workflow_execution_threads t
    cross join lateral jsonb_array_elements(
      coalesce(t.snapshot->'registry_snapshot'->'workflowReferences'->'targets','[]'::jsonb)
    ) target
    cross join lateral workflow_private.p4_definition_function_uses(target.value->'definition') u
    where t.owner_user_id=p_owner
      and t.status='waiting'
      and u.ref=p_ref
  ) then raise exception 'FUNCTION_BUSY'; end if;

  delete from workflow_private.p4_catalog
  where owner_user_id=p_owner and environment_ref=p_environment
    and kind='function' and ref=p_ref;
  get diagnostics deleted = row_count;

  return jsonb_build_object('ref',p_ref,'deleted',deleted,'version',latest);
end $$;

-- The definition save validates resources across the reachable fixed closure,
-- not only the root Definition and embedded graphs.
create or replace function public.workflow_v2_save(
  p_owner uuid,
  p_workflow text,
  p_base integer,
  p_editor_base integer,
  p_definition jsonb,
  p_editor jsonb,
  p_definition_hash text,
  p_provenance jsonb default null,
  p_environment text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  head public.workflow_v2_definitions;
  r integer;
  er integer;
  def jsonb;
  ed jsonb;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('workflow:p4:connection-lifecycle',0));
  perform pg_advisory_xact_lock_shared(hashtextextended('workflow:reference-lifecycle:'||p_owner::text,0));
  perform workflow_private.p4_validate_definition_closure_resources(p_owner,p_environment,p_definition);
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_workflow,0));
  select * into head from public.workflow_v2_definitions
  where owner_user_id=p_owner and workflow_id=p_workflow for update;
  if not found then
    if p_base is not null or p_editor_base is not null then raise exception 'REVISION_CONFLICT'; end if;
    insert into public.workflow_v2_definitions(owner_user_id,workflow_id,provenance)
    values(p_owner,p_workflow,p_provenance);
    r:=1; er:=1;
  else
    if head.archived then raise exception 'WORKFLOW_ARCHIVED'; end if;
    if p_base is distinct from head.current_revision or p_editor_base is distinct from head.editor_revision then raise exception 'REVISION_CONFLICT'; end if;
    r:=head.current_revision+1; er:=head.editor_revision+1;
  end if;
  def:=jsonb_set(jsonb_set(p_definition,'{revision}',to_jsonb(r)),'{workflowId}',to_jsonb(p_workflow));
  perform workflow_private.workflow_reference_validate(p_owner,p_workflow,r,def);
  ed:=jsonb_set(jsonb_set(jsonb_set(p_editor,'{definitionRevision}',to_jsonb(r)),'{editorRevision}',to_jsonb(er)),'{workflowId}',to_jsonb(p_workflow));
  insert into public.workflow_revisions(owner_user_id,workflow_id,revision,definition,definition_hash,editor_snapshot)
  values(p_owner,p_workflow,r,def,p_definition_hash,ed);
  perform workflow_private.workflow_reference_reindex(p_owner,p_workflow,r,def);
  insert into public.workflow_editor_documents
  values(p_owner,p_workflow,er,r,ed)
  on conflict(owner_user_id,workflow_id) do update
  set editor_revision=er,definition_revision=r,document=ed;
  update public.workflow_v2_definitions
  set current_revision=r,editor_revision=er,updated_at=now()
  where owner_user_id=p_owner and workflow_id=p_workflow;
  return jsonb_build_object('workflowId',p_workflow,'revision',r,'editorRevision',er);
end $$;

create or replace function workflow_private.workflow_live_run_connection_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare definition jsonb; begin
  perform pg_advisory_xact_lock_shared(hashtextextended('workflow:p4:connection-lifecycle',0));
  select rev.definition into definition
  from public.workflow_revisions rev
  where rev.owner_user_id=new.owner_user_id
    and rev.workflow_id=new.workflow_id
    and rev.revision=new.revision;
  if definition is null then raise exception 'NOT_FOUND'; end if;
  perform workflow_private.p4_validate_frozen_resources(
    new.owner_user_id,new.environment_ref,definition,new.registry_snapshot
  );
  return new;
end $$;

-- A Workflow may not disappear under an active Run that froze it as a child.
create or replace function public.workflow_v2_archive(p_owner uuid,p_workflow text,p_base integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  head public.workflow_v2_definitions;
  blocking_chain text[];
begin
  perform pg_advisory_xact_lock(hashtextextended('workflow:reference-lifecycle:'||p_owner::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_workflow,0));
  select * into head from public.workflow_v2_definitions
  where owner_user_id=p_owner and workflow_id=p_workflow for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if head.current_revision<>p_base then raise exception 'REVISION_CONFLICT'; end if;
  if not head.archived then
    select chain into blocking_chain
    from workflow_private.workflow_reference_current_chains(p_owner,p_workflow)
    order by array_length(chain,1)
    limit 1;
    if found then
      raise exception 'WORKFLOW_REFERENCED: %', array_to_string(blocking_chain,' -> ');
    end if;
    if exists(
      select from public.workflow_live_runs r
      where r.owner_user_id=p_owner and r.status in ('queued','running','waiting')
        and exists(select from jsonb_array_elements(coalesce(r.registry_snapshot->'workflowReferences'->'targets','[]'::jsonb)) target where target->>'workflowId'=p_workflow)
    ) or exists(
      select from public.workflow_execution_threads t
      where t.owner_user_id=p_owner and t.status='waiting'
        and exists(select from jsonb_array_elements(coalesce(t.snapshot->'registry_snapshot'->'workflowReferences'->'targets','[]'::jsonb)) target where target->>'workflowId'=p_workflow)
    ) then raise exception 'WORKFLOW_BUSY'; end if;
  end if;
  update public.workflow_v2_definitions
  set archived=true,updated_at=now()
  where owner_user_id=p_owner and workflow_id=p_workflow;
  return jsonb_build_object('ok',true,'archived',true);
end $$;

create or replace function public.workflow_v2_delete(p_owner uuid,p_workflow text,p_base integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  h public.workflow_v2_definitions;
  j record;
  runs integer;
  versions integer;
  blocking_chain text[];
begin
  perform pg_advisory_xact_lock(hashtextextended('workflow:reference-lifecycle:'||p_owner::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
  if exists(select from public.workflow_execution_threads where owner_user_id=p_owner and workflow_id=p_workflow and status in ('active','waiting')) then raise exception 'WORKFLOW_BUSY'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_workflow,0));
  select * into h from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=p_workflow for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if h.current_revision<>p_base then raise exception 'REVISION_CONFLICT'; end if;
  select chain into blocking_chain
  from workflow_private.workflow_reference_current_chains(p_owner,p_workflow)
  order by array_length(chain,1)
  limit 1;
  if found then
    raise exception 'WORKFLOW_REFERENCED: %', array_to_string(blocking_chain,' -> ');
  end if;
  if exists(
    select from public.workflow_live_runs r
    where r.owner_user_id=p_owner and r.status in ('queued','running','waiting')
      and exists(select from jsonb_array_elements(coalesce(r.registry_snapshot->'workflowReferences'->'targets','[]'::jsonb)) target where target->>'workflowId'=p_workflow)
  ) or exists(
    select from public.workflow_execution_threads t
    where t.owner_user_id=p_owner and t.status='waiting'
      and exists(select from jsonb_array_elements(coalesce(t.snapshot->'registry_snapshot'->'workflowReferences'->'targets','[]'::jsonb)) target where target->>'workflowId'=p_workflow)
  ) then raise exception 'WORKFLOW_BUSY'; end if;
  for j in select jobs.queue_msg_id from public.workflow_run_jobs jobs join public.workflow_live_runs r using(run_id) where r.owner_user_id=p_owner and r.workflow_id=p_workflow loop
    perform pgmq.delete('workflow_v2',j.queue_msg_id);
  end loop;
  delete from public.workflow_idempotency where owner_user_id=p_owner and workflow_id=p_workflow;
  delete from public.workflow_run_tombstones where owner_user_id=p_owner and workflow_id=p_workflow;
  delete from public.workflow_live_runs where owner_user_id=p_owner and workflow_id=p_workflow;
  get diagnostics runs=row_count;
  delete from workflow_checkpoints.checkpoint_writes where thread_id in (select thread_id::text from public.workflow_execution_threads where owner_user_id=p_owner and workflow_id=p_workflow);
  delete from workflow_checkpoints.checkpoint_blobs where thread_id in (select thread_id::text from public.workflow_execution_threads where owner_user_id=p_owner and workflow_id=p_workflow);
  delete from workflow_checkpoints.checkpoints where thread_id in (select thread_id::text from public.workflow_execution_threads where owner_user_id=p_owner and workflow_id=p_workflow);
  delete from public.workflow_editor_documents where owner_user_id=p_owner and workflow_id=p_workflow;
  delete from public.workflow_revisions where owner_user_id=p_owner and workflow_id=p_workflow;
  get diagnostics versions=row_count;
  delete from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=p_workflow;
  return jsonb_build_object('ok',true,'deletedRuns',runs,'deletedRevisions',versions);
end $$;

revoke all on function workflow_private.workflow_reference_resolve(uuid,jsonb),
  workflow_private.workflow_reference_authorize(uuid,jsonb),
  public.workflow_v2_reference_closure(uuid,text,integer),
  workflow_private.p4_definition_registered_functions(jsonb),
  workflow_private.p4_validate_definition_functions(uuid,text,jsonb),
  workflow_private.p4_validate_definition_resources(uuid,text,jsonb),
  workflow_private.p4_validate_definition_closure_resources(uuid,text,jsonb),
  workflow_private.p4_validate_frozen_resources(uuid,text,jsonb,jsonb),
  workflow_private.p4_connection_reference_count(uuid,text),
  workflow_private.p4_function_reference_count(uuid,text),
  workflow_private.p4_connection_delete(uuid,text,text,integer),
  workflow_private.p4_function_delete(uuid,text,text,integer),
  workflow_private.workflow_live_run_connection_guard(),
  public.workflow_v2_save(uuid,text,integer,integer,jsonb,jsonb,text,jsonb,text),
  public.workflow_v2_archive(uuid,text,integer),
  public.workflow_v2_delete(uuid,text,integer)
from public,anon,authenticated;

grant execute on function workflow_private.workflow_reference_resolve(uuid,jsonb),
  workflow_private.workflow_reference_authorize(uuid,jsonb),
  workflow_private.p4_definition_registered_functions(jsonb),
  workflow_private.p4_validate_definition_functions(uuid,text,jsonb),
  workflow_private.p4_validate_definition_resources(uuid,text,jsonb),
  workflow_private.p4_validate_definition_closure_resources(uuid,text,jsonb),
  workflow_private.p4_validate_frozen_resources(uuid,text,jsonb,jsonb)
to workflow_worker,service_role;

grant execute on function public.workflow_v2_reference_closure(uuid,text,integer),
  workflow_private.p4_connection_reference_count(uuid,text),
  workflow_private.p4_function_reference_count(uuid,text),
  workflow_private.p4_connection_delete(uuid,text,text,integer),
  workflow_private.p4_function_delete(uuid,text,text,integer),
  public.workflow_v2_save(uuid,text,integer,integer,jsonb,jsonb,text,jsonb,text),
  public.workflow_v2_archive(uuid,text,integer),
  public.workflow_v2_delete(uuid,text,integer)
to service_role;

grant execute on function workflow_private.p4_connection_reference_count(uuid,text),
  workflow_private.p4_function_reference_count(uuid,text),
  workflow_private.p4_connection_delete(uuid,text,text,integer),
  workflow_private.p4_function_delete(uuid,text,text,integer)
to workflow_worker;

notify pgrst, 'reload schema';

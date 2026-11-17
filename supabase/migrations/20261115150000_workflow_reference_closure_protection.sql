-- Corrective migration for independent Workflow fixed revisions.
--
-- The phase-2 implementation validated and protected only direct reference
-- rows. That is insufficient in two ways:
--
-- 1. Saving a definition whose pinned target has a transitive pinned target
--    must validate the whole reachable fixed-revision closure. A missing or
--    archived revision deeper in the chain is an error, not an empty edge set.
--    The index cannot be trusted for this: its target FK cascades on physical
--    target deletion, so an old source revision can outlive the clue.
-- 2. Deleting or archiving a target must be blocked when any unarchived
--    Workflow's current revision can reach it through the fixed-revision
--    closure, even when the caller chain passes through an old revision that
--    the current revision no longer uses. A pin is permanent until every
--    current root stops reaching it.
--
-- Both checks therefore walk immutable Definitions directly. The save and
-- delete/archive transactions keep the existing per-owner reference lifecycle
-- lock, so the validation they perform and the revision/index write remain
-- serialized with deletes and archives.

-- Replace the save-time validator. It walks the actual reachable closure in a
-- bounded queue rather than a recursive CTE whose missing target looks like a
-- leaf. Every edge is checked for owner, existence, archived state, exact
-- revision and mapping compatibility.
create or replace function workflow_private.workflow_reference_validate(
  p_owner uuid,
  p_workflow text,
  p_revision integer,
  p_definition jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare
  edge record;
  item jsonb;
  queue jsonb := '[]'::jsonb;
  direct_count integer := 0;
  walked integer := 0;
  unique_targets integer := 0;
  seen_targets text[] := '{}';
  target_archived boolean;
  target_definition jsonb;
  target_identity text;
  target_revision integer;
  item_depth integer;
  cycle_hit boolean;
begin
  if p_revision is null or p_revision < 1 then
    raise exception 'INVALID_SUBGRAPH_REFERENCE';
  end if;
  perform workflow_private.workflow_reference_shape_check(p_definition);

  -- Seed the queue with the root definition's direct fixed references.
  for edge in
    select reference_edge.*,
      coalesce(mapping.inputs,'{}'::jsonb) as inputs,
      coalesce(mapping.writes,'{}'::jsonb) as writes
    from workflow_private.workflow_reference_edges(p_definition) reference_edge
    left join workflow_private.workflow_reference_node_mappings(p_definition) mapping
      on mapping.graph_path=reference_edge.graph_path and mapping.node_id=reference_edge.node_id
  loop
    direct_count := direct_count + 1;
    queue := queue || jsonb_build_array(jsonb_build_object(
      'nodeId', edge.node_id,
      'graphPath', to_jsonb(edge.graph_path),
      'targetWorkflowId', edge.target_workflow_id,
      'targetRevision', edge.target_revision,
      'environmentRef', edge.target_environment_ref,
      'inputs', edge.inputs,
      'writes', edge.writes,
      'depth', 1,
      'path', jsonb_build_array(p_workflow || ':' || p_revision::text)
    ));
  end loop;
  if direct_count > 64 then
    raise exception 'WORKFLOW_REFERENCE_LIMIT: more than 64 direct reference nodes';
  end if;

  while jsonb_array_length(queue) > 0 loop
    item := queue->0;
    queue := queue - 0;
    walked := walked + 1;
    if walked > 256 then
      raise exception 'WORKFLOW_REFERENCE_LIMIT: more than 256 reference nodes in closure';
    end if;

    if jsonb_typeof(item->'nodeId') <> 'string'
      or btrim(item->>'nodeId') = ''
      or jsonb_typeof(item->'targetWorkflowId') <> 'string'
      or btrim(item->>'targetWorkflowId') = ''
      or jsonb_typeof(item->'targetRevision') <> 'number'
      or jsonb_typeof(item->'environmentRef') <> 'string'
      or btrim(item->>'environmentRef') = ''
    then
      raise exception 'INVALID_SUBGRAPH_REFERENCE';
    end if;
    target_revision := (item->>'targetRevision')::integer;
    if target_revision < 1 then
      raise exception 'INVALID_SUBGRAPH_REFERENCE';
    end if;
    target_identity := (item->>'targetWorkflowId') || ':' || target_revision::text;

    select definition.archived into target_archived
    from public.workflow_v2_definitions definition
    where definition.owner_user_id=p_owner
      and definition.workflow_id=item->>'targetWorkflowId';
    if not found then
      raise exception 'WORKFLOW_REFERENCE_UNAVAILABLE: %', target_identity;
    end if;
    if target_archived then
      raise exception 'WORKFLOW_REFERENCE_ARCHIVED: %', target_identity;
    end if;
    select revision.definition into target_definition
    from public.workflow_revisions revision
    where revision.owner_user_id=p_owner
      and revision.workflow_id=item->>'targetWorkflowId'
      and revision.revision=target_revision;
    if not found then
      raise exception 'WORKFLOW_REFERENCE_UNAVAILABLE: %', target_identity;
    end if;

    -- A target already on this chain closes a real fixed-revision cycle.
    cycle_hit := (item->'path') ? target_identity;
    if cycle_hit then
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
      queue := queue || jsonb_build_array(jsonb_build_object(
        'nodeId', edge.node_id,
        'graphPath', to_jsonb(edge.graph_path),
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
end $$;

-- Blocking chains for a target Workflow, rooted at every unarchived current
-- revision. A row reports the direct source edge and the complete call chain
-- from the root, so delete-impact/referenced-by can explain the block.
create or replace function workflow_private.workflow_reference_current_chains(
  p_owner uuid,
  p_target_workflow text
) returns table(
  root_workflow_id text,
  root_revision integer,
  root_name text,
  source_workflow_id text,
  source_revision integer,
  source_name text,
  node_id text,
  graph_path text[],
  target_workflow_id text,
  target_revision integer,
  target_name text,
  target_environment_ref text,
  source_current boolean,
  chain text[],
  chain_names text[]
) language sql stable security definer set search_path='' as $$
with recursive roots as (
  select workflow_id, current_revision
  from public.workflow_v2_definitions
  where owner_user_id=p_owner and archived=false and current_revision>0
),
walk(
  root_workflow_id, root_revision, root_name,
  source_workflow_id, source_revision, source_name,
  node_id, graph_path,
  target_workflow_id, target_revision, target_name,
  target_environment_ref, depth, path, names
) as (
  select
    root.workflow_id,
    root.current_revision,
    coalesce(root_revision.definition->>'name', root.workflow_id),
    root.workflow_id,
    root.current_revision,
    coalesce(root_revision.definition->>'name', root.workflow_id),
    edge.node_id,
    edge.graph_path,
    edge.target_workflow_id,
    edge.target_revision,
    coalesce(target_revision.definition->>'name', edge.target_workflow_id),
    edge.target_environment_ref,
    1,
    array[
      root.workflow_id || ':' || root.current_revision::text,
      edge.target_workflow_id || ':' || edge.target_revision::text
    ],
    array[
      coalesce(root_revision.definition->>'name', root.workflow_id),
      coalesce(target_revision.definition->>'name', edge.target_workflow_id)
    ]
  from roots root
  join public.workflow_revisions root_revision
    on root_revision.owner_user_id=p_owner
   and root_revision.workflow_id=root.workflow_id
   and root_revision.revision=root.current_revision
  cross join lateral workflow_private.workflow_reference_edges(root_revision.definition) edge
  left join public.workflow_revisions target_revision
    on target_revision.owner_user_id=p_owner
   and target_revision.workflow_id=edge.target_workflow_id
   and target_revision.revision=edge.target_revision
  union all
  select
    walk.root_workflow_id,
    walk.root_revision,
    walk.root_name,
    walk.target_workflow_id,
    walk.target_revision,
    walk.target_name,
    edge.node_id,
    edge.graph_path,
    edge.target_workflow_id,
    edge.target_revision,
    coalesce(next_revision.definition->>'name', edge.target_workflow_id),
    edge.target_environment_ref,
    walk.depth + 1,
    walk.path || (edge.target_workflow_id || ':' || edge.target_revision::text),
    walk.names || coalesce(next_revision.definition->>'name', edge.target_workflow_id)
  from walk
  join public.workflow_revisions source_revision
    on source_revision.owner_user_id=p_owner
   and source_revision.workflow_id=walk.target_workflow_id
   and source_revision.revision=walk.target_revision
  cross join lateral workflow_private.workflow_reference_edges(source_revision.definition) edge
  left join public.workflow_revisions next_revision
    on next_revision.owner_user_id=p_owner
   and next_revision.workflow_id=edge.target_workflow_id
   and next_revision.revision=edge.target_revision
  where walk.depth < 8
    -- The current node is the last path element. If it already appeared as an
    -- ancestor, its outgoing edges were explored at the first occurrence.
    and array_position(
      walk.path[1:array_length(walk.path,1)-1],
      walk.target_workflow_id || ':' || walk.target_revision::text
    ) is null
)
select distinct on (
  walk.root_workflow_id,
  walk.root_revision,
  walk.source_workflow_id,
  walk.source_revision,
  walk.node_id,
  walk.graph_path,
  walk.target_workflow_id,
  walk.target_revision
)
  walk.root_workflow_id,
  walk.root_revision,
  walk.root_name,
  walk.source_workflow_id,
  walk.source_revision,
  walk.source_name,
  walk.node_id,
  walk.graph_path,
  walk.target_workflow_id,
  walk.target_revision,
  walk.target_name,
  walk.target_environment_ref,
  exists(
    select 1
    from public.workflow_v2_definitions source_definition
    where source_definition.owner_user_id=p_owner
      and source_definition.workflow_id=walk.source_workflow_id
      and source_definition.current_revision=walk.source_revision
      and not source_definition.archived
  ) as source_current,
  walk.path as chain,
  walk.names as chain_names
from walk
where walk.target_workflow_id=p_target_workflow
order by
  walk.root_workflow_id,
  walk.root_revision,
  walk.source_workflow_id,
  walk.source_revision,
  walk.node_id,
  walk.graph_path,
  walk.target_workflow_id,
  walk.target_revision,
  array_length(walk.path,1);
$$;

-- API-facing impact projection. The API uses this for referenced-by and
-- delete-impact previews; the delete/archive RPCs use the same helper under
-- their exclusive lifecycle lock, so the preview and the authoritative check
-- cannot disagree about the reason.
create or replace function public.workflow_v2_reference_impact(
  p_owner uuid,
  p_workflow text
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  workflow_head record;
  blocking jsonb;
  reference_count integer;
  referenced_by integer;
begin
  select current_revision, archived into workflow_head
  from public.workflow_v2_definitions
  where owner_user_id=p_owner and workflow_id=p_workflow;
  if not found then
    return jsonb_build_object(
      'workflowId', p_workflow,
      'revision', null,
      'archived', false,
      'referenceCount', 0,
      'referencedBy', 0,
      'blocking', '[]'::jsonb
    );
  end if;

  select
    count(*),
    count(distinct chain_row.root_workflow_id),
    coalesce(jsonb_agg(jsonb_build_object(
      'rootWorkflowId', chain_row.root_workflow_id,
      'rootRevision', chain_row.root_revision,
      'rootName', chain_row.root_name,
      'sourceWorkflowId', chain_row.source_workflow_id,
      'sourceRevision', chain_row.source_revision,
      'sourceName', chain_row.source_name,
      'sourceCurrent', chain_row.source_current,
      'nodeId', chain_row.node_id,
      'graphPath', to_jsonb(chain_row.graph_path),
      'targetWorkflowId', chain_row.target_workflow_id,
      'targetRevision', chain_row.target_revision,
      'targetName', chain_row.target_name,
      'environmentRef', chain_row.target_environment_ref,
      'chain', to_jsonb(chain_row.chain),
      'chainNames', to_jsonb(chain_row.chain_names)
    ) order by
      chain_row.root_workflow_id,
      chain_row.root_revision,
      chain_row.source_workflow_id,
      chain_row.source_revision,
      chain_row.node_id), '[]'::jsonb)
  into reference_count, referenced_by, blocking
  from workflow_private.workflow_reference_current_chains(p_owner, p_workflow) chain_row;

  return jsonb_build_object(
    'workflowId', p_workflow,
    'revision', workflow_head.current_revision,
    'archived', workflow_head.archived,
    'referenceCount', reference_count,
    'referencedBy', referenced_by,
    'blocking', blocking
  );
end $$;

-- Recheck the complete current-root closure inside the same exclusive lock
-- that saves take shared. This replaces the direct-index-only check.
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
  end if;
  update public.workflow_v2_definitions
  set archived=true,updated_at=now()
  where owner_user_id=p_owner and workflow_id=p_workflow;
  return jsonb_build_object('ok',true,'archived',true);
end $$;

-- Physical deletion rechecks the same current-root closure under the same
-- exclusive lock. A historical source revision that no longer appears in any
-- current root's closure does not block deletion.
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

-- The helper and the API-facing projection are service-role-only, like the
-- existing reference helpers. Save/archive/delete keep the same ACLs.
revoke all on function workflow_private.workflow_reference_validate(uuid,text,integer,jsonb),
  workflow_private.workflow_reference_current_chains(uuid,text),
  public.workflow_v2_reference_impact(uuid,text),
  public.workflow_v2_archive(uuid,text,integer),
  public.workflow_v2_delete(uuid,text,integer)
from public,anon,authenticated;

grant execute on function workflow_private.workflow_reference_validate(uuid,text,integer,jsonb),
  workflow_private.workflow_reference_current_chains(uuid,text),
  public.workflow_v2_reference_impact(uuid,text),
  public.workflow_v2_archive(uuid,text,integer),
  public.workflow_v2_delete(uuid,text,integer)
to service_role;

notify pgrst, 'reload schema';

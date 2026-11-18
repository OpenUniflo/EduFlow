-- Independent Workflow references are fixed (workflowId, revision) edges in an
-- ordinary Workflow Definition. A reference node keeps the existing
-- `core.subgraph` shape, but replaces the embedded `config.graph` with
-- `config.workflowRef` + `config.environmentRef`; node `inputs`/`writes` remain
-- the input/output mappings. Embedded graphs stay readable and executable.
--
-- The Definition remains the source of truth. `workflow_reference_index` is a
-- derived, owner-scoped projection of every saved source revision. Saves and
-- deletions share a per-owner advisory lock: reference validation, revision
-- insertion and index replacement are one transaction, and physical deletion
-- rechecks current references inside that same transaction.

create table public.workflow_reference_index (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  workflow_id text not null,
  revision integer not null check (revision > 0),
  node_id text not null,
  graph_path text[] not null default '{}',
  target_workflow_id text not null,
  target_revision integer not null check (target_revision > 0),
  target_environment_ref text not null,
  created_at timestamptz not null default now(),
  primary key (owner_user_id, workflow_id, revision, graph_path, node_id),
  foreign key (owner_user_id, workflow_id, revision)
    references public.workflow_revisions(owner_user_id, workflow_id, revision) on delete cascade,
  foreign key (owner_user_id, target_workflow_id, target_revision)
    references public.workflow_revisions(owner_user_id, workflow_id, revision) on delete cascade,
  check (char_length(node_id) between 1 and 200),
  check (char_length(target_workflow_id) between 1 and 128),
  check (char_length(target_environment_ref) between 1 and 160)
);
create index workflow_reference_index_target_idx
  on public.workflow_reference_index(owner_user_id, target_workflow_id, target_revision);
create index workflow_reference_index_source_idx
  on public.workflow_reference_index(owner_user_id, workflow_id, revision);

alter table public.workflow_reference_index enable row level security;
revoke all on public.workflow_reference_index from public, anon, authenticated;
grant select on public.workflow_reference_index to authenticated;
grant all on public.workflow_reference_index to service_role;
create policy owner_read on public.workflow_reference_index
  for select to authenticated using ((select auth.uid()) = owner_user_id);

-- Shape validation for the reference form of `core.subgraph`. Embedded
-- `config.graph` and `config.workflowRef` are mutually exclusive. Reference
-- nodes must pin a positive exact revision and an explicit target environment.
-- Every reference node in an embedded graph is checked too.
create or replace function workflow_private.workflow_reference_shape_check(p_definition jsonb)
returns void language plpgsql immutable security invoker set search_path='' as $$
declare
  item record;
  config jsonb;
  reference jsonb;
  revision numeric;
begin
  if jsonb_typeof(p_definition) <> 'object' then
    raise exception 'INVALID_SUBGRAPH_REFERENCE';
  end if;
  for item in
    with recursive graphs(graph, depth) as (
      select p_definition, 0
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
    select node_row.node as node, g.depth as depth
    from graphs g
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(g.graph->'nodes')='array' then g.graph->'nodes' else '[]'::jsonb end
    ) as node_row(node)
    where node_row.node->>'type'='core.subgraph'
  loop
    config := item.node->'config';
    if jsonb_typeof(config) <> 'object' then
      raise exception 'INVALID_SUBGRAPH_REFERENCE';
    end if;
    if config ? 'graph' and config ? 'workflowRef' then
      raise exception 'INVALID_SUBGRAPH_REFERENCE';
    end if;
    if config ? 'workflowRef' then
      reference := config->'workflowRef';
      if jsonb_typeof(reference) <> 'object'
        or (select count(*) from jsonb_object_keys(reference)) <> 2
        or not reference ? 'workflowId'
        or not reference ? 'revision'
      then
        raise exception 'INVALID_SUBGRAPH_REFERENCE';
      end if;
      if jsonb_typeof(reference->'workflowId') <> 'string'
        or char_length(btrim(reference->>'workflowId')) not between 1 and 128
      then
        raise exception 'INVALID_SUBGRAPH_REFERENCE';
      end if;
      if jsonb_typeof(reference->'revision') <> 'number' then
        raise exception 'INVALID_SUBGRAPH_REFERENCE';
      end if;
      revision := (reference->>'revision')::numeric;
      if revision <> trunc(revision) or revision < 1 or revision > 2147483647 then
        raise exception 'INVALID_SUBGRAPH_REFERENCE';
      end if;
      if jsonb_typeof(config->'environmentRef') <> 'string'
        or char_length(btrim(config->>'environmentRef')) not between 1 and 160
      then
        raise exception 'INVALID_SUBGRAPH_REFERENCE';
      end if;
      if config ? 'stateMode' and config->>'stateMode' <> 'independent' then
        raise exception 'INVALID_SUBGRAPH_REFERENCE';
      end if;
      if config ? 'persistence' and config->>'persistence' <> 'per-invocation' then
        raise exception 'INVALID_SUBGRAPH_REFERENCE';
      end if;
      if exists(
        select 1 from jsonb_object_keys(config) as keys(name)
        where keys.name not in ('workflowRef','environmentRef','stateMode','persistence')
      ) then
        raise exception 'INVALID_SUBGRAPH_REFERENCE';
      end if;
    elsif not (config ? 'graph') then
      raise exception 'INVALID_SUBGRAPH_REFERENCE';
    end if;
    -- A subgraph at depth 8 would contain a ninth nested graph.
    if item.depth >= 8 and jsonb_typeof(config->'graph')='object' then
      raise exception 'WORKFLOW_REFERENCE_LIMIT';
    end if;
  end loop;
end $$;

-- Direct fixed-revision edges in a Definition, including reference nodes inside
-- legacy embedded graphs. `graph_path` lists embedded subgraph node ids only;
-- it is not a call chain into target Workflows.
create or replace function workflow_private.workflow_reference_edges(p_definition jsonb)
returns table(
  graph_path text[],
  node_id text,
  target_workflow_id text,
  target_revision integer,
  target_environment_ref text
) language sql immutable security invoker set search_path='' as $$
with recursive graphs(graph, graph_path, depth) as (
  select
    case when jsonb_typeof(p_definition)='object' then p_definition else '{}'::jsonb end,
    '{}'::text[],
    0
  union all
  select
    node_row.node->'config'->'graph',
    g.graph_path || (node_row.node->>'id'),
    g.depth+1
  from graphs g
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(g.graph->'nodes')='array' then g.graph->'nodes' else '[]'::jsonb end
  ) as node_row(node)
  where g.depth < 8
    and node_row.node->>'type'='core.subgraph'
    and jsonb_typeof(node_row.node->'config'->'graph')='object'
)
select
  g.graph_path,
  node_row.node->>'id',
  node_row.node->'config'->'workflowRef'->>'workflowId',
  case
    when node_row.node->'config'->'workflowRef'->>'revision' ~ '^[1-9][0-9]*$'
      and (node_row.node->'config'->'workflowRef'->>'revision')::numeric <= 2147483647
    then (node_row.node->'config'->'workflowRef'->>'revision')::integer
  end,
  node_row.node->'config'->>'environmentRef'
from graphs g
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(g.graph->'nodes')='array' then g.graph->'nodes' else '[]'::jsonb end
) as node_row(node)
where node_row.node->>'type'='core.subgraph'
  and jsonb_typeof(node_row.node->'config'->'workflowRef')='object';
$$;

-- Inputs/writes are the existing node mappings. These rows let the save-time
-- validator compare mapping keys with the pinned target's declared interface.
create or replace function workflow_private.workflow_reference_node_mappings(p_definition jsonb)
returns table(graph_path text[], node_id text, inputs jsonb, writes jsonb)
language sql immutable security invoker set search_path='' as $$
with recursive graphs(graph, graph_path, depth) as (
  select case when jsonb_typeof(p_definition)='object' then p_definition else '{}'::jsonb end, '{}'::text[], 0
  union all
  select node_row.node->'config'->'graph', g.graph_path || (node_row.node->>'id'), g.depth+1
  from graphs g
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(g.graph->'nodes')='array' then g.graph->'nodes' else '[]'::jsonb end
  ) as node_row(node)
  where g.depth < 8
    and node_row.node->>'type'='core.subgraph'
    and jsonb_typeof(node_row.node->'config'->'graph')='object'
)
select
  g.graph_path,
  node_row.node->>'id',
  case when jsonb_typeof(node_row.node->'inputs')='object' then node_row.node->'inputs' else '{}'::jsonb end,
  case when jsonb_typeof(node_row.node->'writes')='object' then node_row.node->'writes' else '{}'::jsonb end
from graphs g
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(g.graph->'nodes')='array' then g.graph->'nodes' else '[]'::jsonb end
) as node_row(node)
where node_row.node->>'type'='core.subgraph'
  and jsonb_typeof(node_row.node->'config'->'workflowRef')='object';
$$;

-- Key-level mapping compatibility for the pinned target revision. Type checking
-- remains the execution boundary; execution is rejected for references in this
-- release, so a save never implies an unvalidated run contract.
create or replace function workflow_private.workflow_reference_mapping_check(
  p_target_definition jsonb,
  p_inputs jsonb,
  p_writes jsonb
) returns void language plpgsql immutable security invoker set search_path='' as $$
declare
  schema jsonb;
  required_field text;
  supplied_field text;
begin
  if jsonb_typeof(p_inputs) <> 'object' or jsonb_typeof(p_writes) <> 'object' then
    raise exception 'WORKFLOW_REFERENCE_MAPPING';
  end if;
  schema := p_target_definition->'inputSchema';
  if jsonb_typeof(schema)='object' then
    if jsonb_typeof(schema->'required')='array' then
      for required_field in select jsonb_array_elements_text(schema->'required') loop
        if not (p_inputs ? required_field) then raise exception 'WORKFLOW_REFERENCE_MAPPING'; end if;
      end loop;
    end if;
    if schema->'additionalProperties'='false'::jsonb then
      for supplied_field in select jsonb_object_keys(p_inputs) loop
        if not (coalesce(schema->'properties','{}'::jsonb) ? supplied_field) then raise exception 'WORKFLOW_REFERENCE_MAPPING'; end if;
      end loop;
    end if;
  end if;
  schema := p_target_definition->'outputSchema';
  if jsonb_typeof(schema)='object' and schema->'additionalProperties'='false'::jsonb then
    for supplied_field in select jsonb_object_keys(p_writes) loop
      if not (coalesce(schema->'properties','{}'::jsonb) ? supplied_field) then raise exception 'WORKFLOW_REFERENCE_MAPPING'; end if;
    end loop;
  end if;
end $$;

-- Replace the derived rows for one saved source revision. Called in the same
-- transaction as the immutable revision insert.
create or replace function workflow_private.workflow_reference_reindex(
  p_owner uuid,
  p_workflow text,
  p_revision integer,
  p_definition jsonb
) returns integer language plpgsql security definer set search_path='' as $$
declare inserted integer;
begin
  delete from public.workflow_reference_index
  where owner_user_id=p_owner and workflow_id=p_workflow and revision=p_revision;
  insert into public.workflow_reference_index(
    owner_user_id, workflow_id, revision, node_id, graph_path,
    target_workflow_id, target_revision, target_environment_ref
  )
  select
    p_owner, p_workflow, p_revision, edge.node_id, edge.graph_path,
    edge.target_workflow_id, edge.target_revision, edge.target_environment_ref
  from workflow_private.workflow_reference_edges(p_definition) edge;
  get diagnostics inserted = row_count;
  return inserted;
end $$;

-- Authoritative save-time check. All targets are owner-local exact revisions;
-- cross-owner and missing revisions deliberately share one unavailable error so
-- the response cannot be used to probe another owner's Workflow identity.
-- Transitive fixed-revision chains are bounded and cycle-checked.
create or replace function workflow_private.workflow_reference_validate(
  p_owner uuid,
  p_workflow text,
  p_revision integer,
  p_definition jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare
  reference_edge record;
  direct_count integer;
  direct_targets integer;
  target_archived boolean;
  target_definition jsonb;
  cycle_hit boolean;
  depth_hit boolean;
  max_depth integer;
  walk_count integer;
  unique_targets integer;
  root_identity text;
begin
  if p_revision is null or p_revision < 1 then
    raise exception 'INVALID_SUBGRAPH_REFERENCE';
  end if;
  perform workflow_private.workflow_reference_shape_check(p_definition);

  select count(*), count(distinct target_workflow_id)
  into direct_count, direct_targets
  from workflow_private.workflow_reference_edges(p_definition);
  if direct_count > 64 then
    raise exception 'WORKFLOW_REFERENCE_LIMIT';
  end if;

  for reference_edge in
    select edge.*, mapping.inputs, mapping.writes
    from workflow_private.workflow_reference_edges(p_definition) edge
    left join workflow_private.workflow_reference_node_mappings(p_definition) mapping
      on mapping.graph_path=edge.graph_path and mapping.node_id=edge.node_id
  loop
    if reference_edge.node_id is null or btrim(reference_edge.node_id)=''
      or reference_edge.target_workflow_id is null or btrim(reference_edge.target_workflow_id)=''
      or reference_edge.target_revision is null or reference_edge.target_revision < 1
      or reference_edge.target_environment_ref is null or btrim(reference_edge.target_environment_ref)=''
    then
      raise exception 'INVALID_SUBGRAPH_REFERENCE';
    end if;
    select definition.archived into target_archived
    from public.workflow_v2_definitions definition
    where definition.owner_user_id=p_owner
      and definition.workflow_id=reference_edge.target_workflow_id;
    if not found then
      raise exception 'WORKFLOW_REFERENCE_UNAVAILABLE';
    end if;
    if target_archived then
      raise exception 'WORKFLOW_REFERENCE_ARCHIVED';
    end if;
    select revision.definition into target_definition
    from public.workflow_revisions revision
    where revision.owner_user_id=p_owner
      and revision.workflow_id=reference_edge.target_workflow_id
      and revision.revision=reference_edge.target_revision;
    if not found then
      raise exception 'WORKFLOW_REFERENCE_UNAVAILABLE';
    end if;
    perform workflow_private.workflow_reference_mapping_check(
      target_definition,
      coalesce(reference_edge.inputs,'{}'::jsonb),
      coalesce(reference_edge.writes,'{}'::jsonb)
    );
  end loop;

  root_identity := p_workflow || ':' || p_revision::text;
  with recursive walk(workflow_id, revision, path, depth, cycle, outgoing) as (
    select
      edge.target_workflow_id,
      edge.target_revision,
      array[root_identity, edge.target_workflow_id || ':' || edge.target_revision::text],
      1,
      edge.target_workflow_id || ':' || edge.target_revision::text = root_identity,
      (select count(*) from workflow_private.workflow_reference_edges(target.definition) ref
       where target.owner_user_id=p_owner
         and target.workflow_id=edge.target_workflow_id
         and target.revision=edge.target_revision)
    from workflow_private.workflow_reference_edges(p_definition) edge
    left join public.workflow_revisions target
      on target.owner_user_id=p_owner
     and target.workflow_id=edge.target_workflow_id
     and target.revision=edge.target_revision
    union all
    select
      edge.target_workflow_id,
      edge.target_revision,
      walk.path || (edge.target_workflow_id || ':' || edge.target_revision::text),
      walk.depth+1,
      (edge.target_workflow_id || ':' || edge.target_revision::text) = any(walk.path),
      (select count(*) from workflow_private.workflow_reference_edges(target.definition) ref
       where target.owner_user_id=p_owner
         and target.workflow_id=edge.target_workflow_id
         and target.revision=edge.target_revision)
    from walk
    join public.workflow_revisions source
      on source.owner_user_id=p_owner
     and source.workflow_id=walk.workflow_id
     and source.revision=walk.revision
    cross join lateral workflow_private.workflow_reference_edges(source.definition) edge
    left join public.workflow_revisions target
      on target.owner_user_id=p_owner
     and target.workflow_id=edge.target_workflow_id
     and target.revision=edge.target_revision
    where walk.depth < 8
      and not walk.cycle
  )
  select
    coalesce(bool_or(cycle), false),
    coalesce(bool_or(depth >= 8 and outgoing > 0), false),
    coalesce(max(depth), 0),
    count(*),
    count(distinct workflow_id || ':' || revision::text)
  into cycle_hit, depth_hit, max_depth, walk_count, unique_targets
  from walk;

  if cycle_hit then
    raise exception 'WORKFLOW_REFERENCE_CYCLE';
  end if;
  if depth_hit or max_depth > 8 or unique_targets > 32 or walk_count > 256 then
    raise exception 'WORKFLOW_REFERENCE_LIMIT';
  end if;
end $$;

-- The revision insert and the derived rows commit together. Direct writes are
-- limited to service_role; every product path uses this RPC.
drop function if exists public.workflow_v2_save(uuid,text,integer,integer,jsonb,jsonb,text,jsonb,text);
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
  perform workflow_private.p4_validate_definition_connections(p_owner,p_environment,p_definition);
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

-- Logical deletion is protected too: archiving a referenced target would leave
-- current references pointing at a Workflow that can no longer be opened.
create or replace function public.workflow_v2_archive(p_owner uuid,p_workflow text,p_base integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare head public.workflow_v2_definitions;
begin
  perform pg_advisory_xact_lock(hashtextextended('workflow:reference-lifecycle:'||p_owner::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_workflow,0));
  select * into head from public.workflow_v2_definitions
  where owner_user_id=p_owner and workflow_id=p_workflow for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if head.current_revision<>p_base then raise exception 'REVISION_CONFLICT'; end if;
  if not head.archived and exists(
    select from public.workflow_reference_index reference
    join public.workflow_v2_definitions source
      on source.owner_user_id=reference.owner_user_id
     and source.workflow_id=reference.workflow_id
     and source.current_revision=reference.revision
     and not source.archived
    where reference.owner_user_id=p_owner
      and reference.target_workflow_id=p_workflow
  ) then
    raise exception 'WORKFLOW_REFERENCED';
  end if;
  update public.workflow_v2_definitions
  set archived=true,updated_at=now()
  where owner_user_id=p_owner and workflow_id=p_workflow;
  return jsonb_build_object('ok',true,'archived',true);
end $$;

-- Physical deletion rechecks current references under the same exclusive lock
-- that definition saves take shared. Historical source revisions do not block
-- deletion, and their immutable Definitions stay readable afterwards.
create or replace function public.workflow_v2_delete(p_owner uuid,p_workflow text,p_base integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare h public.workflow_v2_definitions; j record; runs integer; versions integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('workflow:reference-lifecycle:'||p_owner::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
  if exists(select from public.workflow_execution_threads where owner_user_id=p_owner and workflow_id=p_workflow and status in ('active','waiting')) then raise exception 'WORKFLOW_BUSY'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_workflow,0));
  select * into h from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=p_workflow for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if h.current_revision<>p_base then raise exception 'REVISION_CONFLICT'; end if;
  if exists(
    select from public.workflow_reference_index reference
    join public.workflow_v2_definitions source
      on source.owner_user_id=reference.owner_user_id
     and source.workflow_id=reference.workflow_id
     and source.current_revision=reference.revision
     and not source.archived
    where reference.owner_user_id=p_owner
      and reference.target_workflow_id=p_workflow
  ) then
    raise exception 'WORKFLOW_REFERENCED';
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

revoke all on function workflow_private.workflow_reference_shape_check(jsonb),
  workflow_private.workflow_reference_edges(jsonb),
  workflow_private.workflow_reference_node_mappings(jsonb),
  workflow_private.workflow_reference_mapping_check(jsonb,jsonb,jsonb),
  workflow_private.workflow_reference_reindex(uuid,text,integer,jsonb),
  workflow_private.workflow_reference_validate(uuid,text,integer,jsonb),
  public.workflow_v2_save(uuid,text,integer,integer,jsonb,jsonb,text,jsonb,text),
  public.workflow_v2_archive(uuid,text,integer),
  public.workflow_v2_delete(uuid,text,integer)
from public,anon,authenticated;

grant execute on function workflow_private.workflow_reference_shape_check(jsonb),
  workflow_private.workflow_reference_edges(jsonb),
  workflow_private.workflow_reference_node_mappings(jsonb),
  workflow_private.workflow_reference_mapping_check(jsonb,jsonb,jsonb),
  workflow_private.workflow_reference_reindex(uuid,text,integer,jsonb),
  workflow_private.workflow_reference_validate(uuid,text,integer,jsonb),
  public.workflow_v2_archive(uuid,text,integer)
to service_role;
grant execute on function public.workflow_v2_save(uuid,text,integer,integer,jsonb,jsonb,text,jsonb,text)
to service_role;
grant execute on function public.workflow_v2_delete(uuid,text,integer)
to service_role;

notify pgrst, 'reload schema';

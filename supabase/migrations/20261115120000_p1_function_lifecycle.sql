-- Registered functions are owner-scoped immutable versions. Permanent deletion
-- is physical only when no current Workflow still pins the logical function
-- (including nested subgraphs and error handlers) and no unfinished execution
-- is still using the revision that references it.
--
-- Function references are ordinary owner-local names, not `p4:` connection
-- keys, so they need a separate scan. This migration deliberately does not
-- change the existing connection lifecycle functions.

create or replace function workflow_private.p4_definition_function_uses(p_definition jsonb)
returns table(ref text, usage text) language sql security definer set search_path='' as $$
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
select distinct r.ref, r.usage
from graphs g
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(g.graph->'nodes')='array' then g.graph->'nodes' else '[]'::jsonb end
) as node_row(node)
cross join lateral (
  select node_row.node->'config'->>'functionRef' as ref, 'functionRef'::text as usage
  where node_row.node->>'type'='core.function'
    and node_row.node->'config'->>'implementation'='registered'
    and nullif(node_row.node->'config'->>'functionRef','') is not null
  union all
  select node_row.node->'config'->'authoring'->'errorHandler'->>'functionRef' as ref, 'errorHandler'::text as usage
  where jsonb_typeof(node_row.node->'config'->'authoring'->'errorHandler')='object'
    and nullif(node_row.node->'config'->'authoring'->'errorHandler'->>'functionRef','') is not null
) r;
$$;

create or replace function workflow_private.p4_function_reference_count(p_owner uuid,p_ref text)
returns integer language sql security definer set search_path='' as $$
select count(*)::integer
from public.workflow_v2_definitions d
join public.workflow_revisions r
  on r.owner_user_id=d.owner_user_id
 and r.workflow_id=d.workflow_id
 and r.revision=d.current_revision
cross join lateral workflow_private.p4_definition_function_uses(r.definition) uses
where d.owner_user_id=p_owner
  and not d.archived
  and uses.ref=p_ref;
$$;

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
  -- Serialize with definition saves and connection lifecycle operations so a
  -- stale browser cannot delete a function behind a newly saved binding.
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
  ) then raise exception 'FUNCTION_BUSY'; end if;

  delete from workflow_private.p4_catalog
  where owner_user_id=p_owner and environment_ref=p_environment
    and kind='function' and ref=p_ref;
  get diagnostics deleted = row_count;

  return jsonb_build_object('ref',p_ref,'deleted',deleted,'version',latest);
end $$;

revoke all on function workflow_private.p4_definition_function_uses(jsonb),
  workflow_private.p4_function_reference_count(uuid,text),
  workflow_private.p4_function_delete(uuid,text,text,integer)
from public,anon,authenticated;

grant execute on function workflow_private.p4_definition_function_uses(jsonb),
  workflow_private.p4_function_reference_count(uuid,text),
  workflow_private.p4_function_delete(uuid,text,text,integer)
to workflow_worker;

-- Provider connections keep a stable reference while their display name and
-- enabled model list evolve through immutable versions. Deletion is physical
-- only after a transaction-scoped reference scan confirms that no current
-- Workflow (including nested subgraphs) still pins the logical connection.
--
-- Workflow definition saves and connection deletion share one advisory lock:
-- a save that began earlier finishes before the delete scan, and a save that
-- arrives during deletion waits. The reference scan and catalog cleanup then
-- run in the same transaction, so the API preflight cannot create a TOCTOU
-- window. The catalog table lock also serializes publish/restore against the
-- expected-version check.

create or replace function workflow_private.p4_definition_connection_uses(p_definition jsonb)
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
  select node_row.node->'config'->>'providerRef' as ref, 'providerRef'::text as usage
  where node_row.node->>'type'='core.llm'
  union all
  select node_row.node->'config'->>'toolRef' as ref, 'toolRef'::text as usage
  where node_row.node->>'type'='core.tool'
  union all
  select value as ref, 'allowedToolRefs'::text as usage
  from jsonb_array_elements_text(
    case
      when node_row.node->>'type' in ('core.llm','core.tool_dispatch')
        and jsonb_typeof(node_row.node->'config'->'allowedToolRefs')='array'
      then node_row.node->'config'->'allowedToolRefs'
      else '[]'::jsonb
    end
  )
) r
where r.ref like 'p4:%';
$$;

create or replace function workflow_private.p4_validate_definition_connections(
  p_owner uuid,
  p_environment text,
  p_definition jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare
  use_row record;
  parts text[];
  logical_ref text;
  connection_version integer;
  target_environment text := nullif(p_environment,'');
begin
  for use_row in select * from workflow_private.p4_definition_connection_uses(p_definition) loop
    parts:=string_to_array(use_row.ref,':');
    if cardinality(parts)<>4
      or parts[1]<>'p4'
      or parts[2]<>p_owner::text
      or parts[3]=''
      or parts[4] !~ '^[1-9][0-9]*$'
    then
      raise exception 'INVALID_CONNECTION_REFERENCE';
    end if;
    logical_ref:=parts[3];
    connection_version:=parts[4]::integer;
    -- Resolve the exact owner/environment/version. A function version with a
    -- coincidental p4 ref is not a model/tool connection and must not satisfy it.
    if not exists(
      select from workflow_private.p4_catalog
      where owner_user_id=p_owner
        and kind='connection'
        and ref=logical_ref
        and version=connection_version
        and (target_environment is null or environment_ref=target_environment)
    ) then
      raise exception 'CONNECTION_UNAVAILABLE';
    end if;
  end loop;
end $$;

create or replace function workflow_private.p4_connection_reference_count(p_owner uuid,p_ref text)
returns integer language sql security definer set search_path='' as $$
select count(*)::integer
from public.workflow_v2_definitions d
join public.workflow_revisions r
  on r.owner_user_id=d.owner_user_id
 and r.workflow_id=d.workflow_id
 and r.revision=d.current_revision
cross join lateral workflow_private.p4_definition_connection_uses(r.definition) uses
where d.owner_user_id=p_owner
  and not d.archived
  and split_part(uses.ref, ':', 3)=p_ref;
$$;

-- Retire the earlier helper that also returned platform refs. Keeping it would
-- preserve the namespace bug for any later caller.
drop function if exists workflow_private.p4_definition_connection_refs(jsonb);

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
  -- Shared by every definition save. The exclusive side waits for in-flight
  -- saves and blocks new ones until the reference scan and delete commit.
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

  -- Queued/running/waiting executions froze an earlier revision and would fail
  -- at their next guard when the catalog revision changes. Wait for them to end.
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

  -- A renamed/restored version may share the same Vault secret. Delete only
  -- secrets that no remaining catalog row (for any owner) still references.
  foreach secret_ref in array coalesce(secret_refs, array[]::text[]) loop
    if secret_ref ~ '^vault:[0-9a-f-]{36}$'
      and not exists(select from workflow_private.p4_catalog where content->>'secretRef'=secret_ref)
    then
      delete from vault.secrets where id=substring(secret_ref from 7)::uuid;
    end if;
  end loop;

  return jsonb_build_object('ref',p_ref,'deleted',deleted,'version',latest,'credentialsDeleted',coalesce(array_length(secret_refs,1),0));
end $$;

-- Connection versions (publish, rename, restore) take the shared lifecycle
-- lock and validate that they append to the current newest version. This
-- prevents a stale browser read from recreating a connection after deletion.
create or replace function workflow_private.p4_catalog_save(p_owner uuid,p_environment text,p_kind text,p_ref text,p_version integer,p_content jsonb,p_disable boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior workflow_private.p4_catalog; begin
 if p_kind='connection' and not p_disable then
  perform pg_advisory_xact_lock_shared(hashtextextended('workflow:p4:connection-lifecycle',0));
  if exists(select from workflow_private.p4_catalog where owner_user_id=p_owner and environment_ref=p_environment and kind=p_kind and ref=p_ref and version=p_version) then
   raise exception 'IMMUTABLE_VERSION';
  end if;
  if p_version<>coalesce((select max(version)+1 from workflow_private.p4_catalog where owner_user_id=p_owner and environment_ref=p_environment and kind=p_kind and ref=p_ref),1) then
   raise exception 'CONNECTION_VERSION_CONFLICT';
  end if;
 end if;
 select * into prior from workflow_private.p4_catalog where owner_user_id=p_owner and environment_ref=p_environment and kind=p_kind and ref=p_ref and version=p_version for update;
 if p_disable then
  if not found then raise exception 'CATALOG_NOT_FOUND'; end if;
  update workflow_private.p4_catalog set disabled=true where owner_user_id=p_owner and environment_ref=p_environment and kind=p_kind and ref=p_ref and version=p_version;
 elsif found then
  if prior.content<>p_content then raise exception 'IMMUTABLE_VERSION'; end if;
 else
  insert into workflow_private.p4_catalog(owner_user_id,environment_ref,kind,ref,version,content) values(p_owner,p_environment,p_kind,p_ref,p_version,p_content);
 end if;
 return jsonb_build_object('ref',p_ref,'version',p_version,'disabled',p_disable);
end $$;

-- Every definition save must acquire the shared side before it reads the
-- current head. The connection validator runs after that lock: a save that
-- waited behind a completed delete sees the removed catalog rows and fails
-- instead of writing a dangling p4 reference.
drop function if exists public.workflow_v2_save(uuid,text,integer,integer,jsonb,jsonb,text,jsonb);
create or replace function public.workflow_v2_save(p_owner uuid,p_workflow text,p_base integer,p_editor_base integer,p_definition jsonb,p_editor jsonb,p_definition_hash text,p_provenance jsonb default null,p_environment text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare head public.workflow_v2_definitions; r integer; er integer; def jsonb; ed jsonb;
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('workflow:p4:connection-lifecycle',0));
 perform workflow_private.p4_validate_definition_connections(p_owner,p_environment,p_definition);
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_workflow,0));
 select * into head from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=p_workflow for update;
 if not found then
  if p_base is not null or p_editor_base is not null then raise exception 'REVISION_CONFLICT'; end if;
  insert into public.workflow_v2_definitions(owner_user_id,workflow_id,provenance) values(p_owner,p_workflow,p_provenance);
  r:=1; er:=1;
 else
  if head.archived then raise exception 'WORKFLOW_ARCHIVED'; end if;
  if p_base is distinct from head.current_revision or p_editor_base is distinct from head.editor_revision then raise exception 'REVISION_CONFLICT'; end if;
  r:=head.current_revision+1; er:=head.editor_revision+1;
 end if;
 def:=jsonb_set(jsonb_set(p_definition,'{revision}',to_jsonb(r)),'{workflowId}',to_jsonb(p_workflow));
 ed:=jsonb_set(jsonb_set(jsonb_set(p_editor,'{definitionRevision}',to_jsonb(r)),'{editorRevision}',to_jsonb(er)),'{workflowId}',to_jsonb(p_workflow));
 insert into public.workflow_revisions(owner_user_id,workflow_id,revision,definition,definition_hash,editor_snapshot) values(p_owner,p_workflow,r,def,p_definition_hash,ed);
 insert into public.workflow_editor_documents values(p_owner,p_workflow,er,r,ed) on conflict(owner_user_id,workflow_id) do update set editor_revision=er,definition_revision=r,document=ed;
 update public.workflow_v2_definitions set current_revision=r,editor_revision=er,updated_at=now() where owner_user_id=p_owner and workflow_id=p_workflow;
 return jsonb_build_object('workflowId',p_workflow,'revision',r,'editorRevision',er);
end $$;

-- A new Run must respect the same catalog boundary. The trigger acquires the
-- shared lifecycle lock, then validates the frozen revision against the
-- selected runtime environment. This closes the delete-vs-enqueue window.
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
  perform workflow_private.p4_validate_definition_connections(new.owner_user_id,new.environment_ref,definition);
  return new;
end $$;
drop trigger if exists workflow_live_runs_connection_guard on public.workflow_live_runs;
create trigger workflow_live_runs_connection_guard
before insert on public.workflow_live_runs
for each row execute function workflow_private.workflow_live_run_connection_guard();

revoke all on function workflow_private.p4_definition_connection_uses(jsonb),
  workflow_private.p4_validate_definition_connections(uuid,text,jsonb),
  workflow_private.workflow_live_run_connection_guard(),
  workflow_private.p4_connection_reference_count(uuid,text),
  workflow_private.p4_connection_delete(uuid,text,text,integer),
  workflow_private.p4_catalog_save(uuid,text,text,text,integer,jsonb,boolean),
  public.workflow_v2_save(uuid,text,integer,integer,jsonb,jsonb,text,jsonb,text)
from public,anon,authenticated;
grant execute on function workflow_private.p4_definition_connection_uses(jsonb),
  workflow_private.p4_validate_definition_connections(uuid,text,jsonb),
  workflow_private.workflow_live_run_connection_guard()
to workflow_worker,service_role;
grant execute on function workflow_private.p4_connection_reference_count(uuid,text),
  workflow_private.p4_connection_delete(uuid,text,text,integer),
  workflow_private.p4_catalog_save(uuid,text,text,text,integer,jsonb,boolean)
to workflow_worker;
grant execute on function public.workflow_v2_save(uuid,text,integer,integer,jsonb,jsonb,text,jsonb,text)
to service_role;

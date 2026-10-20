-- Guard all server migration sources, even when editors omit updated_at.
alter table public.workflow_migration_reports add column source_guard text;
create function workflow_private.migration_source_guard(p_owner uuid,p_report jsonb)
returns text language plpgsql security invoker set search_path='' as $$
declare original jsonb; changed timestamptz; storage text; begin
 storage:=coalesce(p_report->>'sourceStorage',case when p_report->'provenance'->>'sourceTemplateId' is not null then 'template' else 'custom' end);
 if storage='template' then
  if exists(select from public.user_workflow_definitions where owner_user_id=p_owner and id=p_report->>'sourceWorkflowId') then raise exception 'SOURCE_CHANGED'; end if;
  select definition,updated_at into original,changed from public.workflow_templates where id=p_report->>'sourceWorkflowId' for share;
 elsif storage='custom' then
  select definition,updated_at into original,changed from public.user_workflow_definitions where owner_user_id=p_owner and id=p_report->>'sourceWorkflowId' for share;
 else raise exception 'SOURCE_CHANGED'; end if;
 if not found then raise exception 'SOURCE_CHANGED'; end if;
 return encode(extensions.digest(original::text||changed::text,'sha256'),'hex');
end $$;
revoke all on function workflow_private.migration_source_guard(uuid,jsonb) from public,anon,authenticated;
grant execute on function workflow_private.migration_source_guard(uuid,jsonb) to service_role;

create function public.workflow_v2_read_migration_source(p_owner uuid,p_workflow text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare original jsonb; changed timestamptz; storage text; begin
 select definition,updated_at into original,changed from public.user_workflow_definitions where owner_user_id=p_owner and id=p_workflow;
 if found then storage:='custom'; else
  select definition,updated_at into original,changed from public.workflow_templates where id=p_workflow;
  if not found then raise exception 'NOT_FOUND'; end if;
  storage:='template';
 end if;
 return jsonb_build_object('definition',original,'updatedAt',changed,'sourceStorage',storage,'sourceGuard',encode(extensions.digest(original::text||changed::text,'sha256'),'hex'));
end $$;
revoke all on function public.workflow_v2_read_migration_source(uuid,text) from public,anon,authenticated;
grant execute on function public.workflow_v2_read_migration_source(uuid,text) to service_role;

create or replace function public.workflow_v2_preview_migration(p_owner uuid,p_workflow text,p_digest text,p_report jsonb,p_source jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare existing public.workflow_migration_reports; current_guard text; begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||coalesce(p_report->>'sourceKind','server')||':'||(p_report->>'sourceWorkflowId')||':'||p_digest,0));
 if p_report->>'sourceKind'='server' then
  current_guard:=workflow_private.migration_source_guard(p_owner,p_report);
  if current_guard is distinct from p_report->>'sourceRowGuard' then raise exception 'SOURCE_CHANGED'; end if;
 end if;
 select * into existing from public.workflow_migration_reports where owner_user_id=p_owner and source_digest=p_digest and migration_version=1
 and report->>'sourceKind'=p_report->>'sourceKind' and report->>'sourceWorkflowId'=p_report->>'sourceWorkflowId'
 order by applied_revision desc nulls last,migration_id limit 1;
 if found then
  -- An explicit fresh preview can upgrade an unguarded pre-migration report.
  if existing.applied_revision is null and existing.source_guard is distinct from current_guard and p_report->>'sourceKind'='server' then
   current_guard:=workflow_private.migration_source_guard(p_owner,p_report);
   update public.workflow_migration_reports set source_guard=current_guard,report=report||jsonb_build_object('sourceStorage',p_report->>'sourceStorage','sourceUpdatedAt',p_report->>'sourceUpdatedAt','sourceRowGuard',current_guard) where migration_id=existing.migration_id returning * into existing;
  end if;
  return to_jsonb(existing);
 end if;
 current_guard:=case when p_report->>'sourceKind'='server' then workflow_private.migration_source_guard(p_owner,p_report) else null end;
 insert into public.workflow_migration_reports(owner_user_id,workflow_id,source_digest,report,source_snapshot,source_guard)
 values(p_owner,p_workflow,p_digest,p_report,p_source,current_guard) returning * into existing;
 return to_jsonb(existing);
end $$;

create or replace function public.workflow_v2_apply_migration(p_owner uuid,p_migration uuid,p_digest text,p_definition jsonb,p_editor jsonb,p_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.workflow_migration_reports; saved jsonb; begin
 select * into m from public.workflow_migration_reports where migration_id=p_migration and owner_user_id=p_owner for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if m.source_digest<>p_digest then raise exception 'SOURCE_CHANGED'; end if;
 if m.applied_revision is not null then return coalesce(m.applied_result,(select jsonb_build_object('workflowId',m.workflow_id,'revision',m.applied_revision,'editorRevision',(editor_snapshot->>'editorRevision')::integer) from public.workflow_revisions where owner_user_id=p_owner and workflow_id=m.workflow_id and revision=m.applied_revision)); end if;
 if m.report->>'sourceKind'='server' then
  if m.source_guard is null or m.source_guard is distinct from workflow_private.migration_source_guard(p_owner,m.report) then raise exception 'SOURCE_CHANGED'; end if;
 end if;
 saved:=public.workflow_v2_save(p_owner,m.workflow_id,null,null,p_definition,p_editor,p_hash,m.report->'provenance');
 update public.workflow_migration_reports set applied_revision=(saved->>'revision')::integer,applied_result=saved where migration_id=p_migration;
 return saved;
end $$;

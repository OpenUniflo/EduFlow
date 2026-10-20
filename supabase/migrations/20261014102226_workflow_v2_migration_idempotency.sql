-- Migration previews/applications are owner-scoped and transactionally idempotent.
alter table public.workflow_migration_reports add column applied_result jsonb;
create function public.workflow_v2_preview_migration(p_owner uuid,p_workflow text,p_digest text,p_report jsonb,p_source jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare existing public.workflow_migration_reports; begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||coalesce(p_report->>'sourceKind','server')||':'||(p_report->>'sourceWorkflowId')||':'||p_digest,0));
 select * into existing from public.workflow_migration_reports where owner_user_id=p_owner and source_digest=p_digest and migration_version=1
 and report->>'sourceKind'=p_report->>'sourceKind' and report->>'sourceWorkflowId'=p_report->>'sourceWorkflowId'
 order by applied_revision desc nulls last,migration_id limit 1;
 if found then return to_jsonb(existing); end if;
 insert into public.workflow_migration_reports(owner_user_id,workflow_id,source_digest,report,source_snapshot)
 values(p_owner,p_workflow,p_digest,p_report,p_source) returning * into existing;
 return to_jsonb(existing);
end $$;
revoke all on function public.workflow_v2_preview_migration(uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.workflow_v2_preview_migration(uuid,text,text,jsonb,jsonb) to service_role;

create or replace function public.workflow_v2_apply_migration(p_owner uuid,p_migration uuid,p_digest text,p_definition jsonb,p_editor jsonb,p_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.workflow_migration_reports; saved jsonb; begin
 select * into m from public.workflow_migration_reports where migration_id=p_migration and owner_user_id=p_owner for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if m.source_digest<>p_digest then raise exception 'SOURCE_CHANGED'; end if;
 if m.applied_revision is not null then return coalesce(m.applied_result,(select jsonb_build_object('workflowId',m.workflow_id,'revision',m.applied_revision,'editorRevision',(editor_snapshot->>'editorRevision')::integer) from public.workflow_revisions where owner_user_id=p_owner and workflow_id=m.workflow_id and revision=m.applied_revision)); end if;
 if m.report->>'sourceKind'='server' and m.report->>'sourceUpdatedAt' is not null then
  if not exists(select from public.user_workflow_definitions where owner_user_id=p_owner and id=m.report->>'sourceWorkflowId' and updated_at=(m.report->>'sourceUpdatedAt')::timestamptz) then raise exception 'SOURCE_CHANGED'; end if;
 end if;
 saved:=public.workflow_v2_save(p_owner,m.workflow_id,null,null,p_definition,p_editor,p_hash,m.report->'provenance');
 update public.workflow_migration_reports set applied_revision=(saved->>'revision')::integer,applied_result=saved where migration_id=p_migration;
 return saved;
end $$;

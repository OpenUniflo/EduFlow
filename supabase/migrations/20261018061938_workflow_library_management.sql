-- Owner-scoped library projection. Filtering, counts and page clamping share one snapshot.
create or replace function public.workflow_v2_library_page(p_owner uuid,p_search text default '',p_scope text default 'all',p_sort text default 'updated',p_page integer default 1,p_size integer default 12)
returns jsonb language sql stable security invoker set search_path='' as $$
 with filtered as materialized (
  select h.workflow_id,h.current_revision,h.updated_at,r.definition,t.id as template_id,t.name as template_name
  from public.workflow_v2_definitions h
  join public.workflow_revisions r on r.owner_user_id=h.owner_user_id and r.workflow_id=h.workflow_id and r.revision=h.current_revision
  left join public.workflow_templates t on t.id=coalesce(h.provenance->>'sourceTemplateId',h.workflow_id) and t.definition->>'schemaVersion'='2.0'
  where h.owner_user_id=p_owner and not h.archived
   and position(lower(coalesce(p_search,'')) in lower(coalesce(r.definition->>'name','')||' '||coalesce(r.definition->>'description','')))>0
   and (p_scope='all' or p_scope='course' and t.id is not null or p_scope='personal' and t.id is null)
 ), settings as (
  select count(*) as total,greatest(1,least(coalesce(p_size,12),48)) as size from filtered
 ), bounds as (
  select *,greatest(1,least(coalesce(p_page,1),greatest(1,ceil(total::numeric/size)::integer))) as page from settings
 ), numbered as (
  select *,row_number() over(order by case when p_sort='name' then lower(definition->>'name') end asc,
   case when p_sort<>'name' then updated_at end desc,workflow_id asc) as n from filtered
 ), slice as (
  select jsonb_build_object('workflowId',workflow_id,'revision',current_revision,'name',definition->>'name','description',coalesce(definition->>'description',''),
   'updatedAt',updated_at,'nodeCount',jsonb_array_length(definition->'nodes'),'sourceTemplateId',template_id,'sourceName',template_name) as item,n
  from numbered,bounds where n>(page-1)*size and n<=page*size
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(item order by n) from slice),'[]'::jsonb),'total',total,'page',page,'pageSize',size) from bounds;
$$;
revoke all on function public.workflow_v2_library_page(uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.workflow_v2_library_page(uuid,text,text,text,integer,integer) to service_role;

-- Permanent deletion affects only this owner's editable workflow and debugging history.
-- Independently referenced evidence receipts and all Course/Assignment data remain intact.
create or replace function public.workflow_v2_delete(p_owner uuid,p_workflow text,p_base integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare h public.workflow_v2_definitions; j record; runs integer; versions integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 if exists(select 1 from public.workflow_live_runs where owner_user_id=p_owner and workflow_id=p_workflow and status in ('queued','running')) then raise exception 'WORKFLOW_BUSY'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_workflow,0));
 select * into h from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=p_workflow for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if h.current_revision<>p_base then raise exception 'REVISION_CONFLICT'; end if;
 for j in select jobs.queue_msg_id from public.workflow_run_jobs jobs join public.workflow_live_runs r using(run_id) where r.owner_user_id=p_owner and r.workflow_id=p_workflow loop
  perform pgmq.delete('workflow_v2',j.queue_msg_id);
 end loop;
 delete from public.workflow_idempotency where owner_user_id=p_owner and workflow_id=p_workflow;
 delete from public.workflow_run_tombstones where owner_user_id=p_owner and workflow_id=p_workflow;
 delete from public.workflow_live_runs where owner_user_id=p_owner and workflow_id=p_workflow;
 get diagnostics runs=row_count;
 delete from public.workflow_editor_documents where owner_user_id=p_owner and workflow_id=p_workflow;
 delete from public.workflow_revisions where owner_user_id=p_owner and workflow_id=p_workflow;
 get diagnostics versions=row_count;
 delete from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=p_workflow;
 return jsonb_build_object('ok',true,'deletedRuns',runs,'deletedRevisions',versions);
end $$;
revoke all on function public.workflow_v2_delete(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.workflow_v2_delete(uuid,text,integer) to service_role;

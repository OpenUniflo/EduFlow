-- Works overview relationship summaries.
--
-- The cards need two distinct Workflow counts without one request per card:
--   * how many different Workflows this current revision references;
--   * how many different unarchived Workflows currently reference it.
-- Call sites are returned separately so the UI can distinguish "workflows"
-- from "nodes". Counts are scoped by p_owner; the API passes the authenticated
-- owner, never a browser-supplied identity. The closure/impact RPCs remain the
-- authority for detail, protection and deletion; this is a compact projection.
create or replace function public.workflow_v2_library_page(p_owner uuid,p_search text default '',p_scope text default 'all',p_sort text default 'updated',p_page integer default 1,p_size integer default 12)
returns jsonb language sql stable security invoker set search_path='' as $$
 with filtered as materialized (
  select h.workflow_id,h.current_revision,h.updated_at,r.definition,
   t.id as template_id,t.name as template_name,
   case when h.provenance->>'libraryGroup' in ('test','general') then h.provenance->>'libraryGroup' end as library_group
  from public.workflow_v2_definitions h
  join public.workflow_revisions r on r.owner_user_id=h.owner_user_id and r.workflow_id=h.workflow_id and r.revision=h.current_revision
  left join public.workflow_templates t on t.id=coalesce(h.provenance->>'sourceTemplateId',h.workflow_id) and t.purpose='course' and t.definition->>'schemaVersion'='2.0'
  where h.owner_user_id=p_owner and not h.archived
   and position(lower(coalesce(p_search,'')) in lower(coalesce(r.definition->>'name','')||' '||coalesce(r.definition->>'description','')))>0
   and (p_scope='all' or p_scope='course' and t.id is not null or p_scope='personal' and t.id is null)
 ), current_sources as materialized (
  select workflow_id,current_revision
  from public.workflow_v2_definitions
  where owner_user_id=p_owner and not archived
 ), outgoing as (
  select i.workflow_id,i.revision,
   count(distinct i.target_workflow_id)::integer as reference_workflows,
   count(*)::integer as reference_call_sites
  from public.workflow_reference_index i
  join current_sources source on source.workflow_id=i.workflow_id and source.current_revision=i.revision
  where i.owner_user_id=p_owner
  group by i.workflow_id,i.revision
 ), incoming as (
  select i.target_workflow_id as workflow_id,
   count(distinct i.workflow_id)::integer as referenced_by_workflows,
   count(*)::integer as referenced_by_call_sites
  from public.workflow_reference_index i
  join current_sources source on source.workflow_id=i.workflow_id and source.current_revision=i.revision
  where i.owner_user_id=p_owner
  group by i.target_workflow_id
 ), settings as (
  select count(*) as total,greatest(1,least(coalesce(p_size,12),48)) as size from filtered
 ), bounds as (
  select *,greatest(1,least(coalesce(p_page,1),greatest(1,ceil(total::numeric/size)::integer))) as page from settings
 ), numbered as (
  select *,row_number() over(order by case when p_sort='name' then lower(definition->>'name') end asc,
   case when p_sort<>'name' then updated_at end desc,workflow_id asc) as n from filtered
 ), slice as (
  select jsonb_build_object(
    'workflowId',numbered.workflow_id,'revision',numbered.current_revision,
    'name',numbered.definition->>'name','description',coalesce(numbered.definition->>'description',''),
    'updatedAt',numbered.updated_at,'nodeCount',jsonb_array_length(numbered.definition->'nodes'),
    'sourceTemplateId',numbered.template_id,'sourceName',numbered.template_name,
    'group',numbered.library_group,
    'relations',jsonb_build_object(
      'referenceWorkflows',coalesce(outgoing.reference_workflows,0),
      'referenceCallSites',coalesce(outgoing.reference_call_sites,0),
      'referencedByWorkflows',coalesce(incoming.referenced_by_workflows,0),
      'referencedByCallSites',coalesce(incoming.referenced_by_call_sites,0)
    ),
    'nodes',case when jsonb_typeof(numbered.definition->'nodes')='array' then (
      select coalesce(jsonb_agg(jsonb_build_object('id',node->>'id','type',node->>'type','label',node->>'label') order by ordinality),'[]'::jsonb)
      from jsonb_array_elements(numbered.definition->'nodes') with ordinality as item(node,ordinality)
    ) else '[]'::jsonb end
   ) as item,numbered.n
  from numbered
  cross join bounds
  left join outgoing on outgoing.workflow_id=numbered.workflow_id and outgoing.revision=numbered.current_revision
  left join incoming on incoming.workflow_id=numbered.workflow_id
  where numbered.n>(bounds.page-1)*bounds.size and numbered.n<=bounds.page*bounds.size
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(item order by n) from slice),'[]'::jsonb),'total',total,'page',page,'pageSize',size) from bounds;
$$;
revoke all on function public.workflow_v2_library_page(uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.workflow_v2_library_page(uuid,text,text,text,integer,integer) to service_role;

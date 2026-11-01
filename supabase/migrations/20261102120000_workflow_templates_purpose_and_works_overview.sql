-- Product starting templates share workflow_templates with Course templates.
-- Existing rows are Course templates; starter rows are local product content,
-- inserted through the content snapshot rather than this migration.
alter table public.workflow_templates
  add column if not exists purpose text not null default 'course';

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workflow_templates'::regclass
      and conname = 'workflow_templates_purpose_check'
  ) then
    alter table public.workflow_templates
      add constraint workflow_templates_purpose_check check (purpose in ('starter', 'course'));
  end if;
end $$;

create index if not exists workflow_templates_purpose_idx
  on public.workflow_templates(purpose, id);

-- The library returns a compact node outline so the Works overview can draw a
-- real definition thumbnail without fetching every Workflow document. Starter
-- templates are not Course provenance, so only Course-purpose templates are
-- joined as a source.
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
 ), settings as (
  select count(*) as total,greatest(1,least(coalesce(p_size,12),48)) as size from filtered
 ), bounds as (
  select *,greatest(1,least(coalesce(p_page,1),greatest(1,ceil(total::numeric/size)::integer))) as page from settings
 ), numbered as (
  select *,row_number() over(order by case when p_sort='name' then lower(definition->>'name') end asc,
   case when p_sort<>'name' then updated_at end desc,workflow_id asc) as n from filtered
 ), slice as (
  select jsonb_build_object(
    'workflowId',workflow_id,'revision',current_revision,
    'name',definition->>'name','description',coalesce(definition->>'description',''),
    'updatedAt',updated_at,'nodeCount',jsonb_array_length(definition->'nodes'),
    'sourceTemplateId',template_id,'sourceName',template_name,
    'group',library_group,
    'nodes',case when jsonb_typeof(definition->'nodes')='array' then (
      select coalesce(jsonb_agg(jsonb_build_object('id',node->>'id','type',node->>'type','label',node->>'label') order by ordinality),'[]'::jsonb)
      from jsonb_array_elements(definition->'nodes') with ordinality as item(node,ordinality)
    ) else '[]'::jsonb end
   ) as item,n
  from numbered,bounds where n>(page-1)*size and n<=page*size
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(item order by n) from slice),'[]'::jsonb),'total',total,'page',page,'pageSize',size) from bounds;
$$;
revoke all on function public.workflow_v2_library_page(uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.workflow_v2_library_page(uuid,text,text,text,integer,integer) to service_role;

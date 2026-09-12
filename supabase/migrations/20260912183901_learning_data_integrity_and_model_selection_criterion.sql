insert into public.mastery_criteria(id,version,knowledge_id,knowledge_revision_id,title,description,cognitive_level,criterion_type,required,display_order)
select 'criterion-agent-model-selection',1,id,current_revision_id,'依据任务约束比较模型','在相同任务与接口下比较结果、工具表现、成本和等待；落实现有 Knowledge 的任务选型与多维比较标准。','evaluate','conceptual',false,0
from public.knowledge_nodes where id='AGC03' and status='active'
  and exists(select 1 from public.micro_steps where id='aiad-l1-agc03-s4')
on conflict do nothing;
insert into public.micro_step_criteria(step_id,criterion_id,criterion_version,purpose)
select s.id,c.id,c.version,'evidence' from public.micro_steps s cross join public.mastery_criteria c
where s.id='aiad-l1-agc03-s4' and c.id='criterion-agent-model-selection' and c.version=1
on conflict do nothing;

create function public.validate_mastery_criterion_version() returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from knowledge_node_revisions r where r.id=new.knowledge_revision_id and r.node_id=new.knowledge_id) then
    raise exception 'criterion_revision_knowledge_mismatch' using errcode='23514';
  end if;
  if tg_op='UPDATE' and (to_jsonb(new)-'status'-'updated_at') is distinct from (to_jsonb(old)-'status'-'updated_at') then
    raise exception 'criterion_definition_requires_new_version' using errcode='23514';
  end if;
  return new;
end $$;
create trigger mastery_criterion_version before insert or update on public.mastery_criteria
  for each row execute function public.validate_mastery_criterion_version();
revoke all on function public.validate_mastery_criterion_version() from public,anon,authenticated;

-- Hold content stable between checking the evaluated definition and recording its fact.
do $patch$
declare definition text;
begin
  select pg_get_functiondef('public.record_micro_step_attempt(uuid,text,text,text,text,text,jsonb,boolean,text,text,integer,uuid,jsonb)'::regprocedure) into definition;
  definition:=replace(definition,'where id=p_path_id and status=''published'';', 'where id=p_path_id and status=''published'' for share;');
  definition:=replace(definition,'where id=p_step_id and unit_id=p_unit_id;', 'where id=p_step_id and unit_id=p_unit_id for share;');
  execute definition;
  select pg_get_functiondef('public.publish_course_authoring_draft(text,integer)'::regprocedure) into definition;
  -- Avoid conflict with the existing PL/pgSQL variable named item.
  definition:=replace(definition,'from jsonb_array_elements(saved_criterion_mappings) item', 'from jsonb_array_elements(saved_criterion_mappings) as saved(mapping_snapshot)');
  definition:=replace(definition, 'item->''mapping''', 'mapping_snapshot->''mapping''');
  definition:=replace(definition, 'p.knowledge_id=item->>''knowledge'' and s.kind=item->>''kind''', 'p.knowledge_id=mapping_snapshot->>''knowledge'' and s.kind=mapping_snapshot->>''kind''');
  definition:=replace(definition, 'nullif(item->''interaction'',''null''::jsonb)', 'nullif(mapping_snapshot->''interaction'',''null''::jsonb)');
  execute definition;
end $patch$;

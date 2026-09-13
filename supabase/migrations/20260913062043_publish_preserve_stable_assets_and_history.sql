-- Hosted Gold Publish exposed two pre-existing replacement hazards: PDF source
-- metadata was omitted, and deleting unchanged Assignments cascaded their facts.
-- Preserve stable assets in place; only explicitly removed identities are deleted.
do $patch$
declare definition text; original text; anchor text;
begin
  select pg_get_functiondef('public.publish_course_authoring_draft_base(text,integer)'::regprocedure) into definition;
  original := definition;
  anchor := '  delete from course_assignments where course_id = p_course_id;';
  if position(anchor in definition)=0 then raise exception 'publish_assignment_delete_shape_changed'; end if;
  definition := replace(definition,anchor,$replacement$
  delete from course_assignments where course_id=p_course_id and id not in
    (select value->>'id' from jsonb_array_elements(coalesce(runtime->'assignments','[]'::jsonb)));
  -- Move retained rows out of the authored order range before swapping positions.
  update course_assignments set display_order=display_order+(select coalesce(max(display_order),0)+
    coalesce((select max((value->>'order')::integer) from jsonb_array_elements(coalesce(runtime->'assignments','[]'::jsonb))),0)+1
    from course_assignments where course_id=p_course_id) where course_id=p_course_id;$replacement$);
  anchor := '  delete from materials where course_id = p_course_id;';
  if position(anchor in definition)=0 then raise exception 'publish_material_delete_shape_changed'; end if;
  definition := replace(definition,anchor,$replacement$
  delete from materials where course_id=p_course_id and id not in
    (select value->>'id' from jsonb_array_elements(coalesce(runtime->'materials','[]'::jsonb)));
  update materials set display_order=display_order+(select coalesce(max(display_order),0)+
    coalesce((select max((value->>'order')::integer) from jsonb_array_elements(coalesce(runtime->'materials','[]'::jsonb))),0)+1
    from materials where course_id=p_course_id) where course_id=p_course_id;$replacement$);
  anchor := $old$    insert into materials(course_id,id,display_order,title,description,material_type,duration)
      values (p_course_id,item->>'id',(item->>'order')::integer,item->>'title',nullif(item->>'description',''),item->>'type',nullif(item->>'duration',''));$old$;
  if position(anchor in definition)=0 then raise exception 'publish_material_insert_shape_changed'; end if;
  definition := replace(definition,anchor,$replacement$
    insert into materials(course_id,id,display_order,title,description,material_type,duration,storage_path,page_count,uploaded_by)
      values (p_course_id,item->>'id',(item->>'order')::integer,item->>'title',nullif(item->>'description',''),item->>'type',nullif(item->>'duration',''),
        (select m.storage_path from materials m where m.course_id=p_course_id and m.id=item->>'id'),
        (select m.page_count from materials m where m.course_id=p_course_id and m.id=item->>'id'),
        (select m.uploaded_by from materials m where m.course_id=p_course_id and m.id=item->>'id'))
      on conflict (course_id,id) do update set display_order=excluded.display_order,title=excluded.title,
        description=excluded.description,material_type=excluded.material_type,duration=excluded.duration;
$replacement$);
  anchor := $old$coalesce(item->'inheritedOutputs','[]'::jsonb),nullif(item->>'dependencyRationale',''));$old$;
  if position(anchor in definition)=0 then raise exception 'publish_assignment_insert_shape_changed'; end if;
  definition := replace(definition,anchor,$replacement$coalesce(item->'inheritedOutputs','[]'::jsonb),nullif(item->>'dependencyRationale',''))
      on conflict (course_id,id) do update set display_order=excluded.display_order,title=excluded.title,
        description=excluded.description,requirements=excluded.requirements,expected_output=excluded.expected_output,
        acceptance_criteria=excluded.acceptance_criteria,mode=excluded.mode,workflow_template_id=excluded.workflow_template_id,
        estimated_minutes=excluded.estimated_minutes,project_contribution=excluded.project_contribution,
        experience=excluded.experience,inherited_outputs=excluded.inherited_outputs,dependency_rationale=excluded.dependency_rationale;$replacement$);
  if definition=original then raise exception 'publish_base_shape_changed'; end if;
  execute definition;

  select pg_get_functiondef('public.publish_course_authoring_draft(text,integer)'::regprocedure) into definition;
  anchor := '  delete from workflow_runs where course_id = p_course_id;';
  if position(anchor in definition)=0 then raise exception 'publish_workflow_delete_shape_changed'; end if;
  definition := replace(definition,anchor,$replacement$
  delete from workflow_runs where course_id=p_course_id and assignment_id is not null and assignment_id not in
    (select value->>'id' from jsonb_array_elements(coalesce(draft_payload#>'{previewRuntime,assignments}','[]'::jsonb)));$replacement$);
  execute definition;
end $patch$;

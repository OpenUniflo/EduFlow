-- Materials are Course-owned after 20260905010000. Recreate the existing
-- transactional persistence boundary without assigning a generated Lesson to
-- the source Material.
create or replace function public.persist_knowledge_generation(target_run_id uuid, payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  generation_run public.knowledge_generation_runs;
  source_material public.materials;
  old_lesson_ids text[];
  old_chapter_ids text[];
  item jsonb;
begin
  select * into generation_run
  from public.knowledge_generation_runs
  where id = target_run_id and status = 'running'
  for update;
  if generation_run.id is null then raise exception 'knowledge_generation_run_not_running'; end if;

  select * into source_material
  from public.materials
  where course_id = generation_run.course_id and id = generation_run.material_id;
  if source_material.id is null then raise exception 'knowledge_generation_material_missing'; end if;
  if (select count(*) from public.materials where course_id = generation_run.course_id) <> 1 then
    raise exception 'knowledge_generation_requires_single_material_draft';
  end if;
  if exists (select 1 from public.course_assignments where course_id = generation_run.course_id) then
    raise exception 'knowledge_generation_rejects_courses_with_assignments';
  end if;

  select array_agg(id), array_agg(distinct chapter_id) into old_lesson_ids, old_chapter_ids
  from public.curriculum_lessons where course_id = generation_run.course_id;

  delete from public.curriculum_sequences where course_id = generation_run.course_id;
  delete from public.curriculum_coverages where course_id = generation_run.course_id;
  update public.curriculum_lessons set display_order = display_order + 100000 where course_id = generation_run.course_id;
  update public.curriculum_chapters set display_order = display_order + 100000 where course_id = generation_run.course_id;

  update public.knowledge_edges edge set lifecycle_status = 'deprecated'
  where edge.provenance @> jsonb_build_array(jsonb_build_object(
    'courseId', generation_run.course_id,
    'materialId', generation_run.material_id
  ));

  for item in select value from jsonb_array_elements(payload->'nodes') loop
    insert into public.knowledge_nodes (
      id, title, description, node_type, mastery_criteria, scope, owner_id, provenance,
      current_revision_id, status, metadata, created_at, updated_at
    ) values (
      item->>'id', item->>'title', item->>'description', item->>'type', item->'masteryCriteria', 'user',
      generation_run.owner_user_id::text, item->'provenance', item->>'revisionId', 'active', item->'metadata', now(), now()
    ) on conflict (id) do nothing;
    insert into public.knowledge_node_revisions (
      id, node_id, version, title, description, node_type, mastery_criteria, created_by, created_at, change_reason
    ) values (
      item->>'revisionId', item->>'id', 1, item->>'title', item->>'description', item->>'type',
      item->'masteryCriteria', generation_run.owner_user_id::text, now(), 'phase4.2-course-ingestion'
    ) on conflict (id) do nothing;
  end loop;

  for item in select value from jsonb_array_elements(payload->'relations') loop
    insert into public.knowledge_edges (
      id, source_node_id, target_node_id, relation, reason, prerequisite_strength, associative_strength, provenance, lifecycle_status
    ) values (
      item->>'id', item->>'source', item->>'target', item->>'relation', item->>'reason',
      case when item->>'relation' = 'prerequisite' then item->>'strength' else null end,
      case when item->>'relation' <> 'prerequisite' then (item->>'strength')::numeric else null end,
      item->'provenance', 'active'
    ) on conflict (source_node_id, target_node_id, relation) do update
      set reason = excluded.reason,
          prerequisite_strength = excluded.prerequisite_strength,
          associative_strength = excluded.associative_strength,
          provenance = excluded.provenance,
          lifecycle_status = 'active';
  end loop;

  for item in select value from jsonb_array_elements(payload->'chapters') loop
    insert into public.curriculum_chapters (course_id, id, title, description, display_order, color, outcome)
    values (generation_run.course_id, item->>'id', item->>'title', item->>'description', (item->>'order')::integer, item->>'color', item->>'outcome')
    on conflict (course_id, id) do update set title = excluded.title, description = excluded.description,
      display_order = excluded.display_order, color = excluded.color, outcome = excluded.outcome;
  end loop;
  for item in select value from jsonb_array_elements(payload->'lessons') loop
    insert into public.curriculum_lessons (course_id, id, chapter_id, title, display_order)
    values (generation_run.course_id, item->>'id', item->>'chapterId', item->>'title', (item->>'order')::integer)
    on conflict (course_id, id) do update set chapter_id = excluded.chapter_id, title = excluded.title, display_order = excluded.display_order;
  end loop;
  if not exists (select 1 from jsonb_array_elements(payload->'lessons')) then
    raise exception 'knowledge_generation_has_no_lessons';
  end if;
  delete from public.curriculum_lessons
  where course_id = generation_run.course_id and id = any(coalesce(old_lesson_ids, '{}'))
    and id not in (select value->>'id' from jsonb_array_elements(payload->'lessons'));
  delete from public.curriculum_chapters
  where course_id = generation_run.course_id and id = any(coalesce(old_chapter_ids, '{}'))
    and id not in (select value->>'id' from jsonb_array_elements(payload->'chapters'));

  for item in select value from jsonb_array_elements(payload->'coverages') loop
    insert into public.curriculum_coverages (course_id, id, lesson_id, node_id, role, display_order)
    values (
      generation_run.course_id, item->>'id', item->>'lessonId', item->>'nodeId', item->>'role', (item->>'order')::integer
    );
  end loop;

  update public.course_curricula
  set generation_mode = 'auto', requested_chapter_count = null, source_structure_id = generation_run.material_id
  where course_id = generation_run.course_id;
  update public.courses
  set generation_status = 'curriculum-generated', revision = target_run_id::text, updated_at = now()
  where id = generation_run.course_id;
  update public.knowledge_generation_runs
  set status = 'completed', executions = payload->'executions',
      candidate_count = jsonb_array_length(payload->'nodes'), duplicate_count = (payload->>'duplicateCount')::integer,
      relation_count = jsonb_array_length(payload->'relations'), chapter_count = jsonb_array_length(payload->'chapters'),
      completed_at = now()
  where id = target_run_id;
end;
$$;

revoke all on function public.persist_knowledge_generation(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.persist_knowledge_generation(uuid, jsonb) to service_role;

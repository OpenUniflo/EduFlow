-- Material is owned and ordered by Course. Lesson context is a presentation
-- projection through MaterialKnowledgeCoverage and CurriculumCoverage.
alter table public.materials
  drop constraint materials_course_id_lesson_id_display_order_key;

with ranked as (
  select m.course_id, m.id,
    row_number() over (
      partition by m.course_id
      order by l.display_order, m.display_order, m.id
    ) - 1 as course_order
  from public.materials m
  join public.curriculum_lessons l
    on l.course_id = m.course_id and l.id = m.lesson_id
)
update public.materials m
set display_order = ranked.course_order
from ranked
where m.course_id = ranked.course_id and m.id = ranked.id;

alter table public.materials
  drop constraint materials_course_id_lesson_id_fkey,
  drop column lesson_id;

alter table public.materials
  add constraint materials_course_id_display_order_key unique (course_id, display_order);

-- Restate the effective publish function so authoring writes the course-owned
-- Material contract and never consumes a browser-provided Lesson identity.

create or replace function public.publish_course_authoring_draft_base(
  p_course_id text,
  p_expected_revision integer
) returns table (revision text)
language plpgsql security definer set search_path = public as $$
declare d record; runtime jsonb; candidate jsonb; item jsonb; segment jsonb; next_revision text;
begin
  select * into d from course_authoring_drafts where course_id = p_course_id for update;
  if not found then raise exception 'authoring_draft_not_found' using errcode = 'P0002'; end if;
  if d.revision <> p_expected_revision then raise exception 'authoring_draft_conflict' using errcode = '40001'; end if;
  runtime := d.payload -> 'previewRuntime';
  if jsonb_typeof(runtime) <> 'object' or coalesce(runtime #>> '{course,id}', '') <> p_course_id then
    raise exception 'invalid_authoring_preview' using errcode = '22023';
  end if;

  for candidate in select value from jsonb_array_elements(coalesce(d.payload #> '{state,addedKnowledgeCandidates}', '[]'::jsonb)) loop
    if not exists (select 1 from knowledge_nodes where id = candidate ->> 'id') then
      insert into knowledge_nodes(id,title,description,node_type,mastery_criteria,scope,owner_id,provenance,current_revision_id,status)
        values (candidate ->> 'id', candidate ->> 'title', coalesce(candidate ->> 'description',''), 'conceptual', '[]'::jsonb, 'global', null,
          jsonb_build_array(jsonb_build_object('source','course-authoring','courseId',p_course_id)), candidate ->> 'id' || ':r1', 'active');
      insert into knowledge_node_revisions(id,node_id,version,title,description,node_type,mastery_criteria,created_by,change_reason)
        values (candidate ->> 'id' || ':r1', candidate ->> 'id', 1, candidate ->> 'title', coalesce(candidate ->> 'description',''), 'conceptual', '[]'::jsonb, d.author_user_id::text, 'Materialized from course authoring draft');
    end if;
  end loop;

  delete from final_project_outcome_compositions where course_id = p_course_id;
  delete from assignment_outcome_compositions where course_id = p_course_id;
  delete from final_projects where course_id = p_course_id;
  delete from chapter_outcomes where course_id = p_course_id;
  delete from assignment_dependencies where course_id = p_course_id;
  delete from assignment_coverages where course_id = p_course_id;
  delete from course_assignments where course_id = p_course_id;
  delete from material_knowledge_coverages where course_id = p_course_id;
  delete from material_segments where course_id = p_course_id;
  delete from materials where course_id = p_course_id;
  delete from curriculum_sequences where course_id = p_course_id;
  delete from curriculum_coverages where course_id = p_course_id;
  delete from curriculum_lessons where course_id = p_course_id;
  delete from curriculum_chapters where course_id = p_course_id;

  for item in select value from jsonb_array_elements(coalesce(runtime -> 'chapters','[]'::jsonb)) loop
    insert into curriculum_chapters(course_id,id,title,description,display_order,color,outcome)
      values (p_course_id,item->>'id',item->>'title',coalesce(item->>'description',''),(item->>'order')::integer,coalesce(item->>'color','#8b75df'),coalesce(item->>'outcome',''));
  end loop;
  for item in select value from jsonb_array_elements(coalesce(runtime -> 'lessons','[]'::jsonb)) loop
    insert into curriculum_lessons(course_id,id,chapter_id,title,display_order)
      values (p_course_id,item->>'id',item->>'chapterId',item->>'title',(item->>'order')::integer);
  end loop;
  for item in select value from jsonb_array_elements(coalesce(runtime -> 'curriculumCoverages','[]'::jsonb)) loop
    insert into curriculum_coverages(course_id,id,lesson_id,node_id,role,display_order)
      values (p_course_id,item->>'id',item->>'lessonId',item->>'nodeId',item->>'role',(item->>'order')::integer);
  end loop;
  for item in select value from jsonb_array_elements(coalesce(runtime -> 'curriculumSequences','[]'::jsonb)) loop
    insert into curriculum_sequences(course_id,id,source_lesson_id,target_lesson_id)
      values (p_course_id,item->>'id',item->>'sourceLessonId',item->>'targetLessonId');
  end loop;
  for item in select value from jsonb_array_elements(coalesce(runtime -> 'materials','[]'::jsonb)) loop
    insert into materials(course_id,id,display_order,title,description,material_type,duration)
      values (p_course_id,item->>'id',(item->>'order')::integer,item->>'title',nullif(item->>'description',''),item->>'type',nullif(item->>'duration',''));
    for segment in select value from jsonb_array_elements(coalesce(item -> 'segments','[]'::jsonb)) loop
      insert into material_segments(course_id,material_id,id,display_order,page,title,section,content)
        values (p_course_id,item->>'id',segment->>'id',(segment->>'order')::integer,nullif(segment->>'page','')::integer,nullif(segment->>'title',''),nullif(segment->>'section',''),segment->'content');
    end loop;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(runtime -> 'materialKnowledgeCoverages','[]'::jsonb)) loop
    insert into material_knowledge_coverages(course_id,id,material_id,segment_id,node_id,role)
      values (p_course_id,item->>'id',item->>'materialId',item->>'segmentId',item->>'nodeId',item->>'role');
  end loop;
  for item in select value from jsonb_array_elements(coalesce(runtime -> 'assignments','[]'::jsonb)) loop
    insert into course_assignments(course_id,id,display_order,title,description,requirements,expected_output,acceptance_criteria,mode,workflow_template_id,estimated_minutes,project_contribution,experience,inherited_outputs,dependency_rationale)
      values (p_course_id,item->>'id',(item->>'order')::integer,item->>'title',coalesce(item->>'description',''),coalesce(item->'requirements','[]'::jsonb),coalesce(item->>'expectedOutput',''),coalesce(item->'acceptanceCriteria','[]'::jsonb),item->>'mode',nullif(item->>'workflowTemplateId',''),nullif(item->>'estimatedMinutes','')::integer,nullif(item->>'projectContribution',''),item->'experience',coalesce(item->'inheritedOutputs','[]'::jsonb),nullif(item->>'dependencyRationale',''));
  end loop;
  for item in select value from jsonb_array_elements(coalesce(runtime -> 'assignmentCoverages','[]'::jsonb)) loop
    insert into assignment_coverages(course_id,id,assignment_id,node_id,role,required)
      values (p_course_id,item->>'id',item->>'assignmentId',item->>'nodeId',item->>'role',coalesce((item->>'required')::boolean,false));
  end loop;
  for item in select value from jsonb_array_elements(coalesce(runtime -> 'assignmentDependencies','[]'::jsonb)) loop
    insert into assignment_dependencies(course_id,id,source_assignment_id,target_assignment_id,strength)
      values (p_course_id,item->>'id',item->>'sourceAssignmentId',item->>'targetAssignmentId',item->>'strength');
  end loop;
  for item in select value from jsonb_array_elements(coalesce(runtime -> 'chapterOutcomes','[]'::jsonb)) loop
    insert into chapter_outcomes(course_id,id,chapter_id,title) values (p_course_id,item->>'id',item->>'chapterId',item->>'title');
  end loop;
  for item in select value from jsonb_array_elements(coalesce(runtime -> 'assignmentOutcomeCompositions','[]'::jsonb)) loop
    insert into assignment_outcome_compositions(course_id,id,assignment_id,outcome_id) values (p_course_id,item->>'id',item->>'assignmentId',item->>'outcomeId');
  end loop;
  for item in select value from jsonb_array_elements(coalesce(runtime -> 'finalProjects','[]'::jsonb)) loop
    insert into final_projects(course_id,id,title,description) values (p_course_id,item->>'id',item->>'title',coalesce(item->>'description',''));
  end loop;
  for item in select value from jsonb_array_elements(coalesce(runtime -> 'finalProjectOutcomeCompositions','[]'::jsonb)) loop
    insert into final_project_outcome_compositions(course_id,id,final_project_id,outcome_id) values (p_course_id,item->>'id',item->>'finalProjectId',item->>'outcomeId');
  end loop;

  delete from knowledge_edges where id in (select jsonb_array_elements_text(coalesce(d.payload #> '{state,removedDependencyIds}','[]'::jsonb)));
  for item in select value from jsonb_array_elements(coalesce(d.payload #> '{state,addedDependencies}','[]'::jsonb)) loop
    insert into knowledge_edges(id,source_node_id,target_node_id,relation,reason,prerequisite_strength,associative_strength)
      values (item->>'id',item->>'source',item->>'target',item->>'relation',coalesce(item->>'reason','Course authored relation'),case when item->>'relation'='prerequisite' then coalesce(item->>'strength','hard') else null end,case when item->>'relation'='related' then 0.5 else null end)
      on conflict (source_node_id,target_node_id,relation) do update set reason=excluded.reason, prerequisite_strength=excluded.prerequisite_strength, associative_strength=excluded.associative_strength;
  end loop;

  next_revision := 'published-' || extract(epoch from clock_timestamp())::bigint::text;
  update courses set title=runtime #>> '{course,title}', description=coalesce(runtime #>> '{course,description}',''), target_outcome=runtime #>> '{course,targetOutcome}', accent_color=runtime #>> '{course,accentColor}', lifecycle='published', revision=next_revision, updated_at=now() where id=p_course_id;
  delete from course_authoring_drafts where course_id = p_course_id;
  revision := next_revision; return next;
end $$;

revoke all on function public.publish_course_authoring_draft_base(text, integer)
  from public, anon, authenticated;
grant execute on function public.publish_course_authoring_draft_base(text, integer)
  to service_role;

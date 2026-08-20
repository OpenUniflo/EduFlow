-- Publishing replaces Course-owned definitions, but stable identities must keep
-- learner-owned progress. Snapshot state before the replacement and restore
-- only records whose Course-owned identities still exist afterwards.

create or replace function public.publish_course_authoring_draft(p_course_id text, p_expected_revision integer)
returns table (revision text)
language plpgsql security definer set search_path = public as $$
declare
  draft_payload jsonb; item jsonb; unit jsonb; step jsonb; step_position integer;
  saved_course_states jsonb; saved_assignment_states jsonb; saved_material_states jsonb; saved_path_progress jsonb; saved_unit_progress jsonb;
begin
  select payload into draft_payload from course_authoring_drafts where course_id=p_course_id for update;
  if draft_payload is null then raise exception 'authoring_draft_not_found' using errcode='P0002'; end if;

  select coalesce(jsonb_agg(to_jsonb(state)), '[]'::jsonb) into saved_course_states
    from user_course_states state where state.course_id=p_course_id;
  select coalesce(jsonb_agg(to_jsonb(state)), '[]'::jsonb) into saved_assignment_states
    from user_assignment_states state where state.course_id=p_course_id;
  select coalesce(jsonb_agg(to_jsonb(state)), '[]'::jsonb) into saved_material_states
    from user_material_states state where state.course_id=p_course_id;
  select coalesce(jsonb_agg(to_jsonb(progress)), '[]'::jsonb) into saved_path_progress
    from user_micro_path_progress progress
    where progress.path_id in (select id from micro_learning_paths where course_id=p_course_id);
  select coalesce(jsonb_agg(to_jsonb(progress)), '[]'::jsonb) into saved_unit_progress
    from user_micro_unit_progress progress
    where progress.path_id in (select id from micro_learning_paths where course_id=p_course_id);

  update user_course_states set recent_lesson_id = null where course_id = p_course_id;
  -- recent_segment_id is restrictive, so remove the snapshotted user rows
  -- before the base function replaces MaterialSegments.
  delete from user_material_states where course_id=p_course_id;
  delete from workflow_runs where course_id = p_course_id;
  select * into revision from publish_course_authoring_draft_base(p_course_id,p_expected_revision);

  update user_course_states state set recent_lesson_id=saved.recent_lesson_id
  from jsonb_to_recordset(saved_course_states) as saved(user_id uuid,course_id text,recent_lesson_id text)
  where state.user_id=saved.user_id and state.course_id=saved.course_id
    and exists(select 1 from curriculum_lessons lesson where lesson.course_id=saved.course_id and lesson.id=saved.recent_lesson_id);

  insert into user_assignment_states(user_id,course_id,assignment_id,status,progress,updated_at,started_at,submitted_at,accepted_at)
  select state.user_id,state.course_id,state.assignment_id,state.status,state.progress,state.updated_at,state.started_at,state.submitted_at,state.accepted_at
  from jsonb_to_recordset(saved_assignment_states) as state(user_id uuid,course_id text,assignment_id text,status text,progress integer,updated_at timestamptz,started_at timestamptz,submitted_at timestamptz,accepted_at timestamptz)
  join course_assignments assignment on assignment.course_id=state.course_id and assignment.id=state.assignment_id
  on conflict (user_id,course_id,assignment_id) do update set
    status=excluded.status,progress=excluded.progress,updated_at=excluded.updated_at,started_at=excluded.started_at,submitted_at=excluded.submitted_at,accepted_at=excluded.accepted_at;

  insert into user_material_states(user_id,course_id,material_id,recent_segment_id,viewed_segment_ids,completed_segment_ids,progress,updated_at)
  select state.user_id,state.course_id,state.material_id,
    case when exists(select 1 from material_segments segment where segment.course_id=state.course_id and segment.material_id=state.material_id and segment.id=state.recent_segment_id) then state.recent_segment_id else null end,
    state.viewed_segment_ids,state.completed_segment_ids,state.progress,state.updated_at
  from jsonb_to_recordset(saved_material_states) as state(user_id uuid,course_id text,material_id text,recent_segment_id text,viewed_segment_ids jsonb,completed_segment_ids jsonb,progress integer,updated_at timestamptz)
  join materials material on material.course_id=state.course_id and material.id=state.material_id
  on conflict (user_id,course_id,material_id) do update set
    recent_segment_id=excluded.recent_segment_id,viewed_segment_ids=excluded.viewed_segment_ids,completed_segment_ids=excluded.completed_segment_ids,progress=excluded.progress,updated_at=excluded.updated_at;

  if coalesce((draft_payload #>> '{state,microPathsEdited}')::boolean, false) then
    delete from micro_learning_paths where course_id=p_course_id;
    for item in select value from jsonb_array_elements(draft_payload #> '{state,microPaths}') loop
      insert into micro_learning_paths(id,knowledge_id,course_id,scope,title,description,mode,estimated_minutes,required,status,revision)
      values(item->>'id',item->>'knowledgeId',p_course_id,'course',item->>'title',nullif(item->>'description',''),item->>'mode',(item->>'estimatedMinutes')::integer,coalesce((item->>'required')::boolean,true),'published',1);
      for unit in select value from jsonb_array_elements(coalesce(item->'units','[]'::jsonb)) loop
        insert into micro_units(id,path_id,title,description,position,estimated_minutes,required)
        values(unit->>'id',item->>'id',unit->>'title',nullif(unit->>'description',''),(unit->>'position')::integer,(unit->>'estimatedMinutes')::integer,coalesce((unit->>'required')::boolean,true));
        for step, step_position in select value, ordinal - 1 from jsonb_array_elements(coalesce(unit->'steps','[]'::jsonb)) with ordinality as steps(value, ordinal) loop
          insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback,transition)
          values(step->>'id',unit->>'id',step_position,step->>'kind',step->>'title',step->>'body',step->'interaction',nullif(step->>'successFeedback',''),nullif(step->>'retryFeedback',''),step->'transition');
        end loop;
      end loop;
    end loop;

    insert into user_micro_path_progress(user_id,path_id,status,current_unit_id,current_step_id,started_at,completed_at,updated_at)
    select progress.user_id,progress.path_id,progress.status,
      case when exists(select 1 from micro_units candidate where candidate.id=progress.current_unit_id and candidate.path_id=progress.path_id) then progress.current_unit_id else null end,
      case when exists(select 1 from micro_steps candidate join micro_units parent on parent.id=candidate.unit_id where candidate.id=progress.current_step_id and parent.path_id=progress.path_id) then progress.current_step_id else null end,
      progress.started_at,progress.completed_at,progress.updated_at
    from jsonb_to_recordset(saved_path_progress) as progress(user_id uuid,path_id text,status text,current_unit_id text,current_step_id text,started_at timestamptz,completed_at timestamptz,updated_at timestamptz)
    join micro_learning_paths path on path.id=progress.path_id and path.course_id=p_course_id
    on conflict (user_id,path_id) do update set status=excluded.status,current_unit_id=excluded.current_unit_id,current_step_id=excluded.current_step_id,started_at=excluded.started_at,completed_at=excluded.completed_at,updated_at=excluded.updated_at;

    insert into user_micro_unit_progress(user_id,unit_id,path_id,status,current_step_id,completed_step_ids,started_at,completed_at,updated_at)
    select progress.user_id,progress.unit_id,progress.path_id,progress.status,
      case when exists(select 1 from micro_steps candidate where candidate.id=progress.current_step_id and candidate.unit_id=progress.unit_id) then progress.current_step_id else null end,
      coalesce((select jsonb_agg(step_id) from jsonb_array_elements_text(progress.completed_step_ids) step_id where exists(select 1 from micro_steps candidate where candidate.id=step_id and candidate.unit_id=progress.unit_id)), '[]'::jsonb),
      progress.started_at,progress.completed_at,progress.updated_at
    from jsonb_to_recordset(saved_unit_progress) as progress(user_id uuid,unit_id text,path_id text,status text,current_step_id text,completed_step_ids jsonb,started_at timestamptz,completed_at timestamptz,updated_at timestamptz)
    join micro_units existing_unit on existing_unit.id=progress.unit_id and existing_unit.path_id=progress.path_id
    on conflict (user_id,unit_id) do update set path_id=excluded.path_id,status=excluded.status,current_step_id=excluded.current_step_id,completed_step_ids=excluded.completed_step_ids,started_at=excluded.started_at,completed_at=excluded.completed_at,updated_at=excluded.updated_at;
  end if;
  return next;
end $$;

revoke all on function public.publish_course_authoring_draft(text,integer) from public, anon, authenticated;
grant execute on function public.publish_course_authoring_draft(text,integer) to service_role;

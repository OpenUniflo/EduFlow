-- Extend the existing atomic Course publish rather than introducing a second
-- Micro publishing path.  The base function keeps Course materialization; this
-- wrapper materializes the saved draft Micro projection in the same transaction.
alter function public.publish_course_authoring_draft(text, integer) rename to publish_course_authoring_draft_base;

create function public.publish_course_authoring_draft(p_course_id text, p_expected_revision integer)
returns table (revision text)
language plpgsql security definer set search_path = public as $$
declare draft_payload jsonb; item jsonb; unit jsonb; step jsonb;
begin
  select payload into draft_payload from course_authoring_drafts where course_id=p_course_id for update;
  if draft_payload is null then raise exception 'authoring_draft_not_found' using errcode='P0002'; end if;
  -- The base publish validates the revision and clears the draft. Everything in
  -- this wrapper remains one PostgreSQL transaction.
  select * into revision from publish_course_authoring_draft_base(p_course_id,p_expected_revision);
  if draft_payload #> '{state,microPaths}' is not null then
    delete from micro_learning_paths where course_id=p_course_id;
    for item in select value from jsonb_array_elements(draft_payload #> '{state,microPaths}') loop
      insert into micro_learning_paths(id,knowledge_id,course_id,scope,title,description,mode,estimated_minutes,required,status,revision)
      values(item->>'id',item->>'knowledgeId',p_course_id,'course',item->>'title',nullif(item->>'description',''),item->>'mode',(item->>'estimatedMinutes')::integer,coalesce((item->>'required')::boolean,true),'published',1);
      for unit in select value from jsonb_array_elements(coalesce(item->'units','[]'::jsonb)) loop
        insert into micro_units(id,path_id,title,description,position,estimated_minutes,required)
        values(unit->>'id',item->>'id',unit->>'title',nullif(unit->>'description',''),(unit->>'position')::integer,(unit->>'estimatedMinutes')::integer,coalesce((unit->>'required')::boolean,true));
        for step in select value from jsonb_array_elements(coalesce(unit->'steps','[]'::jsonb)) loop
          insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback,transition)
          values(step->>'id',unit->>'id',(step->>'position')::integer,step->>'kind',step->>'title',step->>'body',step->'interaction',nullif(step->>'successFeedback',''),nullif(step->>'retryFeedback',''),step->'transition');
        end loop;
      end loop;
    end loop;
  end if;
  return next;
end $$;

grant execute on function public.publish_course_authoring_draft(text,integer) to authenticated;

-- Legacy workflow_runs was retired with the unified V2 workspace. Course Publish
-- must not query that removed table. V2 run launch context is immutable history;
-- publishing a new Course draft does not delete an owner's workflows or evidence.
do $migration$
declare definition text; obsolete text := $old$  delete from workflow_runs where course_id=p_course_id and assignment_id is not null and assignment_id not in
    (select value->>'id' from jsonb_array_elements(coalesce(draft_payload#>'{previewRuntime,assignments}','[]'::jsonb)));$old$;
begin
 select pg_get_functiondef('public.publish_course_authoring_draft(text,integer)'::regprocedure) into definition;
 if position(obsolete in definition)=0 then raise exception 'Expected legacy Course Publish cleanup clause not found'; end if;
 execute replace(definition,obsolete,'  -- V2 workflows and run evidence retain their independent owner/history lifecycle.');
end $migration$;

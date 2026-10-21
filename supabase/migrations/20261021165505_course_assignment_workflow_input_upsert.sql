-- Keep workflow_input in the Course Publish upsert, not only in the insert path.
-- Existing Assignments are retained by the publish RPC, so the update branch
-- must copy the caller-provided value from the draft preview runtime.
do $migration$
declare
  definition text;
  old_clause text := $old$mode=excluded.mode,workflow_template_id=excluded.workflow_template_id,$old$;
  new_clause text := $new$mode=excluded.mode,workflow_template_id=excluded.workflow_template_id,workflow_input=excluded.workflow_input,$new$;
begin
  select pg_get_functiondef('public.publish_course_authoring_draft_base(text,integer)'::regprocedure) into definition;
  if position(old_clause in definition) = 0 then
    raise exception 'Expected Course Assignment publish upsert clause not found';
  end if;
  execute replace(definition, old_clause, new_clause);
end
$migration$;

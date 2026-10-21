-- Caller-owned Workflow input for Assignment launches. The value is persisted
-- on the Course Assignment and copied into the draft runtime; the canvas never
-- treats browser edits as the Assignment authority.
alter table public.course_assignments
  add column if not exists workflow_input jsonb;

comment on column public.course_assignments.workflow_input is
  'Caller-provided Workflow startup input; read-only on the canvas when launched from this Assignment.';

do $migration$
declare
  definition text;
  old_columns text := $old$insert into course_assignments(course_id,id,display_order,title,description,requirements,expected_output,acceptance_criteria,mode,workflow_template_id,estimated_minutes,project_contribution,experience,inherited_outputs,dependency_rationale)$old$;
  new_columns text := $new$insert into course_assignments(course_id,id,display_order,title,description,requirements,expected_output,acceptance_criteria,mode,workflow_template_id,workflow_input,estimated_minutes,project_contribution,experience,inherited_outputs,dependency_rationale)$new$;
  old_values text := $old$nullif(item->>'workflowTemplateId',''),nullif(item->>'estimatedMinutes','')::integer$old$;
  new_values text := $new$nullif(item->>'workflowTemplateId',''),case when item ? 'workflowInput' then item->'workflowInput' else null end,nullif(item->>'estimatedMinutes','')::integer$new$;
begin
  select pg_get_functiondef('public.publish_course_authoring_draft_base(text,integer)'::regprocedure) into definition;
  if position(old_columns in definition) = 0 or position(old_values in definition) = 0 then
    raise exception 'Expected Course assignment publish clause not found';
  end if;
  definition := replace(definition, old_columns, new_columns);
  definition := replace(definition, old_values, new_values);
  execute definition;
end
$migration$;

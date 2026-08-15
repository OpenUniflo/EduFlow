create table public.assignment_dependencies (
  course_id text not null,
  id text not null,
  source_assignment_id text not null,
  target_assignment_id text not null,
  strength text not null check (strength in ('hard', 'soft')),
  primary key (course_id, id),
  foreign key (course_id, source_assignment_id) references public.course_assignments(course_id, id) on delete cascade,
  foreign key (course_id, target_assignment_id) references public.course_assignments(course_id, id) on delete cascade,
  check (source_assignment_id <> target_assignment_id),
  unique (course_id, source_assignment_id, target_assignment_id)
);

create table public.chapter_outcomes (
  course_id text not null,
  id text not null,
  chapter_id text not null,
  title text not null,
  primary key (course_id, id),
  foreign key (course_id, chapter_id) references public.curriculum_chapters(course_id, id) on delete cascade,
  unique (course_id, chapter_id)
);

create table public.assignment_outcome_compositions (
  course_id text not null,
  id text not null,
  assignment_id text not null,
  outcome_id text not null,
  primary key (course_id, id),
  foreign key (course_id, assignment_id) references public.course_assignments(course_id, id) on delete cascade,
  foreign key (course_id, outcome_id) references public.chapter_outcomes(course_id, id) on delete cascade,
  unique (course_id, assignment_id, outcome_id)
);

create table public.final_projects (
  course_id text not null references public.courses(id) on delete cascade,
  id text not null,
  title text not null,
  description text not null,
  primary key (course_id, id)
);

create table public.final_project_outcome_compositions (
  course_id text not null,
  id text not null,
  final_project_id text not null,
  outcome_id text not null,
  primary key (course_id, id),
  foreign key (course_id, final_project_id) references public.final_projects(course_id, id) on delete cascade,
  foreign key (course_id, outcome_id) references public.chapter_outcomes(course_id, id) on delete cascade,
  unique (course_id, final_project_id, outcome_id)
);

create table public.course_mapping_runs (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id),
  input_revision text not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  provider text not null,
  model text not null,
  prompt_version text not null,
  schema_versions jsonb not null check (jsonb_typeof(schema_versions) = 'array'),
  executions jsonb not null default '[]'::jsonb check (jsonb_typeof(executions) = 'array'),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status = 'failed' and error_code is not null and error_message is not null)
    or (status = 'completed' and completed_at is not null and error_code is null and error_message is null)
    or status = 'running')
);

create index assignment_dependencies_target_idx on public.assignment_dependencies(course_id, target_assignment_id);
create index assignment_outcome_compositions_outcome_idx on public.assignment_outcome_compositions(course_id, outcome_id);
create index course_mapping_runs_course_idx on public.course_mapping_runs(course_id, created_at desc);

alter table public.assignment_dependencies enable row level security;
alter table public.chapter_outcomes enable row level security;
alter table public.assignment_outcome_compositions enable row level security;
alter table public.final_projects enable row level security;
alter table public.final_project_outcome_compositions enable row level security;
alter table public.course_mapping_runs enable row level security;

create policy assignment_dependencies_authenticated_read on public.assignment_dependencies for select to authenticated using (true);
create policy chapter_outcomes_authenticated_read on public.chapter_outcomes for select to authenticated using (true);
create policy assignment_outcome_compositions_authenticated_read on public.assignment_outcome_compositions for select to authenticated using (true);
create policy final_projects_authenticated_read on public.final_projects for select to authenticated using (true);
create policy final_project_outcome_compositions_authenticated_read on public.final_project_outcome_compositions for select to authenticated using (true);

grant select on public.assignment_dependencies, public.chapter_outcomes, public.assignment_outcome_compositions,
  public.final_projects, public.final_project_outcome_compositions to authenticated;
revoke all on public.course_mapping_runs from anon, authenticated;
grant all privileges on public.course_mapping_runs to service_role;

create or replace function public.persist_course_mapping(target_run_id uuid, payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  mapping_run public.course_mapping_runs;
  item jsonb;
begin
  select * into mapping_run from public.course_mapping_runs where id = target_run_id and status = 'running' for update;
  if mapping_run.id is null then raise exception 'course_mapping_run_not_running'; end if;
  if (select generation_status from public.courses where id = mapping_run.course_id) not in ('curriculum-generated', 'ready') then raise exception 'course_mapping_invalid_course_status'; end if;
  if (select revision from public.courses where id = mapping_run.course_id) <> mapping_run.input_revision then raise exception 'course_mapping_input_revision_changed'; end if;

  delete from public.material_knowledge_coverages where course_id = mapping_run.course_id;
  for item in select value from jsonb_array_elements(payload->'materialKnowledgeCoverages') loop
    insert into public.material_knowledge_coverages (course_id, id, material_id, segment_id, node_id, role)
    values (mapping_run.course_id, item->>'id', item->>'materialId', item->>'segmentId', item->>'nodeId', item->>'role');
  end loop;

  update public.course_assignments set display_order = display_order + 100000 where course_id = mapping_run.course_id;
  for item in select value from jsonb_array_elements(payload->'assignments') loop
    insert into public.course_assignments (course_id, id, display_order, title, description, requirements, expected_output, acceptance_criteria, mode, workflow_template_id, estimated_minutes, project_contribution)
    values (mapping_run.course_id, item->>'id', (item->>'order')::integer, item->>'title', item->>'description', item->'requirements', item->>'expectedOutput', item->'acceptanceCriteria', item->>'mode', item->>'workflowTemplateId', (item->>'estimatedMinutes')::integer, item->>'projectContribution')
    on conflict (course_id, id) do update set display_order = excluded.display_order, title = excluded.title, description = excluded.description,
      requirements = excluded.requirements, expected_output = excluded.expected_output, acceptance_criteria = excluded.acceptance_criteria,
      mode = excluded.mode, workflow_template_id = excluded.workflow_template_id, estimated_minutes = excluded.estimated_minutes, project_contribution = excluded.project_contribution;
  end loop;
  delete from public.course_assignments where course_id = mapping_run.course_id
    and id not in (select value->>'id' from jsonb_array_elements(payload->'assignments'));

  delete from public.assignment_coverages where course_id = mapping_run.course_id;
  for item in select value from jsonb_array_elements(payload->'assignmentCoverages') loop
    insert into public.assignment_coverages (course_id, id, assignment_id, node_id, role)
    values (mapping_run.course_id, item->>'id', item->>'assignmentId', item->>'nodeId', item->>'role');
  end loop;
  for item in select value from jsonb_array_elements(payload->'assignmentDependencies') loop
    insert into public.assignment_dependencies (course_id, id, source_assignment_id, target_assignment_id, strength)
    values (mapping_run.course_id, item->>'id', item->>'sourceAssignmentId', item->>'targetAssignmentId', item->>'strength')
    on conflict (course_id, id) do update set source_assignment_id = excluded.source_assignment_id, target_assignment_id = excluded.target_assignment_id, strength = excluded.strength;
  end loop;
  delete from public.assignment_dependencies where course_id = mapping_run.course_id
    and id not in (select value->>'id' from jsonb_array_elements(payload->'assignmentDependencies'));

  for item in select value from jsonb_array_elements(payload->'chapterOutcomes') loop
    insert into public.chapter_outcomes (course_id, id, chapter_id, title)
    values (mapping_run.course_id, item->>'id', item->>'chapterId', item->>'title')
    on conflict (course_id, id) do update set chapter_id = excluded.chapter_id, title = excluded.title;
  end loop;
  delete from public.chapter_outcomes where course_id = mapping_run.course_id
    and id not in (select value->>'id' from jsonb_array_elements(payload->'chapterOutcomes'));
  for item in select value from jsonb_array_elements(payload->'assignmentOutcomeCompositions') loop
    insert into public.assignment_outcome_compositions (course_id, id, assignment_id, outcome_id)
    values (mapping_run.course_id, item->>'id', item->>'assignmentId', item->>'outcomeId')
    on conflict (course_id, id) do update set assignment_id = excluded.assignment_id, outcome_id = excluded.outcome_id;
  end loop;
  delete from public.assignment_outcome_compositions where course_id = mapping_run.course_id
    and id not in (select value->>'id' from jsonb_array_elements(payload->'assignmentOutcomeCompositions'));
  for item in select value from jsonb_array_elements(payload->'finalProjects') loop
    insert into public.final_projects (course_id, id, title, description)
    values (mapping_run.course_id, item->>'id', item->>'title', item->>'description')
    on conflict (course_id, id) do update set title = excluded.title, description = excluded.description;
  end loop;
  delete from public.final_projects where course_id = mapping_run.course_id
    and id not in (select value->>'id' from jsonb_array_elements(payload->'finalProjects'));
  for item in select value from jsonb_array_elements(payload->'finalProjectOutcomeCompositions') loop
    insert into public.final_project_outcome_compositions (course_id, id, final_project_id, outcome_id)
    values (mapping_run.course_id, item->>'id', item->>'finalProjectId', item->>'outcomeId')
    on conflict (course_id, id) do update set final_project_id = excluded.final_project_id, outcome_id = excluded.outcome_id;
  end loop;
  delete from public.final_project_outcome_compositions where course_id = mapping_run.course_id
    and id not in (select value->>'id' from jsonb_array_elements(payload->'finalProjectOutcomeCompositions'));

  update public.courses set generation_status = 'ready', updated_at = now() where id = mapping_run.course_id;
  update public.course_mapping_runs set status = 'completed', executions = payload->'executions', completed_at = now() where id = target_run_id;
end;
$$;

revoke all on function public.persist_course_mapping(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.persist_course_mapping(uuid, jsonb) to service_role;

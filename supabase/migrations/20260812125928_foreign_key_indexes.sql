create index course_assignments_workflow_template_idx
  on public.course_assignments(workflow_template_id)
  where workflow_template_id is not null;
create index curriculum_sequences_target_lesson_idx
  on public.curriculum_sequences(course_id, target_lesson_id);
create index domain_assignment_candidates_domain_idx
  on public.domain_assignment_candidates(domain_id);
create index knowledge_node_revisions_previous_idx
  on public.knowledge_node_revisions(previous_revision_id)
  where previous_revision_id is not null;
create index knowledge_nodes_current_revision_idx
  on public.knowledge_nodes(current_revision_id);
create index materials_uploaded_by_idx
  on public.materials(uploaded_by)
  where uploaded_by is not null;
create index user_assignment_states_assignment_idx
  on public.user_assignment_states(course_id, assignment_id);
create index user_course_states_recent_lesson_idx
  on public.user_course_states(course_id, recent_lesson_id);
create index user_knowledge_states_node_idx
  on public.user_knowledge_states(node_id);
create index user_knowledge_states_source_node_idx
  on public.user_knowledge_states(source_node_id)
  where source_node_id is not null;
create index user_material_states_segment_idx
  on public.user_material_states(course_id, material_id, recent_segment_id);
create index workflow_runs_assignment_idx
  on public.workflow_runs(course_id, assignment_id)
  where course_id is not null and assignment_id is not null;

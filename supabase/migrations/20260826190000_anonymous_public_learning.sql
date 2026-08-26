-- Anonymous Viewer access for public learning content. Guest has no learner
-- identity: no profile, progress, assistant, draft, or user-owned policy is added.

grant usage on schema public to anon;
grant select on public.knowledge_nodes, public.knowledge_node_revisions, public.knowledge_edges,
  public.knowledge_domains, public.domain_assignments, public.courses, public.course_curricula,
  public.curriculum_chapters, public.curriculum_lessons, public.curriculum_coverages,
  public.curriculum_sequences, public.course_assignments, public.assignment_coverages,
  public.assignment_dependencies, public.chapter_outcomes, public.assignment_outcome_compositions,
  public.final_projects, public.final_project_outcome_compositions, public.materials,
  public.material_segments, public.material_knowledge_coverages, public.micro_learning_paths,
  public.micro_units, public.micro_steps, public.h5p_contents to anon;

create policy knowledge_nodes_anon_public_read on public.knowledge_nodes for select to anon
  using (scope = 'global' and status = 'active');
create policy knowledge_node_revisions_anon_public_read on public.knowledge_node_revisions for select to anon
  using (exists (select 1 from public.knowledge_nodes n
    where n.id = node_id and n.current_revision_id = id and n.scope = 'global' and n.status = 'active'));
create policy knowledge_edges_anon_public_read on public.knowledge_edges for select to anon
  using (lifecycle_status = 'active'
    and exists (select 1 from public.knowledge_nodes n where n.id = source_node_id and n.scope = 'global' and n.status = 'active')
    and exists (select 1 from public.knowledge_nodes n where n.id = target_node_id and n.scope = 'global' and n.status = 'active'));
create policy knowledge_domains_anon_public_read on public.knowledge_domains for select to anon using (status = 'active');
create policy domain_assignments_anon_public_read on public.domain_assignments for select to anon
  using (exists (select 1 from public.knowledge_nodes n where n.id = node_id and n.scope = 'global' and n.status = 'active'));

create policy courses_anon_public_read on public.courses for select to anon using (lifecycle = 'published');
create policy course_curricula_anon_public_read on public.course_curricula for select to anon
  using (exists (select 1 from public.courses c where c.id = course_id and c.lifecycle = 'published'));
create policy curriculum_chapters_anon_public_read on public.curriculum_chapters for select to anon
  using (exists (select 1 from public.courses c where c.id = course_id and c.lifecycle = 'published'));
create policy curriculum_lessons_anon_public_read on public.curriculum_lessons for select to anon
  using (exists (select 1 from public.courses c where c.id = course_id and c.lifecycle = 'published'));
create policy curriculum_coverages_anon_public_read on public.curriculum_coverages for select to anon
  using (exists (select 1 from public.courses c where c.id = course_id and c.lifecycle = 'published'));
create policy curriculum_sequences_anon_public_read on public.curriculum_sequences for select to anon
  using (exists (select 1 from public.courses c where c.id = course_id and c.lifecycle = 'published'));
create policy course_assignments_anon_public_read on public.course_assignments for select to anon
  using (exists (select 1 from public.courses c where c.id = course_id and c.lifecycle = 'published'));
create policy assignment_coverages_anon_public_read on public.assignment_coverages for select to anon
  using (exists (select 1 from public.courses c where c.id = course_id and c.lifecycle = 'published'));
create policy assignment_dependencies_anon_public_read on public.assignment_dependencies for select to anon
  using (exists (select 1 from public.courses c where c.id = course_id and c.lifecycle = 'published'));
create policy chapter_outcomes_anon_public_read on public.chapter_outcomes for select to anon
  using (exists (select 1 from public.courses c where c.id = course_id and c.lifecycle = 'published'));
create policy assignment_outcome_compositions_anon_public_read on public.assignment_outcome_compositions for select to anon
  using (exists (select 1 from public.courses c where c.id = course_id and c.lifecycle = 'published'));
create policy final_projects_anon_public_read on public.final_projects for select to anon
  using (exists (select 1 from public.courses c where c.id = course_id and c.lifecycle = 'published'));
create policy final_project_outcome_compositions_anon_public_read on public.final_project_outcome_compositions for select to anon
  using (exists (select 1 from public.courses c where c.id = course_id and c.lifecycle = 'published'));
create policy materials_anon_public_read on public.materials for select to anon
  using (exists (select 1 from public.courses c where c.id = course_id and c.lifecycle = 'published'));
create policy material_segments_anon_public_read on public.material_segments for select to anon
  using (exists (select 1 from public.courses c where c.id = course_id and c.lifecycle = 'published'));
create policy material_knowledge_coverages_anon_public_read on public.material_knowledge_coverages for select to anon
  using (exists (select 1 from public.courses c where c.id = course_id and c.lifecycle = 'published'));

create policy micro_learning_paths_anon_public_read on public.micro_learning_paths for select to anon
  using (status = 'published'
    and exists (select 1 from public.knowledge_nodes n where n.id = knowledge_id and n.scope = 'global' and n.status = 'active')
    and (course_id is null or exists (select 1 from public.courses c where c.id = course_id and c.lifecycle = 'published')));
create policy micro_units_anon_public_read on public.micro_units for select to anon
  using (exists (select 1 from public.micro_learning_paths p where p.id = path_id));
create policy micro_steps_anon_public_read on public.micro_steps for select to anon
  using (exists (select 1 from public.micro_units u where u.id = unit_id));
create policy h5p_contents_anon_public_read on public.h5p_contents for select to anon using (status = 'published');

-- Original PDF assets stay private at the bucket level; only shared assets
-- referenced by a Published Course may be signed/read anonymously.
grant select on storage.objects to anon;
create policy course_materials_anon_public_read on storage.objects for select to anon
  using (bucket_id = 'course-materials'
    and (storage.foldername(name))[1] = 'shared'
    and exists (
      select 1 from public.materials m
      join public.courses c on c.id = m.course_id
      where m.storage_path = name and c.lifecycle = 'published'
    ));

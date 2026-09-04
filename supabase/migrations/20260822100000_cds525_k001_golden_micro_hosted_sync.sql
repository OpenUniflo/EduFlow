-- Hosted-safe CDS525 K001 Golden Micro synchronization.
-- The Hosted database already owns the complete CDS525 Course, K001 coverage,
-- and optional AssignmentCoverage. Reuse those canonical rows and add only the
-- missing Micro content. H5P package bytes are imported separately.

begin;
do $$
begin
  if not exists (
    select 1 from public.courses
    where id = 'cds525-deep-learning' and lifecycle = 'published'
  ) then
    raise exception 'cds525_k001_sync_missing_published_course';
  end if;

  if not exists (
    select 1 from public.knowledge_nodes
    where id = 'CDS525-K001' and status = 'active'
  ) then
    raise exception 'cds525_k001_sync_missing_active_knowledge';
  end if;

  if not exists (
    select 1 from public.curriculum_coverages
    where course_id = 'cds525-deep-learning'
      and node_id = 'CDS525-K001'
      and role = 'introduce'
  ) then
    raise exception 'cds525_k001_sync_missing_curriculum_coverage';
  end if;

  if not exists (
    select 1 from public.assignment_coverages
    where course_id = 'cds525-deep-learning'
      and node_id = 'CDS525-K001'
  ) then
    raise exception 'cds525_k001_sync_missing_assignment_coverage';
  end if;
end $$;
insert into public.h5p_contents (
  id, content_type, title, storage_path, library_name, library_major,
  library_minor, status, revision, completion_policy, source_url, license
) values (
  'cds525-h5p-k001-rule-vs-learning',
  'drag-and-drop',
  'Deep Learning: Rule vs Learning',
  'cds525-h5p-k001-rule-vs-learning/1',
  'H5P.DragQuestion',
  1,
  14,
  'draft',
  1,
  'passed',
  null,
  'CC BY 4.0 · EduFlow'
)
on conflict (id) do update set
  content_type = excluded.content_type,
  title = excluded.title,
  storage_path = excluded.storage_path,
  library_name = excluded.library_name,
  library_major = excluded.library_major,
  library_minor = excluded.library_minor,
  revision = excluded.revision,
  completion_policy = excluded.completion_policy,
  source_url = excluded.source_url,
  license = excluded.license,
  updated_at = now();
insert into public.micro_learning_paths (
  id, knowledge_id, course_id, scope, title, description, mode,
  estimated_minutes, required, status, revision
) values (
  'cds525-k001-rule-vs-learning',
  'CDS525-K001',
  'cds525-deep-learning',
  'course',
  'Deep Learning: Rule vs Learning',
  'Distinguish explicit rules from learning-based problems, then identify what training learns.',
  'learn',
  8,
  true,
  'published',
  1
)
on conflict (id) do update set
  knowledge_id = excluded.knowledge_id,
  course_id = excluded.course_id,
  scope = excluded.scope,
  title = excluded.title,
  description = excluded.description,
  mode = excluded.mode,
  estimated_minutes = excluded.estimated_minutes,
  required = excluded.required,
  status = excluded.status,
  revision = excluded.revision,
  updated_at = now();
insert into public.micro_units (
  id, path_id, title, description, position, estimated_minutes, required
) values
  (
    'cds525-k001-rule-vs-learning-unit-1',
    'cds525-k001-rule-vs-learning',
    'Understand Learning Problems',
    'Classify problems and connect the distinction to model training.',
    0,
    6,
    true
  ),
  (
    'cds525-k001-rule-vs-learning-unit-2',
    'cds525-k001-rule-vs-learning',
    'Summary',
    'Consolidate the rule-versus-learning distinction.',
    1,
    2,
    true
  )
on conflict (id) do update set
  path_id = excluded.path_id,
  title = excluded.title,
  description = excluded.description,
  position = excluded.position,
  estimated_minutes = excluded.estimated_minutes,
  required = excluded.required,
  updated_at = now();
insert into public.micro_steps (
  id, unit_id, position, kind, title, content, interaction,
  success_feedback, retry_feedback
) values
  (
    'cds525-k001-rule-vs-learning-step-h5p',
    'cds525-k001-rule-vs-learning-unit-1',
    0,
    'interaction',
    'Classify Rule and Learning Problems',
    'Drag each problem to the category that best describes how it should be solved.',
    '{"type":"h5p","contentRef":"cds525-h5p-k001-rule-vs-learning","adapter":"h5p-standalone","completionPolicy":"passed"}'::jsonb,
    'Correct: fixed transformations and format checks can use explicit rules; perception and language classification are better learned from data.',
    'Review whether the task has a complete explicit procedure or instead depends on patterns in examples.'
  ),
  (
    'cds525-k001-rule-vs-learning-step-explanation',
    'cds525-k001-rule-vs-learning-unit-1',
    1,
    'explanation',
    'Learning Replaces Handwritten Rules',
    'Deep Learning focuses on learning useful representations and prediction functions from data instead of manually writing every rule.',
    null,
    null,
    null
  ),
  (
    'cds525-k001-rule-vs-learning-step-model-parameters',
    'cds525-k001-rule-vs-learning-unit-1',
    2,
    'interaction',
    'What Training Learns',
    'During training, what does a deep learning model mainly learn?',
    '{"type":"multiple-choice","options":["Training dataset","Model parameters","Test set","Labels"],"correctIndexes":[1]}'::jsonb,
    'Correct: training adjusts the model parameters using examples and labels.',
    'The dataset and labels are inputs to training; the adjustable result is the model parameters.'
  ),
  (
    'cds525-k001-rule-vs-learning-step-summary',
    'cds525-k001-rule-vs-learning-unit-2',
    0,
    'summary',
    'Rule vs Learning Summary',
    'Use explicit rules when a complete procedure is known. Use deep learning when useful representations and prediction functions must be learned from data; training primarily learns model parameters.',
    null,
    null,
    null
  )
on conflict (id) do update set
  unit_id = excluded.unit_id,
  position = excluded.position,
  kind = excluded.kind,
  title = excluded.title,
  content = excluded.content,
  interaction = excluded.interaction,
  success_feedback = excluded.success_feedback,
  retry_feedback = excluded.retry_feedback,
  updated_at = now();
commit;

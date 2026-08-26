-- CDS525 K001 Golden Micro. Course content remains canonical database data;
-- the corresponding H5P package is imported separately through import-h5p.ts.

begin;
set constraints all deferred;
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
);
insert into public.knowledge_nodes (
  id, title, description, node_type, mastery_criteria, scope, owner_id,
  provenance, current_revision_id, status, tags, metadata
) values (
  'CDS525-K001',
  'Deep Learning - Rule vs Learning',
  'Distinguish problems that can be solved with explicit rules from problems whose useful prediction functions are learned from data.',
  'conceptual',
  '["Can distinguish explicit-rule problems from data-learning problems.","Can identify model parameters as the main learned result of training."]'::jsonb,
  'global',
  null,
  '[{"sourceType":"course","sourceId":"cds525-deep-learning","discoveredAt":"2026-08-21T00:00:00.000Z"}]'::jsonb,
  'CDS525-K001-r1',
  'active',
  '["deep-learning","rule-vs-learning"]'::jsonb,
  '{"courseCode":"CDS525","knowledgeCode":"K001"}'::jsonb
);
insert into public.knowledge_node_revisions (
  id, node_id, version, title, description, node_type, mastery_criteria,
  created_by, previous_revision_id, change_reason
) values (
  'CDS525-K001-r1',
  'CDS525-K001',
  1,
  'Deep Learning - Rule vs Learning',
  'Distinguish problems that can be solved with explicit rules from problems whose useful prediction functions are learned from data.',
  'conceptual',
  '["Can distinguish explicit-rule problems from data-learning problems.","Can identify model parameters as the main learned result of training."]'::jsonb,
  'EduFlow',
  null,
  'Initial CDS525 K001 Golden Micro revision'
);
insert into public.courses (
  id, title, subtitle, description, accent_color, revision,
  generation_status, target_outcome, lifecycle
) values (
  'cds525-deep-learning',
  'CDS525 Deep Learning',
  'Chapter 1 · Rule vs Learning',
  'A minimal CDS525 course slice for learning when explicit rules are sufficient and when models should learn from data.',
  '#4F46E5',
  '1',
  'ready',
  'Distinguish explicit-rule solutions from learning-based solutions and identify what a deep learning model learns during training.',
  'published'
);
insert into public.course_curricula (
  course_id, id, generation_mode, requested_chapter_count, source_structure_id
) values (
  'cds525-deep-learning',
  'cds525-deep-learning-curriculum',
  'manual',
  1,
  null
);
insert into public.curriculum_chapters (
  course_id, id, title, description, display_order, color, outcome
) values (
  'cds525-deep-learning',
  'chapter-1',
  'Chapter 1',
  'Foundations of deep learning as learning useful representations and prediction functions from data.',
  0,
  '#4F46E5',
  'Explain the difference between explicit rules and learning from data.'
);
insert into public.curriculum_lessons (
  course_id, id, chapter_id, title, display_order
) values (
  'cds525-deep-learning',
  'lesson-1-rule-vs-learning',
  'chapter-1',
  'Rule vs Learning',
  0
);
insert into public.curriculum_coverages (
  course_id, id, lesson_id, node_id, role, display_order
) values (
  'cds525-deep-learning',
  'coverage-k001-introduce',
  'lesson-1-rule-vs-learning',
  'CDS525-K001',
  'introduce',
  0
);
insert into public.course_assignments (
  course_id, id, display_order, title, description, requirements,
  expected_output, acceptance_criteria, mode, workflow_template_id,
  estimated_minutes, project_contribution
) values (
  'cds525-deep-learning',
  'assignment-k001-rule-vs-learning',
  0,
  'Rule vs Learning Classification Practice',
  'Classify representative problems by whether explicit rules are sufficient or learning from data is more appropriate.',
  '["Classify each supplied problem into one of the two categories."]'::jsonb,
  'A short classification with one-sentence reasoning for each problem.',
  '["Every problem is classified.","The reasoning distinguishes fixed rules from patterns learned from examples."]'::jsonb,
  'instruction',
  null,
  10,
  null
);
insert into public.assignment_coverages (
  course_id, id, assignment_id, node_id, role, required
) values (
  'cds525-deep-learning',
  'assignment-coverage-k001',
  'assignment-k001-rule-vs-learning',
  'CDS525-K001',
  'practice',
  false
);
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
);
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
  );
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
  );
commit;

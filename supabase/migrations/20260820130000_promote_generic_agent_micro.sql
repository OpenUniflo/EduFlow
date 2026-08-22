-- AG01 content is course-neutral. Preserve the stable Path identity so existing
-- progress and Evidence remain valid while making it available standalone.
update public.micro_learning_paths
set course_id = null,
    scope = 'global',
    updated_at = now()
where id = 'golden-micro-AG01'
  and knowledge_id = 'AG01';

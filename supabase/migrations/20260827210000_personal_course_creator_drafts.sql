-- Course Creator persists a learner-owned Personal Course only at Step 5.
-- Drafts stay owner-private through can_read_course; publication remains an
-- explicit authenticated API action. Existing Published Personal Courses are
-- unchanged and the older direct-publish RPC remains available for compatibility.

alter table public.courses drop constraint courses_type_owner_check;
alter table public.courses add constraint courses_type_owner_check check (
  (course_type = 'standard' and owner_user_id is null)
  or (course_type = 'personal' and owner_user_id is not null)
);

create or replace function public.create_personal_course_draft(
  p_owner_user_id uuid,
  p_goal_text text,
  p_source_course_id text,
  p_target_knowledge_ids text[],
  p_chapters jsonb
) returns table (course_id text)
language plpgsql security definer set search_path = '' as $$
declare
  created_course_id text := 'personal-' || gen_random_uuid()::text;
  curriculum_id text := created_course_id || ':curriculum';
  chapter jsonb;
  node_id text;
  chapter_index integer := 0;
  node_order integer;
  all_knowledge_ids text[] := array[]::text[];
  created_chapter_id text;
  created_lesson_id text;
begin
  if p_owner_user_id is null or length(btrim(coalesce(p_goal_text, ''))) = 0 or length(p_goal_text) > 1000 then
    raise exception 'invalid_personal_course_draft_request' using errcode = '22023';
  end if;
  if jsonb_typeof(p_chapters) <> 'array' or jsonb_array_length(p_chapters) = 0 or jsonb_array_length(p_chapters) > 20 then
    raise exception 'personal_course_draft_chapters_required' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_target_knowledge_ids), 0) = 0 then
    raise exception 'personal_course_target_required' using errcode = '22023';
  end if;

  for chapter in select value from jsonb_array_elements(p_chapters) loop
    if length(btrim(coalesce(chapter ->> 'title', ''))) = 0 or jsonb_typeof(chapter -> 'knowledgeIds') <> 'array' then
      raise exception 'invalid_personal_course_draft_chapter' using errcode = '22023';
    end if;
    for node_id in select jsonb_array_elements_text(chapter -> 'knowledgeIds') loop
      all_knowledge_ids := array_append(all_knowledge_ids, node_id);
    end loop;
  end loop;
  if coalesce(cardinality(all_knowledge_ids), 0) = 0
    or (select count(distinct value) from unnest(all_knowledge_ids) value) <> cardinality(all_knowledge_ids)
    or (select count(distinct value) from unnest(p_target_knowledge_ids) value) <> cardinality(p_target_knowledge_ids) then
    raise exception 'invalid_personal_course_draft_knowledge' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_target_knowledge_ids) value where not (value = any(all_knowledge_ids))) then
    raise exception 'personal_course_target_outside_scope' using errcode = '22023';
  end if;
  if (select count(*) from public.knowledge_nodes node
      where node.id = any(all_knowledge_ids) and node.status = 'active'
        and (node.scope = 'global' or (node.scope = 'user' and node.owner_id = p_owner_user_id::text))) <> cardinality(all_knowledge_ids) then
    raise exception 'personal_course_knowledge_unavailable' using errcode = '22023';
  end if;
  if p_source_course_id is not null and not exists (
    select 1 from public.courses source
    where source.id = p_source_course_id and source.lifecycle = 'published'
      and (source.course_type = 'standard' or source.owner_user_id = p_owner_user_id)
  ) then
    raise exception 'personal_course_source_unavailable' using errcode = '22023';
  end if;

  insert into public.courses(id,title,description,target_outcome,accent_color,generation_status,lifecycle,course_type,owner_user_id,source_course_id,author_user_id,revision)
  values(created_course_id,left(btrim(p_goal_text),80),'根据 Course Creation Brief 与已确认 Knowledge 范围创建的个人课程。',btrim(p_goal_text),'#7567e8','draft','draft','personal',p_owner_user_id,p_source_course_id,p_owner_user_id,'creator-draft-1');
  insert into public.course_curricula(course_id,id,generation_mode) values(created_course_id,curriculum_id,'manual');

  for chapter in select value from jsonb_array_elements(p_chapters) loop
    created_chapter_id := created_course_id || ':chapter:' || chapter_index::text;
    created_lesson_id := created_course_id || ':lesson:' || chapter_index::text;
    insert into public.curriculum_chapters(course_id,id,title,description,display_order,color,outcome)
    values(created_course_id,created_chapter_id,left(btrim(chapter ->> 'title'),160),'由 Course Creator 已确认结构生成。',chapter_index,
      (array['#7567e8','#3aa68f','#e59645','#5c8ddc'])[(chapter_index % 4) + 1],btrim(p_goal_text));
    insert into public.curriculum_lessons(course_id,id,chapter_id,title,display_order)
    values(created_course_id,created_lesson_id,created_chapter_id,left(btrim(chapter ->> 'title'),160),chapter_index);
    node_order := 0;
    for node_id in select jsonb_array_elements_text(chapter -> 'knowledgeIds') loop
      insert into public.curriculum_coverages(course_id,id,lesson_id,node_id,role,display_order)
      values(created_course_id,created_course_id || ':coverage:' || chapter_index::text || ':' || node_order::text,created_lesson_id,node_id,
        case when node_id = any(p_target_knowledge_ids) then 'assess' else 'introduce' end,node_order);
      node_order := node_order + 1;
    end loop;
    if chapter_index > 0 then
      insert into public.curriculum_sequences(course_id,id,source_lesson_id,target_lesson_id)
      values(created_course_id,created_course_id || ':sequence:' || (chapter_index - 1)::text,created_course_id || ':lesson:' || (chapter_index - 1)::text,created_lesson_id);
    end if;
    chapter_index := chapter_index + 1;
  end loop;
  foreach node_id in array p_target_knowledge_ids loop
    insert into public.course_target_knowledge(course_id,knowledge_id,required) values(created_course_id,node_id,true);
  end loop;

  course_id := created_course_id;
  return next;
end $$;

revoke all on function public.create_personal_course_draft(uuid,text,text,text[],jsonb) from public, anon, authenticated;
grant execute on function public.create_personal_course_draft(uuid,text,text,text[],jsonb) to service_role;

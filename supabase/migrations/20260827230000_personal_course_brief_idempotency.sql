-- One owned Course Creation Brief has at most one Personal Course. The stable
-- message identity is both the audit provenance and the refresh/re-open key.

alter table public.courses
  add column creation_brief_message_id uuid references public.assistant_messages(id) on delete restrict;

-- UUIDs are identities, not chronology. A per-table monotonic sequence keeps
-- exchanges in their persisted timeline position even when one insert shares a timestamp.
alter table public.assistant_messages
  add column sequence bigint generated always as identity;

create unique index assistant_messages_session_sequence_idx
  on public.assistant_messages(session_id, sequence);

create unique index courses_personal_creation_brief_unique
  on public.courses(creation_brief_message_id)
  where creation_brief_message_id is not null;

create or replace function public.create_personal_course_draft_for_brief(
  p_owner_user_id uuid,
  p_creation_brief_message_id uuid,
  p_goal_text text,
  p_source_course_id text,
  p_target_knowledge_ids text[],
  p_chapters jsonb
) returns table (course_id text, lifecycle text)
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
  existing_course record;
  replacing_existing boolean := false;
begin
  if p_owner_user_id is null or p_creation_brief_message_id is null
    or length(btrim(coalesce(p_goal_text, ''))) = 0 or length(p_goal_text) > 1000 then
    raise exception 'invalid_personal_course_draft_request' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.assistant_messages message
    join public.assistant_sessions session on session.id = message.session_id
    where message.id = p_creation_brief_message_id and session.user_id = p_owner_user_id
      and message.structured_content ->> 'type' = 'course_creation_brief'
  ) then
    raise exception 'personal_course_creation_brief_unavailable' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_creation_brief_message_id::text, 0));
  select existing.id, existing.lifecycle into existing_course
  from public.courses existing
  where existing.creation_brief_message_id = p_creation_brief_message_id
    and existing.course_type = 'personal' and existing.owner_user_id = p_owner_user_id;
  if found then
    if existing_course.lifecycle <> 'draft' then
      course_id := existing_course.id;
      lifecycle := existing_course.lifecycle;
      return next;
      return;
    end if;
    replacing_existing := true;
    created_course_id := existing_course.id;
    curriculum_id := created_course_id || ':curriculum';
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

  if replacing_existing then
    delete from public.course_target_knowledge where course_id = created_course_id;
    delete from public.curriculum_sequences where course_id = created_course_id;
    delete from public.curriculum_coverages where course_id = created_course_id;
    delete from public.curriculum_lessons where course_id = created_course_id;
    delete from public.curriculum_chapters where course_id = created_course_id;
    update public.courses set title=left(btrim(p_goal_text),80), target_outcome=btrim(p_goal_text), source_course_id=p_source_course_id,
      revision='creator-draft-' || extract(epoch from clock_timestamp())::bigint::text, updated_at=now()
    where id=created_course_id and lifecycle='draft' and owner_user_id=p_owner_user_id;
  else
    insert into public.courses(id,title,description,target_outcome,accent_color,generation_status,lifecycle,course_type,owner_user_id,source_course_id,author_user_id,revision,creation_brief_message_id)
    values(created_course_id,left(btrim(p_goal_text),80),'根据课程创建需求与已确认学习范围创建的个人课程。',btrim(p_goal_text),'#7567e8','draft','draft','personal',p_owner_user_id,p_source_course_id,p_owner_user_id,'creator-draft-1',p_creation_brief_message_id);
    insert into public.course_curricula(course_id,id,generation_mode) values(created_course_id,curriculum_id,'manual');
  end if;

  for chapter in select value from jsonb_array_elements(p_chapters) loop
    created_chapter_id := created_course_id || ':chapter:' || chapter_index::text;
    created_lesson_id := created_course_id || ':lesson:' || chapter_index::text;
    insert into public.curriculum_chapters(course_id,id,title,description,display_order,color,outcome)
    values(created_course_id,created_chapter_id,left(btrim(chapter ->> 'title'),160),'由课程创建器已确认结构生成。',chapter_index,
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
  lifecycle := 'draft';
  return next;
end $$;

revoke all on function public.create_personal_course_draft_for_brief(uuid,uuid,text,text,text[],jsonb) from public, anon, authenticated;
grant execute on function public.create_personal_course_draft_for_brief(uuid,uuid,text,text,text[],jsonb) to service_role;

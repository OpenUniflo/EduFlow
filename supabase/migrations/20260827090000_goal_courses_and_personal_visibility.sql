-- Goal-driven Course selection keeps standard and personal Courses in one
-- domain while preserving owner-only Personal Course visibility.

alter table public.courses
  add column course_type text not null default 'standard'
    check (course_type in ('standard', 'personal')),
  add column owner_user_id uuid references auth.users(id) on delete cascade,
  add column source_course_id text references public.courses(id) on delete set null;

alter table public.courses
  add constraint courses_type_owner_check check (
    (course_type = 'standard' and owner_user_id is null)
    or (course_type = 'personal' and owner_user_id is not null and lifecycle = 'published')
  ),
  add constraint courses_source_not_self check (source_course_id is null or source_course_id <> id);

create index courses_owner_idx on public.courses(owner_user_id) where owner_user_id is not null;
create index courses_source_idx on public.courses(source_course_id) where source_course_id is not null;

create table public.course_target_knowledge (
  course_id text not null references public.courses(id) on delete cascade,
  knowledge_id text not null references public.knowledge_nodes(id),
  required boolean not null default true,
  primary key (course_id, knowledge_id)
);
create index course_target_knowledge_node_idx on public.course_target_knowledge(knowledge_id);
alter table public.course_target_knowledge enable row level security;

-- SECURITY DEFINER avoids recursive Course RLS while retaining auth.uid() as
-- the only learner ownership authority. Managers may inspect standard drafts;
-- Personal Courses remain owner-only, including from teachers/admins.
create or replace function public.can_read_course(p_course_id text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.courses course
    where course.id = p_course_id and (
      (course.course_type = 'standard' and course.lifecycle = 'published')
      or (course.course_type = 'personal' and course.owner_user_id = (select auth.uid()))
      or (course.course_type = 'standard' and exists (
        select 1 from public.profiles profile
        where profile.id = (select auth.uid()) and profile.role in ('teacher', 'admin')
      ))
    )
  );
$$;
revoke all on function public.can_read_course(text) from public;
grant execute on function public.can_read_course(text) to anon, authenticated, service_role;

drop policy if exists courses_authenticated_read on public.courses;
create policy courses_authenticated_read on public.courses for select to authenticated
  using (public.can_read_course(id));
drop policy if exists courses_anon_public_read on public.courses;
create policy courses_anon_public_read on public.courses for select to anon
  using (course_type = 'standard' and lifecycle = 'published');
drop policy if exists courses_teacher_update on public.courses;
create policy courses_teacher_update on public.courses for update to authenticated
  using (course_type = 'standard' and exists (
    select 1 from public.profiles profile where profile.id = (select auth.uid()) and profile.role in ('teacher', 'admin')
  ))
  with check (course_type = 'standard' and owner_user_id is null and exists (
    select 1 from public.profiles profile where profile.id = (select auth.uid()) and profile.role in ('teacher', 'admin')
  ));

drop policy if exists course_curricula_authenticated_read on public.course_curricula;
create policy course_curricula_authenticated_read on public.course_curricula for select to authenticated using (public.can_read_course(course_id));
drop policy if exists curriculum_chapters_authenticated_read on public.curriculum_chapters;
create policy curriculum_chapters_authenticated_read on public.curriculum_chapters for select to authenticated using (public.can_read_course(course_id));
drop policy if exists curriculum_lessons_authenticated_read on public.curriculum_lessons;
create policy curriculum_lessons_authenticated_read on public.curriculum_lessons for select to authenticated using (public.can_read_course(course_id));
drop policy if exists curriculum_coverages_authenticated_read on public.curriculum_coverages;
create policy curriculum_coverages_authenticated_read on public.curriculum_coverages for select to authenticated using (public.can_read_course(course_id));
drop policy if exists curriculum_sequences_authenticated_read on public.curriculum_sequences;
create policy curriculum_sequences_authenticated_read on public.curriculum_sequences for select to authenticated using (public.can_read_course(course_id));
drop policy if exists course_assignments_authenticated_read on public.course_assignments;
create policy course_assignments_authenticated_read on public.course_assignments for select to authenticated using (public.can_read_course(course_id));
drop policy if exists assignment_coverages_authenticated_read on public.assignment_coverages;
create policy assignment_coverages_authenticated_read on public.assignment_coverages for select to authenticated using (public.can_read_course(course_id));
drop policy if exists assignment_dependencies_authenticated_read on public.assignment_dependencies;
create policy assignment_dependencies_authenticated_read on public.assignment_dependencies for select to authenticated using (public.can_read_course(course_id));
drop policy if exists chapter_outcomes_authenticated_read on public.chapter_outcomes;
create policy chapter_outcomes_authenticated_read on public.chapter_outcomes for select to authenticated using (public.can_read_course(course_id));
drop policy if exists assignment_outcome_compositions_authenticated_read on public.assignment_outcome_compositions;
create policy assignment_outcome_compositions_authenticated_read on public.assignment_outcome_compositions for select to authenticated using (public.can_read_course(course_id));
drop policy if exists final_projects_authenticated_read on public.final_projects;
create policy final_projects_authenticated_read on public.final_projects for select to authenticated using (public.can_read_course(course_id));
drop policy if exists final_project_outcome_compositions_authenticated_read on public.final_project_outcome_compositions;
create policy final_project_outcome_compositions_authenticated_read on public.final_project_outcome_compositions for select to authenticated using (public.can_read_course(course_id));
drop policy if exists materials_authenticated_read on public.materials;
create policy materials_authenticated_read on public.materials for select to authenticated using (public.can_read_course(course_id));
drop policy if exists material_segments_authenticated_read on public.material_segments;
create policy material_segments_authenticated_read on public.material_segments for select to authenticated using (public.can_read_course(course_id));
drop policy if exists material_knowledge_coverages_authenticated_read on public.material_knowledge_coverages;
create policy material_knowledge_coverages_authenticated_read on public.material_knowledge_coverages for select to authenticated using (public.can_read_course(course_id));
create policy course_target_knowledge_authenticated_read on public.course_target_knowledge for select to authenticated using (public.can_read_course(course_id));

drop policy if exists course_curricula_anon_public_read on public.course_curricula;
create policy course_curricula_anon_public_read on public.course_curricula for select to anon using (public.can_read_course(course_id));
drop policy if exists curriculum_chapters_anon_public_read on public.curriculum_chapters;
create policy curriculum_chapters_anon_public_read on public.curriculum_chapters for select to anon using (public.can_read_course(course_id));
drop policy if exists curriculum_lessons_anon_public_read on public.curriculum_lessons;
create policy curriculum_lessons_anon_public_read on public.curriculum_lessons for select to anon using (public.can_read_course(course_id));
drop policy if exists curriculum_coverages_anon_public_read on public.curriculum_coverages;
create policy curriculum_coverages_anon_public_read on public.curriculum_coverages for select to anon using (public.can_read_course(course_id));
drop policy if exists curriculum_sequences_anon_public_read on public.curriculum_sequences;
create policy curriculum_sequences_anon_public_read on public.curriculum_sequences for select to anon using (public.can_read_course(course_id));
drop policy if exists course_assignments_anon_public_read on public.course_assignments;
create policy course_assignments_anon_public_read on public.course_assignments for select to anon using (public.can_read_course(course_id));
drop policy if exists assignment_coverages_anon_public_read on public.assignment_coverages;
create policy assignment_coverages_anon_public_read on public.assignment_coverages for select to anon using (public.can_read_course(course_id));
drop policy if exists assignment_dependencies_anon_public_read on public.assignment_dependencies;
create policy assignment_dependencies_anon_public_read on public.assignment_dependencies for select to anon using (public.can_read_course(course_id));
drop policy if exists chapter_outcomes_anon_public_read on public.chapter_outcomes;
create policy chapter_outcomes_anon_public_read on public.chapter_outcomes for select to anon using (public.can_read_course(course_id));
drop policy if exists assignment_outcome_compositions_anon_public_read on public.assignment_outcome_compositions;
create policy assignment_outcome_compositions_anon_public_read on public.assignment_outcome_compositions for select to anon using (public.can_read_course(course_id));
drop policy if exists final_projects_anon_public_read on public.final_projects;
create policy final_projects_anon_public_read on public.final_projects for select to anon using (public.can_read_course(course_id));
drop policy if exists final_project_outcome_compositions_anon_public_read on public.final_project_outcome_compositions;
create policy final_project_outcome_compositions_anon_public_read on public.final_project_outcome_compositions for select to anon using (public.can_read_course(course_id));
drop policy if exists materials_anon_public_read on public.materials;
create policy materials_anon_public_read on public.materials for select to anon using (public.can_read_course(course_id));
drop policy if exists material_segments_anon_public_read on public.material_segments;
create policy material_segments_anon_public_read on public.material_segments for select to anon using (public.can_read_course(course_id));
drop policy if exists material_knowledge_coverages_anon_public_read on public.material_knowledge_coverages;
create policy material_knowledge_coverages_anon_public_read on public.material_knowledge_coverages for select to anon using (public.can_read_course(course_id));
create policy course_target_knowledge_anon_public_read on public.course_target_knowledge for select to anon using (public.can_read_course(course_id));

drop policy if exists micro_learning_paths_authenticated_read on public.micro_learning_paths;
create policy micro_learning_paths_authenticated_read on public.micro_learning_paths for select to authenticated
  using (status = 'published' and (course_id is null or public.can_read_course(course_id)));
drop policy if exists micro_learning_paths_anon_public_read on public.micro_learning_paths;
create policy micro_learning_paths_anon_public_read on public.micro_learning_paths for select to anon
  using (status = 'published' and exists (select 1 from public.knowledge_nodes node where node.id = knowledge_id and node.scope = 'global' and node.status = 'active')
    and (course_id is null or public.can_read_course(course_id)));

drop policy if exists course_materials_authenticated_read on storage.objects;
create policy course_materials_authenticated_read on storage.objects for select to authenticated
  using (bucket_id = 'course-materials' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or ((storage.foldername(name))[1] = 'shared' and exists (
      select 1 from public.materials material
      where material.storage_path = name and public.can_read_course(material.course_id)
    ))
  ));
drop policy if exists course_materials_anon_public_read on storage.objects;
create policy course_materials_anon_public_read on storage.objects for select to anon
  using (bucket_id = 'course-materials' and (storage.foldername(name))[1] = 'shared'
    and exists (select 1 from public.materials material where material.storage_path = name and public.can_read_course(material.course_id)));

grant select on public.course_target_knowledge to anon, authenticated;

-- This is the single transactional Personal Course write boundary. The API
-- authenticates the owner and passes only a revalidated visible Knowledge set.
create or replace function public.create_personal_course(
  p_owner_user_id uuid,
  p_goal_text text,
  p_source_course_id text,
  p_target_knowledge_ids text[],
  p_ordered_knowledge_ids text[]
) returns table (course_id text)
language plpgsql security definer set search_path = '' as $$
declare
  created_course_id text := 'personal-' || gen_random_uuid()::text;
  curriculum_id text := created_course_id || ':curriculum';
  chapter_id text := created_course_id || ':chapter:1';
  lesson_id text := created_course_id || ':lesson:1';
  node_id text;
  node_order integer := 0;
begin
  if p_owner_user_id is null or length(btrim(coalesce(p_goal_text, ''))) = 0 then
    raise exception 'invalid_personal_course_request' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_target_knowledge_ids), 0) = 0 or coalesce(cardinality(p_ordered_knowledge_ids), 0) = 0 then
    raise exception 'personal_course_knowledge_required' using errcode = '22023';
  end if;
  if (select count(distinct value) from unnest(p_ordered_knowledge_ids) value) <> cardinality(p_ordered_knowledge_ids)
    or (select count(distinct value) from unnest(p_target_knowledge_ids) value) <> cardinality(p_target_knowledge_ids) then
    raise exception 'duplicate_personal_course_knowledge' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_target_knowledge_ids) value where not (value = any(p_ordered_knowledge_ids))) then
    raise exception 'personal_course_target_outside_scope' using errcode = '22023';
  end if;
  if (select count(*) from public.knowledge_nodes node
      where node.id = any(p_ordered_knowledge_ids) and node.status = 'active'
        and (node.scope = 'global' or (node.scope = 'user' and node.owner_id = p_owner_user_id::text))) <> cardinality(p_ordered_knowledge_ids) then
    raise exception 'personal_course_knowledge_unavailable' using errcode = '22023';
  end if;
  if p_source_course_id is not null and not exists (
    select 1 from public.courses source
    where source.id = p_source_course_id and source.lifecycle = 'published'
      and (source.course_type = 'standard' or source.owner_user_id = p_owner_user_id)
  ) then
    raise exception 'personal_course_source_unavailable' using errcode = '22023';
  end if;

  insert into public.courses(id,title,description,target_outcome,accent_color,generation_status,lifecycle,course_type,owner_user_id,source_course_id,revision)
  values(created_course_id,left(btrim(p_goal_text),80),'根据你的学习目标，从共享 Knowledge 构建的个人课程。',btrim(p_goal_text),'#7d6ee7','ready','published','personal',p_owner_user_id,p_source_course_id,'personal-1');
  insert into public.course_curricula(course_id,id,generation_mode) values(created_course_id,curriculum_id,'manual');
  insert into public.curriculum_chapters(course_id,id,title,description,display_order,color,outcome)
  values(created_course_id,chapter_id,'目标路线','目标 Knowledge 与其事实前置知识。',0,'#7d6ee7',btrim(p_goal_text));
  insert into public.curriculum_lessons(course_id,id,chapter_id,title,display_order)
  values(created_course_id,lesson_id,chapter_id,'目标 Knowledge 路线',0);

  foreach node_id in array p_ordered_knowledge_ids loop
    insert into public.curriculum_coverages(course_id,id,lesson_id,node_id,role,display_order)
    values(created_course_id,created_course_id || ':coverage:' || node_order::text,lesson_id,node_id,
      case when node_id = any(p_target_knowledge_ids) then 'assess' else 'introduce' end,node_order);
    node_order := node_order + 1;
  end loop;
  foreach node_id in array p_target_knowledge_ids loop
    insert into public.course_target_knowledge(course_id,knowledge_id,required) values(created_course_id,node_id,true);
  end loop;
  insert into public.user_course_states(user_id,course_id,is_active,updated_at)
  values(p_owner_user_id,created_course_id,true,now());

  course_id := created_course_id;
  return next;
end $$;

revoke all on function public.create_personal_course(uuid,text,text,text[],text[]) from public, anon, authenticated;
grant execute on function public.create_personal_course(uuid,text,text,text[],text[]) to service_role;

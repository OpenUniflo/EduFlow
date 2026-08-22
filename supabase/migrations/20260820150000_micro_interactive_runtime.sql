-- Micro Learning interactive runtime. Golden content remains ordinary
-- canonical Micro data; H5P packages are extracted into controlled Storage.

create table public.h5p_contents (
  id text primary key,
  content_type text not null check (content_type in ('drag-and-drop', 'fill-in-the-blanks', 'drag-the-words', 'question-set', 'branching-scenario')),
  title text not null check (length(trim(title)) > 0),
  storage_path text not null unique check (storage_path = id || '/' || revision::text),
  library_name text not null check (library_name ~ '^H5P\.[A-Za-z0-9.]+$'),
  library_major integer not null check (library_major >= 0),
  library_minor integer not null check (library_minor >= 0),
  status text not null check (status in ('draft', 'published', 'archived')),
  revision integer not null default 1 check (revision > 0),
  completion_policy text not null default 'passed' check (completion_policy in ('completed', 'passed')),
  source_url text,
  license text not null,
  package_sha256 text check (package_sha256 is null or package_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index h5p_contents_status_idx on public.h5p_contents(status, content_type);
alter table public.h5p_contents enable row level security;
create policy h5p_contents_published_read on public.h5p_contents
  for select to authenticated using (status = 'published');
grant select on public.h5p_contents to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('micro-h5p', 'micro-h5p', true, 52428800, null)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- Public retrieval is intentional because an H5P content tree loads many
-- relative assets. No authenticated write policy exists: controlled importers
-- use the server-only service role and learners cannot upload or overwrite.

create or replace function public.validate_micro_interaction(candidate jsonb)
returns boolean language sql immutable set search_path = public as $$
  select case
    when candidate is null then true
    when jsonb_typeof(candidate) <> 'object' then false
    when candidate->>'type' = 'choice' then
      jsonb_typeof(candidate->'options') = 'array'
      and jsonb_array_length(candidate->'options') >= 2
      and (candidate->>'correctIndex') ~ '^[0-9]+$'
      and (candidate->>'correctIndex')::integer < jsonb_array_length(candidate->'options')
    when candidate->>'type' = 'multiple-choice' then
      jsonb_typeof(candidate->'options') = 'array'
      and jsonb_array_length(candidate->'options') >= 2
      and jsonb_typeof(candidate->'correctIndexes') = 'array'
      and jsonb_array_length(candidate->'correctIndexes') > 0
      and not exists (
        select 1 from jsonb_array_elements(candidate->'correctIndexes') value
        where jsonb_typeof(value) <> 'number' or (value #>> '{}')::integer < 0
          or (value #>> '{}')::integer >= jsonb_array_length(candidate->'options')
      )
      and jsonb_array_length(candidate->'correctIndexes') = (
        select count(distinct value #>> '{}') from jsonb_array_elements(candidate->'correctIndexes') value
      )
    when candidate->>'type' = 'fill-blank' then
      jsonb_typeof(candidate->'answers') = 'array'
      and jsonb_array_length(candidate->'answers') > 0
      and not exists (select 1 from jsonb_array_elements_text(candidate->'answers') answer where length(trim(answer)) = 0)
    when candidate->>'type' = 'ordering' then
      jsonb_typeof(candidate->'items') = 'array' and jsonb_typeof(candidate->'correctOrder') = 'array'
      and jsonb_array_length(candidate->'items') >= 2
      and jsonb_array_length(candidate->'items') = jsonb_array_length(candidate->'correctOrder')
      and not exists ((select value from jsonb_array_elements_text(candidate->'items') value except select value from jsonb_array_elements_text(candidate->'correctOrder') value)
        union all (select value from jsonb_array_elements_text(candidate->'correctOrder') value except select value from jsonb_array_elements_text(candidate->'items') value))
      and jsonb_array_length(candidate->'items') = (select count(distinct value) from jsonb_array_elements_text(candidate->'items') value)
    when candidate->>'type' = 'trace' then
      jsonb_typeof(candidate->'steps') = 'array' and jsonb_array_length(candidate->'steps') >= 2
      and exists (select 1 from jsonb_array_elements(candidate->'steps') step where step->>'id' = candidate->>'correctStepId')
    when candidate->>'type' = 'mini-workflow' then
      jsonb_typeof(candidate->'nodes') = 'array' and jsonb_typeof(candidate->'correctOrder') = 'array'
      and jsonb_array_length(candidate->'nodes') >= 2
      and jsonb_array_length(candidate->'nodes') = jsonb_array_length(candidate->'correctOrder')
      and not exists ((select value from jsonb_array_elements_text(candidate->'nodes') value except select value from jsonb_array_elements_text(candidate->'correctOrder') value)
        union all (select value from jsonb_array_elements_text(candidate->'correctOrder') value except select value from jsonb_array_elements_text(candidate->'nodes') value))
    when candidate->>'type' = 'h5p' then
      length(trim(coalesce(candidate->>'contentRef', ''))) > 0
      and coalesce(candidate->>'adapter', 'h5p-standalone') = 'h5p-standalone'
      and coalesce(candidate->>'completionPolicy', 'passed') in ('completed', 'passed')
    else false
  end
$$;

alter table public.micro_steps add constraint micro_steps_interaction_valid
  check (public.validate_micro_interaction(interaction));

insert into public.h5p_contents (id, content_type, title, storage_path, library_name, library_major, library_minor, status, revision, completion_policy, source_url, license)
values
  ('golden-h5p-workflow-drag-drop', 'drag-and-drop', 'Workflow 角色定位', 'golden-h5p-workflow-drag-drop/1', 'H5P.DragQuestion', 1, 14, 'draft', 1, 'passed', 'https://h5p.org/drag-and-drop', 'CC BY 4.0 · H5P Group'),
  ('golden-h5p-agent-fill-blanks', 'fill-in-the-blanks', 'Agent 行动循环填空', 'golden-h5p-agent-fill-blanks/1', 'H5P.Blanks', 1, 14, 'draft', 1, 'passed', 'https://h5p.org/fill-in-the-blanks', 'CC BY 4.0 · H5P Group'),
  ('golden-h5p-agent-drag-words', 'drag-the-words', 'Agent 组件归位', 'golden-h5p-agent-drag-words/1', 'H5P.DragText', 1, 10, 'draft', 1, 'passed', 'https://h5p.org/drag-the-words', 'CC BY 4.0 · H5P Group'),
  ('golden-h5p-recovery-question-set', 'question-set', 'Failure Recovery 综合检查', 'golden-h5p-recovery-question-set/1', 'H5P.QuestionSet', 1, 20, 'draft', 1, 'passed', 'https://h5p.org/question-set', 'CC BY 4.0 · H5P Group')
on conflict (id) do update set title=excluded.title, status=excluded.status, updated_at=now();

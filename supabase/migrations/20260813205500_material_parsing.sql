create table public.material_parsing_jobs (
  id uuid primary key default gen_random_uuid(),
  course_id text not null,
  material_id text not null,
  source_storage_path text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  attempt integer not null default 0 check (attempt >= 0),
  parser_version text not null,
  adapter_version text not null,
  source_sha256 text,
  raw_artifact_path text,
  normalized_artifact_path text,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (course_id, material_id) references public.materials(course_id, id) on delete cascade,
  unique (course_id, material_id),
  check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$'),
  check ((status = 'completed' and raw_artifact_path is not null and normalized_artifact_path is not null and error_code is null and error_message is null)
    or status <> 'completed'),
  check ((status = 'failed' and error_code is not null and error_message is not null) or status <> 'failed')
);

create index material_parsing_jobs_status_idx on public.material_parsing_jobs(status, updated_at);
alter table public.material_parsing_jobs enable row level security;
create policy material_parsing_jobs_authenticated_read on public.material_parsing_jobs for select to authenticated using (true);
grant select on public.material_parsing_jobs to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('material-parser-artifacts', 'material-parser-artifacts', false, 104857600, array['application/json'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.claim_material_parsing_job(target_id uuid)
returns public.material_parsing_jobs
language plpgsql
security definer
set search_path = public
as $$
declare claimed public.material_parsing_jobs;
begin
  update public.material_parsing_jobs
  set status = 'running', attempt = attempt + 1, started_at = now(), completed_at = null,
      error_code = null, error_message = null, updated_at = now()
  where id = target_id and status = 'pending'
  returning * into claimed;
  if claimed.id is null then raise exception 'material_parse_job_not_pending'; end if;
  return claimed;
end;
$$;

create or replace function public.complete_material_parsing_job(
  target_id uuid, expected_attempt integer, parsed_source_sha256 text, raw_path text, normalized_path text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.material_parsing_jobs
  set status = 'completed', source_sha256 = parsed_source_sha256, raw_artifact_path = raw_path,
      normalized_artifact_path = normalized_path, completed_at = now(), updated_at = now()
  where id = target_id and status = 'running' and attempt = expected_attempt;
  if not found then raise exception 'material_parse_job_not_running'; end if;
end;
$$;

create or replace function public.fail_material_parsing_job(target_id uuid, expected_attempt integer, failure_code text, failure_message text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.material_parsing_jobs
  set status = 'failed', error_code = left(failure_code, 80), error_message = left(failure_message, 1000),
      completed_at = now(), updated_at = now()
  where id = target_id and status = 'running' and attempt = expected_attempt;
  if not found then raise exception 'material_parse_job_not_running'; end if;
end;
$$;

revoke all on function public.claim_material_parsing_job(uuid) from public, anon, authenticated;
revoke all on function public.complete_material_parsing_job(uuid, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.fail_material_parsing_job(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.claim_material_parsing_job(uuid) to service_role;
grant execute on function public.complete_material_parsing_job(uuid, integer, text, text, text) to service_role;
grant execute on function public.fail_material_parsing_job(uuid, integer, text, text) to service_role;

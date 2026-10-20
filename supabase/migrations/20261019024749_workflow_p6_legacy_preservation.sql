-- Deployment prerequisite: preserve pre-release rows before the existing V2
-- retirement migration. No browser/runtime fallback or new learning authority.
create schema if not exists workflow_archive;
revoke all on schema workflow_archive from public,anon,authenticated,service_role,workflow_worker;
create table if not exists workflow_archive.legacy_records (
 source_table text not null,
 row_hash text not null,
 record jsonb not null,
 captured_at timestamptz not null default now(),
 batch text not null default 'p6-hosted-legacy-retirement',
 primary key(source_table,row_hash)
);
alter table workflow_archive.legacy_records enable row level security;
revoke all on workflow_archive.legacy_records from public,anon,authenticated,service_role,workflow_worker;
create or replace function workflow_archive.capture_legacy_row()
returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb;
begin
 if TG_OP in ('UPDATE','DELETE') then
  row_data:=to_jsonb(OLD);
  insert into workflow_archive.legacy_records(source_table,row_hash,record)
  values(TG_TABLE_NAME,encode(sha256(convert_to(row_data::text,'UTF8')),'hex'),row_data) on conflict do nothing;
 end if;
 if TG_OP in ('INSERT','UPDATE') then
  row_data:=to_jsonb(NEW);
  -- Newly published V2 templates are not an unbounded archive stream.
  if TG_TABLE_NAME<>'workflow_templates' or row_data#>>'{definition,schemaVersion}' is distinct from '2.0' then
   insert into workflow_archive.legacy_records(source_table,row_hash,record)
   values(TG_TABLE_NAME,encode(sha256(convert_to(row_data::text,'UTF8')),'hex'),row_data) on conflict do nothing;
  end if;
 end if;
 if TG_OP='DELETE' then return OLD;else return NEW;end if;
end $$;
revoke all on function workflow_archive.capture_legacy_row() from public,anon,authenticated,service_role,workflow_worker;
do $$ declare name text; begin
 foreach name in array array['workflow_runs','user_workflow_definitions','user_workflow_state','workflow_templates'] loop
  if to_regclass('public.'||name) is not null then
   -- Install capture while holding the initial snapshot lock: no gap for old app writes.
   execute format('lock table public.%I in share row exclusive mode',name);
   execute format('insert into workflow_archive.legacy_records(source_table,row_hash,record) select %L,encode(sha256(convert_to(to_jsonb(t)::text,''UTF8'')),''hex''),to_jsonb(t) from public.%I t on conflict do nothing',name,name);
   execute format('drop trigger if exists p6_preserve_legacy on public.%I',name);
   execute format('create trigger p6_preserve_legacy after insert or update or delete on public.%I for each row execute function workflow_archive.capture_legacy_row()',name);
  end if;
 end loop;
end $$;

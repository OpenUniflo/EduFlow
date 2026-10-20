-- Forward correction: only Legacy template versions enter the capture stream.
create or replace function workflow_archive.capture_legacy_row()
returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb;
begin
 if TG_OP in ('UPDATE','DELETE') then
  row_data:=to_jsonb(OLD);
  if TG_TABLE_NAME<>'workflow_templates' or row_data#>>'{definition,schemaVersion}' is distinct from '2.0' then
   insert into workflow_archive.legacy_records(source_table,row_hash,record)
   values(TG_TABLE_NAME,encode(sha256(convert_to(row_data::text,'UTF8')),'hex'),row_data) on conflict do nothing;
  end if;
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

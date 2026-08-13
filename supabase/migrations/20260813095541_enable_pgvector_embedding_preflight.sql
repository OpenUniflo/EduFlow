-- Phase 4 embedding foundation. Formal Knowledge embedding storage is deferred
-- until its revision and versioning contract is defined.
create extension if not exists vector
with schema extensions;

do $$
begin
  if not exists (
    select 1
    from pg_extension extension
    join pg_namespace namespace on namespace.oid = extension.extnamespace
    where extension.extname = 'vector'
      and namespace.nspname = 'extensions'
  ) then
    raise exception 'vector extension must be installed in the extensions schema';
  end if;
end
$$;

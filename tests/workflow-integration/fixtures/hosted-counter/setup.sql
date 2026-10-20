-- Disposable test objects, never read by the product. Remove with cleanup.sql.
create schema p6_acceptance;
revoke all on schema p6_acceptance from public,anon,authenticated,workflow_worker;
create table p6_acceptance.counter(key text primary key,n integer not null);
alter table p6_acceptance.counter enable row level security;
revoke all on p6_acceptance.counter from public,anon,authenticated,workflow_worker;
create function public.p6_acceptance_counter(p_key text,p_increment boolean)
returns integer language plpgsql security definer set search_path='' as $$
begin
 if p_key !~ '^p6-[0-9a-f-]{36}$' then raise exception 'INVALID_FIXTURE_KEY';end if;
 if p_increment then
  insert into p6_acceptance.counter values(p_key,1) on conflict(key) do update set n=p6_acceptance.counter.n+1;
 end if;
 return coalesce((select n from p6_acceptance.counter where key=p_key),0);
end $$;
revoke all on function public.p6_acceptance_counter(text,boolean) from public,anon,authenticated,workflow_worker;
grant execute on function public.p6_acceptance_counter(text,boolean) to service_role;

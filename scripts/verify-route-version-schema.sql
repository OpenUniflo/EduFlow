-- Transaction-only protocol/RLS audit. All test route writes are rolled back.
begin;
create temporary table route_audit_context as
select (select id from auth.users where email='2967618185@qq.com') learner,
       (select id from auth.users where email='admin@eduflow.test') other_user,
       (select id from public.courses where lifecycle='published' and course_type='standard' order by id limit 1) course;
grant select on route_audit_context to service_role,authenticated,anon;
set local role service_role;
do $$
declare c record; a jsonb; b jsonb; restored jsonb; other_route jsonb;
begin
  select * into c from route_audit_context;
  if c.learner is null or c.other_user is null or c.course is null then raise exception 'Audit requires existing test roles and a published course'; end if;
  a:=public.adopt_personal_course_route(c.learner,c.course,null,'initial','{}','{}','{"valid":true,"selectedNodeIds":[],"orderedNodeIds":[],"effectiveTargetNodeIds":[]}', 'transaction-only-audit',null);
  if (a->>'version_number')::int<>1 then raise exception 'Expected fresh initial audit version'; end if;
  if public.adopt_personal_course_route(c.learner,c.course,null,'initial','{}','{}','{}','ignored',null)->>'id' <> a->>'id' then raise exception 'Initial idempotency failed'; end if;
  b:=public.adopt_personal_course_route(c.learner,c.course,(a->>'id')::uuid,'adjustment','{}','{}','{"valid":true}', 'transaction-only-audit',null);
  begin
    perform public.adopt_personal_course_route(c.learner,c.course,(a->>'id')::uuid,'adjustment','{}','{}','{}','stale',null);
    raise exception 'Stale adoption unexpectedly allowed';
  exception when sqlstate 'PT409' then null; end;
  restored:=public.adopt_personal_course_route(c.learner,c.course,(b->>'id')::uuid,'restore','{}','{}','{"valid":true}', 'transaction-only-audit',(a->>'id')::uuid);
  if (restored->>'version_number')::int<>3 or restored->>'restored_from_version_id' <> a->>'id' then raise exception 'Restore is not a new version'; end if;
  if (select snapshot from public.personal_course_route_versions where id=(a->>'id')::uuid) <> a->'snapshot' then raise exception 'Initial snapshot mutated'; end if;
  begin
    update public.personal_course_route_versions set snapshot='{}' where id=(a->>'id')::uuid;
    raise exception 'Service may mutate history';
  exception when insufficient_privilege then null; end;
  other_route:=public.adopt_personal_course_route(c.other_user,c.course,null,'initial','{}','{}','{"valid":true}','other-user-audit',null);
  perform set_config('request.jwt.claim.sub',c.learner::text,true);
end $$;
reset role;
set local role authenticated;
do $$
declare c record; n integer;
begin
  select * into c from route_audit_context;
  select count(*) into n from public.personal_course_route_versions where course_id=c.course;
  if n<>3 then raise exception 'RLS does not isolate learner history: %',n; end if;
  if exists(select 1 from public.personal_course_routes where user_id=c.other_user) then raise exception 'Cross-user current route visible'; end if;
  begin
    perform public.adopt_personal_course_route(c.other_user,c.course,null,'initial','{}','{}','{}','forged',null);
    raise exception 'Authenticated role may execute privileged adoption';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.personal_course_routes(user_id,course_id) values(c.learner,c.course);
    raise exception 'Authenticated role may write current routes';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: Hosted transactional initialization, immutable history, linear restore, stale PT409, service-only mutation, own-read RLS' as result;
rollback;

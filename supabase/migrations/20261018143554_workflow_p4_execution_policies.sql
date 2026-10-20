-- P4 task attempts are durable across Run continuation. Catalog remains worker-only.
create table workflow_private.p4_attempts (
 thread_id uuid not null references public.workflow_execution_threads(thread_id) on delete cascade,
 task_id text not null, attempts integer not null default 0, handlers integer not null default 0,
 primary key(thread_id,task_id)
);
alter table workflow_private.p4_attempts enable row level security;
revoke all on workflow_private.p4_attempts from public,anon,authenticated;
create function workflow_private.p4_attempt(p_run uuid,p_token bigint,p_task text,p_max integer,p_handler boolean default false)
returns integer language plpgsql security definer set search_path='' as $$
declare t public.workflow_execution_threads; a workflow_private.p4_attempts; lim integer; n integer; begin
 perform workflow_private.check_lease(p_run,p_token);
 select e.* into t from public.workflow_execution_threads e join public.workflow_live_runs r using(thread_id) where r.run_id=p_run for update of e;
 if p_max<1 or p_max>10 then raise exception 'INVALID_ATTEMPT_LIMIT'; end if;
 insert into workflow_private.p4_attempts(thread_id,task_id) values(t.thread_id,p_task) on conflict do nothing;
 select * into a from workflow_private.p4_attempts where thread_id=t.thread_id and task_id=p_task for update;
 if (p_handler and a.handlers>=1) or (not p_handler and a.attempts>=p_max) then raise exception 'ATTEMPT_BUDGET_EXCEEDED'; end if;
 select (definition->'policy'->>'maxNodeExecutions')::integer into lim from public.workflow_revisions where owner_user_id=t.owner_user_id and workflow_id=t.workflow_id and revision=t.revision;
 if a.attempts>0 or p_handler then
  if t.node_executions>=lim then raise exception 'NODE_BUDGET_EXCEEDED'; end if;
  update public.workflow_execution_threads set node_executions=node_executions+1 where thread_id=t.thread_id;
 end if;
 update workflow_private.p4_attempts set attempts=attempts+case when p_handler then 0 else 1 end,handlers=handlers+case when p_handler then 1 else 0 end where thread_id=t.thread_id and task_id=p_task returning case when p_handler then handlers else attempts end into n;
 return n;
end $$;
create table workflow_private.p4_catalog (
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 environment_ref text not null, kind text not null check(kind in ('function','connection')),
 ref text not null, version integer not null check(version>0), content jsonb not null,
 disabled boolean not null default false, created_at timestamptz not null default now(),
 primary key(owner_user_id,environment_ref,kind,ref,version)
);
alter table workflow_private.p4_catalog enable row level security;
revoke all on workflow_private.p4_catalog from public,anon,authenticated;
create function workflow_private.p4_catalog_read(p_owner uuid,p_environment text) returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'ref',ref,'version',version,'disabled',disabled,'content',content) order by kind,ref,version),'[]'::jsonb) from workflow_private.p4_catalog where owner_user_id=p_owner and environment_ref=p_environment
$$;
create function workflow_private.p4_catalog_save(p_owner uuid,p_environment text,p_kind text,p_ref text,p_version integer,p_content jsonb,p_disable boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior workflow_private.p4_catalog; begin
 select * into prior from workflow_private.p4_catalog where owner_user_id=p_owner and environment_ref=p_environment and kind=p_kind and ref=p_ref and version=p_version for update;
 if p_disable then
  if not found then raise exception 'CATALOG_NOT_FOUND'; end if;
  update workflow_private.p4_catalog set disabled=true where owner_user_id=p_owner and environment_ref=p_environment and kind=p_kind and ref=p_ref and version=p_version;
 elsif found then
  if prior.content<>p_content then raise exception 'IMMUTABLE_VERSION'; end if;
 else
  insert into workflow_private.p4_catalog(owner_user_id,environment_ref,kind,ref,version,content) values(p_owner,p_environment,p_kind,p_ref,p_version,p_content);
 end if;
 return jsonb_build_object('ref',p_ref,'version',p_version,'disabled',p_disable);
end $$;
revoke all on function workflow_private.p4_attempt(uuid,bigint,text,integer,boolean),workflow_private.p4_catalog_read(uuid,text),workflow_private.p4_catalog_save(uuid,text,text,text,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function workflow_private.p4_attempt(uuid,bigint,text,integer,boolean),workflow_private.p4_catalog_read(uuid,text),workflow_private.p4_catalog_save(uuid,text,text,text,integer,jsonb,boolean) to workflow_worker;

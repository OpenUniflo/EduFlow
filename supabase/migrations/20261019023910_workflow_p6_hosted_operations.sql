-- Operator signals and MCP discovery are shared authority across ephemeral roles.
create table workflow_private.p6_service_signals (
 role text not null check (role in ('worker','watchdog')),
 instance_id uuid not null,
 executor_digest text not null,
 status text not null check(status in ('ok','error','draining')),
 observed_at timestamptz not null default now(),
 primary key(role,instance_id)
);
alter table workflow_private.p6_service_signals enable row level security;
revoke all on workflow_private.p6_service_signals from public,anon,authenticated,workflow_worker;
create table workflow_private.p6_discovery (
 key text primary key, connector_digest text not null, tools jsonb not null,
 updated_at timestamptz not null default now()
);
alter table workflow_private.p6_discovery enable row level security;
revoke all on workflow_private.p6_discovery from public,anon,authenticated,workflow_worker;

create function workflow_private.p6_signal(p_role text,p_instance uuid,p_digest text,p_status text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if length(p_digest)<>64 then raise exception 'INVALID_BUILD_IDENTITY';end if;
 insert into workflow_private.p6_service_signals(role,instance_id,executor_digest,status)
 values(p_role,p_instance,p_digest,p_status)
 on conflict(role,instance_id) do update set executor_digest=excluded.executor_digest,status=excluded.status,observed_at=now();
 delete from workflow_private.p6_service_signals where observed_at<now()-interval '1 day';
 return true;
end $$;
create function workflow_private.p6_health(p_digest text)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('worker',exists(select from workflow_private.p6_service_signals where role='worker' and executor_digest=p_digest and status='ok' and observed_at>now()-interval '20 seconds'),
 'watchdog',exists(select from workflow_private.p6_service_signals where role='watchdog' and executor_digest=p_digest and status='ok' and observed_at>now()-interval '20 seconds'));
$$;
create function workflow_private.p6_catalog_list()
returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(key,jsonb_build_object('connectorDigest',connector_digest,'tools',tools)),'{}') from workflow_private.p6_discovery;
$$;
create function workflow_private.p6_catalog_put(p_key text,p_digest text,p_tools jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if length(p_key)>512 or length(p_digest)<>64 or jsonb_typeof(p_tools)<>'array' or octet_length(p_tools::text)>1048576 then raise exception 'INVALID_CATALOG';end if;
 insert into workflow_private.p6_discovery(key,connector_digest,tools) values(p_key,p_digest,p_tools)
 on conflict(key) do update set connector_digest=excluded.connector_digest,tools=excluded.tools,updated_at=now();
 return true;
end $$;
revoke all on function workflow_private.p6_signal(text,uuid,text,text), workflow_private.p6_health(text), workflow_private.p6_catalog_list(), workflow_private.p6_catalog_put(text,text,jsonb) from public,anon,authenticated;
grant execute on function workflow_private.p6_signal(text,uuid,text,text), workflow_private.p6_health(text), workflow_private.p6_catalog_list(), workflow_private.p6_catalog_put(text,text,jsonb) to workflow_worker;

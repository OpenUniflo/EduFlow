begin;
create table public.workflow_workspace_configuration (
 owner_user_id uuid primary key references auth.users(id) on delete cascade,
 revision integer not null default 1 check(revision>0),
 variables jsonb not null default '[]'::jsonb check(jsonb_typeof(variables)='array'),
 updated_at timestamptz not null default now()
);
alter table public.workflow_workspace_configuration enable row level security;
create policy workflow_workspace_owner_read on public.workflow_workspace_configuration for select to authenticated using((select auth.uid())=owner_user_id);
revoke all on public.workflow_workspace_configuration from anon,authenticated;
grant select on public.workflow_workspace_configuration to authenticated,workflow_worker;
grant all on public.workflow_workspace_configuration to service_role;
-- Remaining historic Course references receive explicit empty V2 starting containers.
update public.workflow_templates set definition=jsonb_build_object(
 'schemaVersion','2.0','workflowId',id,'revision',0,'name',name,'description','实训起步草稿，请按课程要求配置节点与连接。',
 'inputSchema',jsonb_build_object('type','object','properties','{}'::jsonb,'additionalProperties',false),
 'outputSchema',jsonb_build_object('type','object','properties','{}'::jsonb,'additionalProperties',false),
 'state',jsonb_build_object('schema',jsonb_build_object('type','object','properties','{}'::jsonb,'additionalProperties',false),'initial','{}'::jsonb,'inputBindings','{}'::jsonb,'reducers','{}'::jsonb),
 'entryNodeId','start','nodes','[{"id":"start","label":"入口","type":"core.start","typeVersion":1,"config":{},"inputs":{},"writes":{}},{"id":"end","label":"结束","type":"core.end","typeVersion":1,"config":{},"inputs":{},"writes":{}}]'::jsonb,
 'transitions','[{"id":"start-next-end","from":"start","outlet":"next","to":"end"}]'::jsonb,
 'outputBindings','{}'::jsonb,'requiredCapabilities','[]'::jsonb,
 'policy','{"timeoutMs":120000,"nodeTimeoutMs":30000,"maxNodeExecutions":50,"maxToolCalls":10,"maxInputBytes":65536,"maxStateBytes":1048576,"maxEventBytes":65536,"maxOutputTokens":2048,"maxAttempts":1}'::jsonb),description='实训起步草稿，请按课程要求配置节点与连接。'
where definition->>'schemaVersion' is distinct from '2.0';
commit;

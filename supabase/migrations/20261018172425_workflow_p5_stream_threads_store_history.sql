begin;
-- Product-owned capabilities around the official SDK saver and Store.
create schema workflow_memory;
revoke all on schema workflow_memory from public,anon,authenticated;
grant usage on schema workflow_memory to workflow_worker;
create table workflow_memory.store(prefix text not null,key text not null,value jsonb not null,created_at timestamptz default now(),updated_at timestamptz default now(),expires_at timestamptz,ttl_minutes integer,primary key(prefix,key));
create index on workflow_memory.store(prefix text_pattern_ops);
create index on workflow_memory.store(expires_at) where expires_at is not null;
alter table workflow_memory.store enable row level security;
revoke all on workflow_memory.store from public,anon,authenticated;
grant select,insert,update,delete on workflow_memory.store to workflow_worker;
create policy worker_store on workflow_memory.store to workflow_worker using(true) with check(true);
alter table public.workflow_execution_threads add column round_number integer not null default 1,add column parent_thread_id uuid,add column parent_checkpoint_id text;
alter table public.workflow_live_runs add column operation text not null default 'initial';
create table workflow_private.p5_intents(thread_id uuid not null references public.workflow_execution_threads on delete cascade, task_id text not null, namespace jsonb not null, key text not null, operation text not null, value jsonb,expected integer not null,ttl integer,applied boolean not null default false,primary key(thread_id,task_id));
create table workflow_private.p5_requests(owner_user_id uuid not null references auth.users on delete cascade,key text not null,hash text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(owner_user_id,key));
create table workflow_private.p5_audit(id uuid primary key default gen_random_uuid(),owner_user_id uuid not null references auth.users on delete cascade,thread_id uuid not null references public.workflow_execution_threads on delete cascade,operation text not null,details jsonb not null,created_at timestamptz not null default now());
alter table workflow_private.p5_intents enable row level security;
alter table workflow_private.p5_requests enable row level security;
alter table workflow_private.p5_audit enable row level security;
revoke all on workflow_private.p5_intents,workflow_private.p5_requests,workflow_private.p5_audit from public,anon,authenticated;
grant select,insert,update,delete on workflow_private.p5_intents,workflow_private.p5_requests,workflow_private.p5_audit to workflow_worker;
create policy worker_intents on workflow_private.p5_intents to workflow_worker using(true) with check(true);
create policy worker_requests on workflow_private.p5_requests to workflow_worker using(true) with check(true);
create policy worker_audit on workflow_private.p5_audit to workflow_worker using(true) with check(true);
create function workflow_private.p5_read(p_owner uuid,p_kind text,p_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.workflow_execution_threads; begin
 if p_kind='threads' then return (select coalesce(jsonb_agg(to_jsonb(x)-'launch_context'-'snapshot' order by updated_at desc),'[]') from (select * from public.workflow_execution_threads where owner_user_id=p_owner and workflow_id=p_id and updated_at>now()-interval '7 days' order by updated_at desc limit 40) x); end if;
 select * into t from public.workflow_execution_threads where owner_user_id=p_owner and thread_id=p_id::uuid;
 if not found then raise exception 'NOT_FOUND'; end if;
 return jsonb_build_object('thread',to_jsonb(t)-'launch_context','definition',(select definition from public.workflow_revisions where owner_user_id=p_owner and workflow_id=t.workflow_id and revision=t.revision),'run',(select to_jsonb(r)-'registry_snapshot'-'launch_context' from public.workflow_live_runs r where r.run_id=t.current_run_id),'archived',coalesce((select archived from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=t.workflow_id),true));
end $$;
create function workflow_private.p5_branch(p_owner uuid,p_source uuid,p_target uuid,p_checkpoint text,p_state jsonb) returns void language plpgsql security definer set search_path='' as $$
declare t public.workflow_execution_threads; begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into t from public.workflow_execution_threads where owner_user_id=p_owner and thread_id=p_source for update;
 if not found or t.updated_at<=now()-interval '7 days' then raise exception 'NOT_FOUND'; end if;
 if (select count(*) from public.workflow_execution_threads where owner_user_id=p_owner and workflow_id=t.workflow_id and updated_at>now()-interval '7 days')>=40 then raise exception 'THREAD_QUOTA_EXCEEDED'; end if;
 insert into public.workflow_execution_threads(thread_id,owner_user_id,workflow_id,revision,snapshot,status,checkpoint_id,state,parent_thread_id,parent_checkpoint_id)
 values(p_target,p_owner,t.workflow_id,t.revision,t.snapshot,'closed',p_checkpoint,p_state,p_source,p_checkpoint);
end $$;
create function workflow_private.p5_head(p_owner uuid,p_thread uuid,p_checkpoint text,p_state jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.workflow_execution_threads set checkpoint_id=p_checkpoint,state=p_state,state_version=state_version+1,updated_at=now() where thread_id=p_thread and owner_user_id=p_owner and parent_thread_id is not null and current_run_id is null;
 if not found then raise exception 'THREAD_STATE_CONFLICT'; end if;
end $$;
create function workflow_private.p5_start(p_owner uuid,p_thread uuid,p_checkpoint text,p_input jsonb,p_mode text,p_key text,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.workflow_execution_threads; s jsonb; run uuid; msg bigint; prior workflow_private.p5_requests; result jsonb; begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into prior from workflow_private.p5_requests where owner_user_id=p_owner and key=p_key and created_at>now()-interval '24 hours';
 if found then if prior.hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;return prior.result;end if;
 select * into t from public.workflow_execution_threads where owner_user_id=p_owner and thread_id=p_thread for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if t.status<>'closed' or t.last_error is not null or t.checkpoint_id is distinct from p_checkpoint or t.updated_at<=now()-interval '7 days' then raise exception 'THREAD_STATE_CONFLICT'; end if;
 if p_mode not in ('next','branch') or p_mode='branch' and (t.parent_thread_id is null or t.current_run_id is not null) or p_mode='next' and not exists(select from public.workflow_live_runs where run_id=t.current_run_id and status='success') then raise exception 'THREAD_STATE_CONFLICT'; end if;
 if p_mode='next' and t.round_number>=20 then raise exception 'ROUND_BUDGET_EXCEEDED'; end if;
 if not exists(select from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=t.workflow_id and not archived) then raise exception 'WORKFLOW_ARCHIVED';end if;
 if (select count(*) from public.workflow_live_runs where owner_user_id=p_owner and status='queued')>=5 then raise exception 'RUN_QUOTA_EXCEEDED';end if;
 s:=t.snapshot;
 insert into public.workflow_live_runs(owner_user_id,workflow_id,revision,status,definition_hash,semantic_hash,compile_fingerprint,environment_ref,environment_revision,input,registry_snapshot,thread_id,operation)
 values(p_owner,t.workflow_id,t.revision,'queued',s->>'definition_hash',s->>'semantic_hash',s->>'compile_fingerprint',s->>'environment_ref',s->>'environment_revision',p_input,s->'registry_snapshot',t.thread_id,p_mode) returning run_id into run;
 msg:=pgmq.send('workflow_v2',jsonb_build_object('runId',run));insert into public.workflow_run_jobs(run_id,queue_msg_id) values(run,msg);
 update public.workflow_execution_threads set status='active',current_run_id=run,round_number=round_number+case when p_mode='next' then 1 else 0 end,snapshot=jsonb_set(snapshot,'{input}',p_input),wait_expires_at=null,updated_at=now() where thread_id=t.thread_id;
 perform workflow_private.event(run,'run.queued',jsonb_build_object('operation',p_mode,'threadId',t.thread_id));
 perform public.workflow_v2_prune(p_owner,t.workflow_id);
 result:=jsonb_build_object('runId',run,'threadId',t.thread_id,'revision',t.revision,'status','queued','eventsCursor',0);
 insert into workflow_private.p5_requests values(p_owner,p_key,p_hash,result,now()) on conflict(owner_user_id,key) do update set hash=p_hash,result=excluded.result,created_at=now();
 return result;
end $$;
create function workflow_private.p5_stream(p_run uuid,p_token bigint,p_type text,p_payload jsonb,p_step uuid,p_node text) returns boolean language plpgsql security definer set search_path='' as $$
declare n bigint; total bigint; begin
 perform workflow_private.check_lease(p_run,p_token);
 if p_type not in ('node.output.delta','node.output.end','node.progress','stream.gap') then raise exception 'INVALID_EVENT_TYPE'; end if;
 if octet_length(p_payload::text)>16384 then raise exception 'EVENT_TOO_LARGE';end if;
 select count(*),coalesce(sum(octet_length(payload::text)),0) into n,total from public.workflow_run_events where run_id=p_run and type like 'node.%';
 if n>=2048 or total>=1048576 then
  if not exists(select from public.workflow_run_events where run_id=p_run and type='stream.gap') then perform workflow_private.event(p_run,'stream.gap','{"reason":"stream_limit","calibrateFromFinal":true}');end if;
  return false;
 end if;
 perform workflow_private.event(p_run,p_type,p_payload,p_step,p_node);return true;
end $$;
-- Only trusted worker APIs call private functions. Browser roles cannot access them.
revoke all on all functions in schema workflow_private from public,anon,authenticated;
grant execute on function workflow_private.p5_read(uuid,text,text),workflow_private.p5_branch(uuid,uuid,uuid,text,jsonb),workflow_private.p5_head(uuid,uuid,text,jsonb),workflow_private.p5_start(uuid,uuid,text,jsonb,text,text,text),workflow_private.p5_stream(uuid,bigint,text,jsonb,uuid,text) to workflow_worker;
create function workflow_private.p5_workflow(p_owner uuid,p_id text) returns boolean language sql security definer set search_path='' as $$select exists(select from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=p_id and not archived)$$;
revoke all on function workflow_private.p5_workflow(uuid,text) from public,anon,authenticated;
grant execute on function workflow_private.p5_workflow(uuid,text) to workflow_worker;
commit;

-- A root may stay at the same SDK checkpoint while child interrupts are consumed.
-- Freeze its first published waiting observation instead of leaking later child work into history.
create table workflow_private.p5_scope_history(
 thread_id uuid not null references public.workflow_execution_threads on delete cascade,
 root_checkpoint_id text not null,namespace text not null,checkpoint_id text not null,
 primary key(thread_id,root_checkpoint_id,namespace));
alter table workflow_private.p5_scope_history enable row level security;
revoke all on workflow_private.p5_scope_history from public,anon,authenticated;
create function workflow_private.p5_freeze_history(p_run uuid,p_token bigint,p_root text) returns void
language plpgsql security definer set search_path='' as $$
declare t uuid; head text;begin
 perform workflow_private.check_lease(p_run,p_token);
 select r.thread_id,x.checkpoint_id into t,head from public.workflow_live_runs r join public.workflow_execution_threads x on x.thread_id=r.thread_id where r.run_id=p_run;
 if head is distinct from p_root or not exists(select from workflow_checkpoints.checkpoints where thread_id=t::text and checkpoint_ns='' and checkpoint_id=p_root) then raise exception 'CHECKPOINT_NOT_DURABLE';end if;
 if exists(select from workflow_private.p5_scope_history where thread_id=t and root_checkpoint_id=p_root and namespace='') then return;end if;
 insert into workflow_private.p5_scope_history values(t,p_root,'',p_root);
 insert into workflow_private.p5_scope_history(thread_id,root_checkpoint_id,namespace,checkpoint_id)
 select distinct on(namespace) t,p_root,namespace,checkpoint_id from workflow_private.scope_commits where thread_id=t order by namespace,checkpoint_id desc;
end $$;
drop function workflow_private.p5_scope_head(uuid,uuid,text,text);
create function workflow_private.p5_scope_head(p_owner uuid,p_thread uuid,p_namespace text,p_root text,p_upper text)
returns text language plpgsql security definer set search_path='' as $$
declare expected text;begin
 if not exists(select from public.workflow_execution_threads where thread_id=p_thread and owner_user_id=p_owner) then raise exception 'NOT_FOUND';end if;
 if exists(select from workflow_private.p5_scope_history where thread_id=p_thread and root_checkpoint_id=p_root and namespace='') then
  select checkpoint_id into expected from workflow_private.p5_scope_history where thread_id=p_thread and root_checkpoint_id=p_root and namespace=p_namespace;
 else
  select checkpoint_id into expected from workflow_private.scope_commits where thread_id=p_thread and namespace=p_namespace and (p_upper is null or checkpoint_id<p_upper) order by checkpoint_id desc limit 1;
 end if;
 if expected is not null and not exists(select from workflow_checkpoints.checkpoints where thread_id=p_thread::text and checkpoint_ns=p_namespace and checkpoint_id=expected) then raise exception 'CHECKPOINT_MISSING';end if;
 return expected;
end $$;
revoke all on function workflow_private.p5_freeze_history(uuid,bigint,text),workflow_private.p5_scope_head(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function workflow_private.p5_freeze_history(uuid,bigint,text),workflow_private.p5_scope_head(uuid,uuid,text,text,text) to workflow_worker;

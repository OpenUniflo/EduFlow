-- Retain only terminal eligibility, not a copy of pruned Run data.
alter table public.workflow_execution_threads add column last_run_succeeded boolean not null default false;
update public.workflow_execution_threads t set last_run_succeeded=true where exists(select from public.workflow_live_runs r where r.run_id=t.current_run_id and r.status='success');
create function workflow_private.p5_terminal_eligibility() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  update public.workflow_execution_threads set last_run_succeeded=(old.status='success') where current_run_id=old.run_id;
  return old;
 end if;
 update public.workflow_execution_threads set last_run_succeeded=(new.status='success') where current_run_id=new.run_id;
 return new;
end;
$$;
create trigger workflow_p5_terminal_eligibility after update of status or delete on public.workflow_live_runs for each row execute function workflow_private.p5_terminal_eligibility();
revoke all on function workflow_private.p5_terminal_eligibility() from public,anon,authenticated;
create or replace function workflow_private.p5_start(p_owner uuid,p_thread uuid,p_checkpoint text,p_input jsonb,p_mode text,p_key text,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.workflow_execution_threads; s jsonb; run uuid; msg bigint; prior workflow_private.p5_requests; result jsonb; begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into prior from workflow_private.p5_requests where owner_user_id=p_owner and key=p_key and created_at>now()-interval '24 hours';
 if found then if prior.hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;return prior.result;end if;
 select * into t from public.workflow_execution_threads where owner_user_id=p_owner and thread_id=p_thread for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if t.status<>'closed' or t.last_error is not null or t.checkpoint_id is distinct from p_checkpoint or t.updated_at<=now()-interval '7 days' then raise exception 'THREAD_STATE_CONFLICT'; end if;
 if p_mode not in ('next','branch') or p_mode='branch' and (t.parent_thread_id is null or t.current_run_id is not null) or p_mode='next' and not (t.last_run_succeeded or exists(select from public.workflow_live_runs where run_id=t.current_run_id and status='success')) then raise exception 'THREAD_STATE_CONFLICT'; end if;
 if p_mode='next' and t.round_number>=20 then raise exception 'ROUND_BUDGET_EXCEEDED'; end if;
 if not exists(select from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=t.workflow_id and not archived) then raise exception 'WORKFLOW_ARCHIVED';end if;
 if (select count(*) from public.workflow_live_runs where owner_user_id=p_owner and status='queued')>=5 then raise exception 'RUN_QUOTA_EXCEEDED';end if;
 s:=t.snapshot;
 insert into public.workflow_live_runs(owner_user_id,workflow_id,revision,status,definition_hash,semantic_hash,compile_fingerprint,environment_ref,environment_revision,input,registry_snapshot,thread_id,operation)
 values(p_owner,t.workflow_id,t.revision,'queued',s->>'definition_hash',s->>'semantic_hash',s->>'compile_fingerprint',s->>'environment_ref',s->>'environment_revision',p_input,s->'registry_snapshot',t.thread_id,p_mode) returning run_id into run;
 msg:=pgmq.send('workflow_v2',jsonb_build_object('runId',run));insert into public.workflow_run_jobs(run_id,queue_msg_id) values(run,msg);
 update public.workflow_execution_threads set status='active',current_run_id=run,last_run_succeeded=false,round_number=round_number+case when p_mode='next' then 1 else 0 end,snapshot=jsonb_set(snapshot,'{input}',p_input),wait_expires_at=null,updated_at=now() where thread_id=t.thread_id;
 perform workflow_private.event(run,'run.queued',jsonb_build_object('operation',p_mode,'threadId',t.thread_id));
 perform public.workflow_v2_prune(p_owner,t.workflow_id);
 result:=jsonb_build_object('runId',run,'threadId',t.thread_id,'revision',t.revision,'status','queued','eventsCursor',0);
 insert into workflow_private.p5_requests values(p_owner,p_key,p_hash,result,now()) on conflict(owner_user_id,key) do update set hash=p_hash,result=excluded.result,created_at=now();
 return result;
end $$;

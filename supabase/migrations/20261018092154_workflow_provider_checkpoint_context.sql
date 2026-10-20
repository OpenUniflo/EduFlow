begin;
alter table workflow_private.task_receipts add column provider_messages jsonb;
create function workflow_private.prepare_step(p_run uuid,p_token bigint,p_step uuid,p_output jsonb,p_patch jsonb,p_outlet text,p_usage jsonb,p_provider jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare t uuid; task text; begin
 perform workflow_private.prepare_step(p_run,p_token,p_step,p_output,p_patch,p_outlet,p_usage);
 select r.thread_id,s.execution_identity->>'taskId' into t,task from public.workflow_live_runs r join public.workflow_run_steps s using(run_id) where r.run_id=p_run and s.step_id=p_step;
 if exists(select from workflow_private.task_receipts where thread_id=t and task_id=task and provider_messages is not null and provider_messages<>p_provider) then raise exception 'TASK_RESULT_CONFLICT'; end if;
 update workflow_private.task_receipts set provider_messages=p_provider where thread_id=t and task_id=task;
 update workflow_private.task_journal set status='prepared' where thread_id=t and task_id=task;
end $$;
revoke all on function workflow_private.prepare_step(uuid,bigint,uuid,jsonb,jsonb,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function workflow_private.prepare_step(uuid,bigint,uuid,jsonb,jsonb,text,jsonb,jsonb) to workflow_worker;
commit;

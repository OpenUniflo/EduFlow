create function workflow_private.p5_sweep() returns void language plpgsql security definer set search_path='' as $$
begin
 delete from workflow_private.p5_requests where created_at<=now()-interval '24 hours';
 delete from workflow_private.p5_audit where created_at<=now()-interval '7 days';
 delete from workflow_memory.store where expires_at<=now();
 delete from public.workflow_execution_threads where parent_thread_id is not null and current_run_id is null and updated_at<=now()-interval '7 days';
end $$;
create function workflow_private.p5_unknown_effects(p_owner uuid,p_thread uuid) returns boolean language sql security definer set search_path='' as $$
 select exists(select from workflow_private.task_journal j join public.workflow_execution_threads t using(thread_id) where t.owner_user_id=p_owner and t.thread_id=p_thread and j.effect='write' and not exists(select from workflow_private.task_receipts r where r.thread_id=j.thread_id and r.task_id=j.task_id));
$$;
revoke all on function workflow_private.p5_sweep(),workflow_private.p5_unknown_effects(uuid,uuid) from public,anon,authenticated;
grant execute on function workflow_private.p5_sweep(),workflow_private.p5_unknown_effects(uuid,uuid) to workflow_worker;

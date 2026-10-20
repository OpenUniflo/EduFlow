create function workflow_private.p5_branch_input(p_owner uuid,p_thread uuid,p_input jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.workflow_execution_threads set snapshot=jsonb_set(snapshot,'{input}',p_input) where owner_user_id=p_owner and thread_id=p_thread and parent_thread_id is not null and current_run_id is null;
 if not found then raise exception 'THREAD_STATE_CONFLICT';end if;
end $$;
revoke all on function workflow_private.p5_branch_input(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function workflow_private.p5_branch_input(uuid,uuid,jsonb) to workflow_worker;

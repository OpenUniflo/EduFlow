create function workflow_private.p5_pending(p_run uuid,p_token bigint,p_parent text,p_scope text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid; rows jsonb; begin
 perform workflow_private.check_lease(p_run,p_token);
 select thread_id into t from public.workflow_live_runs where run_id=p_run;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.namespace::text,x.key),'[]') into rows from (select i.* from workflow_private.p5_intents i join workflow_private.task_receipts r using(thread_id,task_id) where i.thread_id=t and r.checkpoint_id=p_parent and coalesce(r.execution_identity->>'graphNamespace','')=p_scope and not i.applied for update of i) x;
 return rows;
end $$;
revoke all on function workflow_private.p5_pending(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function workflow_private.p5_pending(uuid,bigint,text,text) to workflow_worker;

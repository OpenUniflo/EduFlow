-- Official checkpoint IDs are time-ordered, as used by the SDK history cursor.
-- Keep the committed child identity even when its SDK row has gone missing.
create function workflow_private.p5_scope_head(p_owner uuid,p_thread uuid,p_namespace text,p_upper text)
returns text language plpgsql security definer set search_path='' as $$
declare expected text;begin
 if not exists(select from public.workflow_execution_threads where thread_id=p_thread and owner_user_id=p_owner) then raise exception 'NOT_FOUND';end if;
 select checkpoint_id into expected from workflow_private.scope_commits
 where thread_id=p_thread and namespace=p_namespace and (p_upper is null or checkpoint_id<p_upper)
 order by checkpoint_id desc limit 1;
 if expected is not null and not exists(select from workflow_checkpoints.checkpoints where thread_id=p_thread::text and checkpoint_ns=p_namespace and checkpoint_id=expected) then raise exception 'CHECKPOINT_MISSING';end if;
 return expected;
end $$;
revoke all on function workflow_private.p5_scope_head(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function workflow_private.p5_scope_head(uuid,uuid,text,text) to workflow_worker;

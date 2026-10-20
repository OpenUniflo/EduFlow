begin;
alter table workflow_private.superstep_commits add column commit_digest text;
create function workflow_private.commit_superstep(p_run uuid,p_token bigint,p_checkpoint text,p_parent text,p_state jsonb,p_initialized boolean,p_digest text)
returns integer language plpgsql security definer set search_path='' as $$
declare t uuid; prior text; version integer; begin
 perform workflow_private.check_lease(p_run,p_token);
 select thread_id into t from public.workflow_live_runs where run_id=p_run;
 select commit_digest into prior from workflow_private.superstep_commits where thread_id=t and checkpoint_id=p_checkpoint;
 if found and prior is distinct from p_digest then raise exception 'CHECKPOINT_CONTENT_CONFLICT'; end if;
 version:=workflow_private.commit_superstep(p_run,p_token,p_checkpoint,p_parent,p_state,p_initialized);
 update workflow_private.superstep_commits set commit_digest=p_digest where thread_id=t and checkpoint_id=p_checkpoint;
 return version;
end $$;
revoke execute on function workflow_private.commit_superstep(uuid,bigint,text,text,jsonb,boolean) from workflow_worker;
revoke all on function workflow_private.commit_superstep(uuid,bigint,text,text,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function workflow_private.commit_superstep(uuid,bigint,text,text,jsonb,boolean,text) to workflow_worker;
commit;

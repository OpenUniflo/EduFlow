-- Prepared copies can outlive a later uncertain write in an accessible ancestor.
-- UNION deduplicates lineage defensively; deleted sources terminate the B04 lineage.
create or replace function workflow_private.p5_unknown_effects(p_owner uuid,p_thread uuid) returns boolean
language sql security definer set search_path='' as $$
 with recursive lineage(thread_id,parent_thread_id) as(
  select thread_id,parent_thread_id from public.workflow_execution_threads where thread_id=p_thread and owner_user_id=p_owner
  union
  select t.thread_id,t.parent_thread_id from public.workflow_execution_threads t join lineage l on t.thread_id=l.parent_thread_id where t.owner_user_id=p_owner
 )
 select exists(select from workflow_private.task_journal j join lineage l using(thread_id)
  where j.effect='write' and not exists(select from workflow_private.task_receipts r where r.thread_id=j.thread_id and r.task_id=j.task_id));
$$;

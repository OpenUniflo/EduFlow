begin;
CREATE OR REPLACE FUNCTION workflow_private.run_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.owner_user_id::text,0));
 if exists(select from (
  select status,row_number() over(order by created_at desc,run_id desc) as position
  from public.workflow_live_runs where owner_user_id=new.owner_user_id and workflow_id=new.workflow_id
 ) ranked where position>=20 and status in ('queued','running')) then raise exception 'RUN_QUOTA_EXCEEDED'; end if;
 if new.thread_id is null and (select count(*) from public.workflow_execution_threads where owner_user_id=new.owner_user_id and workflow_id=new.workflow_id and (status in ('active','waiting') or (status='closed' and checkpoint_id is not null and last_error is not null and coalesce(last_error->>'code','') not in ('RUN_CANCELLED','WAIT_EXPIRED'))))>=20 then raise exception 'THREAD_QUOTA_EXCEEDED'; end if;
 return new;
end $function$

;
commit;

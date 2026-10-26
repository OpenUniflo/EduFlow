-- New Run admission only needs a recent Worker heartbeat. The executor digest is
-- intentionally not part of this probe: a Preview compiler may run different code
-- while the Production Worker still executes the shared queue.
create function workflow_private.p6_worker_status()
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object(
  'online',exists(select from workflow_private.p6_service_signals
                  where role='worker' and status='ok' and observed_at>now()-interval '20 seconds'),
  'executorDigest',(select executor_digest from workflow_private.p6_service_signals
                    where role='worker' and status='ok' and observed_at>now()-interval '20 seconds'
                    order by observed_at desc limit 1),
  'observedAt',(select observed_at from workflow_private.p6_service_signals
                where role='worker' and status='ok' and observed_at>now()-interval '20 seconds'
                order by observed_at desc limit 1));
$$;
revoke all on function workflow_private.p6_worker_status() from public,anon,authenticated;
grant execute on function workflow_private.p6_worker_status() to workflow_worker;

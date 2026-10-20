-- Aggregate operational signals only; never expose product rows or credentials.
create function workflow_private.p6_metrics(p_digest text)
returns jsonb language sql security definer set search_path='' as $$
 select workflow_private.p6_health(p_digest) || jsonb_build_object(
  'queued',count(*) filter(where status='queued'),
  'running',count(*) filter(where status='running'),
  'waiting',count(*) filter(where status='waiting'),
  'oldestQueueSeconds',coalesce(extract(epoch from now()-min(created_at) filter(where status='queued')),0))
 from public.workflow_live_runs where status in ('queued','running','waiting');
$$;
revoke all on function workflow_private.p6_metrics(text) from public,anon,authenticated;
grant execute on function workflow_private.p6_metrics(text) to workflow_worker;

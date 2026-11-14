-- Fix PL/pgSQL/column name ambiguity and make the evidence contract explicit.
-- A truncated step/tool slice is never presented as a complete trace.
begin;

create or replace function workflow_private.evaluation_claim(p_worker text)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare e public.workflow_run_evaluations; r public.workflow_live_runs; d jsonb; result_payload jsonb;
 step_total integer; step_error_count integer; step_statuses jsonb;
 tool_total integer; tool_started integer; tool_completed integer; tool_failed integer; tool_skipped integer;
 tool_call_count integer; tool_recovered integer; tool_final_failures integer; tool_incomplete integer;
begin
 if p_worker is null or length(p_worker)=0 then raise exception 'INVALID_WORKER'; end if;
 for e in
  select * from public.workflow_run_evaluations
  where (status='queued' and available_at<=now()) or (status='running' and lease_until<now())
  order by created_at for update skip locked
 loop
  if e.attempt_count>=e.max_attempts then
   update public.workflow_run_evaluations set status='failed',finished_at=now(),lease_until=null,worker_id=null,
    error_code=coalesce(error_code,'EVALUATION_RETRY_EXHAUSTED'),error_message=coalesce(error_message,'Evaluation retry budget exhausted')
    where evaluation_id=e.evaluation_id;
   continue;
  end if;
  select * into r from public.workflow_live_runs where run_id=e.run_id;
  if not found then
   update public.workflow_run_evaluations set status='failed',finished_at=now(),lease_until=null,worker_id=null,
    error_code='RUN_EVIDENCE_EXPIRED',error_message='The Run is no longer available for evaluation' where evaluation_id=e.evaluation_id;
   continue;
  end if;
  select definition into d from public.workflow_revisions where owner_user_id=e.owner_user_id and workflow_id=e.workflow_id and revision=e.revision;
  if d is null then
   update public.workflow_run_evaluations set status='failed',finished_at=now(),lease_until=null,worker_id=null,
    error_code='EVALUATION_DEFINITION_MISSING',error_message='The frozen Workflow revision is unavailable' where evaluation_id=e.evaluation_id;
   continue;
  end if;
  update public.workflow_run_evaluations set status='running',attempt_count=attempt_count+1,worker_id=p_worker,
   lease_until=now()+interval '120 seconds',started_at=coalesce(started_at,now()),error_code=null,error_message=null
   where evaluation_id=e.evaluation_id returning * into e;

  select count(*),count(*) filter(where error is not null),coalesce(jsonb_object_agg(status,cnt),'{}'::jsonb)
   into step_total,step_error_count,step_statuses
   from (select status,count(*) cnt,count(*) filter(where error is not null) error from public.workflow_run_steps where run_id=e.run_id group by status) s;
  -- The aggregate above is over grouped rows; derive the exact error count separately.
  select count(*) filter(where error is not null) into step_error_count from public.workflow_run_steps where run_id=e.run_id;

  select count(*),count(*) filter(where type='tool.started'),count(*) filter(where type='tool.completed'),
         count(*) filter(where type='tool.failed'),count(*) filter(where type='tool.skipped'),
         count(distinct coalesce(nullif(payload->>'callId',''),nullif(payload->>'toolCallId',''),event_id::text))
   into tool_total,tool_started,tool_completed,tool_failed,tool_skipped,tool_call_count
   from public.workflow_run_events where run_id=e.run_id and type like 'tool.%';
  select count(*) filter(where completed and failed),count(*) filter(where failed and not completed),
         count(*) filter(where started and not completed and not failed and not skipped)
   into tool_recovered,tool_final_failures,tool_incomplete
   from (
    select coalesce(nullif(payload->>'callId',''),nullif(payload->>'toolCallId','')) call_id,
           bool_or(type='tool.started') started,bool_or(type='tool.completed') completed,
           bool_or(type in ('tool.failed','tool.skipped')) failed,bool_or(type='tool.skipped') skipped
    from public.workflow_run_events
    where run_id=e.run_id and type like 'tool.%' and coalesce(nullif(payload->>'callId',''),nullif(payload->>'toolCallId','')) is not null
    group by 1) calls;

  result_payload:=jsonb_build_object(
   'evaluationId',e.evaluation_id,'ownerId',e.owner_user_id,'runId',e.run_id,'workflowId',e.workflow_id,
   'revision',e.revision,'triggerKind',e.trigger_kind,'attempt',e.attempt_count,'maxAttempts',e.max_attempts,
   'config',e.config_snapshot,
   'run',jsonb_build_object('status',r.status,'output',r.output,'input',r.input,'error',r.error,
    'createdAt',r.created_at,'startedAt',r.started_at,'finishedAt',r.finished_at,
    'definitionHash',r.definition_hash,'semanticHash',r.semantic_hash,'environmentRef',r.environment_ref),
   'definition',jsonb_build_object('name',d->>'name','outputSchema',d->'outputSchema',
    'nodes',coalesce((select jsonb_agg(jsonb_build_object('id',n->>'id','type',n->>'type','label',n->>'label')) from jsonb_array_elements(d->'nodes') n),'[]'::jsonb)),
   'aggregates',jsonb_build_object(
    'stepTotal',step_total,'stepReturned',least(step_total,80),'stepsTruncated',step_total>80,
    'stepErrorCount',step_error_count,'stepStatusCounts',step_statuses,
    'toolEventTotal',tool_total,'toolEventReturned',least(tool_total,60),'toolEventsTruncated',tool_total>60,
    'toolCallCount',tool_call_count,'toolStartedCount',tool_started,'toolCompletedCount',tool_completed,
    'toolFailedEventCount',tool_failed,'toolSkippedEventCount',tool_skipped,
    'toolRecoveredCount',tool_recovered,'toolFinalFailureCount',tool_final_failures,'toolIncompleteCount',tool_incomplete),
   'steps',coalesce((select jsonb_agg(step) from (
    select jsonb_build_object('nodeId',node_id,'invocation',invocation,'attempt',attempt,'status',status,'error',error,
     'inputExcerpt',left(coalesce(input::text,''),1200),'outputExcerpt',left(coalesce(output::text,''),2400),
     'outputBytes',length(coalesce(output::text,'')),'startedAt',started_at,'finishedAt',finished_at) step
    from public.workflow_run_steps where run_id=e.run_id order by invocation,attempt limit 80) s),'[]'::jsonb),
   'events',coalesce((select jsonb_agg(jsonb_build_object('type',type,'nodeId',node_id,'stepId',step_id,
    'occurredAt',occurred_at,'payload',jsonb_strip_nulls(jsonb_build_object(
     'toolRef',payload->>'toolRef','callId',payload->>'callId','toolCallId',payload->>'toolCallId',
     'error',payload->'error','effect',payload->>'effect','reason',payload->>'reason')))) from (
    select * from public.workflow_run_events where run_id=e.run_id and type like 'tool.%' order by seq limit 60) ev),'[]'::jsonb));
  return result_payload;
 end loop;
 return null;
end $function$;
revoke all on function workflow_private.evaluation_claim(text) from public,anon,authenticated;
grant execute on function workflow_private.evaluation_claim(text) to workflow_worker,service_role;

create or replace function workflow_private.evaluation_pending()
returns jsonb language plpgsql security definer set search_path='' as $function$
declare queued integer; running integer; stale integer; next_at timestamptz;
begin
 select count(*) filter(where status='queued'),count(*) filter(where status='running'),
        count(*) filter(where status='running' and lease_until<now()),
        min(available_at) filter(where status='queued')
  into queued,running,stale,next_at
  from public.workflow_run_evaluations where status in ('queued','running');
 return jsonb_build_object('queued',coalesce(queued,0),'running',coalesce(running,0),'staleRunning',coalesce(stale,0),
  'nextAvailableAt',next_at,'pending',coalesce(queued,0)+coalesce(running,0)>0);
end $function$;
revoke all on function workflow_private.evaluation_pending() from public,anon,authenticated;
grant execute on function workflow_private.evaluation_pending() to workflow_worker,service_role;

commit;

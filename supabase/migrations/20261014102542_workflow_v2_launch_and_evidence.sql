-- Recheck product launch identities transactionally; preserve existing Assignment-response lineage.
create or replace function public.workflow_v2_enqueue(p_owner uuid,p_workflow text,p_revision integer,p_input jsonb,p_environment text,p_environment_revision text,p_registry jsonb,p_semantic text,p_fingerprint text,p_request_hash text,p_key text,p_launch jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare previous public.workflow_idempotency; run uuid; msg bigint; hash text; active integer; queued integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into previous from public.workflow_idempotency where owner_user_id=p_owner and key=p_key and expires_at>now();
 if found then
  if previous.request_hash<>p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('runId',previous.run_id,'revision',previous.revision,'status',coalesce((select status from public.workflow_live_runs where run_id=previous.run_id),'expired'),'historyExpired',not exists(select from public.workflow_live_runs where run_id=previous.run_id));
 end if;
 if not exists(select from public.workflow_v2_definitions where owner_user_id=p_owner and workflow_id=p_workflow and not archived) then raise exception 'WORKFLOW_ARCHIVED'; end if;
 select definition_hash into hash from public.workflow_revisions where owner_user_id=p_owner and workflow_id=p_workflow and revision=p_revision;
 if hash is null then raise exception 'NOT_FOUND'; end if;
 if p_launch is not null then
  if p_launch->>'workflowTemplateId'<>p_workflow or not exists(
   select from public.course_assignments a join public.courses c on c.id=a.course_id
   where a.course_id=p_launch->>'courseId' and a.id=p_launch->>'assignmentId' and a.mode='workflow' and a.workflow_template_id=p_workflow
   and c.lifecycle='published' and (c.course_type<>'personal' or c.owner_user_id=p_owner)
  ) then raise exception 'LAUNCH_CONTEXT_CHANGED'; end if;
 end if;
 select count(*) filter(where status='running'),count(*) filter(where status='queued') into active,queued from public.workflow_live_runs where owner_user_id=p_owner;
 if queued>=5 then raise exception 'RUN_QUOTA_EXCEEDED'; end if;
 insert into public.workflow_live_runs(owner_user_id,workflow_id,revision,status,definition_hash,semantic_hash,compile_fingerprint,environment_ref,environment_revision,input,registry_snapshot,launch_context)
 values(p_owner,p_workflow,p_revision,'queued',hash,p_semantic,p_fingerprint,p_environment,p_environment_revision,p_input,p_registry,p_launch) returning run_id into run;
 msg:=pgmq.send('workflow_v2',jsonb_build_object('runId',run));
 insert into public.workflow_run_jobs(run_id,queue_msg_id) values(run,msg);
 insert into public.workflow_idempotency values(p_owner,p_key,p_request_hash,run,p_workflow,p_revision,now()+interval '24 hours') on conflict(owner_user_id,key) do update set request_hash=p_request_hash,run_id=run,workflow_id=p_workflow,revision=p_revision,expires_at=now()+interval '24 hours';
 if p_launch is not null then
  insert into public.user_course_states(user_id,course_id,is_active,updated_at) values(p_owner,p_launch->>'courseId',true,now())
  on conflict(user_id,course_id) do update set is_active=true,updated_at=now();
 end if;
 perform workflow_private.event(run,'run.queued','{}');
 return jsonb_build_object('runId',run,'revision',p_revision,'status','queued','eventsCursor',0);
end $$;

create or replace function public.workflow_v2_prune(p_owner uuid,p_workflow text)
returns integer language plpgsql security invoker set search_path='' as $$
declare item record; n integer:=0; begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_workflow,0));
 for item in select * from (
   select run_id::text as id,created_at,'live' as source from public.workflow_live_runs where owner_user_id=p_owner and workflow_id=p_workflow and status in ('success','failed','cancelled')
   union all select id,created_at,'legacy' as source from public.workflow_runs where owner_user_id=p_owner and workflow_id=p_workflow
  ) history order by created_at desc,id desc offset 20 loop
  if exists(select from public.knowledge_evidence where user_id=p_owner and event_type='workflow_passed' and source_entity_id=item.id) or exists(select from public.learning_attempts where user_id=p_owner and response->>'kind'='workflow' and response->>'runId'=item.id) then
   insert into public.workflow_run_evidence_receipts(owner_user_id,run_id,workflow_id,proof)
   values(p_owner,item.id,p_workflow,case when item.source='live' then (select jsonb_build_object('runId',run_id,'revision',revision,'definitionHash',definition_hash,'semanticHash',semantic_hash,'status',status,'finishedAt',finished_at,'output',output) from public.workflow_live_runs where run_id=item.id::uuid) else (select jsonb_build_object('runId',id,'source','legacy_unknown','createdAt',created_at,'outputSummary',output_summary) from public.workflow_runs where owner_user_id=p_owner and id=item.id) end)
   on conflict do nothing;
  end if;
  if item.source='live' then
   insert into public.workflow_run_tombstones(owner_user_id,run_id,workflow_id) values(p_owner,item.id::uuid,p_workflow) on conflict do nothing;
   delete from public.workflow_live_runs where owner_user_id=p_owner and workflow_id=p_workflow and run_id=item.id::uuid;
  else delete from public.workflow_runs where owner_user_id=p_owner and workflow_id=p_workflow and id=item.id; end if;
  n:=n+1;
 end loop;
 delete from public.workflow_idempotency where owner_user_id=p_owner and expires_at<now();
 return n;
end $$;

-- Local-only test-account reset. This file is executed by `pnpm learner:reset:local`
-- against the local Supabase database; it is never a migration and is never deployed.
-- The script checks the Supabase URL is local before it creates or calls the function.
-- All table deletes happen in this one function transaction; Storage files are removed by the script.
create or replace function public.reset_local_learner(
  p_user_ids uuid[],
  p_execute boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
set row_security = off
set statement_timeout = '0'
as $$
declare
  v_ids uuid[];
  v_table text;
  v_count bigint;
  v_chunk jsonb;
  v_counts jsonb := '[]'::jsonb;
  v_remaining jsonb := '[]'::jsonb;
  v_storage_paths jsonb := '[]'::jsonb;
  v_tables text[] := array[
    'assignment_ai_evaluations',
    'capability_state_proposals',
    'evidence_units',
    'capability_diagnosis_runs',
    'micro_step_attempts',
    'edge_action_runs',
    'learning_events',
    'performance_results',
    'learning_attempts',
    'user_micro_unit_progress',
    'user_micro_path_progress',
    'user_material_states',
    'user_assignment_states',
    'user_knowledge_states',
    'user_course_states',
    'navigation_decisions',
    'personal_course_route_versions',
    'personal_course_routes',
    'user_evidence_sources',
    'knowledge_evidence',
    'assistant_sessions'
  ];
begin
  select array_agg(distinct candidate) into v_ids from unnest(coalesce(p_user_ids, array[]::uuid[])) candidate;
  if v_ids is null or cardinality(v_ids) = 0 then
    raise exception 'at least one local learner id is required';
  end if;

  -- Grouped preview counts: one query per table, no per-user loop.
  foreach v_table in array v_tables loop
    execute format($query$
      select coalesce(jsonb_agg(jsonb_build_object('table', %L, 'userId', user_id, 'rows', rows)), '[]'::jsonb)
      from (select user_id, count(*)::bigint as rows from public.%I where user_id = any($1) group by user_id) counted
    $query$, v_table, v_table) into v_chunk using v_ids;
    v_counts := v_counts || v_chunk;
  end loop;
  execute $query$
    select coalesce(jsonb_agg(jsonb_build_object('table', 'assistant_messages', 'userId', user_id, 'rows', rows)), '[]'::jsonb)
    from (
      select session.user_id, count(*)::bigint as rows
      from public.assistant_messages message
      join public.assistant_sessions session on session.id = message.session_id
      where session.user_id = any($1)
      group by session.user_id
    ) counted
  $query$ into v_chunk using v_ids;
  v_counts := v_counts || v_chunk;
  select coalesce(jsonb_agg(jsonb_build_object('userId', user_id, 'path', storage_path)), '[]'::jsonb)
    into v_storage_paths from public.user_evidence_sources where user_id = any(v_ids);

  if p_execute then
    -- Break RESTRICT cycles before deleting either side.
    update public.learning_attempts set action_run_id = null where user_id = any(v_ids);
    update public.edge_action_runs set assignment_attempt_id = null where user_id = any(v_ids);
    -- A preserved Course may cite the assistant message that created its brief.
    -- Keep the Course/work; clear only that provenance pointer before messages go.
    update public.courses course set creation_brief_message_id = null
      where course.creation_brief_message_id in (
        select message.id from public.assistant_messages message
        join public.assistant_sessions session on session.id = message.session_id
        where session.user_id = any(v_ids)
      );

    foreach v_table in array v_tables loop
      execute format('delete from public.%I where user_id = any($1)', v_table) using v_ids;
    end loop;

    -- Verify the whole transaction; any residue raises and rolls everything back.
    foreach v_table in array v_tables loop
      execute format('select count(*) from public.%I where user_id = any($1)', v_table) into v_count using v_ids;
      if v_count <> 0 then raise exception 'reset verification failed for %', v_table; end if;
      v_remaining := v_remaining || jsonb_build_array(jsonb_build_object('table', v_table, 'rows', v_count));
    end loop;
    select count(*) into v_count
      from public.assistant_messages message
      join public.assistant_sessions session on session.id = message.session_id
      where session.user_id = any(v_ids);
    if v_count <> 0 then raise exception 'reset verification failed for assistant_messages'; end if;
    v_remaining := v_remaining || jsonb_build_array(jsonb_build_object('table', 'assistant_messages', 'rows', v_count));
    select count(*) into v_count from public.user_evidence_sources where user_id = any(v_ids);
    if v_count <> 0 then raise exception 'reset verification failed for storage:user-evidence'; end if;
    v_remaining := v_remaining || jsonb_build_array(jsonb_build_object('table', 'storage:user-evidence', 'rows', v_count));
  end if;

  return jsonb_build_object('execute', p_execute, 'counts', v_counts, 'remaining', v_remaining, 'storagePaths', v_storage_paths);
end;
$$;

revoke all on function public.reset_local_learner(uuid[], boolean) from public, anon, authenticated;
grant execute on function public.reset_local_learner(uuid[], boolean) to service_role;
comment on function public.reset_local_learner(uuid[], boolean) is 'Local-only test-account learning reset; never grant to hosted/public callers.';

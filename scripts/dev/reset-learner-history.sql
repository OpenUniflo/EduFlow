-- One-time, explicitly authorized ALL-account learner-history reset.
-- Run only after frontier regression and Assignment guards pass, with a saved preflight snapshot.
-- Preserves accounts, profiles, authorization, ALL course assets, chat, and user-authored workflow/settings.
-- No CASCADE: unexpected external FK dependencies must abort, not silently delete protected data.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';
lock table public.assignment_coverages, public.assignment_dependencies, public.assignment_outcome_compositions, public.assistant_messages, public.assistant_sessions, public.chapter_outcomes, public.course_assignments, public.course_authoring_drafts, public.course_curricula, public.course_mapping_runs, public.course_target_knowledge, public.courses, public.curriculum_chapters, public.curriculum_coverages, public.curriculum_lessons, public.curriculum_sequences, public.domain_assignment_candidates, public.domain_assignments, public.domain_governance_metadata, public.domain_proposals, public.final_project_outcome_compositions, public.final_projects, public.h5p_contents, public.knowledge_domains, public.knowledge_edges, public.knowledge_evidence, public.knowledge_generation_runs, public.knowledge_node_revisions, public.knowledge_nodes, public.learning_attempts, public.learning_events, public.material_knowledge_coverages, public.material_parsing_jobs, public.material_segments, public.materials, public.micro_learning_paths, public.micro_steps, public.micro_units, public.navigation_decisions, public.performance_results, public.profiles, public.user_assignment_states, public.user_course_states, public.user_knowledge_states, public.user_material_states, public.user_micro_path_progress, public.user_micro_unit_progress, public.user_workflow_definitions, public.user_workflow_state, public.workflow_runs, public.workflow_templates, auth.users in share row exclusive mode;
create temporary table learner_reset_audit (phase text, table_name text, row_count bigint, checksum text) on commit drop;
create or replace function pg_temp.capture_learner_reset(phase_name text) returns void language plpgsql as $$
declare t record; n bigint; h text;
begin
  for t in select schemaname, tablename from pg_tables where schemaname='public' union all select 'auth','users' loop
    execute format($q$select count(*), md5(coalesce(string_agg(md5(to_jsonb(r)::text), '' order by md5(to_jsonb(r)::text)), '')) from %I.%I r$q$,t.schemaname,t.tablename) into n,h;
    insert into learner_reset_audit values(phase_name,t.schemaname||'.'||t.tablename,n,h);
  end loop;
end $$;
select pg_temp.capture_learner_reset('before');
delete from public.learning_events;
delete from public.knowledge_evidence;
delete from public.performance_results;
delete from public.learning_attempts;
delete from public.navigation_decisions;
delete from public.user_micro_unit_progress;
delete from public.user_micro_path_progress;
delete from public.user_assignment_states;
delete from public.user_material_states;
delete from public.user_course_states;
delete from public.user_knowledge_states;
delete from public.workflow_runs;
select pg_temp.capture_learner_reset('after');
do $$ begin
  if exists (select 1 from learner_reset_audit b join learner_reset_audit a using(table_name)
    where b.phase='before' and a.phase='after' and b.table_name not in ('public.learning_events','public.knowledge_evidence','public.performance_results','public.learning_attempts','public.navigation_decisions','public.user_micro_unit_progress','public.user_micro_path_progress','public.user_assignment_states','public.user_material_states','public.user_course_states','public.user_knowledge_states','public.workflow_runs')
      and (b.row_count<>a.row_count or b.checksum<>a.checksum)) then
    raise exception 'Protected account, profile, permissions, chat or teaching/authoring asset changed; rolling back';
  end if;
  if exists (select 1 from learner_reset_audit where phase='after' and table_name in ('public.learning_events','public.knowledge_evidence','public.performance_results','public.learning_attempts','public.navigation_decisions','public.user_micro_unit_progress','public.user_micro_path_progress','public.user_assignment_states','public.user_material_states','public.user_course_states','public.user_knowledge_states','public.workflow_runs') and row_count<>0) then
    raise exception 'Learner history remains; rolling back';
  end if;
end $$;
select * from learner_reset_audit order by table_name,phase;
commit;

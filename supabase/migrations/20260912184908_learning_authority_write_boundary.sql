-- Rollout: deploy compatible server-side writers before applying to a shared
-- environment whose older API still writes these records through a user JWT.
revoke insert,update,delete on public.user_knowledge_states,public.user_micro_path_progress,public.user_micro_unit_progress,public.knowledge_evidence from authenticated,anon;
drop policy if exists user_knowledge_states_own_all on public.user_knowledge_states;
create policy user_knowledge_states_own_read on public.user_knowledge_states for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists knowledge_evidence_own_insert on public.knowledge_evidence;

-- Preserve non-evaluative progress writes, but never let a user create/overwrite
-- accepted evaluation. Existing status CHECK remains unchanged (the frontend's
-- legacy 'completed' alias is not a valid canonical database status).
drop policy if exists user_assignment_states_own_all on public.user_assignment_states;
create policy user_assignment_states_own_read on public.user_assignment_states for select to authenticated using(user_id=(select auth.uid()));
create policy user_assignment_states_execution_insert on public.user_assignment_states for insert to authenticated
  with check(user_id=(select auth.uid()) and status<>'accepted');
create policy user_assignment_states_execution_update on public.user_assignment_states for update to authenticated
  using(user_id=(select auth.uid()) and status<>'accepted') with check(user_id=(select auth.uid()) and status<>'accepted');
revoke delete on public.user_assignment_states from authenticated,anon;

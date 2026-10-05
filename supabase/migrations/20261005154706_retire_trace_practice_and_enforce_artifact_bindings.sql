-- Understanding checks remain readable curriculum/history, never Practice executors.
-- Keep stable Action/Assignment references; do not rewrite immutable Route snapshots.
update public.course_action_bindings b set available=false, updated_at=now()
from public.knowledge_edge_actions a, public.course_assignments assignment
where a.id=b.action_id and a.type='practice_task'
 and assignment.course_id=b.course_id and assignment.id=b.assignment_id
 and coalesce(assignment.experience->>'type','answer') not in ('answer','code');

update public.knowledge_edge_actions a set status='archived',updated_at=now()
where a.type='practice_task'
 and exists(select 1 from public.course_action_bindings b join public.course_assignments assignment
   on assignment.course_id=b.course_id and assignment.id=b.assignment_id
   where b.action_id=a.id and coalesce(assignment.experience->>'type','answer') not in ('answer','code'))
 and not exists(select 1 from public.course_action_bindings b where b.action_id=a.id and b.available);

-- Check all three mutation surfaces: binding, Action activation/type, executor edits.
-- These tables already have server-only writes and RLS; the trigger adds no authority.
create function public.validate_artifact_practice_bindings() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('artifact-practice-bindings',0));
 if exists(select 1 from public.course_action_bindings b
   join public.knowledge_edge_actions a on a.id=b.action_id
   left join public.course_assignments assignment on assignment.course_id=b.course_id and assignment.id=b.assignment_id
   where b.available and a.status='active' and a.type='practice_task'
   and (assignment.id is null or assignment.mode='workflow' or b.micro_path_id is not null
     or coalesce(assignment.experience->>'type','answer') not in ('answer','code'))) then
   raise exception 'Active Practice requires an artifact Assignment executor' using errcode='23514';
 end if;
 if exists(select 1 from public.course_action_bindings b join public.knowledge_edge_actions a on a.id=b.action_id
   where b.available and a.status='active' and a.type='practice_task'
   group by b.course_id,b.assignment_id having count(distinct a.edge_id)>1) then
   raise exception 'Practice Assignment requires one canonical execution Edge per Course' using errcode='23514';
 end if;
 return null;
end $$;
revoke all on function public.validate_artifact_practice_bindings() from public,anon,authenticated;
create constraint trigger artifact_practice_binding_guard after insert or update on public.course_action_bindings
 deferrable initially immediate for each row execute function public.validate_artifact_practice_bindings();
create constraint trigger artifact_practice_action_guard after insert or update on public.knowledge_edge_actions
 deferrable initially immediate for each row execute function public.validate_artifact_practice_bindings();
create constraint trigger artifact_practice_assignment_guard after insert or update on public.course_assignments
 deferrable initially immediate for each row execute function public.validate_artifact_practice_bindings();

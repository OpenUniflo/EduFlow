-- Reviewed data repair, not a schema migration. Re-runnable on the existing catalog.
-- Evidence: docs/local/AI-Agents-in-Depth-zh-CN.pdf, PDF (not printed) pages below.
-- Historical relation identities, learning state, Assignments and route snapshots are untouched.
begin;
create temporary table reviewed_project_relations (
 id text primary key, source_node_id text, target_node_id text, relation text,
 prerequisite_strength text, associative_strength double precision, reason text, page integer
) on commit drop;
insert into reviewed_project_relations values
('knowledge-enables-s02-tool06','S02','TOOL06','enables',null,0.88,
 'Sandbox isolation supplies the separate execution environment in which an Agent virtual identity can act without exposing the user''s real device and files.',126),
('knowledge-enables-s03-s01','S03','S01','enables',null,0.86,
 'Least privilege supplies a concrete authorization policy for action guardrails: limiting accessible resources and permitted operations before execution.',118),
('knowledge-prerequisite-t11-ma06','T11','MA06','prerequisite','soft',null,
 'Understanding a tool interface and its parameter contract prepares the learner to understand the tool descriptions exchanged between MCP clients and servers.',114),
('knowledge-enables-rt14-rt01','RT14','RT01','enables',null,0.86,
 'Failure recovery classifies runtime failures, returns actionable tool errors to the next Observe-Think-Act iteration, and applies bounded retry or fallback so the Agent Loop can safely continue or terminate after failure.',147);
do $$ begin
 perform 1 from courses where id='ai-agents-in-depth' for update;
 if exists(select 1 from courses where id='ai-agents-in-depth' and revision not in ('published-1789283972','project-capability-v22')) then raise exception 'Course changed since review'; end if;
 if exists(select 1 from courses where id='ai-agents-in-depth' and revision='published-1789283972') and ((select count(*) from curriculum_coverages where course_id='ai-agents-in-depth' and node_id='S08')<>1 or not exists(select 1 from curriculum_coverages where course_id='ai-agents-in-depth' and id='aiad-cov-S08' and node_id='S08' and lesson_id='aiad-lesson-07' and role='introduce' and display_order=17) or (select count(*) from assignment_coverages where course_id='ai-agents-in-depth' and node_id='S08')<>1 or not exists(select 1 from assignment_coverages where course_id='ai-agents-in-depth' and id='cov-0093' and node_id='S08' and assignment_id='book-v1-node-s08' and role='assess' and required=true)) then raise exception 'Reviewed S08 coverage changed'; end if;
 if exists(select 1 from courses where id='ai-agents-in-depth' and revision='project-capability-v22') and (exists(select 1 from curriculum_coverages where course_id='ai-agents-in-depth' and node_id='S08') or exists(select 1 from assignment_coverages where course_id='ai-agents-in-depth' and node_id='S08')) then raise exception 'S08 was reintroduced after repair'; end if;
 if not exists(select 1 from courses where id='ai-agents-in-depth') then raise exception 'Required course is missing'; end if;
 if exists(select 1 from reviewed_project_relations r left join knowledge_nodes s on s.id=r.source_node_id left join knowledge_nodes t on t.id=r.target_node_id where s.status is distinct from 'active' or t.status is distinct from 'active' or s.scope is distinct from 'global' or t.scope is distinct from 'global') then raise exception 'Reviewed active Global endpoints changed'; end if;
 if exists(select 1 from reviewed_project_relations r join knowledge_edges e on e.id=r.id where e.source_node_id<>r.source_node_id or e.target_node_id<>r.target_node_id or e.relation<>r.relation or e.prerequisite_strength is distinct from r.prerequisite_strength or e.associative_strength is distinct from r.associative_strength or e.reason<>r.reason or e.lifecycle_status<>'active') then raise exception 'Reviewed edge identity conflicts with current authority'; end if;
 if exists(select 1 from reviewed_project_relations r join knowledge_edges e on e.source_node_id=r.source_node_id and e.target_node_id=r.target_node_id and e.relation=r.relation where e.id<>r.id) then raise exception 'Existing semantic relation has another identity; review required'; end if;
end $$;
insert into knowledge_edges(id,source_node_id,target_node_id,relation,prerequisite_strength,associative_strength,reason,provenance,lifecycle_status)
select id,source_node_id,target_node_id,relation,prerequisite_strength,associative_strength,reason,
 jsonb_build_array(jsonb_build_object('sourceType','manual','sourceId','ai-agents-in-depth-v1.4','sourceFile','AI-Agents-in-Depth-zh-CN.pdf','pdfPages',case when source_node_id='S03' then jsonb_build_array(115,118) else jsonb_build_array(page) end,'curation','project-capability-v22-reviewed','discoveredAt','2026-10-02T00:00:00Z')),'active'
from reviewed_project_relations on conflict(id) do nothing;
-- The existing book audit explicitly identifies S08 as EDUFLOW_ADDED and not reliably taught.
-- Course coverage is the project requirement; a legacy optional route bridge is not a target.
delete from assignment_coverages where course_id='ai-agents-in-depth' and id='cov-0093' and node_id='S08';
delete from curriculum_coverages where course_id='ai-agents-in-depth' and node_id='S08';
update courses set revision='project-capability-v22', updated_at=now()
where id='ai-agents-in-depth' and revision<>'project-capability-v22';
commit;

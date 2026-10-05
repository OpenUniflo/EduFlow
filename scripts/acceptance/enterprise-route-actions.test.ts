import { expect,it } from 'vitest';
import { enterpriseActionFixture,fixtureSQL,practiceGoldUpdateSql } from './enterprise-route-actions';
import scenario from './fixtures/enterprise-project-v1.json';
import { validateNativeMicroInteraction,isNativeMicroInteractionCorrect,type NativeMicroInteraction } from '../../src/shared/learning/nativeMicroInteraction';
import { evaluateAssignmentResponse } from '../../api/_lib/assignmentEvaluator';
it('all 23 real project relations have bound Micro and Practice choices; key relations have three',()=>{
 const f=enterpriseActionFixture();const counts=new Map<string,number>();
 for(const action of f.actions){counts.set(action.edge_id,(counts.get(action.edge_id)??0)+1);expect(action.status).toBe('active');const binding=f.bindings.find(b=>b.action_id===action.id)!;expect(binding.available).toBe(true);
  if(action.type==='micro_learning'){const path=f.paths.find(p=>p.id===binding.micro_path_id)!;expect(path.knowledge_id).toBe(scenario.nodes.find(n=>n.key===action.target)!.id);expect(path.status).toBe('published');expect(path.course_id).toBe(f.courseId);expect(binding.assignment_id).toBeNull();}
  else {const assignment=f.assignments.find(a=>a.id===binding.assignment_id)!;expect(assignment.mode).toBe('instruction');expect(f.coverages.filter(c=>c.assignment_id===assignment.id)).toEqual([expect.objectContaining({node_id:scenario.nodes.find(n=>n.key===action.target)!.id})]);expect(binding.micro_path_id).toBeNull();}
 }
 expect(counts.size).toBe(23);expect([...counts.values()].every(n=>n>=2)).toBe(true);expect([...counts.values()].filter(n=>n===3)).toHaveLength(3);
 expect(new Set(f.actions.map(a=>a.id)).size).toBe(49);expect(new Set(f.assignments.map(a=>a.display_order)).size).toBe(f.assignments.length);
 expect(enterpriseActionFixture()).toEqual(f);
});
it('Micro content contains worked examples and two independently valid interactions; trace practices use existing evaluator',()=>{
 const f=enterpriseActionFixture();for(const unit of f.units){const steps=f.steps.filter(s=>s.unit_id===unit.id);expect(steps.map(s=>s.position)).toEqual([0,1,2]);expect(steps[0].content.length).toBeGreaterThan(80);for(const step of steps.slice(1)){const interaction=step.interaction as NativeMicroInteraction;expect(validateNativeMicroInteraction(interaction)).toEqual([]);if(interaction.type==='choice'){expect(isNativeMicroInteractionCorrect(interaction,interaction.options[interaction.correctIndex])).toBe(true);expect(isNativeMicroInteractionCorrect(interaction,interaction.options[(interaction.correctIndex+1)%interaction.options.length])).toBe(false);}}}
 for(const a of f.assignments.filter(a=>a.experience.type==='trace')){expect(evaluateAssignmentResponse(a,{kind:'trace',selectedStepId:'decision'}).outcome).toBe('passed');expect(evaluateAssignmentResponse(a,{kind:'trace',selectedStepId:'propagate'}).outcome).toBe('failed');}
});
it('setup is namespaced, preserves Knowledge facts/history and uses explicitly labeled A/B test states',()=>{
 const sql=fixtureSQL();expect(sql).not.toMatch(/(?:insert into|update|delete from) public\.(?:knowledge_nodes|knowledge_edges|edge_action_runs|personal_course_route_versions)\b/);expect(sql).toContain('acceptance-baseline');expect(sql).toContain('on conflict do nothing');expect(sql).toContain('micro_path_id is null and assignment_id is null');expect(scenario.states.A).not.toEqual(scenario.states.B);
});

it('Gold upgrade is limited to two existing curriculum tasks and leaves user history and Knowledge facts untouched',()=>{
 const sql=practiceGoldUpdateSql();expect(sql.match(/update course_assignments/g)).toHaveLength(2);expect(sql).not.toMatch(/insert|delete|user_knowledge_states|edge_action_runs|knowledge_edges/);expect(sql).toContain("course_id='enterprise-vietnam-supply-collaboration'");
 for(const a of enterpriseActionFixture().assignments.filter(a=>a.id.endsWith('-record'))){expect(a.requirements.length).toBeGreaterThanOrEqual(3);expect(a.acceptance_criteria.length).toBeGreaterThanOrEqual(3);expect(a.description).toContain('教学场景');expect(a.experience.type).not.toBe('trace');}
});

it('Gold Action context is generated from the same task input and output, with stable identities',()=>{
 const sql=practiceGoldUpdateSql();expect(sql.match(/update knowledge_edge_actions/g)).toHaveLength(2);expect(sql.match(/update course_action_bindings/g)).toHaveLength(2);expect(sql).toContain("assignment_id='enterprise-route-action-v3-impact-record'");expect(sql).toContain('当前可用物料 30 件');expect(sql).toContain('10 月 6 日 16:00');expect(sql).not.toContain('2026-10-09');expect(sql).not.toContain('每小时10件');
});

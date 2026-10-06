import {expect,it} from 'vitest';
import scenario from './fixtures/enterprise-project-v1.json';
import {enterpriseOrderedActionFixture,enterpriseOrderedSql,enterpriseOrderedAudit} from './enterprise-ordered-route-actions';
import {enterpriseActionFixture} from './enterprise-route-actions';
import {evaluateAssignmentResponse} from '../../api/_lib/assignmentEvaluator';
it('every content group references exactly an existing factual Edge; generation never changes facts',()=>{
 const before=structuredClone(scenario);const f=enterpriseOrderedActionFixture();
 expect(f.groups.map(g=>[g.source.id,g.target.id,g.relation])).toEqual(scenario.relations.map(([s,t,r])=>[scenario.nodes.find(n=>n.key===s)!.id,scenario.nodes.find(n=>n.key===t)!.id,r]));
 expect(new Set(f.groups.map(g=>g.edgeId)).size).toBe(f.groups.length);expect(scenario).toEqual(before);expect(enterpriseOrderedActionFixture()).toEqual(f);
});
it('each new Micro explains its source-to-target context and has independent stable resources',()=>{
 const f=enterpriseOrderedActionFixture();expect(new Set(f.paths.map(p=>p.id)).size).toBe(f.groups.length);
 for(const g of f.groups){expect(g.path.title).toContain(g.source.title);expect(g.path.knowledge_id).toBe(g.target.id);expect(g.micro.edge_id).toBe(g.edgeId);expect(g.microBinding.micro_path_id).toBe(g.path.id);expect(g.steps.map(s=>s.position)).toEqual([0,1,2]);expect(g.steps[0].content).toContain(g.source.title);expect(g.steps.every(s=>s.content.length>80)).toBe(true);expect(g.steps[1].content).toContain('独立案例');}
});
it('business Practice is Edge-specific artifact work with no active Trace or Quiz executor',()=>{
 const f=enterpriseOrderedActionFixture();const old=enterpriseActionFixture();
 const allOrders=[...old.assignments,...f.assignments].map(a=>a.display_order);expect(new Set(allOrders).size).toBe(allOrders.length);
 const assignments=new Set<string>();
 for(const g of f.groups){expect(g.practices.length).toBeGreaterThan(0);for(const p of g.practices){expect(assignments.has(p.assignment.id)).toBe(false);assignments.add(p.assignment.id);expect(p.action.edge_id).toBe(g.edgeId);expect(p.assignment.experience.type).not.toMatch(/trace|choice|quiz/);expect(p.assignment.description).toContain(g.source.title);expect(p.assignment.expected_output.length).toBeGreaterThan(15);expect(p.assignment.requirements[0].length).toBeGreaterThan(25);expect(p.assignment.acceptance_criteria[0].length).toBeGreaterThan(30);expect(p.binding.assignment_id).toBe(p.assignment.id);expect(p.binding.available).toBe(true);expect(p.coverage.node_id).toBe(g.target.id);
 expect(evaluateAssignmentResponse(p.assignment,{kind:'answer',text:'本人完成业务记录：输入、计算、依据与决策。'}).outcome).toBe('pending');
 expect(evaluateAssignmentResponse(p.assignment,{kind:'answer',text:'',attachmentSourceIds:['owned-private-artifact']}).outcome).toBe('pending');
 expect(evaluateAssignmentResponse(p.assignment,{kind:'answer',text:'说明',attachmentSourceIds:['owned-private-artifact']}).outcome).toBe('pending');}}
});
it('supplier qualification has distinct requesting and returned-dossier actions to support genuine ordered business work',()=>{
 const group=enterpriseOrderedActionFixture().groups.find(g=>g.source.id==='supply-supplier-screening-criteria'&&g.target.id==='supply-supplier-qualification-review')!;
 expect(group.practices.map(p=>p.assignment.title)).toEqual(['向候选供应商发出资质资料请求','审查返回资质并完成补证记录']);expect(group.practices[0].assignment.description).toContain('尚未提供资料');expect(group.practices[1].assignment.description).toContain('范围加工件Y');
});
it('publication is idempotent catalog-only SQL and the audit enumerates content and sharing reasons',()=>{
 const sql=enterpriseOrderedSql(),audit=enterpriseOrderedAudit();expect(sql).toContain('on conflict do nothing');
 expect(sql).not.toMatch(/(?:insert into|update|delete from)\s+(?:public\.)?(?:knowledge_nodes|knowledge_edges|user_\w+|edge_action_runs|personal_course_\w+|learning_attempts|performance_results)\b/i);
 expect(sql).not.toMatch(/delete|update |alter |drop /i);expect(audit).toContain('inputs');expect(audit).toContain('shared resource');
 for(const g of enterpriseOrderedActionFixture().groups){expect(audit).toContain(g.edgeId);expect(audit).toContain(g.source.title);expect(audit).toContain(g.target.title);for(const p of g.practices)expect(audit).toContain(p.assignment.expected_output);}
});

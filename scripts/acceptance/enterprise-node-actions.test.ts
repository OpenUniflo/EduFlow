import {expect,it} from 'vitest';
import {enterpriseNodeActionFixture} from './enterprise-node-actions';
import scenario from './fixtures/enterprise-project-v1.json';
it('acceptance Node resources reference only real supplier roots and keep scope/executor identity exact',()=>{
 const fixture=enterpriseNodeActionFixture();
 expect(fixture.groups.map(group=>group.node.id)).toContain('supply-supplier-screening-criteria');
 expect(fixture.groups).toHaveLength(5);
 for(const group of fixture.groups){
  expect(scenario.relations.some(relation=>relation[1]===group.node.key)).toBe(false);
  expect(group.actions.map(action=>action.type).sort()).toEqual(['micro_learning','practice_task']);
  for(const action of group.actions){expect(action.edge_id).toBeNull();expect(action.node_id).toBe(group.node.id);}
  expect(group.path.knowledge_id).toBe(group.node.id);expect(group.coverage.node_id).toBe(group.node.id);
  expect(group.assignment.experience.type).toBe('answer');expect(group.assignment.description).toContain(group.input);
 }
 expect(fixture.assignments.map(assignment=>assignment.display_order)).toEqual([124,125,126,127,128]);
});

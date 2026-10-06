import { describe, expect, it } from 'vitest';
import { buildCapabilityModel, planCourseRoute, type RoutePlanningInput } from './routePlanning';
const input = (pairs: string[], currentNodeIds: string[] = []): RoutePlanningInput => ({
  nodeIds: [...new Set(['T', 'isolated', ...pairs.flatMap(id => id.split('>'))])], currentNodeIds,
  prerequisiteEdges: pairs.map(id => ({id, source:id.split('>')[0], target:id.split('>')[1], strength:'hard'})),
  courseOrder:[{nodeId:'T',lessonOrder:0,coverageOrder:0}],
});
describe('V3 legitimate candidate capability space', () => {
  it('retains an unacquired no-incoming root and every real target-path fact', () => {
    const data=input(['A>B','B>T']); const model=buildCapabilityModel(data);
    expect(model.orderedNodeIds).toEqual(['A','B','T']);
    expect(model.supportEdges.map(edge=>edge.id)).toEqual(['A>B','B>T']);
    expect(model.actionableNodeIds).toContain('A');
  });
  it('retains multiple roots, branches and their merge without isolated unrelated knowledge', () => {
    const model=buildCapabilityModel(input(['A>B','B>T','C>D','D>T']));
    expect([...model.orderedNodeIds].sort()).toEqual(['A','B','C','D','T']);
    expect(model.supportEdges).toHaveLength(4);
    expect(model.orderedNodeIds).not.toContain('isolated');
  });
  it('retains an unselected legal optional branch independently of route and catalog', () => {
    const data=input(['A>B','B>T','A>C']);
    data.enablesEdges=[{id:'C>T',source:'C',target:'T',relation:'enables',strength:.8}];
    const model=buildCapabilityModel(data);const plan=planCourseRoute(data);
    expect(plan).toMatchObject({valid:true,route:{selectedNodeIds:['A','B','T']}});
    expect(model.orderedNodeIds).toContain('C');
    expect(buildCapabilityModel({...data,...{options:[]}})).toEqual(model);
  });
  it('recomputes at formal acquired boundaries without admitting pruned Include ancestors', () => {
    const data=input(['A>B','B>T']); const before=buildCapabilityModel(data);
    const after=buildCapabilityModel({...data,currentNodeIds:['B']});
    expect(after.orderedNodeIds).toEqual(['B','T']);
    expect(after.orderedNodeIds).not.toEqual(before.orderedNodeIds);
    expect(planCourseRoute({...data,currentNodeIds:['B']},{includeNodeIds:['A'],excludeNodeIds:[]})).toMatchObject({valid:false,conflicts:[{kind:'include_outside_model'}]});
  });
  it('keeps hard AND from both legitimate roots and remains permutation stable', () => {
    const data=input(['A>B','C>B','B>T']); const model=buildCapabilityModel(data);
    expect(model.connectedCourseKnowledgeIds).toEqual(['T']);
    expect(model.actionableNodeIds).not.toContain('B');
    expect(buildCapabilityModel({...data,nodeIds:[...data.nodeIds].reverse(),prerequisiteEdges:[...data.prerequisiteEdges].reverse()})).toEqual(model);
  });
});

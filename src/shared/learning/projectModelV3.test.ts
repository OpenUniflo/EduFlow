import { describe, expect, it } from 'vitest';
import { buildCapabilityModel, planCourseRoute, type RoutePlanningInput } from './routePlanning';
const input = (pairs: string[], currentNodeIds: string[] = []): RoutePlanningInput => ({
  nodeIds: [...new Set(['T', 'isolated', ...pairs.flatMap(id => id.split('>'))])], currentNodeIds,
  prerequisiteEdges: pairs.map(id => ({id, source:id.split('>')[0], target:id.split('>')[1], strength:'hard'})),
  courseOrder:[{nodeId:'T',lessonOrder:0,coverageOrder:0}],
});
describe('V3 legitimate candidate capability space', () => {
  it('excludes an unacquired root and its unanchored gray branch', () => {
    const data=input(['A>B','B>T']); const model=buildCapabilityModel(data);
    expect(model.orderedNodeIds).toEqual(['T']);
    expect(model.supportEdges).toEqual([]);
    expect(model.disconnectedCourseKnowledgeIds).toEqual(['T']);
    expect(planCourseRoute(data)).toMatchObject({valid:false,conflicts:[{kind:'target_without_acquired_path'}]});
  });
  it('retains multiple roots, branches and their merge without isolated unrelated knowledge', () => {
    const model=buildCapabilityModel(input(['A>B','B>T','C>D','D>T'],['A','C']));
    expect([...model.orderedNodeIds].sort()).toEqual(['A','B','C','D','T']);
    expect(model.supportEdges).toHaveLength(4);
    expect(model.orderedNodeIds).not.toContain('isolated');
  });
  it('retains an unselected legal optional branch independently of route and catalog', () => {
    const data=input(['A>B','B>T','A>C'],['A']);
    data.enablesEdges=[{id:'C>T',source:'C',target:'T',relation:'enables',strength:.8}];
    const model=buildCapabilityModel(data);const plan=planCourseRoute(data);
    expect(plan).toMatchObject({valid:true,route:{selectedNodeIds:['A','B','T']}});
    expect(model.orderedNodeIds).toContain('C');
    expect(buildCapabilityModel({...data,...{options:[]}})).toEqual(model);
  });
  it('recomputes at formal acquired boundaries without admitting pruned Include ancestors', () => {
    const data=input(['A>B','B>T'],['A']); const before=buildCapabilityModel(data);
    const after=buildCapabilityModel({...data,currentNodeIds:['B']});
    expect(after.orderedNodeIds).toEqual(['B','T']);
    expect(after.orderedNodeIds).not.toEqual(before.orderedNodeIds);
    expect(planCourseRoute({...data,currentNodeIds:['B']},{includeNodeIds:['A'],excludeNodeIds:[]})).toMatchObject({valid:false,conflicts:[{kind:'include_outside_model'}]});
  });
  it('keeps hard AND from both legitimate roots and remains permutation stable', () => {
    const data=input(['A>B','C>B','B>T'],['A','C']); const model=buildCapabilityModel(data);
    expect(model.connectedCourseKnowledgeIds).toEqual(['T']);
    expect(model.actionableNodeIds).toContain('B');
    expect(buildCapabilityModel({...data,currentNodeIds:['A']}).orderedNodeIds).toEqual(['T']);
    expect(buildCapabilityModel({...data,nodeIds:[...data.nodeIds].reverse(),prerequisiteEdges:[...data.prerequisiteEdges].reverse()})).toEqual(model);
  });
});

it('retains all anchored paths through acquired intermediates rather than only the nearest blue boundary',()=>{
 const model=buildCapabilityModel(input(['A>X','X>B','B>T'],['A','B']));
 expect(model.orderedNodeIds).toEqual(['A','X','B','T']);
 expect(model.supportEdges.map(edge=>edge.id)).toEqual(['A>X','B>T','X>B']);
});
it('every gray member has incoming and outgoing relations on an acquired-to-target path',()=>{
 const model=buildCapabilityModel(input(['A>B','B>T','C>D','D>T','A>E','E>T'],['A']));
 expect(model.orderedNodeIds).not.toContain('C');expect(model.orderedNodeIds).not.toContain('D');
 for(const id of model.bridgeKnowledgeIds.filter(id=>!model.currentKnowledgeIds.includes(id))){
   expect(model.supportEdges.some(edge=>edge.target===id)).toBe(true);
   expect(model.supportEdges.some(edge=>edge.source===id)).toBe(true);
 }
});

it('excludes a cycle detour which requires revisiting its entry to reach a target',()=>{
 const data=input([],['A']);data.nodeIds=['A','X','Y','T'];
 data.enablesEdges=['A>X','X>Y','Y>X','X>T'].map(id=>({id,source:id.split('>')[0],target:id.split('>')[1],relation:'enables',strength:.8}));
 const model=buildCapabilityModel(data);expect([...model.orderedNodeIds].sort()).toEqual(['A','T','X']);
 expect(model.supportEdges.map(edge=>edge.id)).toEqual(['A>X','X>T']);
});
it('retains useful cyclic-component nodes with different entry and exit, without a cyclic backtracking edge',()=>{
 const data=input([],['A']);data.nodeIds=['A','X','Y','T'];
 data.enablesEdges=['A>X','X>Y','Y>X','Y>T'].map(id=>({id,source:id.split('>')[0],target:id.split('>')[1],relation:'enables',strength:.8}));
 const model=buildCapabilityModel(data);expect([...model.orderedNodeIds].sort()).toEqual(['A','T','X','Y']);
 expect(model.supportEdges.map(edge=>edge.id)).toEqual(['A>X','X>Y','Y>T']);
 expect(data.enablesEdges).toHaveLength(4);
});

it('matches independent exhaustive simple-path witnesses across deterministic small cyclic graphs',()=>{
 const nodes=['A','B','C','D','T'];let seed=721;
 for(let scenario=0;scenario<200;scenario++){
   const enablesEdges=nodes.flatMap(source=>nodes.flatMap(target=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return source!==target&&(seed>>>24)%3===0?[{id:`${source}>${target}`,source,target,relation:'enables' as const,strength:.8}]:[];}));
   const acquired=scenario%2?['A']:['A','B'],seenNodes=new Set(['T']),seenEdges=new Set<string>();
   const visit=(id:string,path:string[],edgeIds:string[])=>{if(id==='T'){path.forEach(node=>seenNodes.add(node));edgeIds.forEach(edge=>seenEdges.add(edge));}
     for(const edge of enablesEdges.filter(edge=>edge.source===id&&!path.includes(edge.target)))visit(edge.target,[...path,edge.target],[...edgeIds,edge.id]);};
   acquired.forEach(id=>visit(id,[id],[]));
   const model=buildCapabilityModel({nodeIds:nodes,currentNodeIds:acquired,prerequisiteEdges:[],enablesEdges,courseOrder:[{nodeId:'T',lessonOrder:0,coverageOrder:0}]});
   expect([...model.orderedNodeIds].sort()).toEqual([...seenNodes].sort());expect(model.supportEdges.map(edge=>edge.id)).toEqual([...seenEdges].sort());
 }
});

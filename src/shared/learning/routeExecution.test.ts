import { describe,expect,it } from 'vitest';
import { executionRelations,inspectRouteExecution,planRouteExecution,type RouteActionOption } from './routeExecution';
import type { CapabilityRelation,SelectedRoute } from './routePlanning';
const facts:CapabilityRelation[]=[{id:'ab',source:'A',target:'B',relation:'prerequisite',strength:'hard'},{id:'cb',source:'C',target:'B',relation:'prerequisite',strength:'hard'},{id:'bd',source:'B',target:'D',relation:'prerequisite',strength:'hard'},{id:'ad',source:'A',target:'D',relation:'enables',strength:.5}];
const route:SelectedRoute={selectedNodeIds:['A','B','C','D'],orderedNodeIds:['A','C','B','D'],prerequisiteEdges:facts.filter(e=>e.relation==='prerequisite') as SelectedRoute['prerequisiteEdges'],effectiveTargetNodeIds:['D'],currentKnowledgeIds:['A','C'],bridgeKnowledgeIds:['A','C','B']};
const option=(edgeId:string,actionId:string,extra:Partial<RouteActionOption>={}):RouteActionOption=>({edgeId,actionId,title:actionId,type:'micro_learning',estimatedMinutes:8,weight:8,planningAvailable:true,availableNow:true,reasons:[],...extra});
const options=facts.flatMap(e=>[option(e.id,`${e.id}-micro`),option(e.id,`${e.id}-practice`,{type:'practice_task',weight:20})]);
describe('formal execution Route references',()=>{
  it('linearizes a factual DAG without creating the adjacent reading-order edge',()=>{
    const original=structuredClone({route,facts});
    const result=planRouteExecution({route,facts,options});
    expect(result.complete).toBe(true);expect(result.steps.map(s=>s.edgeId)).toEqual(['ab','cb','ad','bd']);
    expect(result.steps.map(s=>[s.sourceNodeId,s.targetNodeId])).not.toContainEqual(['A','C']);
    expect({route,facts}).toEqual(original);expect(result.steps[0]).not.toHaveProperty('title');
  });
  it('uses readiness, cost and stable ID for Preview recommendations but allows future resources',()=>{
    const result=planRouteExecution({route,facts,options:options.map(o=>o.edgeId==='ab'?{...o,availableNow:o.type==='practice_task'}:o)});
    expect(result.steps[0].actionId).toBe('ab-practice');
    const future=planRouteExecution({route,facts,options:options.map(o=>({...o,availableNow:false,reasons:['source not acquired']}))});
    expect(future.complete).toBe(true);
  });
  it('Action-only choices change Steps without changing Knowledge topology or membership',()=>{
    const before=planRouteExecution({route,facts,options});
    const after=planRouteExecution({route,facts,options,choices:[{edgeId:'ab',actionId:'ab-practice'}]});
    expect(after.steps[0].actionId).toBe('ab-practice');expect(after.steps.map(s=>s.edgeId)).toEqual(before.steps.map(s=>s.edgeId));
    expect(route.selectedNodeIds).toEqual(['A','B','C','D']);
  });
  it('does not replace an explicitly invalid Action with a recommended alternative',()=>{
    const result=planRouteExecution({route,facts,options,choices:[{edgeId:'ab',actionId:'archived'}]});
    expect(result.complete).toBe(false);expect(result.steps.some(s=>s.edgeId==='ab')).toBe(false);
    expect(result.issues[0]).toMatchObject({edgeId:'ab',actionId:'archived'});
  });
  it('permits omitting optional support but not a necessary prerequisite',()=>{
    expect(planRouteExecution({route,facts,options,selectedEdgeIds:['ab','cb','bd']}).complete).toBe(true);
    expect(planRouteExecution({route,facts,options,selectedEdgeIds:['ab','bd']}).issues).toContainEqual({edgeId:'cb',reason:'必要前置关系不能从路线中省略。'});
  });
  it('new formal relation membership is exactly persisted Edge selection',()=>{
    const steps=planRouteExecution({route,facts,options,selectedEdgeIds:['ab','cb','bd']}).steps;
    expect(executionRelations({...route,executionSteps:steps},facts).map(e=>e.id)).toEqual(['ab','bd','cb']);
    expect(executionRelations(route,facts).map(e=>e.id)).toEqual(['ab','ad','bd','cb']);
  });
  it('legacy snapshots remain inspectable but require explicit adoption before execution',()=>{
    expect(inspectRouteExecution(route,facts,options)).toMatchObject({steps:[],complete:false});
    expect(route).not.toHaveProperty('executionSteps');
  });
  it('keeps an unavailable formal Action instead of silently replacing it',()=>{
    const steps=planRouteExecution({route,facts,options}).steps;
    const snapshot={...route,executionSteps:steps};
    const result=inspectRouteExecution(snapshot,facts,options.filter(o=>o.actionId!=='ab-micro'));
    expect(result.steps).toEqual(steps);expect(result.complete).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({edgeId:'ab',actionId:'ab-micro'}));
  });
  it('rejects duplicate Edge identity, corrupt order and reversed endpoints',()=>{
    const steps=planRouteExecution({route,facts,options}).steps;
    expect(inspectRouteExecution({...route,executionSteps:[{...steps[0],sourceNodeId:'B',targetNodeId:'A'},...steps.slice(1)]},facts,options).complete).toBe(false);
    expect(inspectRouteExecution({...route,executionSteps:[steps[0],steps[0],...steps.slice(2)]},facts,options).complete).toBe(false);
  });
  it('orders enables Steps by source formation even when curriculum puts their target first',()=>{
    const edges:CapabilityRelation[]=[{id:'ac',source:'A',target:'C',relation:'prerequisite',strength:'hard'},{id:'cb',source:'C',target:'B',relation:'enables',strength:.5}];
    const selected={...route,selectedNodeIds:['A','B','C'],orderedNodeIds:['B','A','C'],currentKnowledgeIds:['A'],effectiveTargetNodeIds:['B'],prerequisiteEdges:[edges[0]] as SelectedRoute['prerequisiteEdges']};
    const result=planRouteExecution({route:selected,facts:edges,options:edges.map(e=>option(e.id,e.id))});
    expect(result.complete).toBe(true);expect(result.steps.map(s=>s.edgeId)).toEqual(['ac','cb']);
  });
  it('rejects disconnected source formation and unmet required capabilities without inventing Steps',()=>{
    expect(planRouteExecution({route:{...route,currentKnowledgeIds:[]},facts,options}).complete).toBe(false);
    const result=planRouteExecution({route,facts,options:options.map(o=>({...o,requiredCapabilityIds:['UNREACHABLE']}))});
    expect(result.complete).toBe(false);expect(result.steps).toEqual([]);
  });

  it('uses formally acquired requirements outside Route membership without adding them to the graph',()=>{
    const result=planRouteExecution({route,facts,options:options.map(o=>({...o,requiredCapabilityIds:['EXTERNAL']})),acquiredNodeIds:['A','C','EXTERNAL']});
    expect(result.complete).toBe(true);expect(route.selectedNodeIds).not.toContain('EXTERNAL');
  });

  it('reports a new live hard prerequisite without rewriting an immutable adopted Route',()=>{
    const snapshot={...route,executionSteps:planRouteExecution({route,facts,options}).steps};
    const before=structuredClone(snapshot);
    const live=[...facts,{id:'zb',source:'Z',target:'B',relation:'prerequisite' as const,strength:'hard' as const}];
    expect(inspectRouteExecution(snapshot,live,options,['A','C']).complete).toBe(false);
    expect(inspectRouteExecution(snapshot,live,options,['A','C','Z']).complete).toBe(true);
    expect(snapshot).toEqual(before);
  });

});

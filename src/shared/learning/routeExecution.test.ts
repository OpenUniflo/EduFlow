import { describe,expect,it } from 'vitest';
import { actionChoice,executionRelations,inspectRouteExecution,planRouteExecution,type RouteActionOption } from './routeExecution';
import type { CapabilityRelation,SelectedRoute } from './routePlanning';
const facts:CapabilityRelation[]=[{id:'ab',source:'A',target:'B',relation:'prerequisite',strength:'hard'},{id:'cb',source:'C',target:'B',relation:'prerequisite',strength:'hard'},{id:'bd',source:'B',target:'D',relation:'prerequisite',strength:'hard'},{id:'ad',source:'A',target:'D',relation:'enables',strength:.5}];
const route:SelectedRoute={selectedNodeIds:['A','B','C','D'],orderedNodeIds:['A','C','B','D'],prerequisiteEdges:facts.filter(e=>e.relation==='prerequisite') as SelectedRoute['prerequisiteEdges'],effectiveTargetNodeIds:['D'],currentKnowledgeIds:['A','C'],bridgeKnowledgeIds:['A','C','B']};
const option=(edgeId:string,actionId:string,extra:Partial<Extract<RouteActionOption,{edgeId:string}>>={}):RouteActionOption=>({edgeId,actionId,title:actionId,type:'micro_learning',estimatedMinutes:8,weight:8,planningAvailable:true,availableNow:true,reasons:[],...extra});
const options=facts.flatMap(e=>[option(e.id,`${e.id}-micro`),option(e.id,`${e.id}-practice`,{type:'practice_task',weight:20})]);
describe('formal execution Route references',()=>{
  it('linearizes a factual DAG without creating the adjacent reading-order edge',()=>{
    const original=structuredClone({route,facts});
    const result=planRouteExecution({route,facts,options});
    expect(result.complete).toBe(true);expect(result.steps.map(s=>s.edgeId)).toEqual(['ab','cb','bd']);
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
    const after=planRouteExecution({route,facts,options,choices:[{edgeId:'ab',actionId:'ab-practice'},{edgeId:'cb',actionId:'cb-micro'},{edgeId:'bd',actionId:'bd-micro'}]});
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
    expect(planRouteExecution({route,facts,options,selectedEdgeIds:['ab','bd']}).issues).toContainEqual(expect.objectContaining({kind:'hard_edge_required',edgeId:'cb'}));
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
    expect(inspectRouteExecution({...route,executionSteps:[{scope:'edge',edgeId:steps[0].edgeId!,actionId:steps[0].actionId,order:steps[0].order,sourceNodeId:'B',targetNodeId:'A'},...steps.slice(1)]},facts,options).complete).toBe(false);
    expect(inspectRouteExecution({...route,executionSteps:[steps[0],steps[0],...steps.slice(2)]},facts,options).complete).toBe(false);
  });
  it('orders enables Steps by source formation even when curriculum puts their target first',()=>{
    const edges:CapabilityRelation[]=[{id:'ac',source:'A',target:'C',relation:'prerequisite',strength:'hard'},{id:'cb',source:'C',target:'B',relation:'enables',strength:.5}];
    const selected={...route,selectedNodeIds:['A','B','C'],orderedNodeIds:['B','A','C'],currentKnowledgeIds:['A'],effectiveTargetNodeIds:['B'],prerequisiteEdges:[edges[0]] as SelectedRoute['prerequisiteEdges']};
    const result=planRouteExecution({route:selected,facts:edges,options:edges.map(e=>option(e.id,e.id)),selectedEdgeIds:['ac','cb']});
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

  it('keeps unselected external hard facts outside execution authority without rewriting a Route',()=>{
    const snapshot={...route,executionSteps:planRouteExecution({route,facts,options}).steps};
    const before=structuredClone(snapshot);
    const live=[...facts,{id:'zb',source:'Z',target:'B',relation:'prerequisite' as const,strength:'hard' as const}];
    expect(inspectRouteExecution(snapshot,live,options,['A','C']).complete).toBe(true);
    expect(inspectRouteExecution(snapshot,live,options,['A','C','Z']).complete).toBe(true);
    expect(snapshot).toEqual(before);
  });

});

describe('deterministic hard and optional execution selection',()=>{
  it('retains valid optional decisions but ignores old decisions outside the new scope',()=>{
    const result=planRouteExecution({route,facts,options,retainedEdgeIds:['ad','gone']});
    expect(result.complete).toBe(true);expect(result.steps.map(step=>step.edgeId)).toContain('ad');expect(result.steps.map(step=>step.edgeId)).not.toContain('gone');
  });
  it('does not select new enables or soft prerequisites when membership expands',()=>{
    const soft={id:'soft',source:'C',target:'D',relation:'prerequisite' as const,strength:'soft' as const};
    const result=planRouteExecution({route:{...route,prerequisiteEdges:[...route.prerequisiteEdges,soft]},facts:[...facts,soft],options:[...options,option('soft','soft-action')]});
    expect(result.complete).toBe(true);expect(result.steps.map(step=>step.edgeId)).toEqual(['ab','cb','bd']);
  });
  it('reports a real candidate support edge then converges after explicit selection',()=>{
    const edge={id:'support',source:'A',target:'T',relation:'enables' as const,strength:.8};
    const selected={...route,selectedNodeIds:['A','T'],orderedNodeIds:['T','A'],currentKnowledgeIds:['A'],effectiveTargetNodeIds:['T'],prerequisiteEdges:[]};
    const input={route:selected,facts:[edge],options:[option('support','learn')]};
    const missing=planRouteExecution(input);expect(missing.steps).toEqual([]);expect(missing.issues).toContainEqual(expect.objectContaining({kind:'support_edge_required',nodeId:'T',candidateEdgeIds:['support']}));
    expect(planRouteExecution({...input,selectedEdgeIds:['support']}).complete).toBe(true);
  });
  it('uses typed action, source, requirement and missing-target issues',()=>{
    expect(planRouteExecution({route,facts,options:[]}).issues).toContainEqual(expect.objectContaining({kind:'action_required',edgeId:'ab'}));
    expect(planRouteExecution({route,facts,options,choices:[{edgeId:'ab',actionId:'retired'}]}).issues).toContainEqual(expect.objectContaining({kind:'action_unavailable',actionId:'retired'}));
    expect(planRouteExecution({route:{...route,currentKnowledgeIds:[]},facts,options}).issues).toContainEqual(expect.objectContaining({kind:'source_unreachable',nodeId:'A'}));
    expect(planRouteExecution({route,facts,options:options.map(o=>({...o,requiredCapabilityIds:['M']}))}).issues).toContainEqual(expect.objectContaining({kind:'required_capability_missing',requiredNodeIds:expect.arrayContaining(['M'])}));
    expect(planRouteExecution({route:{...route,effectiveTargetNodeIds:['Z']},facts,options}).issues).toContainEqual(expect.objectContaining({kind:'target_unreachable',nodeId:'Z'}));
    expect(planRouteExecution({route,facts,options,selectedEdgeIds:['fake']}).issues).toContainEqual(expect.objectContaining({kind:'edge_not_in_route',edgeId:'fake'}));
  });
  it('hard edges remain selected even when an invalid removal request is diagnosed',()=>{
    const result=planRouteExecution({route,facts,options,selectedEdgeIds:[]});
    expect(result.issues).toContainEqual(expect.objectContaining({kind:'hard_edge_required'}));expect(result.steps.map(s=>s.edgeId)).toEqual(['ab','cb','bd']);
  });
  it('rejects repeated Assignment execution across different edges',()=>{
    const result=planRouteExecution({route,facts,options:options.map(o=>({...o,type:'practice_task' as const,assignmentId:'one-task'}))});
    expect(result.complete).toBe(false);expect(result.steps.length).toBe(1);expect(result.issues).toContainEqual(expect.objectContaining({kind:'action_unavailable'}));
  });
  it('every proposed step is a real factual edge and carries no copied Action',()=>{
    const result=planRouteExecution({route,facts,options,retainedEdgeIds:['ad']});
    for(const step of result.steps){expect(facts).toContainEqual(expect.objectContaining({id:step.edgeId,source:step.sourceNodeId,target:step.targetNodeId}));expect(step).not.toHaveProperty('title');}
  });
});

it('exact history scope rejects changed prerequisite semantics before offering restore',async()=>{
 const {isExecutionScopeValid}=await import('./routeExecution');
 const snapshot={...route,valid:true};
 expect(isExecutionScopeValid(snapshot,route.selectedNodeIds,facts)).toBe(true);
 expect(isExecutionScopeValid(snapshot,route.selectedNodeIds,facts.map(edge=>edge.relation==='prerequisite'&&edge.id==='ab'?{...edge,strength:'soft' as const}:edge))).toBe(false);
 expect(isExecutionScopeValid({...snapshot,valid:false},route.selectedNodeIds,facts)).toBe(false);
 expect(isExecutionScopeValid(snapshot,['A','C','D'],facts)).toBe(false);
});

describe('ordered multi-action groups and execution progress',()=>{
 it.each([1,2,5])('supports %i Actions per Edge with stable local order',count=>{
  const actions=Array.from({length:count},(_,i)=>option('ab',`action-${i}`));
  const choices=[...actions].reverse().map(actionChoice);
  const result=planRouteExecution({route,facts,options:[...actions,...options],choices:[...choices,{edgeId:'cb',actionId:'cb-micro'},{edgeId:'bd',actionId:'bd-micro'}]});
  expect(result.complete).toBe(true);
  expect(result.steps.slice(0,count).map(s=>s.actionId)).toEqual(choices.map(s=>s.actionId));
  expect(result.steps.map(s=>s.order)).toEqual(result.steps.map((_,i)=>i));
  expect(inspectRouteExecution({...route,executionSteps:result.steps},facts,[...actions,...options]).complete).toBe(true);
 });
 it('rejects duplicate Edge/Action choices and interleaved immutable groups',()=>{
  const choice={edgeId:'ab',actionId:'ab-micro'};
  expect(planRouteExecution({route,facts,options,choices:[choice,choice]}).complete).toBe(false);
  const result=planRouteExecution({route,facts,options,choices:[choice,{edgeId:'ab',actionId:'ab-practice'},{edgeId:'cb',actionId:'cb-micro'},{edgeId:'bd',actionId:'bd-micro'}]});
  const steps=[result.steps[0],result.steps[2],result.steps[1],result.steps[3]].map((s,order)=>({...s,order}));
  expect(inspectRouteExecution({...route,executionSteps:steps},facts,options).complete).toBe(false);
 });
 it('reaches targets only after every selected incoming Edge group completes; never writes UKS',async()=>{
  const {routeExecutionProgress}=await import('./routeExecution');
  const steps=planRouteExecution({route,facts,options,choices:[{edgeId:'ab',actionId:'ab-micro'},{edgeId:'ab',actionId:'ab-practice'},{edgeId:'cb',actionId:'cb-micro'},{edgeId:'bd',actionId:'bd-micro'}]}).steps;
  const uks=['A','C'];
  const run=(index:number)=>({user_id:'u',course_id:'c',edge_id:steps[index].edgeId??null,action_id:steps[index].actionId,status:'completed',execution_version:2});
  const progress=(runs:ReturnType<typeof run>[])=>routeExecutionProgress({userId:'u',courseId:'c',steps,runs,acquiredNodeIds:uks,facts});
  expect(steps[progress([run(0)]).recommendedStepIndex!]?.actionId).toBe('ab-practice');
  expect(progress([run(0)]).completedEdgeIds).not.toContain('ab');
  expect(progress([run(0),run(1)]).reachableNodeIds).not.toContain('B');
  expect(progress([run(0),run(1),run(2)]).reachableNodeIds).toContain('B');
  expect(steps[progress([run(0),run(1),run(2)]).recommendedStepIndex!]?.edgeId).toBe('bd');
  expect(uks).toEqual(['A','C']);
  expect(progress([{...run(0),user_id:'other'}]).recommendedStepIndex).toBe(0);
  expect(progress([{...run(0),execution_version:1}]).recommendedStepIndex).toBe(1);
  expect(progress([run(0),{...run(0),status:'in_progress'}]).recommendedStepIndex).toBe(1);
 });
});

it('explicitly empty selections never regain defaults; untouched planning may recommend',()=>{
 const selected={...route,selectedNodeIds:['A','B'],orderedNodeIds:['A','B'],currentKnowledgeIds:['A'],effectiveTargetNodeIds:['B'],prerequisiteEdges:[facts[0]] as SelectedRoute['prerequisiteEdges']};
 const input={route:selected,facts:[facts[0]],options:[option('ab','removed')],selectedEdgeIds:['ab']};
 expect(planRouteExecution({...input,choices:[]}).steps).toEqual([]);
 expect(planRouteExecution({...input,choices:[]}).issues).toContainEqual(expect.objectContaining({kind:'action_required',edgeId:'ab'}));
 expect(planRouteExecution({...input,choices:[]}).complete).toBe(false);
 expect(planRouteExecution(input).complete).toBe(true);
});

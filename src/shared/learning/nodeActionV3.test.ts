import { describe, expect, it } from 'vitest';
import { planRouteExecution, inspectRouteExecution, routeExecutionProgress, type RouteActionOption, type RouteExecutionStep } from './routeExecution';
import type { CapabilityRelation, SelectedRoute } from './routePlanning';
const facts: CapabilityRelation[]=[{id:'ab',source:'A',target:'B',relation:'prerequisite',strength:'hard'},{id:'ct',source:'C',target:'T',relation:'enables',strength:.8},{id:'bt',source:'B',target:'T',relation:'enables',strength:.8}];
const route:SelectedRoute={selectedNodeIds:['A','B','C','T'],orderedNodeIds:['A','B','C','T'],prerequisiteEdges:[{id:'ab',source:'A',target:'B',strength:'hard'}],currentKnowledgeIds:[],effectiveTargetNodeIds:['T'],bridgeKnowledgeIds:['A','B','C']};
const node=(nodeId:string,actionId:string,type='micro_learning')=>({scope:'node',nodeId,actionId,title:actionId,type,estimatedMinutes:5,weight:5,planningAvailable:true,availableNow:true,reasons:[]}) as unknown as RouteActionOption;
const edge=(edgeId:string,actionId:string)=>({scope:'edge',edgeId,actionId,title:actionId,type:'micro_learning',estimatedMinutes:5,weight:5,planningAvailable:true,availableNow:false,reasons:[]}) as RouteActionOption;
const options=[node('A','a-micro'),node('A','a-practice','practice_task'),node('C','c-micro'),edge('ab','ab-micro'),edge('bt','bt-micro'),edge('ct','ct-micro')];
const input={route,facts,options,selectedEdgeIds:['ab','bt','ct']};
const progress=(steps:RouteExecutionStep[],runs:Parameters<typeof routeExecutionProgress>[0]['runs']=[],acquiredNodeIds:string[]=[])=>routeExecutionProgress({userId:'u',courseId:'course',steps,runs,acquiredNodeIds,facts,options});
const scope=(step:RouteExecutionStep)=>(step as unknown as {scope?:string}).scope;
const run=(step:RouteExecutionStep)=>({user_id:'u',course_id:'course',node_id:(step as unknown as {nodeId?:string}).nodeId??null,edge_id:step.edgeId??null,action_id:step.actionId,status:'completed'} as unknown as Parameters<typeof routeExecutionProgress>[0]['runs'][number]);
describe('V3 Node / Edge execution uses one route lifecycle',()=>{
 it('plans real unacquired roots through Node actions without invented Edges',()=>{
  const result=planRouteExecution(input);expect(result.complete).toBe(true);
  expect(result.steps.filter(step=>scope(step)==='node').map(step=>(step as unknown as {nodeId:string}).nodeId).sort()).toEqual(['A','C']);
  expect(result.steps.filter(step=>scope(step)!=='node').every(step=>facts.some(edge=>edge.id===step.edgeId))).toBe(true);
  expect(inspectRouteExecution({...route,executionSteps:result.steps},facts,options,[]).complete).toBe(true);
 });
 it('completes a Node Micro into execution reachability, preserves UKS and unlocks its real Edge',()=>{
  const steps=planRouteExecution(input).steps;const uks:string[]=[];
  const root=steps.find(step=>step.actionId==='a-micro')!;expect(root).toBeDefined();
  const value=progress(steps,[run(root)],uks);
  expect(value.reachableNodeIds).toContain('A');expect(value.availableStepIndexes.map(index=>steps[index].actionId)).toContain('ab-micro');expect(uks).toEqual([]);
 });
 it('acquired Node steps are satisfied without fabricating completed Runs',()=>{
  const steps=planRouteExecution(input).steps;const index=steps.findIndex(step=>step.actionId==='a-micro');expect(index).toBeGreaterThanOrEqual(0);
  const value=progress(steps,[],['A']);expect(value.satisfied[index]).toBe(true);expect(value.completed[index]).toBe(false);
  expect(value.reachableNodeIds).toContain('A');expect(value.availableStepIndexes).not.toContain(index);
 });
 it('independent root actions are simultaneously in frontier despite global order',()=>{
  const steps=planRouteExecution(input).steps;
  expect(progress(steps).availableStepIndexes.map(index=>steps[index].actionId).sort()).toEqual(['a-micro','c-micro']);
 });
 it('requires all ordered Node Micro/Practice choices before granting root reachability',()=>{
  const choices=options.map(({actionId,...rest})=>({...rest,actionId}));
  const result=planRouteExecution({...input,choices});expect(result.complete).toBe(true);
  const local=result.steps.filter(step=>scope(step)==='node' && (step as unknown as {nodeId:string}).nodeId==='A');expect(local.map(step=>step.actionId)).toEqual(['a-micro','a-practice']);
  expect(progress(result.steps,[run(local[0])]).reachableNodeIds).not.toContain('A');
  expect(progress(result.steps,[run(local[0])]).availableStepIndexes.map(index=>result.steps[index].actionId)).toContain('a-practice');
  expect(progress(result.steps,local.map(run)).reachableNodeIds).toContain('A');
 });
 it('missing Node resources make execution incomplete without replacing scope or facts',()=>{
  const result=planRouteExecution({...input,options:options.filter(option=>option.actionId!=='a-micro'&&option.actionId!=='a-practice')});
  expect(result.complete).toBe(false);expect(result.issues).toContainEqual(expect.objectContaining({kind:'action_required',nodeId:'A'}));
  expect(route.selectedNodeIds).toContain('A');expect(facts).toHaveLength(3);
 });
 it('rejects a Node action on a middle capability rather than bypassing its incoming fact',()=>{
  const result=planRouteExecution({...input,options:[...options,node('B','b-shortcut')],choices:[node('B','b-shortcut')]});
  expect(result.complete).toBe(false);expect(result.issues).toContainEqual(expect.objectContaining({nodeId:'B'}));
 });
 it('rejects floating formal intermediate nodes, even when target is already acquired',()=>{
  const selected={...route,selectedNodeIds:['A','B','T'],orderedNodeIds:['A','B','T'],currentKnowledgeIds:['T']};
  const result=planRouteExecution({route:selected,facts,options,choices:[],selectedEdgeIds:[]});
  expect(result.complete).toBe(false);
 });
 it('same-scope duplicate Node choices and interleaved history are invalid',()=>{
  expect(planRouteExecution({...input,choices:[node('A','a-micro'),node('A','a-micro')]}).complete).toBe(false);
  const result=planRouteExecution({...input,choices:options});
  const a=result.steps.filter(step=>['a-micro','a-practice'].includes(step.actionId));const c=result.steps.find(step=>step.actionId==='c-micro');expect(a).toHaveLength(2);expect(c).toBeDefined();
  const steps=[a[0],c!,a[1],...result.steps.filter(step=>scope(step)!=='node')].map((step,order)=>({...step,order}));
  expect(inspectRouteExecution({...route,executionSteps:steps},facts,options).complete).toBe(false);
 });
 it('keeps scope-less historical Edge steps readable and unchanged',()=>{
  const legacy={...route,selectedNodeIds:['A','B'],orderedNodeIds:['A','B'],effectiveTargetNodeIds:['B'],currentKnowledgeIds:['A'],executionSteps:[{edgeId:'ab',actionId:'ab-micro',sourceNodeId:'A',targetNodeId:'B',order:0}]};
  const before=structuredClone(legacy);
  expect(inspectRouteExecution(legacy,facts,options,['A']).complete).toBe(true);
  expect(progress(legacy.executionSteps,[run(legacy.executionSteps[0])],['A']).reachableNodeIds).toContain('B');expect(legacy).toEqual(before);
 });
});

it('Node required capability gates only that root and does not serialize independent branches',()=>{
 const opts=options.map(option=>option.actionId==='a-micro'?{...option,requiredCapabilityIds:['C']}:option);
 const steps=planRouteExecution({...input,options:opts}).steps;
 const before=routeExecutionProgress({userId:'u',courseId:'course',steps,runs:[],acquiredNodeIds:[],facts,options:opts});
 expect(before.availableStepIndexes.map(index=>steps[index].actionId)).toEqual(['c-micro']);
 const c=steps.find(step=>step.actionId==='c-micro')!;
 const after=routeExecutionProgress({userId:'u',courseId:'course',steps,runs:[run(c)],acquiredNodeIds:[],facts,options:opts});
 expect(after.availableStepIndexes.map(index=>steps[index].actionId)).toContain('a-micro');
});
it('new in-scope hard facts block stale target reachability even when old optional group completed',()=>{
 const legacy={...route,currentKnowledgeIds:['A','C'],executionSteps:[{edgeId:'ct',sourceNodeId:'C',targetNodeId:'T',actionId:'ct-micro',order:0}]};
 const drift=[...facts,{id:'at',source:'A',target:'T',relation:'prerequisite' as const,strength:'hard' as const}];
 const value=routeExecutionProgress({userId:'u',courseId:'course',selectedNodeIds:legacy.selectedNodeIds,steps:legacy.executionSteps,runs:[run(legacy.executionSteps[0])],acquiredNodeIds:['A','C'],facts:drift});
 expect(value.reachableNodeIds).not.toContain('T');
});

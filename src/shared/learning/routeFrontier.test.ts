import { describe, expect, it } from 'vitest';
import { routeExecutionProgress, type RouteExecutionStep, type ExecutionRunReference } from './routeExecution';
import type { CapabilityRelation } from './routePlanning';

const facts: CapabilityRelation[] = [
  {id:'ab',source:'A',target:'B',relation:'prerequisite',strength:'hard'},
  {id:'cb',source:'C',target:'B',relation:'prerequisite',strength:'hard'},
  {id:'bd',source:'B',target:'D',relation:'enables',strength:.5},
  {id:'ae',source:'A',target:'E',relation:'enables',strength:.5},
];
const steps: RouteExecutionStep[] = ['ab','ab','cb','bd','ae'].map((edgeId,order)=>{
  const edge=facts.find(edge=>edge.id===edgeId)!;
  return {edgeId,actionId:`action-${order}`,sourceNodeId:edge.source,targetNodeId:edge.target,order};
});
const run=(index:number):ExecutionRunReference=>({user_id:'u',course_id:'c',edge_id:steps[index].edgeId??null,action_id:steps[index].actionId,status:'completed'});
const progress=(runs:ExecutionRunReference[]=[],acquiredNodeIds=['A','C'])=>routeExecutionProgress({userId:'u',courseId:'c',steps,runs,acquiredNodeIds,facts});
describe('dependency-driven execution frontier',()=>{
  it('makes independent first Actions and parallel hard incoming Actions available',()=>{
    expect(progress().availableStepIndexes).toEqual([0,2,4]);
    expect(progress().recommendedStepIndex).toBe(0);
  });
  it('keeps strict same-Edge order',()=>{
    expect(progress().availableStepIndexes).not.toContain(1);
    expect(progress([run(0)]).availableStepIndexes).toEqual([1,2,4]);
  });
  it('requires every hard incoming group before making target reachable',()=>{
    expect(progress([run(0),run(1)]).reachableNodeIds).not.toContain('B');
    expect(progress([run(0),run(1),run(2)]).availableStepIndexes).toEqual([3,4]);
  });
  it('uses a fixed point independent of the global unfinished prefix',()=>{
    expect(progress([run(4)]).reachableNodeIds).toContain('E');
    expect(progress([run(3),run(2),run(1),run(0)]).reachableNodeIds).toContain('D');
  });
  it('satisfies progression from UKS without fabricating completion or changing inputs',()=>{
    const acquired=['A','C','B']; const runs:ExecutionRunReference[]=[];
    const result=progress(runs,acquired);
    expect(result.satisfied).toEqual([true,true,true,false,false]);
    expect(result.completed).toEqual([false,false,false,false,false]);
    expect(result.availableStepIndexes).toEqual([0,2,3,4]);
    expect(result.recommendedStepIndex).toBe(3);
    expect(acquired).toEqual(['A','C','B']); expect(runs).toEqual([]);
  });
  it('permits optional satisfied execution only in local order',()=>{
    expect(progress([run(0)],['A','C','B']).availableStepIndexes).toContain(1);
    expect(progress([],['A','C','B']).availableStepIndexes).not.toContain(1);
  });
  it('does not turn enables into a hard incoming conjunction',()=>{
    const optional={id:'ce',source:'C',target:'E',relation:'enables' as const,strength:.5};
    const extra={edgeId:'ce',actionId:'extra',sourceNodeId:'C',targetNodeId:'E',order:5};
    const result=routeExecutionProgress({userId:'u',courseId:'c',steps:[...steps,extra],runs:[run(4)],acquiredNodeIds:['A','C'],facts:[...facts,optional]});
    expect(result.reachableNodeIds).toContain('E');
  });
  it('rejects unrelated owner completion and invalid factual endpoint references',()=>{
    expect(progress([{...run(0),user_id:'other'}]).completed[0]).toBe(false);
    expect(routeExecutionProgress({userId:'u',courseId:'c',steps,runs:[],acquiredNodeIds:['A','C'],facts:facts.filter(edge=>edge.id!=='ab')}).availableStepIndexes).not.toContain(0);
  });
  it('does not bootstrap a completed cycle without a formal seed',()=>{
    const cycleFacts:CapabilityRelation[]=[{id:'xy',source:'X',target:'Y',relation:'enables',strength:.5},{id:'yx',source:'Y',target:'X',relation:'enables',strength:.5}];
    const cycleSteps=cycleFacts.map((edge,order)=>({edgeId:edge.id,actionId:edge.id,sourceNodeId:edge.source,targetNodeId:edge.target,order}));
    const runs=cycleSteps.map(step=>({user_id:'u',course_id:'c',edge_id:step.edgeId,action_id:step.actionId,status:'completed'}));
    expect(routeExecutionProgress({userId:'u',courseId:'c',steps:cycleSteps,runs,acquiredNodeIds:[],facts:cycleFacts}).reachableNodeIds).toEqual([]);
  });
  it('reaches fixed point for reverse display order and cannot bypass an unfinished hard group',()=>{
    const reverse=[...steps].reverse();
    expect(routeExecutionProgress({userId:'u',courseId:'c',steps:reverse,runs:[run(0),run(1),run(2),run(3)],acquiredNodeIds:['A','C'],facts}).reachableNodeIds).toContain('D');
    expect(progress([run(0),run(1),run(3)]).reachableNodeIds).not.toContain('D');
  });
  it('requires Action-specific capabilities without serializing independent groups',()=>{
    const options=steps.map(step=>({...step,title:step.actionId,type:'micro_learning' as const,estimatedMinutes:1,weight:1,planningAvailable:true,availableNow:true,reasons:[],requiredCapabilityIds:step.edgeId==='ab'?['M']:[]}));
    expect(routeExecutionProgress({userId:'u',courseId:'c',steps,runs:[],acquiredNodeIds:['A','C'],facts,options}).availableStepIndexes).toEqual([2,4]);
  });
  it('retains archived selected hard references as failed conjunction conditions, never current facts',()=>{
    const selectedPrerequisiteEdges=facts.filter(edge=>edge.relation==='prerequisite') as import('./routePlanning').RoutePrerequisite[];
    const input={userId:'u',courseId:'c',steps,runs:[run(0),run(1),run(2)],acquiredNodeIds:['A','C'],facts:facts.filter(edge=>edge.id!=='ab'),selectedPrerequisiteEdges};
    expect(routeExecutionProgress(input).reachableNodeIds).not.toContain('B');
    expect(routeExecutionProgress(input).availableStepIndexes).not.toContain(3);
    expect(routeExecutionProgress({...input,acquiredNodeIds:['A','C','B']}).availableStepIndexes).toContain(3);
  });
});

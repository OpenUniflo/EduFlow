import { expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readRouteActionOptions } from './routeExecution';
import type { RoutePlanningInput, SelectedRoute } from '../../src/shared/learning/routePlanning';
import type { RouteExecutionStep } from '../../src/shared/learning/routeExecution';

it('real prerequisite input without relation retains hard conjunction, including an archived selected hard Edge',async()=>{
  const edges=[{id:'ab',source:'A',target:'B',strength:'hard' as const},{id:'cb',source:'C',target:'B',strength:'hard' as const},{id:'bd',source:'B',target:'D',strength:'hard' as const}];
  const steps=edges.map((edge,order)=>({edgeId:edge.id,actionId:edge.id,sourceNodeId:edge.source,targetNodeId:edge.target,order}));
  const tables:Record<string,Record<string,unknown>[]>= {
    knowledge_edge_actions:edges.map(edge=>({id:edge.id,edge_id:edge.id,status:'active',type:'micro_learning',required_capability_ids:[],resource_requirements:[],estimated_minutes:5,difficulty:1,title:edge.id})),
    course_action_bindings:edges.map(edge=>({id:edge.id,action_id:edge.id,course_id:'c',available:true,micro_path_id:edge.id,resources:[]})),
    micro_learning_paths:edges.map(edge=>({id:edge.id,knowledge_id:edge.target,course_id:'c',mode:'learn',status:'published'})),
    edge_action_runs:[{id:'done',user_id:'u',course_id:'c',edge_id:'ab',action_id:'ab',status:'completed'}],
  };
  const client={from(table:string){let rows=tables[table]??[];const q={select:()=>q,order:()=>q,eq:(key:string,value:unknown)=>{rows=rows.filter(row=>row[key]===value);return q;},in:(key:string,values:unknown[])=>{rows=rows.filter(row=>values.includes(row[key]));return q;},range:(from:number,to:number)=>Promise.resolve({data:rows.slice(from,to+1),error:null})};return q;}} as unknown as SupabaseClient;
  const input:RoutePlanningInput={nodeIds:['A','B','C','D'],currentNodeIds:['A','C'],courseOrder:[],prerequisiteEdges:edges};
  const route:SelectedRoute & {executionSteps:RouteExecutionStep[]}={selectedNodeIds:input.nodeIds as string[],orderedNodeIds:input.nodeIds as string[],currentKnowledgeIds:['A','C'],bridgeKnowledgeIds:[],effectiveTargetNodeIds:['D'],prerequisiteEdges:edges,executionSteps:steps};
  const read=()=>readRouteActionOptions(client,'c',input,route,'u');
  expect((await read()).find(option=>option.actionId==='bd')?.availableNow).toBe(false);
  tables.edge_action_runs.push({id:'other',user_id:'u',course_id:'c',edge_id:'cb',action_id:'cb',status:'completed'});
  expect((await read()).find(option=>option.actionId==='bd')?.availableNow).toBe(true);
  input.prerequisiteEdges=edges.filter(edge=>edge.id!=='ab');
  expect((await read()).find(option=>option.actionId==='bd')?.availableNow).toBe(false);
});

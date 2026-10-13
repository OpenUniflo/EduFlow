import { isArtifactPracticeExecutor } from '../../src/shared/learning/practiceBoundary.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoutePlanningInput, SelectedRoute } from '../../src/shared/learning/routePlanning.js';
import { routeExecutionProgress, runMatchesStep, isRouteNodeRoot, type ExecutionRunReference, type RouteActionOption, type RouteExecutionStep } from '../../src/shared/learning/routeExecution.js';
import { evaluateAction, type CourseActionBinding, type CapabilityAction } from '../../src/features/actions/model.js';
import { allRows } from './query.js';
import { readAssignmentEligibility } from './assignmentEligibility.js';

/** Authenticated catalog; resources never determine capability model membership. */
export async function readRouteActionOptions(client:SupabaseClient,courseId:string,input:RoutePlanningInput,route:SelectedRoute & {executionSteps?:RouteExecutionStep[]},userId?:string):Promise<RouteActionOption[]> {
  const allFacts=[...input.prerequisiteEdges.map(edge=>({...edge,relation:'prerequisite' as const})),...(input.enablesEdges??[])];
  const facts=allFacts.filter(edge=>route.selectedNodeIds.includes(edge.source)&&route.selectedNodeIds.includes(edge.target));
  const roots=route.selectedNodeIds.filter(id=>isRouteNodeRoot(id,route,allFacts));
  const [edgeRows,nodeRows,bindingRows,paths,assignments,coverages]=await Promise.all([
    facts.length?allRows(client.from('knowledge_edge_actions').select('*').eq('status','active').in('edge_id',facts.map(edge=>edge.id)).order('id'),'Route Edge Actions'):[],
    roots.length?allRows(client.from('knowledge_edge_actions').select('*').eq('status','active').in('node_id',roots).order('id'),'Route Node Actions'):[],
    allRows(client.from('course_action_bindings').select('*').eq('course_id',courseId).order('id'),'Route bindings'),
    allRows(client.from('micro_learning_paths').select('id,knowledge_id,course_id').eq('status','published').eq('mode','learn').order('id'),'Route Micro executors'),
    allRows(client.from('course_assignments').select('id,mode,experience').eq('course_id',courseId).order('id'),'Route Assignment executors'),
    allRows(client.from('assignment_coverages').select('assignment_id,node_id').eq('course_id',courseId).order('id'),'Route Assignment coverage'),
  ]);
  const acquired=new Set(input.currentNodeIds);
  const runs=userId&&route.executionSteps?await readOwnedRouteRuns(client,userId,courseId):[];
  const progress=userId&&route.executionSteps?routeExecutionProgress({userId,courseId,steps:route.executionSteps,runs,acquiredNodeIds:input.currentNodeIds,facts:allFacts,selectedNodeIds:route.selectedNodeIds,selectedPrerequisiteEdges:route.prerequisiteEdges}):null;
  const reachable=new Set(progress?.reachableNodeIds??input.currentNodeIds),potential=new Set([...input.currentNodeIds,...route.selectedNodeIds]);
  return Promise.all([...edgeRows,...nodeRows].map(async row=>{
    const action=row as CapabilityAction,binding=bindingRows.find(row=>row.action_id===action.id) as CourseActionBinding|undefined;
    const edge=facts.find(edge=>edge.id===action.edge_id),target=action.node_id??edge?.target;
    if(!target)throw new Error('Action scope does not match Route catalog');
    const assignment=assignments.find(row=>row.id===binding?.assignment_id);
    const executor=Boolean(binding?.available && (action.type==='micro_learning'
      ? !binding.assignment_id && paths.some(path=>path.id===binding.micro_path_id&&path.knowledge_id===target&&(path.course_id==null||path.course_id===courseId))
      : !binding.micro_path_id && isArtifactPracticeExecutor(assignment)&&coverages.some(row=>row.assignment_id===binding.assignment_id&&row.node_id===target)));
    const planned=evaluateAction(action,{sourceId:edge?.source,binding,acquiredIds:potential,executionAvailable:executor});
    const immediate=evaluateAction(action,{sourceId:edge?.source,binding,acquiredIds:acquired,routeExecutionReachableIds:reachable,executionAvailable:executor});
    const eligibility=action.type==='practice_task'&&executor&&binding?.assignment_id&&userId
      ? (await readAssignmentEligibility(client,userId,courseId,binding.assignment_id,{targetId:target,status:'not_started',reachableNodeIds:[...reachable]})).eligibility:null;
    const choice=action.node_id?{scope:'node' as const,nodeId:action.node_id,actionId:action.id}:{scope:'edge' as const,edgeId:edge!.id,actionId:action.id};
    const frontier=!progress||progress.availableStepIndexes.some(index=>{const step=route.executionSteps![index];return runMatchesStep({action_id:action.id,edge_id:action.edge_id,node_id:action.node_id},step);});
    return {...choice,title:action.title,type:action.type,estimatedMinutes:action.estimated_minutes,weight:immediate.weight,planningAvailable:planned.available,
      availableNow:frontier&&immediate.available&&!eligibility?.reason,assignmentId:action.type==='practice_task'?String(binding?.assignment_id??''):undefined,
      requiredCapabilityIds:[...new Set([...action.required_capability_ids,...(action.type==='practice_task'?coverages.filter(row=>row.assignment_id===binding?.assignment_id&&row.node_id!==target).map(row=>String(row.node_id)):[])])],
      reasons:[...immediate.reasons.filter(reason=>!['time','difficulty'].includes(reason.code)).map(reason=>reason.message),...(eligibility?.reason?[eligibility.reason]:[])]};
  }));
}
export async function readOwnedRouteRuns(client:SupabaseClient,userId:string,courseId:string) {
  return allRows(client.from('edge_action_runs').select('*').eq('user_id',userId).eq('course_id',courseId).order('id'),'Owned Route runs') as Promise<ExecutionRunReference[]>;
}

import { isArtifactPracticeExecutor } from '../../src/shared/learning/practiceBoundary.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoutePlanningInput, SelectedRoute } from '../../src/shared/learning/routePlanning.js';
import { routeExecutionProgress, type ExecutionRunReference, type RouteActionOption, type RouteExecutionStep } from '../../src/shared/learning/routeExecution.js';
import { evaluateAction, type CourseActionBinding, type EdgeAction } from '../../src/features/actions/model.js';
import { hasUnmetHardPrerequisite } from '../../src/shared/learning/teachingPrerequisites.js';
import { allRows } from './query.js';
import { readAssignmentEligibility } from './assignmentEligibility.js';

/** Authenticated catalog reads; future Steps may be planned before their sources form. */
export async function readRouteActionOptions(client: SupabaseClient, courseId: string, input: RoutePlanningInput, route: SelectedRoute & {executionSteps?:RouteExecutionStep[]}, userId?: string): Promise<RouteActionOption[]> {
  const facts = [...input.prerequisiteEdges, ...(input.enablesEdges ?? [])].filter(edge => route.selectedNodeIds.includes(edge.source) && route.selectedNodeIds.includes(edge.target));
  if (!facts.length) return [];
  const [actionRows, bindingRows, paths, assignments, coverages] = await Promise.all([
    allRows(client.from('knowledge_edge_actions').select('*').eq('status','active').in('edge_id',facts.map(edge => edge.id)).order('id'),'Route Action alternatives'),
    allRows(client.from('course_action_bindings').select('*').eq('course_id',courseId).order('id'),'Route Action bindings'),
    allRows(client.from('micro_learning_paths').select('id,knowledge_id,course_id').eq('status','published').eq('mode','learn').order('id'),'Route Micro executors'),
    allRows(client.from('course_assignments').select('id,mode,experience').eq('course_id',courseId).order('id'),'Route Assignment executors'),
    allRows(client.from('assignment_coverages').select('assignment_id,node_id').eq('course_id',courseId).order('id'),'Route Assignment coverage'),
  ]);
  const acquired = new Set(input.currentNodeIds);
  const runs=userId && route.executionSteps ? await allRows(client.from('edge_action_runs').select('*').eq('user_id',userId).eq('course_id',courseId).order('id'),'Route progress') as ExecutionRunReference[] : [];
  const progress=userId && route.executionSteps ? routeExecutionProgress({userId,courseId,steps:route.executionSteps,runs,acquiredNodeIds:input.currentNodeIds}) : null;
  const reachable=new Set(progress?.reachableNodeIds??input.currentNodeIds);
  const potential = new Set([...input.currentNodeIds,...route.selectedNodeIds]);
  return Promise.all(actionRows.map(async row => {
    const action = row as EdgeAction;
    const binding = bindingRows.find(row => row.action_id === action.id) as CourseActionBinding | undefined;
    const edge = facts.find(edge => edge.id === action.edge_id)!;
    const assignment = assignments.find(row => row.id === binding?.assignment_id);
    const executor = Boolean(binding?.available && (action.type === 'micro_learning'
      ? !binding.assignment_id && paths.some(path => path.id === binding.micro_path_id && path.knowledge_id === edge.target && (path.course_id == null || path.course_id === courseId))
      : !binding.micro_path_id && isArtifactPracticeExecutor(assignment) && coverages.some(row => row.assignment_id === binding.assignment_id && row.node_id === edge.target)));
    const planned = evaluateAction(action,{sourceId:edge.source,binding,acquiredIds:potential,executionAvailable:executor});
    const immediate = evaluateAction(action,{sourceId:edge.source,binding,acquiredIds:acquired,routeExecutionReachableIds:reachable,executionAvailable:executor});
    const hardBlocked = hasUnmetHardPrerequisite(edge.target,reachable,input.prerequisiteEdges);
    const eligibility = action.type==='practice_task' && executor && binding?.assignment_id && userId
      ? (await readAssignmentEligibility(client,userId,courseId,binding.assignment_id,{targetId:edge.target,status:'not_started',reachableNodeIds:[...reachable]})).eligibility : null;
    return { edgeId:edge.id,actionId:action.id,title:action.title,type:action.type,estimatedMinutes:action.estimated_minutes,
      weight:immediate.weight,planningAvailable:planned.available,availableNow:(!progress || progress.currentStep?.actionId===action.id) && immediate.available && !hardBlocked && !eligibility?.reason,assignmentId:action.type==='practice_task'?String(binding?.assignment_id??''):undefined,requiredCapabilityIds:[...new Set([...action.required_capability_ids,...(action.type==='practice_task'?coverages.filter(row=>row.assignment_id===binding?.assignment_id && row.node_id!==edge.target).map(row=>String(row.node_id)):[])])],
      reasons:[...immediate.reasons.filter(reason => !['time','difficulty'].includes(reason.code)).map(reason => reason.message),...(hardBlocked?['需要先形成目标能力的必要前置。']:[]),...(eligibility?.reason?[eligibility.reason]:[])] };
  }));
}

export async function readOwnedRouteRuns(client:SupabaseClient,userId:string,courseId:string) {
  return allRows(client.from('edge_action_runs').select('*').eq('user_id',userId).eq('course_id',courseId).order('id'),'Owned Route runs') as Promise<ExecutionRunReference[]>;
}

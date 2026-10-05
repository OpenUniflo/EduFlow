import { isArtifactPracticeExecutor } from '../../src/shared/learning/practiceBoundary.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './http.js';
import { allRows, dataOrThrow } from './query.js';
import { requirePublishedCourse, requireMicroTeachingEligibility } from './courseMembership.js';
import { readActiveVersion, readRouteInput } from './routePlanning.js';
import { planCourseRoute } from '../../src/shared/learning/routePlanning.js';
import { routeRelations } from '../../src/shared/learning/routePresentation.js';
import { hasUnmetHardPrerequisite } from '../../src/shared/learning/teachingPrerequisites.js';
import { evaluateAction, type EdgeAction, type CourseActionBinding, type ActionRun } from '../../src/features/actions/model.js';
import { readAssignmentEligibility } from './assignmentEligibility.js';
export async function availableMicroPaths(client: SupabaseClient, courseId: string) {
  return allRows(client.from('micro_learning_paths').select('id,knowledge_id,course_id').eq('status', 'published').eq('mode', 'learn').order('id'), 'Action Micro paths').then(paths => paths.filter(path => path.course_id == null || path.course_id === courseId));
}
export async function requireActionExecution(client: SupabaseClient, userId: string, courseId: string, actionId: string, retainedEdgeId?: string) {
  await requirePublishedCourse(client, courseId);
  const [actionResult, bindingResult, routeData] = await Promise.all([
    client.from('knowledge_edge_actions').select('*').eq('id', actionId).eq('status', 'active').maybeSingle(),
    client.from('course_action_bindings').select('*').eq('course_id', courseId).eq('action_id', actionId).maybeSingle(),
    readRouteInput(client, userId, courseId),
  ]);
  const action = dataOrThrow(actionResult.data, actionResult.error, 'Execution action') as EdgeAction & { updated_at: string } | null;
  if (!action) throw new ApiError(404, 'action_unavailable', '行动不可用。');
  const binding = dataOrThrow(bindingResult.data, bindingResult.error, 'Execution binding') as CourseActionBinding & { updated_at: string } | null;
  const edges = [...routeData.input.prerequisiteEdges.map(edge => ({ ...edge, relation: 'prerequisite' as const })), ...(routeData.input.enablesEdges ?? [])];
  const edge = edges.find(edge => edge.id === action.edge_id && routeData.input.nodeIds.includes(edge.source) && routeData.input.nodeIds.includes(edge.target));
  if (!edge) throw new ApiError(422, 'action_outside_project', '该行动当前不在项目的真实能力关系中。');
  const version = await readActiveVersion(client, userId, courseId);
  if (version?.constraints.excludeNodeIds.some(id => id === edge.source || id === edge.target)) throw new ApiError(422, 'action_excluded', '该关系的能力已从当前路线明确排除，请先调整路线。');
  if (!retainedEdgeId) {
    const formal = version?.snapshot.executionSteps;
    const plan = version ? planCourseRoute(routeData.input, version.constraints) : null;
    if (formal !== undefined) {
      if (!version?.snapshot.valid || !formal.some(step=>step.edgeId===edge.id && step.sourceNodeId===edge.source && step.targetNodeId===edge.target && step.actionId===actionId)) throw new ApiError(422,'action_not_selected_in_route','该行动不是正式路线的已选方案，请在项目能力模型中调整并采用路线。');
    } else if (!plan?.valid || !routeRelations(plan.route, edges).some(relation => relation.id === edge.id)) throw new ApiError(422, 'action_outside_route', '请先在个人路线中选择这条真实关系，再开始行动。');
  }
  if (hasUnmetHardPrerequisite(edge.target, new Set(routeData.input.currentNodeIds), routeData.input.prerequisiteEdges)) throw new ApiError(422, 'target_prerequisite_required', '请先形成目标能力的必要前置。');
  const cost = evaluateAction(action, { sourceId: edge.source, acquiredIds: new Set(routeData.input.currentNodeIds), binding: binding ?? undefined });
  if (!cost.available) throw new ApiError(422, 'action_conditions_unmet', cost.reasons.filter(reason => reason.code !== 'time' && reason.code !== 'difficulty').map(reason => reason.message).join('；'));
  let microPathId: string | null = null;
  if (action.type === 'micro_learning') {
    const paths = await availableMicroPaths(client, courseId);
    const path = paths.find(path => path.id === binding?.micro_path_id && path.knowledge_id === edge.target);
    if (!path) throw new ApiError(422, 'action_micro_unavailable', '该能力尚无已发布的微学习内容，请选择其他行动。');
    // Existing Micro authority owns teaching eligibility; never initialize a route from Action execution.
    if (!await readActiveVersion(client, userId, courseId)) throw new ApiError(409, 'route_not_initialized', '请先打开课程路线。');
    await requireActionMicroEligibility(client, userId, courseId, edge.target, Boolean(retainedEdgeId));
    microPathId = String(path.id);
  } else {
    if (!binding?.assignment_id || binding.micro_path_id) throw new ApiError(422, 'action_assignment_unavailable', '该行动尚未绑定具体实训，请选择其他行动。');
    const assignmentResult = await client.from('course_assignments').select('mode,experience').eq('course_id', courseId).eq('id', binding.assignment_id).maybeSingle();
    const assignment = dataOrThrow(assignmentResult.data, assignmentResult.error, 'Assignment executor');
    if (!isArtifactPracticeExecutor(assignment)) throw new ApiError(422, 'action_assignment_unavailable', '该任务暂不支持从关系行动启动，请使用课程实训入口。');
    const coverageResult = await client.from('assignment_coverages').select('node_id').eq('course_id', courseId).eq('assignment_id', binding.assignment_id).eq('node_id', edge.target).maybeSingle();
    if (!dataOrThrow(coverageResult.data, coverageResult.error, 'Action Assignment target coverage')) throw new ApiError(422, 'action_assignment_unavailable', '绑定实训未覆盖该关系的目标能力。');
    const { eligibility } = await readAssignmentEligibility(client, userId, courseId, binding.assignment_id, { targetId: edge.target, status: 'not_started' });
    if (eligibility.reason) throw new ApiError(422, 'action_assignment_prerequisite', eligibility.reason);
  }
  return { action, binding, edge, cost, microPathId, routeVersionId: version?.id ?? null };
}

/** A retained execution may review an acquired target pruned from today's candidate
 * model. This teaching scope does not change a formal route or bypass an exclusion. */
export async function requireActionMicroEligibility(client: SupabaseClient, userId: string, courseId: string, nodeId: string, retained: boolean) {
  if (retained) {
    const [data, version] = await Promise.all([readRouteInput(client, userId, courseId), readActiveVersion(client, userId, courseId)]);
    if (version && data.input.nodeIds.includes(nodeId) && data.input.currentNodeIds.includes(nodeId) && !version.constraints.excludeNodeIds.includes(nodeId)) {
      const plan = planCourseRoute(data.input, version.constraints);
      if (plan.valid) return { ...plan.route, selectedNodeIds: [...new Set([...plan.route.selectedNodeIds, nodeId])], activeVersionId: version.id };
    }
  }
  return requireMicroTeachingEligibility(client, userId, courseId, nodeId);
}

/** Action identity is untrusted until owner, course, executor and current facts agree. */
export async function requireAssignmentActionRun(client: SupabaseClient, userId: string, courseId: string, assignmentId: string, runId: string) {
  const result = await client.from('edge_action_runs').select('*').eq('id', runId).eq('user_id', userId).eq('course_id', courseId).eq('assignment_id', assignmentId).maybeSingle();
  const run = dataOrThrow(result.data, result.error, 'Assignment execution context') as ActionRun | null;
  if (!run || run.execution_version !== 2 || !['selected', 'in_progress', 'completed'].includes(run.status)) throw new ApiError(404, 'action_run_unavailable', '该实训执行记录不可用。');
  // Completed runs remain readable even after route/content changes.
  if (run.status !== 'completed') {
    const context = await requireActionExecution(client, userId, courseId, run.action_id, run.status === 'in_progress' || run.execution_snapshot.repeatedFromRunId ? run.edge_id : undefined);
    if (context.binding?.assignment_id !== assignmentId) throw new ApiError(409, 'action_executor_changed', '行动绑定已变化，请重新选择。');
  }
  return run;
}

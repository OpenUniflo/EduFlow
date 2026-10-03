import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './http.js';
import { allRows, dataOrThrow } from './query.js';
import { requirePublishedCourse, requireMicroTeachingEligibility } from './courseMembership.js';
import { readActiveVersion, readRouteInput } from './routePlanning.js';
import { buildCapabilityModel } from '../../src/shared/learning/routePlanning.js';
import { evaluateAction, type EdgeAction, type CourseActionBinding } from '../../src/features/actions/model.js';
export async function availableMicroPaths(client: SupabaseClient, courseId: string) {
  return allRows(client.from('micro_learning_paths').select('id,knowledge_id,course_id').eq('status', 'published').eq('mode', 'learn').order('id'), 'Action Micro paths').then(paths => paths.filter(path => path.course_id == null || path.course_id === courseId));
}
export async function requireActionExecution(client: SupabaseClient, userId: string, courseId: string, actionId: string) {
  await requirePublishedCourse(client, courseId);
  const [actionResult, bindingResult, routeData] = await Promise.all([
    client.from('knowledge_edge_actions').select('*').eq('id', actionId).eq('status', 'active').maybeSingle(),
    client.from('course_action_bindings').select('*').eq('course_id', courseId).eq('action_id', actionId).maybeSingle(),
    readRouteInput(client, userId, courseId),
  ]);
  const action = dataOrThrow(actionResult.data, actionResult.error, 'Execution action') as EdgeAction & { updated_at: string } | null;
  if (!action) throw new ApiError(404, 'action_unavailable', '行动不可用。');
  const binding = dataOrThrow(bindingResult.data, bindingResult.error, 'Execution binding') as CourseActionBinding & { updated_at: string } | null;
  const model = buildCapabilityModel(routeData.input);
  const edge = model.supportEdges.find(edge => edge.id === action.edge_id);
  if (!edge) throw new ApiError(422, 'action_outside_project', '该行动当前不在项目的真实能力关系中。');
  const cost = evaluateAction(action, { sourceId: edge.source, acquiredIds: new Set(routeData.input.currentNodeIds), binding: binding ?? undefined });
  if (!cost.available) throw new ApiError(422, 'action_conditions_unmet', cost.reasons.filter(reason => reason.cost === 0).map(reason => reason.message).join('；'));
  let microPathId: string | null = null;
  if (action.type === 'micro_learning') {
    const paths = await availableMicroPaths(client, courseId);
    const path = paths.filter(path => path.knowledge_id === edge.target).sort((a, b) => Number(b.course_id === courseId) - Number(a.course_id === courseId) || String(a.id).localeCompare(String(b.id)))[0];
    if (!path) throw new ApiError(422, 'action_micro_unavailable', '该能力尚无已发布的微学习内容，请选择其他行动。');
    // Existing Micro authority owns teaching eligibility; never initialize a route from Action execution.
    if (!await readActiveVersion(client, userId, courseId)) throw new ApiError(409, 'route_not_initialized', '请先打开课程路线。');
    await requireMicroTeachingEligibility(client, userId, courseId, edge.target);
    microPathId = String(path.id);
  }
  return { action, binding, edge, cost, microPathId };
}

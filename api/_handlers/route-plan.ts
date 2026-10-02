import { z } from 'zod';
import { handleApi, ApiError, json, methodNotAllowed } from '../_lib/http.js';
import { createUserSupabase } from '../_lib/supabase.js';
import { requirePublishedCourse } from '../_lib/courseMembership.js';
import { allRows } from '../_lib/query.js';
import { currentRoute, mapRouteVersion, persistRoute, readActiveVersion, readRouteInput, readVersion } from '../_lib/routePlanning.js';
import { planCourseRoute } from '../../src/shared/learning/routePlanning.js';
const ids = z.array(z.string().min(1).max(512)).max(10000);
const intent = { includeNodeIds: ids, excludeNodeIds: ids };
const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('preview'), ...intent }).strict(),
  z.object({ action: z.literal('adopt'), baseVersionId: z.uuid(), ...intent }).strict(),
  z.object({ action: z.literal('restore'), baseVersionId: z.uuid(), versionId: z.uuid() }).strict(),
]);
export default handleApi(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'POST') return methodNotAllowed(response, ['GET', 'POST']);
  const { client, user } = await createUserSupabase(request);
  const courseId = typeof request.query.courseId === 'string' ? request.query.courseId : '';
  if (!courseId) throw new ApiError(400, 'course_id_required', 'courseId is required');
  await requirePublishedCourse(client, courseId);
  if (request.method === 'GET') {
    if (request.query.view === 'history') {
      const versions = await allRows(client.from('personal_course_route_versions').select('*').eq('user_id', user.id).eq('course_id', courseId).order('version_number', { ascending: false }), 'Route history');
      json(response, 200, { versions: versions.map(mapRouteVersion) }); return;
    }
    json(response, 200, (await currentRoute(client, user.id, courseId)).view); return;
  }
  const parsed = bodySchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, 'invalid_route_intent', '只能提交加入、排除和路线版本意图。');
  const body = parsed.data;
  const [data, active] = await Promise.all([readRouteInput(client, user.id, courseId), readActiveVersion(client, user.id, courseId)]);
  if (body.action !== 'preview' && (active?.id ?? null) !== body.baseVersionId) throw new ApiError(409, 'route_version_conflict', '路线已在其他页面更新，请重新载入后规划。');
  const constraints = body.action === 'restore' ? (await readVersion(client, user.id, courseId, body.versionId)).constraints : { includeNodeIds: body.includeNodeIds, excludeNodeIds: body.excludeNodeIds };
  const plan = planCourseRoute(data.input, constraints);
  if (body.action === 'preview') { json(response, 200, { plan, baseVersionId: active?.id ?? null }); return; }
  if (!plan.valid) throw new ApiError(422, 'route_constraints_conflict', '当前规划约束无法满足。', { conflicts: plan.conflicts });
  // No snapshot, route node list, user identity, or preview result is accepted from the browser.
  const version = await persistRoute(user.id, courseId, data, constraints, plan.route, body.baseVersionId,
    body.action === 'restore' ? 'restore' : 'adjustment', body.action === 'restore' ? body.versionId : null);
  json(response, 200, { activeVersion: version, plan });
});

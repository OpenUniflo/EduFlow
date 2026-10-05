import { routePreviewState } from '../_lib/routePreviewState.js';
import { z } from 'zod';
import { handleApi, ApiError, json, methodNotAllowed } from '../_lib/http.js';
import { createUserSupabase } from '../_lib/supabase.js';
import { requirePublishedCourse } from '../_lib/courseMembership.js';
import { allRows } from '../_lib/query.js';
import { currentRoute, mapRouteVersion, persistRoute, readActiveVersion, readRouteInput, readVersion } from '../_lib/routePlanning.js';
import { planCourseRoute } from '../../src/shared/learning/routePlanning.js';
import { planRouteExecution } from '../../src/shared/learning/routeExecution.js';
import { readRouteActionOptions } from '../_lib/routeExecution.js';
const ids = z.array(z.string().min(1).max(512)).max(10000);
const intent = { includeNodeIds: ids, excludeNodeIds: ids };
const choices = { actionChoices:z.array(z.object({edgeId:z.string().min(1).max(512),actionId:z.uuid()}).strict()).max(10000).optional(), selectedEdgeIds:ids.optional(), scopeMode:z.enum(['current','replan']).optional() };
const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('preview'), ...intent,...choices }).strict(),
  z.object({ action: z.literal('adopt'), baseVersionId: z.uuid(), previewState:z.string().regex(/^[a-f0-9]{64}$/), ...intent,...choices,actionChoices:choices.actionChoices.unwrap(),selectedEdgeIds:ids }).strict(),
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
  if (!parsed.success) throw new ApiError(400, 'invalid_route_intent', '只能提交节点、关系、行动选择和路线版本意图。');
  const body = parsed.data;
  const [data, active] = await Promise.all([readRouteInput(client, user.id, courseId), readActiveVersion(client, user.id, courseId)]);
  if (body.action !== 'preview' && (active?.id ?? null) !== body.baseVersionId) throw new ApiError(409, 'route_version_conflict', '路线已在其他页面更新，请重新载入后规划。');
  const historical = body.action === 'restore' ? await readVersion(client,user.id,courseId,body.versionId) : null;
  const constraints = historical ? historical.constraints : body.action !== 'restore' ? { includeNodeIds: body.includeNodeIds, excludeNodeIds: body.excludeNodeIds } : {includeNodeIds:[],excludeNodeIds:[]};
  const sameIds=(left:readonly string[],right:readonly string[])=>JSON.stringify([...new Set(left)].sort())===JSON.stringify([...new Set(right)].sort());
  const formal=active?.snapshot;
  // Action/Edge-only edits retain the adopted spatial scope even after UKS grows.
  // Node edits (which clear selectedEdgeIds in the client) use the live planner.
  const retainScope=body.action!=='restore' && (body.scopeMode==='current' || (body.scopeMode===undefined && body.selectedEdgeIds!==undefined)) && formal?.valid && formal.executionSteps!==undefined
    && sameIds(constraints.includeNodeIds,active!.constraints.includeNodeIds) && sameIds(constraints.excludeNodeIds,active!.constraints.excludeNodeIds)
    && formal.selectedNodeIds.every(id=>data.input.nodeIds.includes(id))
    && formal.prerequisiteEdges.every(edge=>data.input.prerequisiteEdges.some(fact=>fact.id===edge.id && fact.source===edge.source && fact.target===edge.target && fact.strength===edge.strength));
  const plan = retainScope?{valid:true as const,route:{...formal!,currentKnowledgeIds:data.input.currentNodeIds.filter(id=>formal!.selectedNodeIds.includes(id))},conflicts:[]}:planCourseRoute(data.input, constraints);
  if (body.action === 'preview' && !plan.valid) { json(response, 200, { plan, baseVersionId: active?.id ?? null }); return; }
  if (!plan.valid) throw new ApiError(422, 'route_constraints_conflict', '当前规划约束无法满足。', { conflicts: plan.conflicts });
  const executionChoices = historical ? historical.snapshot?.executionSteps : body.action !== 'restore' ? body.actionChoices : undefined;
  const selectedEdgeIds = historical ? historical.snapshot?.executionSteps?.map(step=>step.edgeId) : body.action !== 'restore' ? body.selectedEdgeIds : undefined;
  const options=await readRouteActionOptions(client,courseId,data.input,plan.route,user.id);
  const execution = planRouteExecution({route:plan.route,
    facts:[...data.input.prerequisiteEdges.map(edge=>({...edge,relation:'prerequisite' as const})),...(data.input.enablesEdges??[])],
    options,choices:executionChoices,selectedEdgeIds,acquiredNodeIds:data.input.currentNodeIds});
  const previewState=routePreviewState(data.input,data.states,constraints,active?.id??null,options,{selectedNodeIds:plan.route.selectedNodeIds,steps:execution.steps});
  if(body.action==='adopt' && body.previewState!==previewState)throw new ApiError(409,'route_preview_stale','能力或路线状态已经变化，需要重新计算路线。');
  if (body.action === 'preview') { json(response,200,{plan:{...plan,execution},baseVersionId:active?.id??null,previewState});return; }
  // New adoption always carries explicit execution decisions. Historical node-only
  // snapshots remain readable and retain their existing restoration contract.
  const explicitExecution = historical ? historical.snapshot?.executionSteps !== undefined : body.action !== 'restore' && (body.actionChoices !== undefined || body.selectedEdgeIds !== undefined);
  if (explicitExecution && (!execution.complete || execution.steps.some(step=>!executionChoices?.some(choice=>choice.edgeId===step.edgeId && choice.actionId===step.actionId)))) throw new ApiError(422,'route_actions_incomplete','请为每条路线关系选择合法行动后再采用。',{issues:execution.issues});
  // No snapshot, route node list, user identity, or preview result is accepted from the browser.
  const version = await persistRoute(user.id, courseId, data, constraints, plan.route, body.baseVersionId,
    body.action === 'restore' ? 'restore' : 'adjustment', body.action === 'restore' ? body.versionId : null, [], explicitExecution ? execution.steps : undefined);
  json(response, 200, { activeVersion: version, plan:{...plan,execution} });
});

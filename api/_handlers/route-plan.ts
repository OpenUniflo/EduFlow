import { routePreviewState } from '../_lib/routePreviewState.js';
import { z } from 'zod';
import { handleApi, ApiError, json, methodNotAllowed } from '../_lib/http.js';
import { createUserSupabase } from '../_lib/supabase.js';
import { requirePublishedCourse } from '../_lib/courseMembership.js';
import { allRows } from '../_lib/query.js';
import { currentRoute, mapRouteVersion, persistRoute, readActiveVersion, readRouteInput, readVersion } from '../_lib/routePlanning.js';
import { routeRelations } from '../../src/shared/learning/routePresentation.js';
import { planCourseRoute } from '../../src/shared/learning/routePlanning.js';
import { inspectRouteExecution, planRouteExecution, isExecutionScopeValid } from '../../src/shared/learning/routeExecution.js';
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
    if (request.query.view === 'inspect' && typeof request.query.versionId==='string') {
      const [version,data]=await Promise.all([readVersion(client,user.id,courseId,request.query.versionId),readRouteInput(client,user.id,courseId)]);
      const facts=[...data.input.prerequisiteEdges.map(edge=>({...edge,relation:'prerequisite' as const})),...(data.input.enablesEdges??[])];
      const options=await readRouteActionOptions(client,courseId,data.input,version.snapshot,user.id);
      const execution=inspectRouteExecution(version.snapshot,facts,options,data.input.currentNodeIds);
      if(!isExecutionScopeValid(version.snapshot,data.input.nodeIds,facts))execution.issues.push({kind:'edge_not_in_route',reason:'历史能力、前置关系或强度已经变化，请基于此版本重新规划。'});
      execution.complete=execution.issues.length===0;
      json(response,200,{versionId:version.id,execution});return;
    }
    if (request.query.view === 'history') {
      const versions = await allRows(client.from('personal_course_route_versions').select('*').eq('user_id', user.id).eq('course_id', courseId).order('version_number', { ascending: false }), 'Route history');
      const actionIds=[...new Set(versions.flatMap(row=>((row.snapshot as {executionSteps?:Array<{actionId:string}>}).executionSteps??[]).map(step=>step.actionId)))];
      const actions=actionIds.length?await allRows(client.from('knowledge_edge_actions').select('id,title').in('id',actionIds).order('id'),'Historical Action titles'):[];
      json(response, 200, { versions: versions.map(mapRouteVersion),actionTitles:Object.fromEntries(actions.map(row=>[row.id,row.title])) }); return;
    }
    json(response, 200, (await currentRoute(client, user.id, courseId)).view); return;
  }
  const parsed = bodySchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, 'invalid_route_intent', '只能提交节点、关系、行动选择和路线版本意图。');
  const body = parsed.data;
  const [data, active] = await Promise.all([readRouteInput(client, user.id, courseId), readActiveVersion(client, user.id, courseId)]);
  if (body.action !== 'preview' && (active?.id ?? null) !== body.baseVersionId) throw new ApiError(409, 'route_version_conflict', '路线已在其他页面更新，请重新载入后规划。');
  const historical = body.action === 'restore' ? await readVersion(client,user.id,courseId,body.versionId) : null;
  if (historical?.id === active?.id) throw new ApiError(409,'route_version_current','当前使用中的版本无需恢复。');
  const constraints = historical ? historical.constraints : body.action !== 'restore' ? { includeNodeIds: body.includeNodeIds, excludeNodeIds: body.excludeNodeIds } : {includeNodeIds:[],excludeNodeIds:[]};
  const sameIds=(left:readonly string[],right:readonly string[])=>JSON.stringify([...new Set(left)].sort())===JSON.stringify([...new Set(right)].sort());
  const formal=active?.snapshot;
  const historicalExecution = historical?.snapshot?.executionSteps !== undefined;
  const retained = historicalExecution ? historical!.snapshot : formal;
  const validScope=isExecutionScopeValid(retained,data.input.nodeIds,[...data.input.prerequisiteEdges.map(edge=>({...edge,relation:'prerequisite' as const})),...(data.input.enablesEdges??[])]);
  if (historicalExecution && !validScope) throw new ApiError(422,'route_history_invalid','历史路线的知识或关系已失效，请重新规划。');
  // Action/Edge-only edits retain the adopted spatial scope even after UKS grows.
  // Node edits use live node planning while preserving valid optional intent.
  const retainScope=historicalExecution || (body.action!=='restore' && (body.scopeMode==='current' || (body.scopeMode===undefined && body.selectedEdgeIds!==undefined)) && validScope && formal!.executionSteps!==undefined
    && sameIds(constraints.includeNodeIds,active!.constraints.includeNodeIds) && sameIds(constraints.excludeNodeIds,active!.constraints.excludeNodeIds)
  );
  const retainedRoute=retained?{...retained,currentKnowledgeIds:data.input.currentNodeIds.filter(id=>retained.selectedNodeIds.includes(id)),prerequisiteEdges:historicalExecution?retained.prerequisiteEdges:data.input.prerequisiteEdges.filter(edge=>retained.selectedNodeIds.includes(edge.source)&&retained.selectedNodeIds.includes(edge.target))}:null;
  const plan = retainScope?{valid:true as const,route:retainedRoute!,conflicts:[]}:planCourseRoute(data.input, constraints);
  if (body.action === 'preview' && !plan.valid) { json(response, 200, { plan, baseVersionId: active?.id ?? null }); return; }
  if (!plan.valid) throw new ApiError(422, 'route_constraints_conflict', '当前规划约束无法满足。', { conflicts: plan.conflicts });
  const executionChoices = historical ? historical.snapshot?.executionSteps : body.action !== 'restore' ? body.actionChoices ?? active?.snapshot?.executionSteps?.filter(step=>plan.route.selectedNodeIds.includes(step.sourceNodeId)&&plan.route.selectedNodeIds.includes(step.targetNodeId)) : undefined;
  const selectedEdgeIds = historical ? historical.snapshot?.executionSteps?.map(step=>step.edgeId) : body.action !== 'restore' ? body.selectedEdgeIds : undefined;
  const options=await readRouteActionOptions(client,courseId,data.input,plan.route,user.id);
  const facts=[...data.input.prerequisiteEdges.map(edge=>({...edge,relation:'prerequisite' as const})),...(data.input.enablesEdges??[])];
  const members=routeRelations(plan.route,facts);
  const selectedForPreview = body.action!=='restore' && (body.scopeMode==='replan'||retainScope) && selectedEdgeIds!==undefined
    ? [...new Set([...selectedEdgeIds.filter(id=>members.some(edge=>edge.id===id)),...members.filter(edge=>edge.relation==='prerequisite'&&edge.strength==='hard').map(edge=>edge.id)])] : selectedEdgeIds;
  // A restore revalidates the actual historical decisions, including their order.
  // Replanning would mix a smaller current gap with the old execution references.
  const execution = historicalExecution ? inspectRouteExecution(plan.route,facts,options,data.input.currentNodeIds)
    : planRouteExecution({route:plan.route,facts,options,choices:executionChoices,selectedEdgeIds:selectedForPreview,acquiredNodeIds:data.input.currentNodeIds,retainedEdgeIds:active?.snapshot?.executionSteps?.map(step=>step.edgeId),excludedNodeIds:constraints.excludeNodeIds});
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

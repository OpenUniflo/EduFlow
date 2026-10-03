import { z } from 'zod';
import { readActiveVersion, readRouteInput, defaultConstraints } from '../_lib/routePlanning.js';
import { planCourseRoute } from '../../src/shared/learning/routePlanning.js';
import { hasUnmetHardPrerequisite } from '../../src/shared/learning/teachingPrerequisites.js';
import { createServerSupabase, createUserSupabase } from '../_lib/supabase.js';
import { ApiError, handleApi, json, methodNotAllowed } from '../_lib/http.js';
import { allRows, dataOrThrow } from '../_lib/query.js';
import { availableMicroPaths, requireActionExecution } from '../_lib/edgeActionRuns.js';
import { requirePublishedCourse } from '../_lib/courseMembership.js';
const id = z.string().min(1).max(512);
const template = z.object({ id: z.uuid().optional(), edge_id: id, type: z.enum(['micro_learning', 'practice_task']), title: z.string().trim().min(1).max(240), description: z.string().max(12000), estimated_minutes: z.number().int().min(1).max(10080), difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]), resource_requirements: z.array(id).max(30), required_capability_ids: z.array(id).max(30), expected_evidence: z.string().trim().min(1).max(12000), status: z.enum(['active', 'archived']) }).strict();
const binding = z.object({ course_id: id, action_id: z.uuid(), context: z.string().max(12000), contact: z.string().max(2000), instructions: z.string().max(12000), resources: z.array(z.object({ key: id, label: z.string().max(240), reference: z.string().max(4000), available: z.boolean() }).strict()).max(30), available: z.boolean() }).strict();
const bodySchema = z.discriminatedUnion('action', [z.object({ action: z.literal('select'), courseId: id, actionId: z.uuid(), selectionKey: z.uuid() }).strict(), z.object({ action: z.literal('transition'), runId: z.uuid(), operation: z.enum(['start', 'submit', 'sync-micro']), sourceId: z.uuid().optional() }).strict(), z.object({ action: z.literal('save-template'), template }).strict(), z.object({ action: z.literal('save-binding'), binding }).strict()]);
export default handleApi(async (request, response) => {
  const { client, user } = await createUserSupabase(request);
  response.setHeader('Cache-Control', 'private, no-store');
  if (request.method === 'GET') {
    const courseId = typeof request.query.courseId === 'string' ? request.query.courseId : '';
    if (!courseId) throw new ApiError(400, 'course_required', 'courseId is required');
    await requirePublishedCourse(client, courseId);
    const [actions, bindings, runs, microPaths, edges, routeData, version] = await Promise.all([
      allRows(client.from('knowledge_edge_actions').select('*').eq('status', 'active').order('id'), 'Global edge actions'),
      allRows(client.from('course_action_bindings').select('*').eq('course_id', courseId).order('id'), 'Course action resources'),
      allRows(client.from('edge_action_runs').select('*').eq('course_id', courseId).order('created_at', { ascending: false }).order('id'), 'Action runs'),
      availableMicroPaths(client, courseId),
      allRows(client.from('knowledge_edges').select('id,target_node_id').eq('lifecycle_status', 'active').order('id'), 'Action targets'),
      readRouteInput(client, user.id, courseId),
      readActiveVersion(client, user.id, courseId),
    ]);
    const plan = planCourseRoute(routeData.input, version?.constraints ?? defaultConstraints);
    const acquired = new Set(routeData.input.currentNodeIds);
    const availableMicroActionIds = actions.filter(action => {
      const target = String(edges.find(edge => edge.id === action.edge_id)?.target_node_id ?? '');
      return Boolean(version && plan.valid && plan.route?.selectedNodeIds.includes(target)
        && !hasUnmetHardPrerequisite(target, acquired, plan.route.prerequisiteEdges)
        && microPaths.some(path => path.knowledge_id === target));
    }).map(action => action.id);
    json(response, 200, { actions, bindings, runs, availableMicroActionIds }); return;
  }
  if (request.method !== 'POST') return methodNotAllowed(response, ['GET', 'POST']);
  const parsed = bodySchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, 'invalid_action_request', 'Invalid edge action request');
  const server = createServerSupabase();
  const body = parsed.data;
  if (body.action === 'select') {
    const context = await requireActionExecution(client, user.id, body.courseId, body.actionId);
    const result = await server.rpc('select_edge_action', { p_user_id: user.id, p_course_id: body.courseId, p_action_id: body.actionId, p_selection_key: body.selectionKey, p_action_version: context.action.updated_at, p_binding_version: context.binding?.updated_at ?? null, p_micro_path_id: context.microPathId });
    if (result.error) throw new ApiError(409, 'action_selection_changed', '行动或执行条件已变化，请刷新后重新选择。');
    json(response, 200, { run: result.data }); return;
  }
  if (body.action === 'transition') {
    const found = await client.from('edge_action_runs').select('*').eq('id', body.runId).maybeSingle();
    const run = dataOrThrow(found.data, found.error, 'Owned action run');
    if (!run) throw new ApiError(404, 'run_not_found', '执行记录不存在。');
    await requirePublishedCourse(client, run.course_id);
    if (body.operation === 'start' && run.status === 'selected') {
      const context = await requireActionExecution(client, user.id, run.course_id, run.action_id);
      if (context.microPathId !== run.micro_path_id) throw new ApiError(409, 'micro_path_changed', '微学习内容已变化，请重新选择行动。');
    }
    if (body.operation === 'submit' && !body.sourceId) throw new ApiError(400, 'source_required', '请上传真实结果文件。');
    const result = await server.rpc('transition_edge_action_run', { p_user_id: user.id, p_run_id: run.id, p_operation: body.operation, p_source_id: body.sourceId ?? null });
    if (result.error) throw new ApiError(result.error.code === 'P0002' ? 404 : 409, 'action_transition_rejected', '执行状态、资源或结果资料已变化，请刷新后检查。');
    json(response, 200, { run: result.data }); return;
  }
  const roleResult = await server.from('profiles').select('role').eq('id', user.id).single();
  const profile = dataOrThrow(roleResult.data, roleResult.error, 'Action governance authority');
  if (body.action === 'save-template') {
    if (profile.role !== 'admin') throw new ApiError(403, 'global_action_forbidden', 'Global administrator required');
    const value = { ...body.template, provenance: { kind: 'admin', actor_id: user.id } };
    const result = body.template.id ? await server.from('knowledge_edge_actions').update(value).eq('id', body.template.id).select().single() : await server.from('knowledge_edge_actions').insert(value).select().single();
    if (result.error?.code === '23514') throw new ApiError(422, 'invalid_action_edge', '行动必须属于有效的全局能力关系，执行类型和关系不可更改。');
    json(response, 200, { action: dataOrThrow(result.data, result.error, 'Save global action') }); return;
  }
  // Match the existing teacher/admin authoring role; also require visible course ownership context.
  if (!['teacher', 'admin'].includes(profile.role)) throw new ApiError(403, 'binding_forbidden', 'Teacher or administrator required');
  await requirePublishedCourse(client, body.binding.course_id);
  const templateResult = await client.from('knowledge_edge_actions').select('id').eq('id', body.binding.action_id).eq('status', 'active').maybeSingle();
  if (!dataOrThrow(templateResult.data, templateResult.error, 'Binding template')) throw new ApiError(404, 'action_not_found', 'Active action not found');
  const result = await server.from('course_action_bindings').upsert({ ...body.binding, updated_at: new Date().toISOString() }, { onConflict: 'course_id,action_id' }).select().single();
  json(response, 200, { binding: dataOrThrow(result.data, result.error, 'Save course resources') });
});

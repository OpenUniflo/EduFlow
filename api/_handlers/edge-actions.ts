import { z } from 'zod';
import { readActiveVersion, readRouteInput, defaultConstraints } from '../_lib/routePlanning.js';
import { buildCapabilityModel, planCourseRoute } from '../../src/shared/learning/routePlanning.js';
import { hasUnmetHardPrerequisite } from '../../src/shared/learning/teachingPrerequisites.js';
import { createServerSupabase, createUserSupabase } from '../_lib/supabase.js';
import { ApiError, handleApi, json, methodNotAllowed } from '../_lib/http.js';
import { allRows, dataOrThrow } from '../_lib/query.js';
import { availableMicroPaths, requireActionExecution } from '../_lib/edgeActionRuns.js';
import { requirePublishedCourse } from '../_lib/courseMembership.js';
import { readAssignmentEligibility } from '../_lib/assignmentEligibility.js';
const id = z.string().min(1).max(512);
const template = z.object({ id: z.uuid().optional(), edge_id: id, type: z.enum(['micro_learning', 'practice_task']), title: z.string().trim().min(1).max(240), description: z.string().max(12000), estimated_minutes: z.number().int().min(1).max(10080), difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]), resource_requirements: z.array(id).max(30), required_capability_ids: z.array(id).max(30), expected_evidence: z.string().trim().min(1).max(12000), status: z.enum(['active', 'archived']) }).strict();
const binding = z.object({ course_id: id, action_id: z.uuid(), context: z.string().max(12000), contact: z.string().max(2000), instructions: z.string().max(12000), resources: z.array(z.object({ key: id, label: z.string().max(240), reference: z.string().max(4000), available: z.boolean() }).strict()).max(30), available: z.boolean(), micro_path_id: id.nullable().optional(), assignment_id: id.nullable().optional() }).strict();
const bodySchema = z.discriminatedUnion('action', [z.object({ action: z.literal('select'), courseId: id, actionId: z.uuid(), selectionKey: z.uuid(), expectedActiveRunId: z.uuid().nullable().optional(), repeatRunId: z.uuid().optional() }).strict(), z.object({ action: z.literal('transition'), runId: z.uuid(), operation: z.enum(['start', 'sync-micro']) }).strict(), z.object({ action: z.literal('save-template'), template }).strict(), z.object({ action: z.literal('save-binding'), binding }).strict()]);
export default handleApi(async (request, response) => {
  const { client, user } = await createUserSupabase(request);
  response.setHeader('Cache-Control', 'private, no-store');
  if (request.method === 'GET') {
    const courseId = typeof request.query.courseId === 'string' ? request.query.courseId : '';
    if (!courseId) throw new ApiError(400, 'course_required', 'courseId is required');
    await requirePublishedCourse(client, courseId);
    if (typeof request.query.runId === 'string') {
      const found = await client.from('edge_action_runs').select('*').eq('id', request.query.runId).eq('course_id', courseId).eq('user_id', user.id).maybeSingle();
      const run = dataOrThrow(found.data, found.error, 'Action execution history');
      if (!run) throw new ApiError(404, 'run_not_found', '执行记录不存在。');
      const steps = run.micro_path_id ? await allRows(client.from('micro_step_attempts').select('step_id').eq('action_run_id', run.id).eq('completion_accepted', true).order('id'), 'Micro execution steps') : [];
      json(response, 200, { run, microStepIds: [...new Set(steps.map(row => row.step_id))] }); return;
    }
    const [routeData, runs] = await Promise.all([
      readRouteInput(client, user.id, courseId),
      allRows(client.from('edge_action_runs').select('*').eq('course_id', courseId).order('created_at', { ascending: false }).order('id'), 'Action runs'),
    ]);
    const modelEdges = buildCapabilityModel(routeData.input).supportEdges;
    const modelEdgeIds = new Set(modelEdges.map(edge => edge.id));
    const courseNodes = new Set(routeData.input.courseOrder.map(item => item.nodeId));
    const courseEdges = [...routeData.input.prerequisiteEdges, ...(routeData.input.enablesEdges ?? [])].filter(edge => courseNodes.has(edge.source) && courseNodes.has(edge.target));
    const scopedEdges = new Set([...modelEdges.map(edge => edge.id), ...courseEdges.map(edge => edge.id), ...runs.map(run => String(run.edge_id))]);
    const edges = [...routeData.input.prerequisiteEdges.map(edge => ({ ...edge, relation: 'prerequisite' as const })), ...(routeData.input.enablesEdges ?? [])].filter(edge => scopedEdges.has(edge.id));
    const [actions, bindings, microPaths, version, assignments] = await Promise.all([
      edges.length ? allRows(client.from('knowledge_edge_actions').select('*').eq('status', 'active').in('edge_id', edges.map(edge => edge.id)).order('id'), 'Project edge actions') : [],
      allRows(client.from('course_action_bindings').select('*').eq('course_id', courseId).order('id'), 'Course action resources'),
      availableMicroPaths(client, courseId),
      readActiveVersion(client, user.id, courseId),
      allRows(client.from('course_assignments').select('id,mode,experience').eq('course_id', courseId).order('id'), 'Action Assignment executors'),
    ]);
    const plan = planCourseRoute(routeData.input, version?.constraints ?? defaultConstraints);
    const acquired = new Set(routeData.input.currentNodeIds);
    const completedActions = new Set(runs.filter(run => run.status === 'completed').map(run => run.action_id));
    const availableMicroActionIds = actions.filter(action => {
      const edge = edges.find(edge => edge.id === action.edge_id);
      const target = edge?.target ?? '';
      const binding = bindings.find(binding => binding.action_id === action.id);
      return Boolean(action.type === 'micro_learning' && binding?.available && version && edge && !version.constraints.excludeNodeIds.some(id => id === edge.source || id === edge.target) && plan.valid && (modelEdgeIds.has(edge.id) && plan.route.selectedNodeIds.includes(edge.source) && plan.route.selectedNodeIds.includes(target) || completedActions.has(action.id) && acquired.has(target))
        && !hasUnmetHardPrerequisite(target, acquired, plan.route.prerequisiteEdges)
        && microPaths.some(path => path.id === binding.micro_path_id && path.knowledge_id === target));
    }).map(action => action.id);
    const availablePractice = await Promise.all(actions.filter(action => action.type === 'practice_task').map(async action => {
      const binding = bindings.find(binding => binding.action_id === action.id);
      const edge = edges.find(edge => edge.id === action.edge_id);
      const assignment = assignments.find(assignment => assignment.id === binding?.assignment_id);
      const scopeAvailable = edge && !version?.constraints.excludeNodeIds.some(id => id === edge.source || id === edge.target) && (completedActions.has(action.id) || modelEdgeIds.has(edge.id) && plan.valid && plan.route.selectedNodeIds.includes(edge.source) && plan.route.selectedNodeIds.includes(edge.target));
      if (!edge || !version || !scopeAvailable || !assignment || assignment.mode === 'workflow' || (assignment.experience as { type?: string } | null)?.type === 'workflow' || !binding?.available || !binding.assignment_id || binding.micro_path_id || hasUnmetHardPrerequisite(edge.target, acquired, routeData.input.prerequisiteEdges)) return null;
      const { coverage, eligibility } = await readAssignmentEligibility(client, user.id, courseId, String(binding.assignment_id), { targetId: edge.target, status: 'not_started' });
      return !eligibility.reason && coverage.some(row => row.node_id === edge.target) ? action.id : null;
    }));
    const continuableRunIds = (await Promise.all(runs.filter(run => run.execution_version === 2 && ['selected', 'in_progress'].includes(String(run.status))).map(async run => {
      try {
        const snapshot = run.execution_snapshot as { repeatedFromRunId?: string; action?: { updated_at?: string }; binding?: { updated_at?: string } } | null;
        const context = await requireActionExecution(client, user.id, courseId, String(run.action_id), run.status === 'in_progress' || snapshot?.repeatedFromRunId ? String(run.edge_id) : undefined);
        if (context.action.updated_at !== snapshot?.action?.updated_at || context.binding?.updated_at !== snapshot?.binding?.updated_at || context.microPathId !== run.micro_path_id || (context.binding?.assignment_id ?? null) !== (run.assignment_id ?? null)) return null;
        return String(run.id);
      } catch (error) {
        if (error instanceof ApiError && error.status < 500) return null;
        throw error;
      }
    }))).filter((id): id is string => id !== null);
    json(response, 200, { actions, bindings, runs, continuableRunIds, availableMicroActionIds, availableActionIds: [...availableMicroActionIds, ...availablePractice.filter(Boolean)] }); return;
  }
  if (request.method !== 'POST') return methodNotAllowed(response, ['GET', 'POST']);
  const parsed = bodySchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, 'invalid_action_request', 'Invalid edge action request');
  const server = createServerSupabase();
  const body = parsed.data;
  if (body.action === 'select') {
    let retainedEdgeId: string | undefined;
    if (body.repeatRunId) {
      const previousResult = await client.from('edge_action_runs').select('edge_id').eq('id', body.repeatRunId).eq('user_id', user.id).eq('course_id', body.courseId).eq('action_id', body.actionId).eq('status', 'completed').maybeSingle();
      const previous = dataOrThrow(previousResult.data, previousResult.error, 'Repeated execution');
      if (!previous) throw new ApiError(404, 'repeat_run_not_found', '已完成的执行记录不存在。');
      retainedEdgeId = String(previous.edge_id);
    }
    const context = await requireActionExecution(client, user.id, body.courseId, body.actionId, retainedEdgeId);
    const result = await server.rpc('select_edge_action_v2', { p_user_id: user.id, p_course_id: body.courseId, p_action_id: body.actionId, p_selection_key: body.selectionKey, p_action_version: context.action.updated_at, p_binding_version: context.binding?.updated_at ?? null, p_expected_active_run_id: body.expectedActiveRunId ?? null, p_repeat_run_id: body.repeatRunId ?? null });
    if (result.error) throw new ApiError(409, 'action_selection_changed', '行动或执行条件已变化，请刷新后重新选择。');
    json(response, 200, { run: result.data }); return;
  }
  if (body.action === 'transition') {
    const found = await client.from('edge_action_runs').select('*').eq('id', body.runId).maybeSingle();
    const run = dataOrThrow(found.data, found.error, 'Owned action run');
    if (!run) throw new ApiError(404, 'run_not_found', '执行记录不存在。');
    await requirePublishedCourse(client, run.course_id);
    if (body.operation === 'start' && ['selected', 'in_progress'].includes(run.status)) {
      const context = await requireActionExecution(client, user.id, run.course_id, run.action_id, run.status === 'in_progress' || run.execution_snapshot.repeatedFromRunId ? run.edge_id : undefined);
      if (context.microPathId !== run.micro_path_id) throw new ApiError(409, 'micro_path_changed', '微学习内容已变化，请重新选择行动。');
    }
    const result = await server.rpc('transition_edge_action_run_v2', { p_user_id: user.id, p_run_id: run.id, p_operation: body.operation });
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
  const templateResult = await client.from('knowledge_edge_actions').select('id,type,edge_id').eq('id', body.binding.action_id).eq('status', 'active').maybeSingle();
  const action = dataOrThrow(templateResult.data, templateResult.error, 'Binding template');
  if (!action) throw new ApiError(404, 'action_not_found', 'Active action not found');
  if (body.binding.micro_path_id && (action.type !== 'micro_learning' || body.binding.assignment_id) || body.binding.assignment_id && action.type !== 'practice_task') throw new ApiError(422, 'executor_type_mismatch', '执行资源必须与行动类型一致。');
  const result = await server.from('course_action_bindings').upsert({ ...body.binding, updated_at: new Date().toISOString() }, { onConflict: 'course_id,action_id' }).select().single();
  json(response, 200, { binding: dataOrThrow(result.data, result.error, 'Save course resources') });
});

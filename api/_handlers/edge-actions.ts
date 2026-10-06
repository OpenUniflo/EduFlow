import { isArtifactPracticeExecutor } from '../../src/shared/learning/practiceBoundary.js';
import { z } from 'zod';
import { readActiveVersion, readRouteInput, defaultConstraints } from '../_lib/routePlanning.js';
import { buildCapabilityModel, planCourseRoute } from '../../src/shared/learning/routePlanning.js';
import { routeRelations } from '../../src/shared/learning/routePresentation.js';
import { executionRelations, routeExecutionProgress } from '../../src/shared/learning/routeExecution.js';
import { evaluateAction, type EdgeAction, type CourseActionBinding } from '../../src/features/actions/model.js';
import { hasUnmetHardPrerequisite } from '../../src/shared/learning/teachingPrerequisites.js';
import { createServerSupabase, createUserSupabase } from '../_lib/supabase.js';
import { ApiError, handleApi, json, methodNotAllowed } from '../_lib/http.js';
import { allRows, dataOrThrow } from '../_lib/query.js';
import { availableMicroPaths, requireActionExecution } from '../_lib/edgeActionRuns.js';
import { requirePublishedCourse } from '../_lib/courseMembership.js';
import { readAssignmentEligibility } from '../_lib/assignmentEligibility.js';
import { readRouteActionOptions } from '../_lib/routeExecution.js';
const id = z.string().min(1).max(512);
const template = z.object({ id: z.uuid().optional(), edge_id: id.nullable().optional(), node_id:id.nullable().optional(), type: z.enum(['micro_learning', 'practice_task']), title: z.string().trim().min(1).max(240), description: z.string().max(12000), estimated_minutes: z.number().int().min(1).max(10080), difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]), resource_requirements: z.array(id).max(30), required_capability_ids: z.array(id).max(30), expected_evidence: z.string().trim().min(1).max(12000), status: z.enum(['active', 'archived']) }).strict().refine(value=>Boolean(value.edge_id)!==Boolean(value.node_id),'Exactly one Node or Edge scope is required');
const binding = z.object({ course_id: id, action_id: z.uuid(), context: z.string().max(12000), contact: z.string().max(2000), instructions: z.string().max(12000), resources: z.array(z.object({ key: id, label: z.string().max(240), reference: z.string().max(4000), available: z.boolean() }).strict()).max(30), available: z.boolean(), micro_path_id: id.nullable().optional(), assignment_id: id.nullable().optional() }).strict();
const bodySchema = z.discriminatedUnion('action', [z.object({ action: z.literal('select'), courseId: id, actionId: z.uuid(), selectionKey: z.uuid(), expectedActiveRunId: z.uuid().nullable().optional(), repeatRunId: z.uuid().optional(), routeVersionId: z.uuid().optional() }).strict(), z.object({ action: z.literal('transition'), runId: z.uuid(), operation: z.enum(['start', 'sync-micro']), routeVersionId: z.uuid().optional() }).strict(), z.object({ action: z.literal('save-template'), template }).strict(), z.object({ action: z.literal('save-binding'), binding }).strict()]);
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
    const [routeData, runs, version] = await Promise.all([
      readRouteInput(client, user.id, courseId),
      allRows(client.from('edge_action_runs').select('*').eq('course_id', courseId).order('created_at', { ascending: false }).order('id'), 'Action runs'),
      readActiveVersion(client, user.id, courseId),
    ]);
    const courseNodes = new Set(routeData.input.courseOrder.map(item => item.nodeId));
    const courseEdges = [...routeData.input.prerequisiteEdges, ...(routeData.input.enablesEdges ?? [])].filter(edge => courseNodes.has(edge.source) && courseNodes.has(edge.target));
    const plan = version?.snapshot.executionSteps !== undefined && version.snapshot.valid ? {valid:true as const,route:version.snapshot,conflicts:[]} : planCourseRoute(routeData.input, version?.constraints ?? defaultConstraints);
    const facts = [...routeData.input.prerequisiteEdges.map(edge => ({ ...edge, relation: 'prerequisite' as const })), ...(routeData.input.enablesEdges ?? [])];
    const projectNodes = new Set(buildCapabilityModel(routeData.input).orderedNodeIds);
    const projectEdges = facts.filter(edge => projectNodes.has(edge.source) && projectNodes.has(edge.target));
    const routeEdges = plan.valid ? (version?.snapshot.executionSteps !== undefined ? executionRelations(version.snapshot,facts) : routeRelations(plan.route, facts)) : [];
    const routeEdgeIds = new Set(routeEdges.map(edge => edge.id));
    const scopedEdges = new Set([...projectEdges.map(edge => edge.id), ...routeEdges.map(edge => edge.id), ...courseEdges.map(edge => edge.id), ...runs.map(run => String(run.edge_id))]);
    const edges = facts.filter(edge => scopedEdges.has(edge.id));
    const scopedNodes=new Set([...projectNodes,...(version?.snapshot.selectedNodeIds??[]),...runs.flatMap(run=>run.node_id?[String(run.node_id)]:[])]);
    const [edgeActions, nodeActions, bindings, microPaths, assignments] = await Promise.all([
      edges.length ? allRows(client.from('knowledge_edge_actions').select('*').eq('status', 'active').in('edge_id', edges.map(edge => edge.id)).order('id'), 'Project edge actions') : [],
      scopedNodes.size ? allRows(client.from('knowledge_edge_actions').select('*').eq('status','active').in('node_id',[...scopedNodes]).order('id'),'Project Node actions') : [],
      allRows(client.from('course_action_bindings').select('*').eq('course_id', courseId).order('id'), 'Course action resources'),
      availableMicroPaths(client, courseId),
      allRows(client.from('course_assignments').select('id,mode,experience').eq('course_id', courseId).order('id'), 'Action Assignment executors'),
    ]);
    const actions=[...edgeActions,...nodeActions];
    const progress=version?.snapshot.executionSteps ? routeExecutionProgress({userId:user.id,courseId,steps:version.snapshot.executionSteps,runs:runs as import('../../src/shared/learning/routeExecution.js').ExecutionRunReference[],acquiredNodeIds:routeData.input.currentNodeIds,facts,selectedNodeIds:version.snapshot.selectedNodeIds,selectedPrerequisiteEdges:version.snapshot.prerequisiteEdges}) : null;
    const acquired = new Set(progress?.reachableNodeIds??routeData.input.currentNodeIds);
    const frontierAction=(id:string)=>!progress || progress.availableStepIndexes.some(index=>version!.snapshot.executionSteps![index].actionId===id);
    const completedActions = new Set(runs.filter(run => run.status === 'completed').map(run => run.action_id));
    const availableMicroActionIds = edgeActions.filter(action => {
      const edge = edges.find(edge => edge.id === action.edge_id);
      const target = edge?.target ?? '';
      const binding = bindings.find(binding => binding.action_id === action.id);
      return Boolean(action.type === 'micro_learning' && frontierAction(String(action.id)) && binding?.available && version && edge && !version.constraints.excludeNodeIds.some(id => id === edge.source || id === edge.target) && plan.valid && (routeEdgeIds.has(edge.id) && plan.route.selectedNodeIds.includes(edge.source) && plan.route.selectedNodeIds.includes(target) || completedActions.has(action.id) && acquired.has(target))
        && evaluateAction(action as EdgeAction,{sourceId:edge.source,acquiredIds:acquired,binding:binding as CourseActionBinding}).available
        && (progress || !hasUnmetHardPrerequisite(target, acquired, routeData.input.prerequisiteEdges))
        && microPaths.some(path => path.id === binding.micro_path_id && path.knowledge_id === target));
    }).map(action => action.id);
    const availablePractice = await Promise.all(edgeActions.filter(action => action.type === 'practice_task').map(async action => {
      const binding = bindings.find(binding => binding.action_id === action.id);
      const edge = edges.find(edge => edge.id === action.edge_id);
      const assignment = assignments.find(assignment => assignment.id === binding?.assignment_id);
      const scopeAvailable = edge && !version?.constraints.excludeNodeIds.some(id => id === edge.source || id === edge.target) && (completedActions.has(action.id) || routeEdgeIds.has(edge.id) && plan.valid && plan.route.selectedNodeIds.includes(edge.source) && plan.route.selectedNodeIds.includes(edge.target));
      if (!frontierAction(String(action.id)) || !edge || !version || !scopeAvailable || !isArtifactPracticeExecutor(assignment) || !binding?.available || !binding.assignment_id || binding.micro_path_id || !progress && hasUnmetHardPrerequisite(edge.target, acquired, routeData.input.prerequisiteEdges)) return null;
      if(!evaluateAction(action as EdgeAction,{sourceId:edge.source,acquiredIds:acquired,binding:binding as CourseActionBinding}).available) return null;
      const { coverage, eligibility } = await readAssignmentEligibility(client, user.id, courseId, String(binding.assignment_id), { targetId: edge.target, status: 'not_started', reachableNodeIds:[...acquired] });
      return !eligibility.reason && coverage.some(row => row.node_id === edge.target) ? action.id : null;
    }));
    const nodeOptions=plan.valid && nodeActions.length ? await readRouteActionOptions(client,courseId,routeData.input,plan.route,user.id) : [];
    const availableNodeActions=nodeOptions.filter(option=>option.scope==='node' && option.availableNow && version?.snapshot.executionSteps?.some(step=>step.scope==='node' && step.nodeId===option.nodeId && step.actionId===option.actionId));
    availableMicroActionIds.push(...availableNodeActions.filter(option=>option.type==='micro_learning').map(option=>option.actionId));
    const repeatableActionIds=(await Promise.all([...completedActions].map(async actionId=>{
      try {await requireActionExecution(client,user.id,courseId,String(actionId),true);return String(actionId);}
      catch(error){if(error instanceof ApiError && error.status<500)return null;throw error;}
    }))).filter((id):id is string=>id!==null);
    const continuableRunIds = (await Promise.all(runs.filter(run => run.execution_version === 2 && ['selected', 'in_progress'].includes(String(run.status))).map(async run => {
      try {
        const snapshot = run.execution_snapshot as { repeatedFromRunId?: string; action?: { updated_at?: string }; binding?: { updated_at?: string } } | null;
        const context = await requireActionExecution(client, user.id, courseId, String(run.action_id), run.status === 'in_progress' || snapshot?.repeatedFromRunId ? true : undefined);
        if (context.action.updated_at !== snapshot?.action?.updated_at || context.binding?.updated_at !== snapshot?.binding?.updated_at || context.microPathId !== run.micro_path_id || (context.binding?.assignment_id ?? null) !== (run.assignment_id ?? null)) return null;
        return String(run.id);
      } catch (error) {
        if (error instanceof ApiError && error.status < 500) return null;
        throw error;
      }
    }))).filter((id): id is string => id !== null);
    json(response, 200, { actions, bindings, runs, routeExecutionReachableNodeIds:progress?.reachableNodeIds, continuableRunIds, repeatableActionIds, availableMicroActionIds, availableActionIds: [...availableMicroActionIds, ...availablePractice.filter(Boolean),...availableNodeActions.filter(option=>option.type==='practice_task').map(option=>option.actionId)] }); return;
  }
  if (request.method !== 'POST') return methodNotAllowed(response, ['GET', 'POST']);
  const parsed = bodySchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, 'invalid_action_request', 'Invalid edge action request');
  const server = createServerSupabase();
  const body = parsed.data;
  if (body.action === 'select') {
    const duplicateResult = await client.from('edge_action_runs').select('*').eq('user_id',user.id).eq('selection_key',body.selectionKey).maybeSingle();
    const duplicate = dataOrThrow(duplicateResult.data,duplicateResult.error,'Action selection retry');
    if (duplicate) {
      if (duplicate.course_id !== body.courseId || duplicate.action_id !== body.actionId || duplicate.execution_version !== 2) throw new ApiError(409,'selection_key_conflict','此请求标识已用于其他行动。');
      json(response,200,{run:duplicate});return;
    }
    let retainedEdgeId: boolean | undefined;
    if (body.repeatRunId) {
      const previousResult = await client.from('edge_action_runs').select('edge_id').eq('id', body.repeatRunId).eq('user_id', user.id).eq('course_id', body.courseId).eq('action_id', body.actionId).eq('status', 'completed').maybeSingle();
      const previous = dataOrThrow(previousResult.data, previousResult.error, 'Repeated execution');
      if (!previous) throw new ApiError(404, 'repeat_run_not_found', '已完成的执行记录不存在。');
      retainedEdgeId = true;
    }
    const context = await requireActionExecution(client, user.id, body.courseId, body.actionId, retainedEdgeId);
    const result = await server.rpc('select_route_action_v3', { p_user_id: user.id, p_course_id: body.courseId, p_action_id: body.actionId, p_selection_key: body.selectionKey, p_expected_version_id: body.routeVersionId ?? context.routeVersionId, p_action_version: context.action.updated_at, p_binding_version: context.binding?.updated_at ?? null, p_expected_active_run_id: body.expectedActiveRunId ?? null, p_repeat_run_id: body.repeatRunId ?? null });
    if (result.error) throw new ApiError(409, 'action_selection_changed', '行动或执行条件已变化，请刷新后重新选择。');
    json(response, 200, { run: result.data }); return;
  }
  if (body.action === 'transition') {
    const found = await client.from('edge_action_runs').select('*').eq('id', body.runId).maybeSingle();
    const run = dataOrThrow(found.data, found.error, 'Owned action run');
    if (!run) throw new ApiError(404, 'run_not_found', '执行记录不存在。');
    await requirePublishedCourse(client, run.course_id);
    let expectedVersionId = body.routeVersionId ?? null;
    if (body.operation === 'start' && ['selected', 'in_progress'].includes(run.status)) {
      const context = await requireActionExecution(client, user.id, run.course_id, run.action_id, run.status === 'in_progress' || run.execution_snapshot.repeatedFromRunId ? true : undefined);
      expectedVersionId = body.routeVersionId ?? context.routeVersionId;
      if (context.microPathId !== run.micro_path_id) throw new ApiError(409, 'micro_path_changed', '微学习内容已变化，请重新选择行动。');
    }
    const result = await server.rpc('transition_route_action_v3', { p_user_id: user.id, p_run_id: run.id, p_operation: body.operation, p_expected_version_id: expectedVersionId });
    if (result.error) throw new ApiError(result.error.code === 'P0002' ? 404 : 409, 'action_transition_rejected', '执行状态、资源或结果资料已变化，请刷新后检查。');
    json(response, 200, { run: result.data }); return;
  }
  const roleResult = await server.from('profiles').select('role').eq('id', user.id).single();
  const profile = dataOrThrow(roleResult.data, roleResult.error, 'Action governance authority');
  if (body.action === 'save-template') {
    if (profile.role !== 'admin') throw new ApiError(403, 'global_action_forbidden', 'Global administrator required');
    const value = { ...body.template, edge_id:body.template.edge_id??null,node_id:body.template.node_id??null, provenance: { kind: 'admin', actor_id: user.id } };
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

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildCapabilityModel, planCourseRoute, routeStructure, PrerequisiteCycleError, type RoutePlanningInput, type RouteConstraints, type SelectedRoute, type RouteConflict } from '../../src/shared/learning/routePlanning.js';
import type { RouteVersion, RoutePlanView } from '../../src/shared/learning/routeVersion.js';
import { satisfiesTeachingPrerequisite } from '../../src/shared/learning/teachingPrerequisites.js';
import { allRows, dataOrThrow } from './query.js';
import { ApiError } from './http.js';
import { createServerSupabase } from './supabase.js';
import { inspectRouteExecution, type RouteExecutionStep } from '../../src/shared/learning/routeExecution.js';
import { readRouteActionOptions } from './routeExecution.js';
type Row = Record<string, unknown>;
export const defaultConstraints: RouteConstraints = { includeNodeIds: [], excludeNodeIds: [] };
export function mapRouteVersion(row: Row): RouteVersion {
  return { id: String(row.id), routeId: String(row.route_id), userId: String(row.user_id), courseId: String(row.course_id), versionNumber: Number(row.version_number),
    parentVersionId: row.parent_version_id == null ? null : String(row.parent_version_id), source: row.source as RouteVersion['source'],
    constraints: { includeNodeIds: row.include_node_ids as string[], excludeNodeIds: row.exclude_node_ids as string[] },
    snapshot: row.snapshot as RouteVersion['snapshot'], structureFingerprint: String(row.structure_fingerprint), createdAt: String(row.created_at), restoredFromVersionId: row.restored_from_version_id == null ? null : String(row.restored_from_version_id) };
}
/** Authenticated RLS reads only; no service catalog substitution. */
export async function readRouteInput(client: SupabaseClient, userId: string, courseId: string) {
  const [nodes, edges, states, coverages, lessons] = await Promise.all([
    allRows(client.from('knowledge_nodes').select('id,current_revision_id,title').eq('status', 'active').order('id'), 'Route visible Knowledge'),
    allRows(client.from('knowledge_edges').select('id,source_node_id,target_node_id,relation,prerequisite_strength,associative_strength').in('relation', ['prerequisite', 'enables']).eq('lifecycle_status', 'active').order('id'), 'Route factual prerequisites'),
    allRows(client.from('user_knowledge_states').select('node_id,status').eq('user_id', userId).order('node_id'), 'Route current capabilities'),
    allRows(client.from('curriculum_coverages').select('id,node_id,lesson_id,display_order').eq('course_id', courseId).order('id'), 'Route Course coverage'),
    allRows(client.from('curriculum_lessons').select('id,display_order').eq('course_id', courseId).order('id'), 'Route Course order'),
  ]);
  const lessonOrder = new Map(lessons.map(row => [String(row.id), Number(row.display_order)]));
  const input: RoutePlanningInput = {
    nodeIds: nodes.map(row => String(row.id)),
    prerequisiteEdges: edges.filter(row => row.relation === 'prerequisite').map(row => {
      if (row.prerequisite_strength !== 'hard' && row.prerequisite_strength !== 'soft') throw new ApiError(422, 'invalid_prerequisite_strength', 'Knowledge prerequisite strength is invalid');
      return { id: String(row.id), source: String(row.source_node_id), target: String(row.target_node_id), strength: row.prerequisite_strength };
    }),
    enablesEdges: edges.filter(row => row.relation === 'enables').map(row => {
      const strength = Number(row.associative_strength);
      if (row.associative_strength == null || !Number.isFinite(strength) || strength < 0 || strength > 1) throw new ApiError(422, 'invalid_enables_strength', 'Knowledge enables strength is invalid');
      return { id: String(row.id), source: String(row.source_node_id), target: String(row.target_node_id), relation: 'enables', strength };
    }),
    currentNodeIds: states.filter(row => nodes.some(node=>node.id===row.node_id) && satisfiesTeachingPrerequisite(String(row.status))).map(row => String(row.node_id)),
    courseOrder: coverages.map(row => ({ nodeId: String(row.node_id), lessonOrder: lessonOrder.get(String(row.lesson_id)) ?? Number.MAX_SAFE_INTEGER, coverageOrder: Number(row.display_order) })),
  };
  return { input, nodes, states };
}
export const fingerprint = (input: RoutePlanningInput, constraints: RouteConstraints) => createHash('sha256').update(JSON.stringify(routeStructure(input, constraints))).digest('hex');
export async function readActiveVersion(client: SupabaseClient, userId: string, courseId: string) {
  const found = await client.from('personal_course_routes').select('active_version_id').eq('user_id', userId).eq('course_id', courseId).maybeSingle();
  const row = dataOrThrow(found.data as Row | null, found.error, 'Current route lookup');
  return row?.active_version_id ? readVersion(client, userId, courseId, String(row.active_version_id)) : null;
}
export async function readVersion(client: SupabaseClient, userId: string, courseId: string, id: string) {
  const found = await client.from('personal_course_route_versions').select('*').eq('id', id).eq('user_id', userId).eq('course_id', courseId).maybeSingle();
  const row = dataOrThrow(found.data as Row | null, found.error, 'Route version lookup');
  if (!row) throw new ApiError(404, 'route_version_not_found', 'Route version is unavailable');
  return mapRouteVersion(row);
}
export async function persistRoute(userId: string, courseId: string, data: Awaited<ReturnType<typeof readRouteInput>>, constraints: RouteConstraints, route: SelectedRoute | null, baseVersionId: string | null, source: RouteVersion['source'], restoredFromVersionId: string | null = null, initialConflicts: RouteConflict[] = [], executionSteps?: RouteExecutionStep[]) {
  if (!route && source !== 'initial') throw new ApiError(422, 'route_constraints_conflict', 'Only initial history can record an unplannable default.');
  const snapshot = route ?? { selectedNodeIds: [], orderedNodeIds: [], prerequisiteEdges: [], effectiveTargetNodeIds: [...new Set(data.input.courseOrder.map(row => row.nodeId).filter(id => data.input.nodeIds.includes(id)))].sort(), currentKnowledgeIds: [], bridgeKnowledgeIds: [] };
  const selected = new Set([...(route?.selectedNodeIds ?? snapshot.effectiveTargetNodeIds), ...constraints.includeNodeIds, ...constraints.excludeNodeIds, ...snapshot.effectiveTargetNodeIds]);
  const result = await createServerSupabase().rpc('adopt_personal_course_route', {
    p_user_id: userId, p_course_id: courseId, p_base_version_id: baseVersionId, p_source: source,
    p_include_node_ids: [...new Set(constraints.includeNodeIds)].sort(), p_exclude_node_ids: [...new Set(constraints.excludeNodeIds)].sort(),
    p_snapshot: { ...snapshot, planningCurrentNodeIds:[...data.input.currentNodeIds], planningKnowledgeStates:data.states.filter(row=>data.input.nodeIds.includes(String(row.node_id))).map(row=>({nodeId:row.node_id,status:row.status})), ...(executionSteps === undefined ? {} : { executionSteps }), valid: route !== null, conflicts: initialConflicts, titles: Object.fromEntries(data.nodes.filter(row => selected.has(String(row.id))).map(row => [String(row.id), String(row.title)])) },
    p_structure_fingerprint: fingerprint(data.input, constraints), p_restored_from_version_id: restoredFromVersionId,
  });
  if (result.error?.code === 'PT409') throw new ApiError(409, 'route_version_conflict', '路线已在其他页面更新，请重新载入后规划。');
  return mapRouteVersion(dataOrThrow(result.data as Row | null, result.error, 'Atomic route adoption'));
}
export async function currentRoute(client: SupabaseClient, userId: string, courseId: string) {
  const [data, existing] = await Promise.all([readRouteInput(client, userId, courseId), readActiveVersion(client, userId, courseId)]);
  let activeVersion = existing;
  let plan = planCourseRoute(data.input, activeVersion?.constraints ?? defaultConstraints);
  if (!activeVersion) {
    activeVersion = await persistRoute(userId, courseId, data, defaultConstraints, plan.valid ? plan.route : null, null, 'initial', null, plan.conflicts);
    // Another session may have initialized and adjusted while this request was reading.
    plan = planCourseRoute(data.input, activeVersion.constraints);
  }
  // New formal execution Routes are immutable decisions. State changes may invalidate
  // a gate, but never substitute a freshly planned Route before explicit adoption.
  if (activeVersion.snapshot.executionSteps !== undefined) {
    const snapshot = activeVersion.snapshot;
    const facts = [...data.input.prerequisiteEdges.map(edge=>({...edge,relation:'prerequisite' as const})),...(data.input.enablesEdges??[])];
    const valid = snapshot.valid && snapshot.selectedNodeIds.every(id=>data.input.nodeIds.includes(id))
      && snapshot.prerequisiteEdges.every(edge=>facts.some(fact=>fact.id===edge.id && fact.source===edge.source && fact.target===edge.target && fact.relation==='prerequisite' && fact.strength===edge.strength));
    plan = valid ? {valid:true,route:snapshot,conflicts:[]} : {valid:false,route:null,conflicts:snapshot.conflicts};
  }
  let model = null;
  try { model = buildCapabilityModel(data.input); } catch (error) { if (!(error instanceof PrerequisiteCycleError)) throw error; }
  const execution = activeVersion.snapshot.valid ? inspectRouteExecution(activeVersion.snapshot,
    [...data.input.prerequisiteEdges.map(edge=>({...edge,relation:'prerequisite' as const})),...(data.input.enablesEdges??[])],
    await readRouteActionOptions(client,courseId,data.input,activeVersion.snapshot,userId),data.input.currentNodeIds) : undefined;
  const view: RoutePlanView = { activeVersion, model, plan, execution, structureChanged: Boolean(activeVersion && activeVersion.structureFingerprint !== fingerprint(data.input, activeVersion.constraints)) };
  return { ...data, view };
}

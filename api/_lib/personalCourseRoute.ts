import type { SupabaseClient } from '@supabase/supabase-js';
import { buildPersonalCourseRoute, PrerequisiteCycleError } from '../../src/shared/learning/personalCourseRoute.js';
import { satisfiesTeachingPrerequisite } from '../../src/shared/learning/teachingPrerequisites.js';
import { allRows } from './query.js';
import { ApiError } from './http.js';

/** Must receive the authenticated user's RLS client, never a service-role catalog. */
export async function readPersonalCourseRoute(client: SupabaseClient, userId: string, courseId: string) {
  const [nodes, edges, states, coverages, lessons] = await Promise.all([
    allRows(client.from('knowledge_nodes').select('id,current_revision_id').eq('status', 'active').order('id'), 'Route visible Knowledge'),
    allRows(client.from('knowledge_edges').select('id,source_node_id,target_node_id').eq('relation', 'prerequisite').eq('lifecycle_status', 'active').order('id'), 'Route factual prerequisites'),
    allRows(client.from('user_knowledge_states').select('node_id,status').eq('user_id', userId).order('node_id'), 'Route current capabilities'),
    allRows(client.from('curriculum_coverages').select('id,node_id,lesson_id,display_order').eq('course_id', courseId).order('id'), 'Route Course coverage'),
    allRows(client.from('curriculum_lessons').select('id,display_order').eq('course_id', courseId).order('id'), 'Route Course order'),
  ]);
  const lessonOrder = new Map(lessons.map(row => [String(row.id), Number(row.display_order)]));
  try {
    const route = buildPersonalCourseRoute({
      nodeIds: nodes.map(row => String(row.id)),
      prerequisiteEdges: edges.map(row => ({ id: String(row.id), source: String(row.source_node_id), target: String(row.target_node_id) })),
      currentNodeIds: states.filter(row => satisfiesTeachingPrerequisite(String(row.status))).map(row => String(row.node_id)),
      courseOrder: coverages.map(row => ({ nodeId: String(row.node_id), lessonOrder: lessonOrder.get(String(row.lesson_id)) ?? Number.MAX_SAFE_INTEGER, coverageOrder: Number(row.display_order) })),
    });
    const members = new Set(route.orderedNodeIds);
    return { route, nodes: nodes.filter(row => members.has(String(row.id))), states: states.filter(row => members.has(String(row.node_id))) };
  } catch (error) {
    if (error instanceof PrerequisiteCycleError) throw new ApiError(422, 'knowledge_prerequisite_cycle', error.message);
    throw error;
  }
}

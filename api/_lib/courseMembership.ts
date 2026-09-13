import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./http.js";
import { allRows, dataOrThrow } from "./query.js";

type Row = Record<string, unknown>;

export async function requirePublishedCourse(client: SupabaseClient, courseId: string) {
  const result = await client.from("courses").select("id,lifecycle").eq("id", courseId).maybeSingle();
  const course = dataOrThrow(result.data as Row | null, result.error, "Published Course lookup");
  if (!course || course.lifecycle !== "published") throw new ApiError(404, "published_course_not_found", "Published Course is unavailable");
  return course;
}

export async function requireCourseKnowledge(client: SupabaseClient, courseId: string, nodeId: string) {
  await requirePublishedCourse(client, courseId);
  const result = await client.from("curriculum_coverages").select("id").eq("course_id", courseId).eq("node_id", nodeId).limit(1).maybeSingle();
  const coverage = dataOrThrow(result.data as Row | null, result.error, "Course Knowledge coverage lookup");
  if (!coverage) throw new ApiError(400, "knowledge_not_in_course", "Knowledge is not covered by this Course");
}

export async function activateCourse(client: SupabaseClient, userId: string, courseId: string) {
  await requirePublishedCourse(client, courseId);
  const updatedAt = new Date().toISOString();
  const result = await client.from("user_course_states").upsert({ user_id: userId, course_id: courseId, is_active: true, updated_at: updatedAt });
  dataOrThrow(result.data, result.error, "Course membership activation");
  return updatedAt;
}

/** Course-local factual prerequisites are the existing instructional gate. */
export async function requireMicroTeachingEligibility(client: SupabaseClient, userId: string, courseId: string, nodeId: string) {
  await requireCourseKnowledge(client, courseId, nodeId);
  const [edges, coverage] = await Promise.all([
    allRows(client.from('knowledge_edges').select('source_node_id').eq('target_node_id', nodeId).eq('relation', 'prerequisite').eq('lifecycle_status', 'active').order('source_node_id'), 'Micro prerequisite lookup'),
    allRows(client.from('curriculum_coverages').select('node_id').eq('course_id', courseId).order('id'), 'Micro prerequisite Course scope'),
  ]);
  const ids = [...new Set(edges.map(row => String(row.source_node_id)).filter(id => coverage.some(row => row.node_id === id)))];
  if (!ids.length) return;
  const result = await client.from('user_knowledge_states').select('node_id,status').eq('user_id', userId).in('node_id', ids);
  const states = dataOrThrow(result.data as Row[] | null, result.error, 'Micro prerequisite state');
  if (ids.some(id => !states.some(row => row.node_id === id && ['learned','practicing','mastered'].includes(String(row.status))))) {
    throw new ApiError(403, 'teaching_prerequisite_required', 'Complete the Course teaching prerequisites before starting this Micro');
  }
}

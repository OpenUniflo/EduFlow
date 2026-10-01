import { readPersonalCourseRoute } from "./personalCourseRoute.js";
import { satisfiesTeachingPrerequisite } from "../../src/shared/learning/teachingPrerequisites.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./http.js";
import { dataOrThrow } from "./query.js";

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

/** Original coverage and computed bridge are distinct authorization paths. Client flags are never read. */
export async function requirePersonalCourseRouteKnowledge(client: SupabaseClient, userId: string, courseId: string, nodeId: string) {
  await requirePublishedCourse(client, courseId);
  const personal = await readPersonalCourseRoute(client, userId, courseId);
  if (personal.route.courseKnowledgeIds.includes(nodeId)) {
    await requireCourseKnowledge(client, courseId, nodeId);
  } else if (!personal.route.bridgeKnowledgeIds.includes(nodeId)) {
    throw new ApiError(400, "knowledge_not_in_course", "Knowledge is neither Course coverage nor a current personal route bridge");
  }
  return personal;
}

/** All route-local factual prerequisites are AND gates, including hard and soft. */
export async function requireMicroTeachingEligibility(client: SupabaseClient, userId: string, courseId: string, nodeId: string) {
  const personal = await requirePersonalCourseRouteKnowledge(client, userId, courseId, nodeId);
  const statuses = new Map(personal.states.map(row => [String(row.node_id), String(row.status)]));
  if (satisfiesTeachingPrerequisite(statuses.get(nodeId))) return personal.route;
  const unmet = personal.route.prerequisiteEdges.some(edge => edge.target === nodeId && !satisfiesTeachingPrerequisite(statuses.get(edge.source)));
  if (unmet) throw new ApiError(403, 'teaching_prerequisite_required', 'Complete the personal route teaching prerequisites before starting this Micro');
  return personal.route;
}

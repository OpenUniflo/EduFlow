import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createUserSupabase } from "../_lib/supabase.js";
import { ApiError, handleApi, json, methodNotAllowed } from "../_lib/http.js";
import { dataOrThrow } from "../_lib/query.js";
import { activateCourse, requirePublishedCourse } from "../_lib/courseMembership.js";

type Row = Record<string, unknown>;

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  const { client, user } = await createUserSupabase(request);
  if (request.method === "GET") {
    const [knowledgeResult, coursesResult, assignmentsResult, materialsResult, evidenceResult] = await Promise.all([
      client.from("user_knowledge_states").select("*").eq("user_id", user.id),
      client.from("user_course_states").select("*").eq("user_id", user.id),
      client.from("user_assignment_states").select("*").eq("user_id", user.id),
      client.from("user_material_states").select("*").eq("user_id", user.id),
      client.from("knowledge_evidence").select("*").eq("user_id", user.id).order("occurred_at", { ascending: false })
    ]);
    const evidenceRows = dataOrThrow(evidenceResult.data as Row[] | null, evidenceResult.error, "KnowledgeEvidence query");
    const knowledge = dataOrThrow(knowledgeResult.data as Row[] | null, knowledgeResult.error, "UserKnowledgeState query").map((row) => ({
      nodeId: String(row.node_id), status: String(row.status), mastery: row.mastery == null ? undefined : Number(row.mastery),
      masteryOrigin: row.mastery_origin ?? undefined, sourceNodeId: row.source_node_id ?? undefined,
      sourceNodeIds: row.source_node_ids ?? undefined,
      evidence: evidenceRows.filter((item) => item.node_id === row.node_id).map((item) => ({ id: String(item.id), nodeId: String(item.node_id), type: String(item.event_type), label: String(item.event_type).replace(/_/g, " "), refId: String(item.source_entity_id), createdAt: String(item.occurred_at) })),
      updatedAt: String(row.updated_at)
    }));
    const assignmentRows = dataOrThrow(assignmentsResult.data as Row[] | null, assignmentsResult.error, "UserAssignmentState query");
    const materialRows = dataOrThrow(materialsResult.data as Row[] | null, materialsResult.error, "UserMaterialState query");
    const courseStates = dataOrThrow(coursesResult.data as Row[] | null, coursesResult.error, "UserCourseState query").map((course) => {
      const courseId = String(course.course_id);
      const assignmentStates = Object.fromEntries(assignmentRows.filter((row) => row.course_id === courseId).map((row) => [String(row.assignment_id), {
        assignmentId: String(row.assignment_id), status: String(row.status), progress: row.progress == null ? undefined : Number(row.progress)
      }]));
      const materialStates = Object.fromEntries(materialRows.filter((row) => row.course_id === courseId).map((row) => [String(row.material_id), {
        materialId: String(row.material_id), recentSegmentId: row.recent_segment_id ?? undefined,
        viewedSegmentIds: row.viewed_segment_ids, completedSegmentIds: row.completed_segment_ids,
        progress: row.progress == null ? undefined : Number(row.progress), updatedAt: String(row.updated_at)
      }]));
      return { userId: user.id, courseId, isActive: Boolean(course.is_active), assignmentStates, materialStates, recentLessonId: course.recent_lesson_id ?? undefined, updatedAt: String(course.updated_at) };
    });
    json(response, 200, { userKnowledge: knowledge, courseStates });
    return;
  }
  if (request.method === "POST") {
    const body = request.body as { action?: "activate-course" | "deactivate-course"; courseId?: string };
    if (!body.courseId || !body.action) throw new ApiError(400, "invalid_membership_action", "courseId and action are required");
    if (body.action === "activate-course") await activateCourse(client, user.id, body.courseId);
    else if (body.action === "deactivate-course") {
      await requirePublishedCourse(client, body.courseId);
      const result = await client.from("user_course_states").update({ is_active: false, updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("course_id", body.courseId);
      dataOrThrow(result.data, result.error, "Course membership deactivation");
    } else throw new ApiError(400, "invalid_membership_action", "Unsupported membership action");
    const stateResult = await client.from("user_course_states").select("*").eq("user_id", user.id).eq("course_id", body.courseId).maybeSingle();
    const row = dataOrThrow(stateResult.data as Row | null, stateResult.error, "Course membership readback");
    if (!row) throw new ApiError(404, "course_membership_not_found", "Course membership does not exist");
    json(response, 200, { state: { userId: user.id, courseId: body.courseId, isActive: Boolean(row.is_active), assignmentStates: {}, materialStates: {}, recentLessonId: row.recent_lesson_id ?? undefined, updatedAt: String(row.updated_at) } });
    return;
  }
  if (request.method === "PUT") {
    const state = request.body as { userId?: string; courseId?: string; assignmentStates?: Record<string, Row>; materialStates?: Record<string, Row>; recentLessonId?: string; updatedAt?: string };
    if (!state?.courseId || !state.assignmentStates || !state.materialStates) throw new ApiError(400, "invalid_progress", "A complete course progress state is required");
    const updatedAt = state.updatedAt ?? new Date().toISOString();
    await requirePublishedCourse(client, state.courseId);
    const courseResult = await client.from("user_course_states").upsert({ user_id: user.id, course_id: state.courseId, is_active: true, recent_lesson_id: state.recentLessonId ?? null, updated_at: updatedAt });
    dataOrThrow(courseResult.data, courseResult.error, "UserCourseState update");
    const assignmentRows = Object.values(state.assignmentStates).map((item) => ({
      user_id: user.id, course_id: state.courseId, assignment_id: String(item.assignmentId), status: String(item.status),
      progress: item.progress == null ? null : Number(item.progress), updated_at: updatedAt
    }));
    if (assignmentRows.length) {
      const result = await client.from("user_assignment_states").upsert(assignmentRows);
      dataOrThrow(result.data, result.error, "UserAssignmentState update");
    }
    const materialRows = Object.values(state.materialStates).map((item) => ({
      user_id: user.id, course_id: state.courseId, material_id: String(item.materialId), recent_segment_id: item.recentSegmentId ?? null,
      viewed_segment_ids: item.viewedSegmentIds ?? [], completed_segment_ids: item.completedSegmentIds ?? [],
      progress: item.progress == null ? null : Number(item.progress), updated_at: item.updatedAt ?? updatedAt
    }));
    if (materialRows.length) {
      const result = await client.from("user_material_states").upsert(materialRows);
      dataOrThrow(result.data, result.error, "UserMaterialState update");
    }
    json(response, 200, { state: { ...state, userId: user.id, isActive: true, updatedAt } });
    return;
  }
  return methodNotAllowed(response, ["GET", "POST", "PUT"]);
});

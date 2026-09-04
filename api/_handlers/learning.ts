import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createServerSupabase, createUserSupabase } from "../_lib/supabase.js";
import { ApiError, handleApi, json, methodNotAllowed } from "../_lib/http.js";
import { dataOrThrow } from "../_lib/query.js";
import { recomputeMastery, updateKnowledgeAtLeast } from "../_lib/mastery.js";
import { activateCourse, requireCourseKnowledge, requirePublishedCourse } from "../_lib/courseMembership.js";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key]);
async function requireTeacher(userId: string) {
  const server = createServerSupabase();
  const profileResult = await server.from("profiles").select("role").eq("id", userId).maybeSingle();
  const profile = dataOrThrow(profileResult.data as Row | null, profileResult.error, "Teacher role lookup");
  if (!profile || !["teacher", "admin"].includes(text(profile, "role"))) throw new ApiError(403, "assignment_acceptance_forbidden", "Teacher or admin permission is required");
  return server;
}

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  const { client, user } = await createUserSupabase(request);
  if (request.method === "GET") {
    const server = await requireTeacher(user.id);
    const courseId = typeof request.query.courseId === "string" ? request.query.courseId : undefined;
    let statesQuery = server.from("user_assignment_states").select("user_id,course_id,assignment_id,status,submitted_at,accepted_at").in("status", ["submitted", "accepted"]).order("submitted_at", { ascending: false });
    if (courseId) statesQuery = statesQuery.eq("course_id", courseId);
    const statesResult = await statesQuery;
    const states = dataOrThrow(statesResult.data as Row[] | null, statesResult.error, "Assignment submissions lookup");
    const learnerIds = [...new Set(states.map((state) => text(state, "user_id")))];
    const profilesResult = learnerIds.length ? await server.from("profiles").select("id,display_name").in("id", learnerIds) : { data: [], error: null };
    const profiles = dataOrThrow(profilesResult.data as Row[] | null, profilesResult.error, "Assignment learner profiles lookup");
    const displayNameById = new Map(profiles.map((profile) => [text(profile, "id"), text(profile, "display_name")]));
    json(response, 200, { submissions: states.map((state) => ({
      learnerUserId: text(state, "user_id"), learnerName: displayNameById.get(text(state, "user_id")) || "Learner",
      courseId: text(state, "course_id"), assignmentId: text(state, "assignment_id"), status: text(state, "status"),
      submittedAt: state.submitted_at == null ? undefined : text(state, "submitted_at"), acceptedAt: state.accepted_at == null ? undefined : text(state, "accepted_at")
    })) });
    return;
  }
  if (request.method !== "POST") return methodNotAllowed(response, ["GET", "POST"]);
  const body = request.body as { action?: "start-material" | "start-assignment" | "submit-assignment" | "accept-assignment"; nodeId?: string; courseId?: string; materialId?: string; assignmentId?: string; learnerUserId?: string; deterministicAccepted?: boolean };
  if (!body.action) throw new ApiError(400, "invalid_learning_action", "An action is required");
  if (body.action === "start-material") {
    if (!body.nodeId || !body.courseId || !body.materialId) throw new ApiError(400, "invalid_learning_action", "nodeId, courseId and materialId are required");
    await requireCourseKnowledge(client, body.courseId, body.nodeId);
    const [materialResult, coverageResult] = await Promise.all([
      client.from("materials").select("id").eq("course_id", body.courseId).eq("id", body.materialId).maybeSingle(),
      client.from("material_knowledge_coverages").select("id").eq("course_id", body.courseId).eq("material_id", body.materialId).eq("node_id", body.nodeId).limit(1)
    ]);
    const material = dataOrThrow(materialResult.data as Row | null, materialResult.error, "Material learning lookup");
    const coverage = dataOrThrow(coverageResult.data as Row[] | null, coverageResult.error, "Material Knowledge coverage lookup");
    if (!material || !coverage.length) throw new ApiError(404, "material_learning_unavailable", "This Material is not available for the selected learning content");
    await activateCourse(client, user.id, body.courseId);
    await updateKnowledgeAtLeast(client, user.id, body.nodeId, "learning");
    json(response, 200, { status: "learning" }); return;
  }
  if (!body.courseId || !body.assignmentId) throw new ApiError(400, "invalid_learning_action", "courseId and assignmentId are required");
  if (body.action === "accept-assignment") {
    if (!body.learnerUserId) throw new ApiError(400, "invalid_learning_action", "learnerUserId is required");
    const server = await requireTeacher(user.id);
    const stateResult = await server.from("user_assignment_states").select("status,started_at,submitted_at").eq("user_id", body.learnerUserId).eq("course_id", body.courseId).eq("assignment_id", body.assignmentId).maybeSingle();
    const state = dataOrThrow(stateResult.data as Row | null, stateResult.error, "Assignment submission lookup");
    if (!state || text(state, "status") !== "submitted") throw new ApiError(409, "assignment_not_submitted", "Only a submitted Assignment can be accepted");
    const now = new Date().toISOString();
    const acceptedWrite = await server.from("user_assignment_states").update({ status: "accepted", progress: 100, accepted_at: now, updated_at: now }).eq("user_id", body.learnerUserId).eq("course_id", body.courseId).eq("assignment_id", body.assignmentId);
    dataOrThrow(acceptedWrite.data, acceptedWrite.error, "Manual Assignment acceptance");
    const coverageResult = await server.from("assignment_coverages").select("node_id").eq("course_id", body.courseId).eq("assignment_id", body.assignmentId);
    const coverage = dataOrThrow(coverageResult.data as Row[] | null, coverageResult.error, "Assignment coverage lookup");
    await Promise.all(coverage.map(async (item) => {
      const nodeId = text(item, "node_id");
      const evidence = await server.from("knowledge_evidence").upsert({ user_id: body.learnerUserId, node_id: nodeId, event_type: "assignment_accepted", source_entity_id: `${body.courseId}:${body.assignmentId}`, outcome: "accepted", context: { courseId: body.courseId, assignmentId: body.assignmentId, deterministic: false, acceptedBy: user.id }, occurred_at: now }, { onConflict: "user_id,node_id,event_type,source_entity_id", ignoreDuplicates: true });
      dataOrThrow(evidence.data, evidence.error, "Manual Assignment evidence");
      await recomputeMastery(server as typeof client, body.learnerUserId!, nodeId, body.courseId!);
    }));
    json(response, 200, { status: "accepted", accepted: true }); return;
  }
  const assignmentResult = await client.from("course_assignments").select("*").eq("course_id", body.courseId).eq("id", body.assignmentId).maybeSingle();
  const assignment = dataOrThrow(assignmentResult.data as Row | null, assignmentResult.error, "Assignment lookup");
  if (!assignment) throw new ApiError(404, "assignment_not_found", "Assignment is unavailable");
  await requirePublishedCourse(client, body.courseId);
  const now = new Date().toISOString();
  const course = await client.from("user_course_states").upsert({ user_id: user.id, course_id: body.courseId, is_active: true, updated_at: now });
  dataOrThrow(course.data, course.error, "Course state initialization");
  const coverageResult = await client.from("assignment_coverages").select("node_id").eq("course_id", body.courseId).eq("assignment_id", body.assignmentId);
  const coverage = dataOrThrow(coverageResult.data as Row[] | null, coverageResult.error, "Assignment coverage lookup");
  if (body.action === "start-assignment") {
    const previousResult = await client.from("user_assignment_states").select("status,started_at").eq("user_id", user.id).eq("course_id", body.courseId).eq("assignment_id", body.assignmentId).maybeSingle();
    const previous = dataOrThrow(previousResult.data as Row | null, previousResult.error, "Assignment state lookup");
    if (!previous || ["not_started", "needs_revision"].includes(text(previous, "status"))) {
      const write = await client.from("user_assignment_states").upsert({ user_id: user.id, course_id: body.courseId, assignment_id: body.assignmentId, status: "started", progress: 1, started_at: previous?.started_at ?? now, updated_at: now });
      dataOrThrow(write.data, write.error, "Assignment start");
    }
    await Promise.all(coverage.map((item) => updateKnowledgeAtLeast(client, user.id, text(item, "node_id"), "practicing")));
    json(response, 200, { status: "started" }); return;
  }
  const experience = assignment.experience as Row | null;
  const objectivelyAcceptable = Boolean(body.deterministicAccepted && experience?.type === "trace");
  const nextStatus = objectivelyAcceptable ? "accepted" : "submitted";
  const write = await client.from("user_assignment_states").upsert({ user_id: user.id, course_id: body.courseId, assignment_id: body.assignmentId, status: nextStatus, progress: objectivelyAcceptable ? 100 : 75, started_at: now, submitted_at: now, accepted_at: objectivelyAcceptable ? now : null, updated_at: now });
  dataOrThrow(write.data, write.error, "Assignment submit");
  if (objectivelyAcceptable) {
    await Promise.all(coverage.map(async (item) => {
      const nodeId = text(item, "node_id");
      const evidence = await client.from("knowledge_evidence").upsert({ user_id: user.id, node_id: nodeId, event_type: "assignment_accepted", source_entity_id: `${body.courseId}:${body.assignmentId}`, outcome: "accepted", context: { courseId: body.courseId, assignmentId: body.assignmentId, deterministic: true }, occurred_at: now }, { onConflict: "user_id,node_id,event_type,source_entity_id", ignoreDuplicates: true });
      dataOrThrow(evidence.data, evidence.error, "Assignment evidence");
      await recomputeMastery(client, user.id, nodeId, body.courseId!);
    }));
  }
  json(response, 200, { status: nextStatus, accepted: objectivelyAcceptable });
});

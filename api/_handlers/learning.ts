import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createServerSupabase, createUserSupabase } from "../_lib/supabase.js";
import { ApiError, handleApi, json, methodNotAllowed } from "../_lib/http.js";
import { dataOrThrow } from "../_lib/query.js";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key]);
const weakKnowledgeStatus = (status: string) => ["explore", "learning", "learned", "practicing"].includes(status);

async function updateKnowledgeAtLeast(client: Awaited<ReturnType<typeof createUserSupabase>>["client"], userId: string, nodeId: string, status: "learning" | "practicing" | "mastered") {
  const existingResult = await client.from("user_knowledge_states").select("status").eq("user_id", userId).eq("node_id", nodeId).maybeSingle();
  const existing = dataOrThrow(existingResult.data as Row | null, existingResult.error, "Knowledge state lookup");
  if (existing && !weakKnowledgeStatus(text(existing, "status"))) return;
  const rank = { explore: 0, learning: 1, learned: 2, practicing: 3, mastered: 4 } as const;
  if (existing && rank[text(existing, "status") as keyof typeof rank] >= rank[status]) return;
  const write = await client.from("user_knowledge_states").upsert({ user_id: userId, node_id: nodeId, status, updated_at: new Date().toISOString() });
  dataOrThrow(write.data, write.error, "Knowledge state update");
}

async function recomputeMastery(client: Awaited<ReturnType<typeof createUserSupabase>>["client"], userId: string, nodeId: string) {
  const [pathsResult, pathProgressResult, coveragesResult] = await Promise.all([
    client.from("micro_learning_paths").select("id").eq("knowledge_id", nodeId).eq("mode", "learn").eq("required", true).eq("status", "published"),
    client.from("user_micro_path_progress").select("path_id,status").eq("user_id", userId),
    client.from("assignment_coverages").select("course_id,assignment_id").eq("node_id", nodeId).eq("required", true)
  ]);
  const paths = dataOrThrow(pathsResult.data as Row[] | null, pathsResult.error, "Required Micro paths lookup");
  const pathProgress = dataOrThrow(pathProgressResult.data as Row[] | null, pathProgressResult.error, "Micro progress lookup");
  const requiredAssignments = dataOrThrow(coveragesResult.data as Row[] | null, coveragesResult.error, "Required assignment lookup");
  const completedPaths = new Set(pathProgress.filter((row) => text(row, "status") === "completed").map((row) => text(row, "path_id")));
  if (!paths.length || !paths.every((path) => completedPaths.has(text(path, "id"))) || !requiredAssignments.length) return false;
  const acceptedResult = await client.from("user_assignment_states").select("course_id,assignment_id,status").eq("user_id", userId).eq("status", "accepted");
  const accepted = dataOrThrow(acceptedResult.data as Row[] | null, acceptedResult.error, "Accepted assignments lookup");
  const acceptedKeys = new Set(accepted.map((row) => `${text(row, "course_id")}:${text(row, "assignment_id")}`));
  if (!requiredAssignments.every((row) => acceptedKeys.has(`${text(row, "course_id")}:${text(row, "assignment_id")}`))) return false;
  await updateKnowledgeAtLeast(client, userId, nodeId, "mastered");
  return true;
}

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  const { client, user } = await createUserSupabase(request);
  const body = request.body as { action?: "start-knowledge" | "start-assignment" | "submit-assignment" | "accept-assignment"; nodeId?: string; courseId?: string; assignmentId?: string; learnerUserId?: string; deterministicAccepted?: boolean };
  if (!body.action) throw new ApiError(400, "invalid_learning_action", "An action is required");
  if (body.action === "start-knowledge") {
    if (!body.nodeId) throw new ApiError(400, "invalid_learning_action", "nodeId is required");
    const node = await client.from("knowledge_nodes").select("id").eq("id", body.nodeId).eq("status", "active").maybeSingle();
    if (!dataOrThrow(node.data as Row | null, node.error, "Knowledge lookup")) throw new ApiError(404, "knowledge_not_found", "Knowledge is unavailable");
    await updateKnowledgeAtLeast(client, user.id, body.nodeId, "learning");
    json(response, 200, { status: "learning" }); return;
  }
  if (!body.courseId || !body.assignmentId) throw new ApiError(400, "invalid_learning_action", "courseId and assignmentId are required");
  if (body.action === "accept-assignment") {
    if (!body.learnerUserId) throw new ApiError(400, "invalid_learning_action", "learnerUserId is required");
    const server = createServerSupabase();
    const profileResult = await server.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const profile = dataOrThrow(profileResult.data as Row | null, profileResult.error, "Teacher role lookup");
    if (!profile || !["teacher", "admin"].includes(text(profile, "role"))) throw new ApiError(403, "assignment_acceptance_forbidden", "Teacher or admin permission is required");
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
      await recomputeMastery(server as typeof client, body.learnerUserId!, nodeId);
    }));
    json(response, 200, { status: "accepted", accepted: true }); return;
  }
  const assignmentResult = await client.from("course_assignments").select("*").eq("course_id", body.courseId).eq("id", body.assignmentId).maybeSingle();
  const assignment = dataOrThrow(assignmentResult.data as Row | null, assignmentResult.error, "Assignment lookup");
  if (!assignment) throw new ApiError(404, "assignment_not_found", "Assignment is unavailable");
  const now = new Date().toISOString();
  const course = await client.from("user_course_states").upsert({ user_id: user.id, course_id: body.courseId, updated_at: now });
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
      await recomputeMastery(client, user.id, nodeId);
    }));
  }
  json(response, 200, { status: nextStatus, accepted: objectivelyAcceptable });
});

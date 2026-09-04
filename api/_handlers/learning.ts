import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createServerSupabase, createUserSupabase } from "../_lib/supabase.js";
import { ApiError, handleApi, json, methodNotAllowed } from "../_lib/http.js";
import { dataOrThrow } from "../_lib/query.js";
import { updateKnowledgeAtLeast } from "../_lib/mastery.js";
import { activateCourse, requireCourseKnowledge, requirePublishedCourse } from "../_lib/courseMembership.js";
import { evaluateAssignmentResponse, parseAssignmentResponse } from "../_lib/assignmentEvaluator.js";

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
    const assignmentId = typeof request.query.assignmentId === "string" ? request.query.assignmentId : undefined;
    const learnerCourseId = typeof request.query.courseId === "string" ? request.query.courseId : undefined;
    if (assignmentId && learnerCourseId) {
      const attemptResult = await client.from("learning_attempts").select("id,attempt_number").eq("user_id",user.id).eq("course_id",learnerCourseId).eq("assignment_id",assignmentId).order("attempt_number",{ascending:false}).limit(1).maybeSingle();
      const attempt = dataOrThrow(attemptResult.data as Row|null,attemptResult.error,"Latest Assignment Attempt lookup");
      if (!attempt) { json(response,200,{result:null}); return; }
      const performanceResult = await client.from("performance_results").select("id,outcome,feedback,evaluated_at,version").eq("attempt_id",text(attempt,"id")).order("version",{ascending:false}).limit(1).single();
      const performance = dataOrThrow(performanceResult.data as Row|null,performanceResult.error,"Latest PerformanceResult lookup");
      json(response,200,{result:{attemptId:text(attempt,"id"),resultId:text(performance,"id"),outcome:text(performance,"outcome"),accepted:text(performance,"outcome")==="passed",feedback:performance.feedback,evaluatedAt:text(performance,"evaluated_at")}}); return;
    }
    const server = await requireTeacher(user.id);
    const courseId = learnerCourseId;
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
  const body = request.body as { action?: "start-material" | "start-assignment" | "submit-assignment" | "accept-assignment"; nodeId?: string; courseId?: string; materialId?: string; assignmentId?: string; learnerUserId?: string; idempotencyKey?: string; response?: unknown };
  if (!body.action) throw new ApiError(400, "invalid_learning_action", "An action is required");
  if (!["start-material","start-assignment","submit-assignment","accept-assignment"].includes(body.action)) throw new ApiError(400,"invalid_learning_action","Unsupported learning action");
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
    const reviewResult = await server.rpc("record_manual_assignment_review", { p_learner_user_id: body.learnerUserId, p_course_id: body.courseId, p_assignment_id: body.assignmentId, p_reviewer_user_id: user.id });
    dataOrThrow(reviewResult.data, reviewResult.error, "Manual Assignment acceptance");
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
  const submission = parseAssignmentResponse(body.response);
  if (!submission || !body.idempotencyKey) throw new ApiError(400, "invalid_assignment_response", "A valid response and idempotency key are required");
  const evaluation = evaluateAssignmentResponse(assignment, submission);
  const recorded = await createServerSupabase().rpc("record_assignment_attempt", {
    p_learner_user_id: user.id, p_course_id: body.courseId, p_assignment_id: body.assignmentId, p_idempotency_key: body.idempotencyKey,
    p_response: submission, p_outcome: evaluation.outcome, p_score: evaluation.score ?? null,
    p_feedback: evaluation.feedback, p_evaluator_kind: evaluation.evaluatorKind
  });
  if (recorded.error?.code === "23505") throw new ApiError(409, "assignment_idempotency_conflict", "This idempotency key was already used with a different response");
  const result = dataOrThrow(recorded.data as Row[] | null, recorded.error, "Assignment Attempt and PerformanceResult write")[0];
  if (!result) throw new Error("Assignment result write returned no result");
  const persistedResult = await createServerSupabase().from("performance_results").select("outcome,feedback").eq("id", text(result,"result_id")).single();
  const persisted = dataOrThrow(persistedResult.data as Row | null, persistedResult.error, "Persisted PerformanceResult lookup");
  const outcome = text(persisted,"outcome");
  json(response, 200, { status: outcome === "passed" ? "accepted" : outcome === "failed" ? "needs_revision" : "submitted", accepted: outcome === "passed", attemptId: text(result, "attempt_id"), resultId: text(result, "result_id"), outcome, duplicate: Boolean(result.duplicate), feedback: persisted.feedback });
});

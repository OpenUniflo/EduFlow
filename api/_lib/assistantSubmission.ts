import { ATTACHMENT_LIMIT } from "../../src/shared/assistant/attachments.js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ApiError } from "./http.js";
import { dataOrThrow } from "./query.js";
import { activateCourse, requirePublishedCourse } from "./courseMembership.js";
import { readAssignmentEligibility } from "./assignmentEligibility.js";
import { evaluateAssignmentResponse, parseAssignmentResponse } from "./assignmentEvaluator.js";
import { isArtifactPracticeExecutor } from "../../src/shared/learning/practiceBoundary.js";
import type { AssignmentResponse } from "../../src/shared/learning/assignmentAttempt.js";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key]);

export type AssistantSubmissionInput = {
  client: SupabaseClient;
  server: SupabaseClient;
  user: User;
  courseId: string;
  assignmentId: string;
  note?: string;
  link?: string;
  attachmentSourceIds?: string[];
  evaluator?: "ai" | "teacher";
  idempotencyKey: string;
};

export type AssistantSubmissionResult = {
  status: "accepted" | "needs_revision" | "submitted";
  attemptId: string;
  resultId: string;
  outcome: "passed" | "failed" | "pending";
  accepted: boolean;
  evaluatorKind?: string;
  duplicate: boolean;
  feedback?: Row;
};

function buildResponse(assignment: Row, input: AssistantSubmissionInput): AssignmentResponse {
  const note = input.note?.trim().slice(0, 8_000) ?? "";
  const link = input.link?.trim().slice(0, 2_000) ?? "";
  if (link && !/^https?:\/\/[^\s]+$/i.test(link)) throw new ApiError(400, "invalid_assignment_link", "链接必须以 http:// 或 https:// 开头");
  const body = [note, ...(link ? [`链接：${link}`] : [])].filter(Boolean).join("\n");
  const ids = [...new Set(input.attachmentSourceIds ?? [])].slice(0, ATTACHMENT_LIMIT);
  if (!body && !ids.length) throw new ApiError(400, "invalid_assignment_response", "请提供备注、链接或一份本人文件");
  const experience = (assignment.experience ?? null) as Row | null;
  const kind = experience?.type === "code" || experience?.type === "trace" ? "code" : "answer";
  const response = kind === "code"
    ? { kind: "code" as const, ...(body ? { code: body } : {}), fileName: "对话提交", ...(ids.length ? { attachmentSourceIds: ids } : {}) }
    : { kind: "answer" as const, text: body, ...(ids.length ? { attachmentSourceIds: ids } : {}) };
  const parsed = parseAssignmentResponse(response);
  if (!parsed) throw new ApiError(400, "invalid_assignment_response", "提交内容无法保存");
  return parsed;
}

/**
 * The model-called submission path. It reuses the ordinary server submission
 * rules (published Course, eligibility, attachment ownership, evaluator) and
 * the same immutable Attempt + pending Result transaction as the panel.
 */
export async function submitAssignmentFromAssistant(input: AssistantSubmissionInput): Promise<AssistantSubmissionResult> {
  const { client, server, user, courseId, assignmentId } = input;
  await requirePublishedCourse(client, courseId);
  const assignmentResult = await client.from("course_assignments").select("*").eq("course_id", courseId).eq("id", assignmentId).maybeSingle();
  const assignment = dataOrThrow(assignmentResult.data as Row | null, assignmentResult.error, "Assistant Assignment lookup");
  if (!assignment) throw new ApiError(404, "assignment_not_found", "Assignment is unavailable");
  const response = buildResponse(assignment, input);
  if (!isArtifactPracticeExecutor(assignment) && (assignment.experience as Row | null)?.type !== "workflow" && assignment.mode !== "workflow") {
    throw new ApiError(422, "practice_executor_unavailable", "这个动手任务不能通过提交收口。");
  }
  if (assignment.mode === "workflow" || (assignment.experience as Row | null)?.type === "workflow") {
    throw new ApiError(422, "workflow_submission_required", "工作流动手任务要在作品画布中提交，对话提交只适用于文本与文件成果。");
  }

  const ids = response.attachmentSourceIds ?? [];
  if (ids.length) {
    const sources = await client.from("user_evidence_sources").select("id,source_sha256")
      .in("id", ids).eq("user_id", user.id).eq("parse_status", "ready").is("archived_at", null);
    const rows = dataOrThrow(sources.data as Row[] | null, sources.error, "Assistant submission attachments");
    if (rows.length !== ids.length || rows.some((source) => !source.source_sha256)) {
      throw new ApiError(404, "practice_attachment_unavailable", "请选择本人已解析且未归档的文件。");
    }
  }

  let { eligibility } = await readAssignmentEligibility(client, user.id, courseId, assignmentId);
  if (!eligibility.canSubmit) {
    const retry = await client.from("learning_attempts").select("id").eq("user_id", user.id).eq("course_id", courseId).eq("assignment_id", assignmentId).eq("idempotency_key", input.idempotencyKey).maybeSingle();
    if (retry.data) {
      // A retry of an already acknowledged submission is read back, not written again.
    } else if (eligibility.canStart) {
      // The panel starts on the first real input; a conversational submission
      // does the same server-side before writing the Attempt.
      await activateCourse(client, user.id, courseId);
      const now = new Date().toISOString();
      const started = await server.from("user_assignment_states").upsert({
        user_id: user.id, course_id: courseId, assignment_id: assignmentId,
        status: "started", progress: 1, started_at: now, updated_at: now
      });
      dataOrThrow(started.data, started.error, "Assistant Assignment start");
      const raised = await server.rpc("start_assignment_learning_state", { p_user_id: user.id, p_course_id: courseId, p_assignment_id: assignmentId });
      dataOrThrow(raised.data, raised.error, "Assistant Assignment learning state");
      ({ eligibility } = await readAssignmentEligibility(client, user.id, courseId, assignmentId));
      if (!eligibility.canSubmit) throw new ApiError(409, "assignment_not_started", "先开始这次动手任务，再提交。");
    } else {
      throw new ApiError(409, "assignment_not_started", eligibility.reason || "先开始这次动手任务，再提交。");
    }
  }

  const evaluator: "teacher" | "ai" = input.evaluator === "ai" ? "ai" : "teacher";
  const criteria = Array.isArray(assignment.acceptance_criteria)
    ? assignment.acceptance_criteria.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
  if (evaluator === "ai" && !criteria.length) throw new ApiError(422, "ai_evaluation_criteria_unavailable", "这个实践没有可用的验收标准，请改交老师验收。");
  if (evaluator === "ai" && (assignment.mode === "workflow" || (assignment.experience as Row | null)?.type === "workflow")) {
    throw new ApiError(422, "ai_evaluation_unsupported_submission", "工作流提交需要老师验收。");
  }
  const ruleEvaluation = evaluateAssignmentResponse(assignment, response);
  const evaluation = evaluator === "ai" && ruleEvaluation.outcome === "pending"
    ? { outcome: "pending" as const, score: undefined, evaluatorKind: "ai" as const, feedback: { code: "ai_evaluation_pending", message: "提交已保存，AI 评估者正在逐条核对。", requestedEvaluator: "ai", evaluator: "ai" } }
    : ruleEvaluation;
  const recorded = await server.rpc("record_conversation_assignment_attempt", {
    p_learner_user_id: user.id, p_course_id: courseId, p_assignment_id: assignmentId,
    p_idempotency_key: input.idempotencyKey, p_response: { ...response, submissionMode: "conversation" },
    p_outcome: evaluation.outcome, p_score: evaluation.score ?? null, p_feedback: evaluation.feedback, p_evaluator_kind: evaluation.evaluatorKind
  });
  if (recorded.error?.code === "23505") throw new ApiError(409, "assignment_idempotency_conflict", "这次提交已经保存，请刷新查看结果。");
  const result = dataOrThrow(recorded.data as Row[] | null, recorded.error, "Assistant Assignment Attempt and Result")[0];
  if (!result) throw new ApiError(500, "assignment_submission_failed", "提交没有保存，请重试");
  const persisted = await server.from("performance_results").select("outcome,feedback,evaluator_kind").eq("id", text(result, "result_id")).single();
  const performance = dataOrThrow(persisted.data as Row | null, persisted.error, "Assistant submitted Result");
  const attemptRow = await server.from("learning_attempts").select("attempt_number").eq("id", text(result, "attempt_id")).maybeSingle();
  const attempt = dataOrThrow(attemptRow.data as Row | null, attemptRow.error, "Assistant submitted Attempt number");
  const outcome = text(performance, "outcome") as "passed" | "failed" | "pending";
  return {
    status: outcome === "passed" ? "accepted" : outcome === "failed" ? "needs_revision" : "submitted",
    attemptId: text(result, "attempt_id"), resultId: text(result, "result_id"), ...(attempt ? { attemptNumber: Number(attempt.attempt_number) } : {}), outcome,
    accepted: outcome === "passed", evaluatorKind: text(performance, "evaluator_kind"),
    duplicate: Boolean(result.duplicate), feedback: (performance.feedback ?? {}) as Row
  };
}

import { tool } from "ai";
import { z } from "zod";
import { getAssignmentContext } from "../assistantData.js";
import { readPracticeReview } from "../practiceContext.js";
import { submitAssignmentFromAssistant } from "../assistantSubmission.js";
import { createServerSupabase } from "../supabase.js";
import { dataOrThrow } from "../query.js";
import { assistantToolId, safeTool, type AssistantPlugin } from "./types.js";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key]);

export const assignmentPlugin: AssistantPlugin = {
  id: "assignment",
  title: "动手任务与提交",
  cards: [
    { cardType: "practice", panel: "assignment" },
    { cardType: "submission", panel: "assignment" },
    { cardType: "evaluation", panel: "assignment" }
  ],
  writes: {
    submitAssignment: {
      label: "提交动手任务",
      result: (value) => {
        const output = value && typeof value === "object" ? value as Row : {};
        const error = output.error && typeof output.error === "object" ? output.error as Row : null;
        if (error) return { ok: false, title: "提交没有成功", detail: String(error.message ?? error.code ?? "请重试") };
        const status = String(output.status ?? "");
        const ok = ["submitted", "accepted", "needs_revision"].includes(status);
        const title = status === "accepted" ? "提交已通过" : status === "needs_revision" ? "提交已保存，需要修改" : status === "submitted" ? "提交已保存，待评价" : "提交没有成功";
        const card = typeof output.courseId === "string" && typeof output.assignmentId === "string"
          ? { cardType: "practice" as const, courseId: output.courseId, assignmentId: output.assignmentId, compact: true }
          : undefined;
        return {
          ok,
          title,
          ...(typeof output.attemptNumber === "number" ? { detail: `第 ${output.attemptNumber} 次提交` } : typeof output.attemptId === "string" ? { detail: `提交编号 ${output.attemptId.slice(0, 8)}` } : {}),
          ...(typeof output.attemptId === "string" ? { attemptId: output.attemptId } : {}),
          ...(status === "submitted" && output.evaluatorKind === "ai" ? { evaluationPending: true } : {}),
          ...(card ? { card } : {})
        };
      }
    },
    withdrawAssignmentSubmission: {
      label: "撤回提交",
      result: (value) => {
        const output = value && typeof value === "object" ? value as Row : {};
        const error = output.error && typeof output.error === "object" ? output.error as Row : null;
        if (error) return { ok: false, title: "撤回没有成功", detail: String(error.message ?? error.code ?? "请重试") };
        const status = String(output.status ?? "");
        const ok = status === "withdrawn" || status === "already_withdrawn";
        const card = typeof output.courseId === "string" && typeof output.assignmentId === "string"
          ? { cardType: "practice" as const, courseId: output.courseId, assignmentId: output.assignmentId, compact: true }
          : undefined;
        return {
          ok,
          title: ok ? "已撤回" : "撤回没有成功",
          detail: ok && output.attemptNumber != null ? `第 ${Number(output.attemptNumber)} 次提交` : status === "attempt_not_found" ? "没有可撤回的提交" : undefined,
          ...(typeof output.attemptId === "string" ? { attemptId: output.attemptId } : {}),
          ...(card ? { card } : {})
        };
      }
    }
  },
  tools: ({ client, user, context, dependencies }) => ({
    getAssignmentContext: tool({
      description: "Read one Course-owned Assignment, its Knowledge coverage, direct Assignment dependencies, the learner's Assignment state, and the learner's full owned Attempt history (including withdrawn Attempts). submissionSummary contains authoritative totalSubmissions, withdrawnSubmissions, countingSubmissions and latestCountingSubmission; transcribe those numbers, never count mySubmissions yourself. Call this tool before answering any question about submission counts, history or which Attempt currently counts.",
      inputSchema: z.object({ courseId: assistantToolId, assignmentId: assistantToolId }),
      execute: ({ courseId, assignmentId }: { courseId: string; assignmentId: string }) => safeTool(() => getAssignmentContext(client, user, courseId, assignmentId))
    }),
    getPracticeReviewContext: tool({
      description: "Read the authenticated learner's formal Practice submission, original file contents, Assignment scenario/criteria, Action/Edge and latest Result/feedback. Teaching feedback only; no grading or business writes.",
      inputSchema: z.object({ attemptId: z.string().uuid() }),
      execute: ({ attemptId }: { attemptId: string }) => safeTool(() => readPracticeReview(client, user.id, attemptId))
    }),
    withdrawAssignmentSubmission: tool({
      description: "Withdraw one of the authenticated learner's own Assignment Attempts. Learner-owned and reversible, so do not ask for a confirmation card. Every call revalidates ownership, Course, Assignment and Attempt server-side. Call getAssignmentContext first and identify the exact Attempt from submissionSummary/mySubmissions; pass that attemptId. Omitting attemptId is only a fallback for the latest counting Attempt.",
      inputSchema: z.object({ courseId: assistantToolId.optional(), assignmentId: assistantToolId.optional(), attemptId: z.string().uuid().optional() }),
      execute: ({ courseId, assignmentId, attemptId }: { courseId?: string; assignmentId?: string; attemptId?: string }) => safeTool(async () => {
        let resolvedCourseId = courseId ?? context.courseId;
        let resolvedAssignmentId = assignmentId;
        let found: Row | null = null;
        if (attemptId) {
          // An explicit attempt is the target; resolve its Course/Assignment
          // from the owned row instead of requiring the model to repeat them.
          const target = await client.from("learning_attempts")
            .select("id,attempt_number,withdrawn_at,course_id,assignment_id")
            .eq("user_id", user.id).eq("id", attemptId).maybeSingle();
          found = dataOrThrow(target.data as Row | null, target.error, "Assistant withdrawal target Attempt");
          if (!found) return { status: "attempt_not_found" };
          resolvedCourseId = text(found, "course_id");
          resolvedAssignmentId = text(found, "assignment_id");
        } else {
          if (!resolvedCourseId) return { status: "attempt_not_found" };
          if (!resolvedAssignmentId) {
            const latestOpen = await client.from("learning_attempts")
              .select("assignment_id").eq("user_id", user.id).eq("course_id", resolvedCourseId)
              .is("withdrawn_at", null).order("submitted_at", { ascending: false }).limit(1).maybeSingle();
            const row = dataOrThrow(latestOpen.data as Row | null, latestOpen.error, "Assistant latest open Attempt");
            if (row) resolvedAssignmentId = text(row, "assignment_id");
          }
          if (!resolvedAssignmentId) return { status: "attempt_not_found" };
          const latest = await client.from("learning_attempts")
            .select("id,attempt_number,withdrawn_at")
            .eq("user_id", user.id).eq("course_id", resolvedCourseId).eq("assignment_id", resolvedAssignmentId)
            .is("withdrawn_at", null).order("attempt_number", { ascending: false }).limit(1).maybeSingle();
          found = dataOrThrow(latest.data as Row | null, latest.error, "Assistant withdrawal Attempt");
          if (!found) return { status: "attempt_not_found" };
        }
        if (found.withdrawn_at != null) return { status: "already_withdrawn", attemptId: text(found, "id"), attemptNumber: Number(found.attempt_number) };
        const withdrawal = await createServerSupabase().rpc("withdraw_learning_attempt", { p_user_id: user.id, p_attempt_id: text(found, "id"), p_source: "assistant" });
        if (withdrawal.error) return { status: "withdraw_failed", code: withdrawal.error.code ?? "unknown" };
        const row = (withdrawal.data as Row[] | null)?.[0] ?? {};
        console.info(`assistant_withdraw attempt=${text(found, "id")} number=${Number(found.attempt_number)}`);
        return { status: "withdrawn", courseId: resolvedCourseId, assignmentId: resolvedAssignmentId, attemptId: text(found, "id"), attemptNumber: Number(found.attempt_number), restoredStatus: row.restored_status ?? null, countedAsEvidence: false };
      })
    }),
    submitAssignment: tool({
      description: "Submit the authenticated learner's own Assignment only when the conversation clearly means to submit it (for example 帮我交 / 提交吧 / 这是结果). Do not call for 帮我看看 or a request for feedback. If it is genuinely unclear, ask one short question instead. The server revalidates the published Course, Assignment eligibility, attachment ownership and evaluator; the Attempt is immutable and AI evaluation uses the ordinary flow. Use the attachmentSourceIds from the current learner turn; omit them only when the learner attached no file. Never invent content or an attempt result.",
      inputSchema: z.object({ courseId: assistantToolId.optional(), assignmentId: assistantToolId.optional(), note: z.string().trim().max(8000).optional(), link: z.string().trim().max(2000).optional(), attachmentSourceIds: z.array(z.string().uuid()).max(4).optional(), evaluator: z.enum(["ai", "teacher"]).optional() }),
      execute: ({ courseId, assignmentId, note, link, attachmentSourceIds, evaluator }: { courseId?: string; assignmentId?: string; note?: string; link?: string; attachmentSourceIds?: string[]; evaluator?: "ai" | "teacher" }) => safeTool(async () => {
        const resolvedCourseId = courseId ?? context.courseId;
        let resolvedAssignmentId = assignmentId ?? context.assignmentId;
        if (!resolvedCourseId) return { status: "assignment_required" };
        if (!resolvedAssignmentId) {
          const latest = await client.from("learning_attempts").select("assignment_id").eq("user_id", user.id).eq("course_id", resolvedCourseId).order("submitted_at", { ascending: false }).limit(1).maybeSingle();
          const row = dataOrThrow(latest.data as Row | null, latest.error, "Assistant latest Assignment for submit");
          if (row) resolvedAssignmentId = text(row, "assignment_id");
        }
        if (!resolvedAssignmentId) return { status: "assignment_required" };
        const ids = [...new Set(attachmentSourceIds ?? dependencies.attachmentSourceIds ?? [])].slice(0, 4);
        const turnId = dependencies.turnId ?? `${Date.now()}`;
        const idempotencyKey = `assistant:${turnId}:${resolvedAssignmentId}`.slice(0, 160);
        const resolvedLink = link ?? dependencies.links?.[0];
        const submitted = await submitAssignmentFromAssistant({
          client, server: createServerSupabase(), user, courseId: resolvedCourseId, assignmentId: resolvedAssignmentId,
          ...(note ? { note } : {}), ...(resolvedLink ? { link: resolvedLink } : {}), ...(ids.length ? { attachmentSourceIds: ids } : {}),
          ...(evaluator ? { evaluator } : {}), idempotencyKey
        });
        console.info(`assistant_submit attempt=${submitted.attemptId} status=${submitted.status} outcome=${submitted.outcome}`);
        return { ...submitted, courseId: resolvedCourseId, assignmentId: resolvedAssignmentId, attachmentCount: ids.length };
      })
    })
  })
};

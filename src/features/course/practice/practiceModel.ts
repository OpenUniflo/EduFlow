import type { AssignmentFeedback, AssignmentResponse } from "@/shared/learning/assignmentAttempt";
import type { CourseAssignment } from "@/features/course/types";

/**
 * P2 presents every practice as one task: a description, an approach and one
 * submission. Historical `code` / `trace` records stay readable and submit
 * through the same file/link surface; `answer` is retired and read-only.
 */
export type PracticeCompatibility = "unified" | "legacy-code" | "legacy-trace" | "legacy-answer" | "workflow";

export type PracticeEvaluator = "teacher" | "ai";

export type PracticeResultActions = {
  showViewSubmission: boolean;
  showPracticeAgain: boolean;
};

/** Accepted work is final: only the saved submission remains. A revision can try again. */
export function practiceResultActions(tone: PracticeOutcomeTone): PracticeResultActions {
  return {
    showViewSubmission: true,
    showPracticeAgain: tone === "revision"
  };
}

/** One practice task, one attempt at a time. The number is the attempt being edited or reviewed. */
export function practiceAttemptKicker(attemptNumber: number) {
  return `动手任务 · 第 ${Math.max(1, Math.round(attemptNumber))} 次尝试`;
}

export type PracticeDraft = {
  note: string;
  link: string;
  linkedWorkName?: string;
  linkedWorkVersion?: string;
  attachmentIds: string[];
  attachmentNames: string[];
};

export type PracticeViewState = "draft" | "confirm" | "result" | "disabled" | "workflow";

export function practiceCompatibility(assignment: Pick<CourseAssignment, "mode" | "experience"> | null | undefined): PracticeCompatibility {
  if (!assignment) return "unified";
  const type = assignment.experience?.type;
  if (type === "answer") return "legacy-answer";
  if (type === "code") return "legacy-code";
  if (type === "trace") return "legacy-trace";
  if (type === "workflow" || assignment.mode === "workflow") return "workflow";
  return "unified";
}

export function practiceViewState(input: {
  compatibility: PracticeCompatibility;
  hasResult: boolean;
  confirming: boolean;
}): PracticeViewState {
  if (input.compatibility === "legacy-answer") return "disabled";
  if (input.compatibility === "workflow") return "workflow";
  if (input.hasResult) return "result";
  return input.confirming ? "confirm" : "draft";
}

export function canSubmitPractice(compatibility: PracticeCompatibility) {
  return compatibility === "unified" || compatibility === "legacy-code" || compatibility === "legacy-trace";
}

/** Opening the panel does not start; the first real edit does, once. */
export function shouldStartPracticeOnInput(input: {
  status?: string;
  canStart: boolean;
  alreadyRequested: boolean;
}) {
  if (input.alreadyRequested || !input.canStart) return false;
  return !input.status || !["submitted", "accepted", "completed"].includes(input.status);
}

/**
 * AI evaluation is only offered for text-shaped submissions with real
 * acceptance criteria. Workflow submissions and practices without criteria
 * stay with the teacher.
 */
export function aiEvaluationAvailable(
  compatibility: PracticeCompatibility,
  acceptanceCriteria: readonly string[] | null | undefined
) {
  return canSubmitPractice(compatibility) && Boolean(acceptanceCriteria?.some((criterion) => criterion.trim()));
}

/** The submission text carries a note and an optional link; both are learner-authored. */
export function practiceSubmissionText(draft: Pick<PracticeDraft, "note" | "link" | "linkedWorkName" | "linkedWorkVersion">) {
  const lines: string[] = [];
  if (draft.note.trim()) lines.push(draft.note.trim());
  if (draft.link.trim()) lines.push(`链接：${draft.link.trim()}`);
  if (draft.linkedWorkName) lines.push(`关联作品：${draft.linkedWorkName}${draft.linkedWorkVersion ? ` · ${draft.linkedWorkVersion}` : ""}`);
  return lines.join("\n");
}

/**
 * Build the immutable Attempt payload. Older code/trace Records keep their
 * server-recognised response kind so their result is still evaluated by the
 * server rather than fabricated in the browser.
 */
export function buildPracticeResponse(
  compatibility: PracticeCompatibility,
  draft: PracticeDraft
): AssignmentResponse | null {
  if (!canSubmitPractice(compatibility)) return null;
  const text = practiceSubmissionText(draft);
  const attachmentSourceIds = [...new Set(draft.attachmentIds)].slice(0, 4);
  if (!text.trim() && !attachmentSourceIds.length) return null;
  if (compatibility === "legacy-code" || compatibility === "legacy-trace") {
    return {
      kind: "code",
      ...(text.trim() ? { code: text } : {}),
      ...(draft.attachmentNames.length ? { fileName: draft.attachmentNames.slice(0, 4).join("、") } : {}),
      ...(attachmentSourceIds.length ? { attachmentSourceIds } : {})
    };
  }
  return {
    kind: "answer",
    text,
    ...(attachmentSourceIds.length ? { attachmentSourceIds } : {})
  };
}

/** Rebuild the editable draft from the previous immutable Attempt for a revision. */
export function draftFromPracticeResult(
  response: AssignmentResponse,
  attachments: ReadonlyArray<{ id: string; title: string }> = []
): PracticeDraft {
  const rawText = response.kind === "answer" ? response.text : response.kind === "code" ? response.code ?? "" : "";
  const noteLines: string[] = [];
  let link = "";
  for (const line of rawText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("链接：")) { link = trimmed.slice("链接：".length).trim(); continue; }
    if (trimmed.startsWith("关联作品：")) continue;
    noteLines.push(line);
  }
  const ids = [...new Set(response.attachmentSourceIds ?? [])].slice(0, 4);
  const attachmentNames = ids.map((id, index) => attachments.find((attachment) => attachment.id === id)?.title ?? `附件 ${index + 1}`);
  return {
    note: noteLines.join("\n").trim(),
    link,
    attachmentIds: ids,
    attachmentNames
  };
}

export type PracticeChecklistItem = {
  id: "content" | "work" | "attachment" | "note" | "link";
  label: string;
  detail: string;
  done: boolean;
  required: boolean;
};

/**
 * The server accepts any one of note, link, attachment or linked Work. Show one
 * required "submission content" condition plus optional supporting inputs; do
 * not mark each supporting input as mandatory.
 */
export function practiceChecklist(draft: PracticeDraft): PracticeChecklistItem[] {
  const hasContent = Boolean(draft.note.trim() || draft.link.trim() || draft.attachmentIds.length || draft.linkedWorkName);
  return [
    { id: "content", label: "提交内容", detail: "备注、链接、附件或关联作品至少一项", done: hasContent, required: true },
    { id: "note", label: "提交备注", detail: draft.note.trim() ? "已写明完成过程与验证结果" : "可选：完成过程、结果与边界", done: Boolean(draft.note.trim()), required: false },
    { id: "attachment", label: "附件 / 运行记录", detail: draft.attachmentNames.length ? `${draft.attachmentNames.length} 份原始文件` : "可选：上传可复核的文件", done: draft.attachmentNames.length > 0, required: false },
    { id: "link", label: "外部链接", detail: draft.link.trim() ? "已附仓库或演示链接" : "可选：仓库或演示链接", done: Boolean(draft.link.trim()), required: false },
    { id: "work", label: "关联作品", detail: draft.linkedWorkName ? `${draft.linkedWorkName}${draft.linkedWorkVersion ? ` · ${draft.linkedWorkVersion}` : ""}` : "可选：从我的作品选择", done: Boolean(draft.linkedWorkName), required: false }
  ];
}

export function practiceChecklistCounts(items: readonly PracticeChecklistItem[]) {
  const required = items.filter((item) => item.required);
  return { attached: required.filter((item) => item.done).length, total: required.length };
}

export const evaluatorOptions: ReadonlyArray<{ id: PracticeEvaluator; label: string; detail: string }> = [
  { id: "teacher", label: "教师", detail: "提交给老师验收，结果由老师给出。" },
  { id: "ai", label: "AI 评估者", detail: "提交后由 AI 评估者逐条核对验收标准，通常几十秒内返回；结果会保存。" }
];

export type PracticeOutcomeTone = "accepted" | "revision" | "pending" | "evaluating" | "unavailable" | "handed_off";

export type PracticeOutcomeView = {
  tone: PracticeOutcomeTone;
  label: string;
  detail: string;
};

/** Learner-facing copy is owned by feedback code, never by evaluator prose. */
const PRACTICE_FEEDBACK_TEXT: Record<string, string> = {
  manual_review_required: "提交内容已记录，等待老师验收。",
  ai_evaluation_pending: "提交内容已记录，AI 评估者正在逐条核对验收标准。",
  ai_evaluation_passed: "所有验收标准均已通过，正式结果已保存。",
  ai_evaluation_needs_revision: "有验收标准尚未满足，请根据逐条反馈补充后再次提交。",
  ai_evaluation_handed_off: "这次提交已改交老师验收，结果会保存在同一条提交里。",
  ai_evaluation_unavailable: "AI 评估者暂时无法完成评价，本次提交仍然保留。可以重试或改交老师。",
  teacher_accepted: "老师已通过这次提交，正式结果已保存。",
  trace_response_invalid: "这次回答与任务要求不一致，请重新查看执行记录后再提交。",
  trace_root_cause_found: "你找到了最早出错的步骤。",
  trace_root_cause_missed: "还没有找到最早出错的步骤，请重新查看执行记录。",
  response_kind_mismatch: "提交内容与任务要求不一致，请按任务要求重新提交。"
};

export function practiceFeedbackText(code?: string, outcome?: string) {
  const mapped = code ? PRACTICE_FEEDBACK_TEXT[code] : undefined;
  if (mapped) return mapped;
  if (outcome === "passed") return "已通过验收，正式结果已保存。";
  if (outcome === "failed" || outcome === "needs_revision") return "这次提交未通过，请根据反馈调整后再次提交。";
  return "提交已记录，等待评估者验收。";
}

/** Internal delivery codes (e.g. CH01.R10.REACT_TRACE) are not learner copy. */
export function referencesKnowledgeMasteryCriterion(criterion: string) {
  return /mastery[_\s-]*criteria/i.test(criterion);
}

/** Learner-facing criteria never expose field names; references expand to real Chinese standards. */
export function learnerAcceptanceCriteria(
  acceptanceCriteria: readonly string[],
  knowledge: ReadonlyArray<{ id: string; masteryCriteria: readonly string[] }>
) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const criterion of acceptanceCriteria) {
    if (!referencesKnowledgeMasteryCriterion(criterion)) {
      if (!seen.has(criterion)) { seen.add(criterion); result.push(criterion); }
      continue;
    }
    const expanded = knowledge.flatMap((item) => item.masteryCriteria.map((text) => text.trim()).filter(Boolean));
    if (!expanded.length) {
      const fallback = "掌握标准暂不可用，请改交老师验收。";
      if (!seen.has(fallback)) { seen.add(fallback); result.push(fallback); }
      continue;
    }
    for (const text of expanded) {
      if (seen.has(text)) continue;
      seen.add(text);
      result.push(text);
    }
  }
  return result;
}

export function isLearnerFacingExpectedOutput(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  return /[\s\u4e00-\u9fff]/.test(trimmed);
}

export function practiceEvaluatorLabel(feedback?: AssignmentFeedback) {
  return feedback?.evaluator === "ai" || feedback?.evaluatorKind === "ai" ? "AI 评估者" : "教师";
}

export function practiceOutcomeView(input: {
  outcome?: string;
  accepted?: boolean;
  feedbackCode?: string;
  feedbackMessage?: string;
  evaluator?: string;
  evaluationStatus?: string;
}): PracticeOutcomeView {
  const ai = input.evaluator === "ai";
  if (input.accepted || input.outcome === "passed") {
    return {
      tone: "accepted",
      label: ai ? "已通过 AI 评价" : "已通过教师验收",
      detail: input.feedbackMessage || practiceFeedbackText(input.feedbackCode, input.outcome)
    };
  }
  if (input.outcome === "failed" || input.outcome === "needs_revision") {
    return {
      tone: "revision",
      label: "需要修改",
      detail: input.feedbackMessage || practiceFeedbackText(input.feedbackCode, input.outcome)
    };
  }
  if (ai && input.evaluationStatus === "handed_off") {
    return { tone: "handed_off", label: "已改交老师", detail: practiceFeedbackText("ai_evaluation_handed_off", input.outcome) };
  }
  if (ai && input.evaluationStatus === "failed") {
    return { tone: "unavailable", label: "评价暂时不可用", detail: practiceFeedbackText("ai_evaluation_unavailable", input.outcome) };
  }
  if (ai) {
    return { tone: "evaluating", label: "评价中", detail: "AI 评估者正在逐条核对验收标准，你可以先离开，结果会保存在这次提交里。" };
  }
  return { tone: "pending", label: "待教师评价", detail: practiceFeedbackText(input.feedbackCode, input.outcome) };
}

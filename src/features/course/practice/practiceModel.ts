import type { AssignmentResponse } from "@/shared/learning/assignmentAttempt";
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

/** Accepted work is final: only the saved submission remains. A revision or preview can try again. */
export function practiceResultActions(tone: "accepted" | "revision" | "pending" | "preview", preview: boolean): PracticeResultActions {
  return {
    showViewSubmission: true,
    showPracticeAgain: tone === "revision" || preview
  };
}

/** One practice task, one attempt at a time. The number is the attempt being edited or reviewed. */
export function practiceAttemptKicker(attemptNumber: number) {
  return `实践 · 第 ${Math.max(1, Math.round(attemptNumber))} 次尝试`;
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

/** The submission text carries a note and an optional link; both are learner-authored. */
export function practiceSubmissionText(draft: Pick<PracticeDraft, "note" | "link" | "linkedWorkName" | "linkedWorkVersion">) {
  const lines: string[] = [];
  if (draft.note.trim()) lines.push(draft.note.trim());
  if (draft.link.trim()) lines.push(`链接：${draft.link.trim()}`);
  if (draft.linkedWorkName) lines.push(`关联作品：${draft.linkedWorkName}${draft.linkedWorkVersion ? ` · ${draft.linkedWorkVersion}` : " · 版本以预览保存"}`);
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


export type PracticeChecklistItem = {
  id: "work" | "attachment" | "note" | "link";
  label: string;
  detail: string;
  done: boolean;
  required: boolean;
};

/** Draft deliverables shown as the requirements checklist (never a fake score). */
export function practiceChecklist(draft: PracticeDraft): PracticeChecklistItem[] {
  return [
    { id: "work", label: "交付作品", detail: draft.linkedWorkName ? `${draft.linkedWorkName}${draft.linkedWorkVersion ? ` · ${draft.linkedWorkVersion}` : ""}` : "从我的作品选择一个版本", done: Boolean(draft.linkedWorkName), required: true },
    { id: "attachment", label: "附件 / 运行记录", detail: draft.attachmentNames.length ? `${draft.attachmentNames.length} 份原始文件` : "上传可复核的文件", done: draft.attachmentNames.length > 0, required: true },
    { id: "note", label: "提交备注", detail: draft.note.trim() ? "已写明复现命令与边界" : "复现命令、结果与边界", done: Boolean(draft.note.trim()), required: true },
    { id: "link", label: "外部链接", detail: draft.link.trim() ? "已附仓库或演示链接" : "仓库或演示链接（可选）", done: Boolean(draft.link.trim()), required: false }
  ];
}

export function practiceChecklistCounts(items: readonly PracticeChecklistItem[]) {
  const required = items.filter((item) => item.required);
  return { attached: required.filter((item) => item.done).length, total: required.length };
}

export const evaluatorOptions: ReadonlyArray<{ id: PracticeEvaluator; label: string; detail: string; preview: boolean }> = [
  { id: "teacher", label: "教师", detail: "提交给老师验收，结果由老师给出。", preview: false },
  { id: "ai", label: "AI 评估者", detail: "预览：可体验评价结果，不会保存到正式记录。", preview: true }
];

export type PracticeOutcomeView = {
  tone: "accepted" | "revision" | "pending" | "preview";
  label: string;
  detail: string;
};

export function practiceOutcomeView(input: { outcome?: string; accepted?: boolean; preview: boolean; feedback?: string }): PracticeOutcomeView {
  if (input.preview) {
    return { tone: "preview", label: "预览评价", detail: "4 项评分中 3 项满足；预览结果不会保存，也不会改变学习记录。" };
  }
  if (input.accepted || input.outcome === "passed") {
    return { tone: "accepted", label: "已通过教师验收", detail: input.feedback ?? "正式结果已保存。" };
  }
  if (input.outcome === "failed" || input.outcome === "needs_revision") {
    return { tone: "revision", label: "需修改", detail: input.feedback ?? "教师已退回，请根据反馈再次提交。" };
  }
  return { tone: "pending", label: "待教师评价", detail: input.feedback ?? "提交已记录，等待教师验收。" };
}

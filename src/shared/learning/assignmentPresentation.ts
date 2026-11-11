/**
 * One learner-facing vocabulary for a Course Assignment (动手任务). Every card,
 * panel, task row and course view reads these labels instead of keeping its own
 * copy. The evaluator kind only changes whether the learner is waiting for AI
 * or a teacher; it never changes the object identity.
 */
export type AssignmentLifecycleStatus =
  | "not_started"
  | "not-started"
  | "started"
  | "in-progress"
  | "submitted"
  | "needs_revision"
  | "accepted"
  | "completed";

export type AssignmentPresentationTone = "ok" | "warn" | "brand" | "quiet";

export type AssignmentPresentation = {
  label: string;
  tone: AssignmentPresentationTone;
  detail: string;
};

export function hasStartedAssignment(status?: string): boolean {
  return Boolean(status && status !== "not_started" && status !== "not-started");
}

export function assignmentStatusPresentation(
  status?: string,
  evaluation?: { status?: string; evaluator?: string; outcome?: string } | null
): AssignmentPresentation {
  if (status === "accepted" || status === "completed" || evaluation?.outcome === "passed") {
    return { label: "已通过", tone: "ok", detail: "结果已保存。" };
  }
  if (status === "needs_revision" || evaluation?.outcome === "failed") {
    return { label: "需要修改", tone: "warn", detail: "根据上次反馈补充后再交。" };
  }
  if (status === "submitted") {
    if (evaluation?.status === "handed_off" || (evaluation?.evaluator && evaluation.evaluator !== "ai")) {
      return { label: "待老师评价", tone: "quiet", detail: "提交已保存，等待老师验收。" };
    }
    return { label: "待评价", tone: "warn", detail: "提交已保存，评价结果会写回这里。" };
  }
  if (status === "started" || status === "in-progress") {
    return { label: "进行中", tone: "brand", detail: "在右侧工作区继续；提交后内容会被保存。" };
  }
  return { label: "未开始", tone: "quiet", detail: "打开动手任务开始。" };
}

/** The action label follows the real lifecycle state; it never promises a page jump. */
export function assignmentActionLabel(status?: string, evaluation?: { outcome?: string } | null): string {
  const label = assignmentStatusPresentation(status, evaluation).label;
  if (label === "已通过") return "查看结果";
  if (label === "需要修改") return "补充后再交";
  if (label === "进行中") return "继续动手任务";
  return "打开动手任务";
}

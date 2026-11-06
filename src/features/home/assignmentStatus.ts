import type { UserAssignmentStatus } from "@/features/course/types";

/** A practice is only "started" once the learner state says so. Opening a panel is not a start. */
export function hasStartedAssignment(status?: UserAssignmentStatus): boolean {
  return Boolean(status && status !== "not_started" && status !== "not-started");
}

export type PracticeStatusView = {
  label: "未开始" | "进行中" | "评价中" | "需要修改" | "已通过" | "待老师评价";
  tone: "quiet" | "brand" | "pending" | "warn" | "ok";
  detail: string;
};

/** One display mapping for every surface that shows an Assignment lifecycle. */
export function practiceStatusView(
  status?: UserAssignmentStatus,
  evaluation?: { status?: string; evaluator?: string; outcome?: string } | null
): PracticeStatusView {
  if (status === "accepted" || status === "completed" || evaluation?.outcome === "passed") {
    return { label: "已通过", tone: "ok", detail: "结果已保存。" };
  }
  if (status === "needs_revision" || evaluation?.outcome === "failed") {
    return { label: "需要修改", tone: "warn", detail: "根据上次反馈补充后再交。" };
  }
  if (status === "submitted") {
    if (evaluation?.status === "handed_off" || evaluation?.evaluator !== "ai") {
      return { label: "待老师评价", tone: "pending", detail: "提交已保存，等待老师验收。" };
    }
    return { label: "评价中", tone: "pending", detail: "AI 评估者正在核对，结果会保存；可以先离开。" };
  }
  if (status === "started" || status === "in-progress") {
    return { label: "进行中", tone: "brand", detail: "在右侧工作区继续；提交后内容会被保存。" };
  }
  return { label: "未开始", tone: "quiet", detail: "打开动手任务开始。" };
}

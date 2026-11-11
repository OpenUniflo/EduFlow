import type { UserAssignmentStatus } from "@/features/course/types";
import { assignmentStatusPresentation, hasStartedAssignment } from "@/shared/learning/assignmentPresentation";

export { hasStartedAssignment };

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
  const presentation = assignmentStatusPresentation(status, evaluation);
  const label = presentation.label === "待评价" ? "评价中" : presentation.label;
  const tone = presentation.label === "待评价" ? "pending" : presentation.tone;
  return { label: label as PracticeStatusView["label"], tone, detail: presentation.detail };
}

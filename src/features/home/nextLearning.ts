import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { NavigationDecision } from "@/shared/learning/navigation";

export type NextLearningSummary = { title: string; minutes?: number };

/**
 * The header and Continue card restate the deterministic Navigation decision,
 * never the first pending Assignment. Duration is read from the concrete
 * resource the decision selected; when any identity is missing we render
 * nothing rather than guessing a next step.
 */
export function resolveNextLearningSummary(input: {
  decision?: NavigationDecision | null;
  runtime?: CourseRuntimeData | null;
  microMinutes?(nodeId: string, pathId?: string): number | undefined;
  displayTitle?(nodeId: string, pathId?: string): string | undefined;
}): NextLearningSummary | null {
  const { decision, runtime } = input;
  if (!decision || !runtime || decision.courseId !== runtime.course.id) return null;
  const action = decision.nextAction;
  if (!action.nodeId) return null;
  const pathTitle = decision.path.find((item) => item.nodeId === action.nodeId)?.title?.trim();
  const displayTitle = action.resourceKind === "micro" ? input.displayTitle?.(action.nodeId, action.resourceId)?.trim() : undefined;
  const title = displayTitle || pathTitle;
  if (!title) return null;
  let minutes: number | undefined;
  if (action.resourceKind === "micro") minutes = input.microMinutes?.(action.nodeId, action.resourceId);
  else if (action.resourceKind === "assignment") minutes = runtime.assignments.find((assignment) => assignment.id === action.resourceId)?.estimatedMinutes;
  else if (action.resourceKind === "material") {
    const duration = runtime.materials.find((material) => material.id === action.resourceId)?.duration;
    const parsed = duration ? Number.parseInt(duration, 10) : Number.NaN;
    minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return { title, ...(minutes && minutes > 0 ? { minutes } : {}) };
}

export function nextLearningLabel(summary: NextLearningSummary | null) {
  if (!summary) return "";
  return `下一步「${summary.title}」${summary.minutes ? ` · 约 ${summary.minutes} 分钟` : ""}`;
}

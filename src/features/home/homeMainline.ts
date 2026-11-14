import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { NavigationDecision } from "@/shared/learning/navigation";
import type { FirstSegment } from "@/shared/learning/firstSegment";
export { resolveHomeNextStep, type HomeNextStep } from "@/features/course/path/mainlineNext";

/**
 * Home has exactly two states. A learner with any history lands directly in a
 * conversation: the last conversation when one exists, otherwise a new one
 * with the next-step strip. Only "no conversation and no learning record" is
 * the first-run open question.
 */
export type HomeView = "fresh" | "conversation";

export function deriveHomeView(input: {
  hasLearningRecord: boolean;
  hasConversation: boolean;
}): HomeView {
  if (!input.hasLearningRecord && !input.hasConversation) return "fresh";
  return "conversation";
}

export type HomeNavId = "home" | "archive" | "works" | "records" | "teaching" | "admin";

/**
 * Authenticated navigation is stable: every logged-in learner always gets
 * 首页 / 作品 / 记录 / 地图 in that order, independent of learning state.
 * Teachers and admins keep their role entries after the learner set. Guests
 * only receive 首页; other destinations stay reachable by URL, ⌘K and the
 * Assistant.
 */
export function deriveHomeNavigation(input: {
  isTeacher: boolean;
  isAdmin: boolean;
}): HomeNavId[] {
  return [
    "home",
    "works",
    "records",
    "archive",
    ...(input.isTeacher || input.isAdmin ? ["teaching" as const] : []),
    ...(input.isAdmin ? ["admin" as const] : [])
  ];
}

export function homeRouteProgress(segment: FirstSegment): string {
  return `${segment.completedCount} / ${segment.steps.length} 步`;
}

export function shouldShowStarter(input: {
  configuredCourseId?: string | null;
  hasCourse: boolean;
  segmentStarted: boolean;
}): boolean {
  return Boolean(input.configuredCourseId && input.hasCourse && !input.segmentStarted);
}

/**
 * Next-step strip progress label. The first segment keeps its route-card
 * denominator (`segment.completedCount / segment.steps.length`) until it is
 * complete; only then does it become the broader course route.
 */
export function routeStripLabel(
  segment: { complete: boolean; completedCount: number; steps: readonly unknown[] } | null | undefined,
  chapter?: { learnedCount: number; nodeIds: readonly unknown[] } | null
): string {
  if (!segment) return "";
  if (!segment.complete) return `第一段 ${segment.completedCount}/${segment.steps.length}`;
  if (chapter) return `路线 ${chapter.learnedCount}/${chapter.nodeIds.length}`;
  return `路线 ${segment.completedCount}/${segment.steps.length}`;
}

/** A first segment is complete only after every real step (Micro + task) passed. */
export function firstSegmentComplete(segment: FirstSegment): boolean {
  return segment.complete;
}

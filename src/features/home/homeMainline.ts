import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { NavigationDecision } from "@/shared/learning/navigation";
import type { FirstSegment } from "@/shared/learning/firstSegment";
export { resolveHomeNextStep, type HomeNextStep } from "@/features/course/path/mainlineNext";

/** Home has exactly three states; all are derived from real data. */
export type HomeView = "fresh" | "learning" | "returning";

export function deriveHomeView(input: {
  hasLearningRecord: boolean;
  hasConversation: boolean;
  /** Set only by an explicit Continue / send / start action in this visit. */
  resumed?: boolean;
}): HomeView {
  if (!input.hasLearningRecord && !input.hasConversation) return "fresh";
  if (input.hasLearningRecord && !input.resumed) return "returning";
  return "learning";
}

export type HomeNavSignals = {
  hasLearningRecord: boolean;
  hasPracticeActivity: boolean;
  hasFirstSegmentComplete: boolean;
};

export type HomeNavId = "home" | "archive" | "works" | "records" | "teaching" | "admin";

/**
 * Default navigation grows from real learner state. It is not a level or an
 * unlock store: every hidden destination remains reachable by URL, ⌘K and the
 * Assistant. Teachers and admins always receive their full set.
 */
export function deriveHomeNavigation(input: {
  isTeacher: boolean;
  isAdmin: boolean;
  signals: HomeNavSignals;
}): HomeNavId[] {
  if (input.isTeacher || input.isAdmin) {
    return [
      "home",
      "archive",
      "works",
      "records",
      ...(input.isTeacher || input.isAdmin ? ["teaching" as const] : []),
      ...(input.isAdmin ? ["admin" as const] : [])
    ];
  }
  return [
    "home",
    ...(input.signals.hasPracticeActivity ? ["works" as const] : []),
    ...(input.signals.hasLearningRecord ? ["records" as const] : []),
    ...(input.signals.hasFirstSegmentComplete ? ["archive" as const] : [])
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

/** A first segment is complete only after every real step (Micro + task) passed. */
export function firstSegmentComplete(segment: FirstSegment): boolean {
  return segment.complete;
}

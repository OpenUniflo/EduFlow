import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { NavigationDecision } from "@/shared/learning/navigation";

export type HomeNextStep = {
  courseId: string;
  courseTitle: string;
  kind: "micro" | "practice" | "material";
  title: string;
  minutes?: number;
  nodeId?: string;
  knowledgeId?: string;
  pathId?: string;
  assignmentId?: string;
};

/**
 * Presentation adapter for the one server-owned Next Action. The first-segment
 * placement is already applied by `readNavigationDecision`; this function only
 * maps the action to the concrete Course title/duration. It never falls back to
 * the first active Knowledge or a guessed title: missing identities render none.
 */
export function resolveHomeNextStep(input: {
  decision?: NavigationDecision | null;
  runtime?: CourseRuntimeData | null;
  microTitle?: string;
  microMinutes?: number;
}): HomeNextStep | null {
  const { decision, runtime } = input;
  if (!runtime || !decision || decision.courseId !== runtime.course.id) return null;
  const action = decision.nextAction;
  if (action.resourceKind === "course") return null;
  const pathTitle = action.nodeId ? decision.path.find((item) => item.nodeId === action.nodeId)?.title?.trim() : undefined;
  const assignment = action.resourceKind === "assignment" && action.resourceId
    ? runtime.assignments.find((item) => item.id === action.resourceId)
    : undefined;
  const title = action.resourceKind === "micro"
    ? input.microTitle?.trim() || pathTitle
    : action.resourceKind === "assignment"
      ? assignment?.title?.trim() || pathTitle
      : pathTitle;
  if (!title) return null;
  const minutes = action.resourceKind === "micro"
    ? input.microMinutes
    : action.resourceKind === "assignment"
      ? assignment?.estimatedMinutes
      : undefined;
  return {
    courseId: runtime.course.id,
    courseTitle: runtime.course.title,
    kind: action.resourceKind === "assignment" ? "practice" : action.resourceKind,
    title,
    ...(minutes && minutes > 0 ? { minutes } : {}),
    ...(action.nodeId ? { nodeId: action.nodeId, knowledgeId: action.nodeId } : {}),
    ...(action.resourceKind === "micro" && action.resourceId ? { pathId: action.resourceId } : {}),
    ...(action.resourceKind === "assignment" && action.resourceId ? { assignmentId: action.resourceId } : {})
  };
}


import type { FirstSegment } from "./firstSegment";
import type { NavigationNextAction, NavigationPlan } from "./navigation";

/**
 * One deterministic next-step calculation shared by the navigation API, the
 * Assistant navigation tool, candidate snapshots and every Home entry.
 *
 * The navigation engine owns the Course learning frontier. The first segment
 * is the one place where a real Assignment closes that segment before the next
 * Micro; when the segment's opening task is still open, it becomes the single
 * Next Action. Nothing is invented: the Assignment identity comes from the
 * segment's real Course structure, and the segment itself comes from explicit
 * curriculum order plus the learner's durable state.
 */
export function mainlineNextAction(decision: NavigationPlan, segment: FirstSegment | null | undefined): NavigationNextAction {
  const current = segment?.started && !segment.complete ? segment.currentStep : undefined;
  if (!current || current.kind !== "practice") return decision.nextAction;
  if (decision.nextAction.resourceKind === "assignment" && decision.nextAction.resourceId === current.assignmentId && decision.nextAction.nodeId === current.nodeId) {
    return decision.nextAction;
  }
  return {
    kind: "practice",
    nodeId: current.nodeId,
    resourceKind: "assignment",
    resourceId: current.assignmentId,
    reasonCode: "complete_required_assignment",
    reason: "要点已经学过，接下来动手做一次。"
  };
}

/** Apply the shared first-segment rule without mutating the navigation plan. */
export function applyMainlineNext<T extends NavigationPlan>(decision: T, segment: FirstSegment | null | undefined): T {
  const nextAction = mainlineNextAction(decision, segment);
  if (nextAction === decision.nextAction) return decision;
  return { ...decision, nextAction };
}

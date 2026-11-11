/**
 * Exactly one right-hand panel is active at a time. The running Micro is not a
 * right-panel state: its `form === "side"` decides the side placement, and
 * opening My/the route/a task closes that side form (see MicroHost).
 *
 * Every learner-facing object has one panel. A panel may offer an explicit
 * "open page" or "expand" action; cards never navigate by themselves.
 */
export type RightPanel =
  | { kind: "none" }
  | { kind: "my" }
  | { kind: "route"; courseId: string; chapterId?: string; nodeId?: string }
  | { kind: "practice"; courseId: string; assignmentId: string; title: string; attemptId?: string }
  | { kind: "knowledge"; nodeId: string }
  | { kind: "material"; courseId: string; materialId: string; segmentId?: string }
  | { kind: "records" }
  | { kind: "brief"; messageId: string };

export type RightPanelAction =
  | { type: "close" }
  | { type: "open-my" }
  | { type: "open-route"; courseId: string; chapterId?: string; nodeId?: string }
  | { type: "open-practice"; panel: Extract<RightPanel, { kind: "practice" }> }
  | { type: "open-knowledge"; nodeId: string }
  | { type: "open-material"; courseId: string; materialId: string; segmentId?: string }
  | { type: "open-records" }
  | { type: "open-brief"; messageId: string }
  | { type: "open-panel"; panel: RightPanel };

/** Only an actual URL panel-param change may drive My; route/task URL cleanup must not bounce back. */
export function panelParamAction(previous: boolean, next: boolean, active: RightPanel["kind"]): RightPanelAction | null {
  if (previous === next) return null;
  if (next) return { type: "open-my" };
  return active === "my" ? { type: "close" } : null;
}

export function reduceRightPanel(_state: RightPanel, action: RightPanelAction): RightPanel {
  switch (action.type) {
    case "close": return { kind: "none" };
    case "open-my": return { kind: "my" };
    case "open-route": return {
      kind: "route",
      courseId: action.courseId,
      ...(action.chapterId ? { chapterId: action.chapterId } : {}),
      ...(action.nodeId ? { nodeId: action.nodeId } : {})
    };
    case "open-practice": return action.panel;
    case "open-knowledge": return { kind: "knowledge", nodeId: action.nodeId };
    case "open-material": return {
      kind: "material",
      courseId: action.courseId,
      materialId: action.materialId,
      ...(action.segmentId ? { segmentId: action.segmentId } : {})
    };
    case "open-records": return { kind: "records" };
    case "open-brief": return { kind: "brief", messageId: action.messageId };
    case "open-panel": return action.panel;
  }
}

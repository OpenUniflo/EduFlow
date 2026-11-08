/**
 * Exactly one right-hand panel is active at a time. The running Micro is not a
 * right-panel state: its `form === "side"` decides the side placement, and
 * opening My/the route/a task closes that side form (see MicroHost).
 */
export type RightPanel =
  | { kind: "none" }
  | { kind: "my" }
  | { kind: "route"; courseId: string }
  | { kind: "practice"; courseId: string; assignmentId: string; title: string }
  | { kind: "knowledge"; nodeId: string };

export type RightPanelAction =
  | { type: "close" }
  | { type: "open-my" }
  | { type: "open-route"; courseId: string }
  | { type: "open-practice"; panel: Extract<RightPanel, { kind: "practice" }> }
  | { type: "open-knowledge"; nodeId: string };

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
    case "open-route": return { kind: "route", courseId: action.courseId };
    case "open-practice": return action.panel;
    case "open-knowledge": return { kind: "knowledge", nodeId: action.nodeId };
  }
}

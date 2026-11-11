/**
 * Exactly one right-hand panel is active at a time. The running Micro is not a
 * right-panel state: its `form === "side"` decides the side placement, and
 * opening My/the route/a task closes that side form (see MicroHost).
 *
 * Every panel change remembers the panel it replaced, so My can open its Course
 * route (back to My) and My can open over a task without losing that task's
 * mounted context (back to the task). This is one previous-panel rule, not a
 * per-surface branch.
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
  | { type: "back" }
  | { type: "open-my" }
  | { type: "open-route"; courseId: string; chapterId?: string; nodeId?: string }
  | { type: "open-practice"; panel: Extract<RightPanel, { kind: "practice" }> }
  | { type: "open-knowledge"; nodeId: string }
  | { type: "open-material"; courseId: string; materialId: string; segmentId?: string }
  | { type: "open-records" }
  | { type: "open-brief"; messageId: string }
  | { type: "open-panel"; panel: RightPanel };

export type RightPanelState = {
  current: RightPanel;
  history: readonly RightPanel[];
};

export const NO_PANEL: RightPanel = { kind: "none" };

export function initialRightPanelState(current: RightPanel = NO_PANEL): RightPanelState {
  return { current, history: [] };
}

/** The panel a Back control would return to. */
export function previousRightPanel(state: RightPanelState): RightPanel {
  return state.history[state.history.length - 1] ?? NO_PANEL;
}

/** Stable identity for one panel; presentation payload such as a title may refresh in place. */
export function panelKey(panel: RightPanel): string {
  switch (panel.kind) {
    case "none": return "none";
    case "my": return "my";
    case "route": return `route:${panel.courseId}:${panel.chapterId ?? ""}:${panel.nodeId ?? ""}`;
    case "practice": return `practice:${panel.courseId}:${panel.assignmentId}:${panel.attemptId ?? ""}`;
    case "knowledge": return `knowledge:${panel.nodeId}`;
    case "material": return `material:${panel.courseId}:${panel.materialId}:${panel.segmentId ?? ""}`;
    case "records": return "records";
    case "brief": return `brief:${panel.messageId}`;
  }
}

/** One visible return label for the panel opened over another panel. */
export function panelBackLabel(panel: RightPanel): string {
  switch (panel.kind) {
    case "my": return "返回我的";
    case "route": return "返回路线";
    case "practice": return "返回动手任务";
    case "knowledge": return "返回知识点";
    case "material": return "返回资料";
    case "records": return "返回记录";
    case "brief": return "返回课程简报";
    case "none": return "返回";
  }
}

function openPanel(state: RightPanelState, next: RightPanel): RightPanelState {
  const nextKey = panelKey(next);
  if (panelKey(state.current) === nextKey) return { current: next, history: state.history };
  if (state.current.kind === "none") return { current: next, history: [] };
  // An already-visited panel is a return target, not a new layer. Rewind to it
  // and drop the panels opened after it so a loop cannot grow the stack.
  const previousIndex = state.history.findIndex((panel) => panelKey(panel) === nextKey);
  if (previousIndex >= 0) return { current: next, history: state.history.slice(0, previousIndex) };
  return { current: next, history: [...state.history, state.current] };
}

/** Only an actual URL panel-param change may drive My; route/task URL cleanup must not bounce back. */
export function panelParamAction(previous: boolean, next: boolean, active: RightPanel["kind"]): RightPanelAction | null {
  if (previous === next) return null;
  if (next) return { type: "open-my" };
  return active === "my" ? { type: "close" } : null;
}

export function reduceRightPanel(state: RightPanelState, action: RightPanelAction): RightPanelState {
  switch (action.type) {
    case "close": return initialRightPanelState();
    case "back": return {
      current: previousRightPanel(state),
      history: state.history.slice(0, -1)
    };
    case "open-my": return openPanel(state, { kind: "my" });
    case "open-route": return openPanel(state, {
      kind: "route",
      courseId: action.courseId,
      ...(action.chapterId ? { chapterId: action.chapterId } : {}),
      ...(action.nodeId ? { nodeId: action.nodeId } : {})
    });
    case "open-practice": return openPanel(state, action.panel);
    case "open-knowledge": return openPanel(state, { kind: "knowledge", nodeId: action.nodeId });
    case "open-material": return openPanel(state, {
      kind: "material",
      courseId: action.courseId,
      materialId: action.materialId,
      ...(action.segmentId ? { segmentId: action.segmentId } : {})
    });
    case "open-records": return openPanel(state, { kind: "records" });
    case "open-brief": return openPanel(state, { kind: "brief", messageId: action.messageId });
    case "open-panel": return openPanel(state, action.panel);
  }
}

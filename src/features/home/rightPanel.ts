import type { MicroLearningPath } from "@/features/learning/micro/microLearning";

/** Exactly one right-hand surface is active at a time. */
export type RightPanel =
  | { kind: "none" }
  | { kind: "my" }
  | { kind: "route" }
  | { kind: "micro"; knowledgeId: string; courseId?: string; pathId: string; path: MicroLearningPath }
  | { kind: "practice"; courseId: string; assignmentId: string; title: string };

export type RightPanelAction =
  | { type: "close" }
  | { type: "open-my" }
  | { type: "open-route" }
  | { type: "open-micro"; panel: Extract<RightPanel, { kind: "micro" }> }
  | { type: "open-practice"; panel: Extract<RightPanel, { kind: "practice" }> };

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
    case "open-route": return { kind: "route" };
    case "open-micro": return action.panel;
    case "open-practice": return action.panel;
  }
}

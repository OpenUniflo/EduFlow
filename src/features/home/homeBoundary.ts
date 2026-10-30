export type HomeBoundary = "loading" | "error" | "new-user" | "ready";

/**
 * Boundary state is derived only from real inputs: the session data gate, the
 * loader error and whether the learner has any active Knowledge or course state.
 * Nothing here invents progress for a new or failed account.
 */
export function resolveHomeBoundary(input: {
  loading: boolean;
  error?: string | null;
  activeKnowledgeCount: number;
  activeCourseCount: number;
  hasAnyLearningRecord: boolean;
}): HomeBoundary {
  if (input.loading) return "loading";
  if (input.error) return "error";
  if (input.activeKnowledgeCount === 0 && input.activeCourseCount === 0 && !input.hasAnyLearningRecord) return "new-user";
  return "ready";
}

/** Error banner copy is shared by the Home conversation and the My panel. */
export function homeBoundaryMessage(boundary: HomeBoundary) {
  switch (boundary) {
    case "loading":
      return "正在整理你的学习情况";
    case "error":
      return "学习数据加载失败，请检查网络后重试。";
    case "new-user":
      return "从一个目标开始";
    default:
      return "";
  }
}

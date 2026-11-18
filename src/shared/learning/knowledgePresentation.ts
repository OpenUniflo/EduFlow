export type KnowledgeState = "explore" | "learning" | "learned" | "practicing" | "mastered";
export type KnowledgeScope = "global" | "tenant" | "user";

/**
 * One learner-facing vocabulary for a Knowledge node in every surface: answer
 * cards, Archive search/detail, Course tree, route and Profile. A surface may
 * add a local presentation marker such as "当前", but the object's own state
 * and scope always come from here.
 */
export const knowledgeStateLabel: Record<KnowledgeState, string> = {
  explore: "未开始",
  learning: "在学",
  learned: "已学",
  practicing: "动手任务中",
  mastered: "已掌握"
};

/**
 * Scope answers "who can see this Knowledge", not "how well do I know it".
 * "公开可见" is deliberately a visibility phrase; the old "公开知识" read like
 * a mastery or provenance badge and conflicted with the state label.
 */
export const knowledgeScopeLabel: Record<KnowledgeScope, string> = {
  global: "公开可见",
  tenant: "组织可见",
  user: "仅自己可见"
};

export function knowledgeStateLabelFor(status: string | undefined | null): string {
  return status && status in knowledgeStateLabel
    ? knowledgeStateLabel[status as KnowledgeState]
    : knowledgeStateLabel.explore;
}

export function knowledgeScopeLabelFor(scope: string | undefined | null): string {
  return scope === "tenant" || scope === "user" ? knowledgeScopeLabel[scope] : knowledgeScopeLabel.global;
}

export function knowledgeStateTone(status: KnowledgeState): "ok" | "warn" | "brand" | "quiet" {
  if (status === "mastered" || status === "learned") return "ok";
  if (status === "practicing" || status === "learning") return "brand";
  return "quiet";
}

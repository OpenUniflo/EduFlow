export type KnowledgeState = "explore" | "learning" | "learned" | "practicing" | "mastered";

/** One learner-facing vocabulary for a Knowledge node in the Archive and Course views. */
export const knowledgeStateLabel: Record<KnowledgeState, string> = {
  explore: "尚未具备",
  learning: "在学",
  learned: "已学",
  practicing: "动手任务中",
  mastered: "已掌握"
};

export function knowledgeStateTone(status: KnowledgeState): "ok" | "warn" | "brand" | "quiet" {
  if (status === "mastered" || status === "learned") return "ok";
  if (status === "practicing" || status === "learning") return "brand";
  return "quiet";
}

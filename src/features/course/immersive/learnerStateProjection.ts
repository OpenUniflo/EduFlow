import type { UserKnowledgeRecord, UserKnowledgeStatus } from "@/features/profile/types";

/**
 * Course-immersive learner state is a read-only projection over durable
 * UserKnowledgeState. Course reachability (courseUnlockPolicy) and route
 * membership are intentionally not inputs: they are not learning evidence.
 */
export type LearnerStateCategory = "acquired" | "learning" | "pending";
export type LearnerStateLabel = "已学" | "在学" | "待学";

export type LearnerNodeState = {
  nodeId: string;
  /** Null means the course Knowledge has no durable UserKnowledgeState yet. */
  status: UserKnowledgeStatus | null;
  category: LearnerStateCategory;
  label: LearnerStateLabel;
  current: boolean;
};

export type LearnerStateCounts = {
  /** learned | practicing | mastered, the mutually exclusive 已学 bucket. */
  acquired: number;
  learning: number;
  pending: number;
  /** acquired + learning + pending. Always equals the Course Knowledge count. */
  total: number;
  /** Presentation target dimension; overlaps status and is never added to total. */
  target: number;
  current: number;
  currentId: string | null;
  mastered: number;
  learned: number;
  practicing: number;
  explore: number;
};

export type LearnerStateProjection = {
  counts: LearnerStateCounts;
  nodes: LearnerNodeState[];
};

export function learnerCategory(status: UserKnowledgeStatus | null | undefined): LearnerStateCategory {
  if (status === "learned" || status === "practicing" || status === "mastered") return "acquired";
  if (status === "learning") return "learning";
  return "pending";
}

export function learnerLabel(category: LearnerStateCategory): LearnerStateLabel {
  if (category === "acquired") return "已学";
  if (category === "learning") return "在学";
  return "待学";
}

/** Stage/CSS status for dots and capsules; never used as the legend's source. */
export function learnerStageStatus(category: LearnerStateCategory): "completed" | "learning" | "locked" {
  if (category === "acquired") return "completed";
  if (category === "learning") return "learning";
  return "locked";
}

/**
 * Deterministic current item follows curriculum order: the earliest explicitly
 * in-progress Knowledge, then the earliest learned/practicing Knowledge. It is
 * one item or none, never one per route node.
 */
export function summarizeLearnerState(records: readonly UserKnowledgeRecord[], courseNodeIds: readonly string[]): LearnerStateProjection {
  const ids = [...new Set(courseNodeIds)];
  const courseIds = new Set(ids);
  const byNode = new Map<string, UserKnowledgeRecord>();
  records.forEach((record) => {
    if (courseIds.has(record.nodeId) && !byNode.has(record.nodeId)) byNode.set(record.nodeId, record);
  });
  const currentId = ids.find((id) => byNode.get(id)?.status === "learning")
    ?? ids.find((id) => {
      const status = byNode.get(id)?.status;
      return status === "learned" || status === "practicing";
    })
    ?? null;
  const nodes = ids.map((nodeId): LearnerNodeState => {
    const status = byNode.get(nodeId)?.status ?? null;
    const category = learnerCategory(status);
    return { nodeId, status, category, label: learnerLabel(category), current: nodeId === currentId };
  });
  const counts = nodes.reduce<LearnerStateCounts>((result, node) => {
    if (node.category === "acquired") result.acquired += 1;
    else if (node.category === "learning") result.learning += 1;
    else result.pending += 1;
    if (node.status === "mastered") result.mastered += 1;
    else if (node.status === "learned") result.learned += 1;
    else if (node.status === "practicing") result.practicing += 1;
    else if (node.status === "explore") result.explore += 1;
    return result;
  }, {
    acquired: 0, learning: 0, pending: 0, total: nodes.length,
    target: nodes.filter((node) => node.category !== "acquired").length,
    current: currentId ? 1 : 0, currentId,
    mastered: 0, learned: 0, practicing: 0, explore: 0
  });
  return { counts, nodes };
}

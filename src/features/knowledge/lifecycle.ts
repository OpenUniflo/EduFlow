import type {
  KnowledgeEvidence,
  KnowledgeMastery,
  KnowledgeNode,
  KnowledgeNodeRevision
} from "./types";

export type SplitKnowledgeResult = {
  source: KnowledgeNode;
  children: KnowledgeNode[];
  inheritedMastery: KnowledgeMastery[];
  evidence: KnowledgeEvidence[];
};

export function splitKnowledgeNode(
  source: KnowledgeNode,
  children: KnowledgeNode[],
  sourceMastery: KnowledgeMastery | undefined,
  evidence: KnowledgeEvidence[]
): SplitKnowledgeResult {
  if (children.length < 2) throw new Error("A split must create at least two atomic nodes.");
  const childIds = new Set(children.map((child) => child.id));
  if (childIds.size !== children.length || childIds.has(source.id)) throw new Error("Split children must have unique new identities.");
  const normalizedChildren = children.map((child) => ({ ...child, splitFrom: source.id }));
  return {
    source: { ...source, status: "superseded", supersededBy: normalizedChildren.map((child) => child.id) },
    children: normalizedChildren,
    inheritedMastery: sourceMastery ? normalizedChildren.map((child) => ({
      nodeId: child.id,
      mastery: sourceMastery.mastery,
      masteryOrigin: "inherited-from-split",
      sourceNodeId: source.id,
      updatedAt: sourceMastery.updatedAt
    })) : [],
    evidence: evidence.map((item) => item.nodeId === source.id
      ? { ...item, alsoSupportsNodeIds: Array.from(new Set([...(item.alsoSupportsNodeIds ?? []), ...normalizedChildren.map((child) => child.id)])) }
      : item)
  };
}

export type MergeKnowledgeResult = {
  sources: KnowledgeNode[];
  merged: KnowledgeNode;
  inheritedMastery?: KnowledgeMastery;
  evidence: KnowledgeEvidence[];
};

export function mergeKnowledgeNodes(
  sources: KnowledgeNode[],
  merged: KnowledgeNode,
  sourceMastery: KnowledgeMastery[],
  evidence: KnowledgeEvidence[]
): MergeKnowledgeResult {
  if (sources.length < 2) throw new Error("A merge must combine at least two nodes.");
  if (sources.some((source) => source.id === merged.id)) throw new Error("A merge must create a new stable identity.");
  const sourceIds = sources.map((source) => source.id);
  const masteryByNode = new Map(sourceMastery.map((record) => [record.nodeId, record]));
  const available = sourceIds.flatMap((id) => masteryByNode.get(id) ? [masteryByNode.get(id) as KnowledgeMastery] : []);
  if (available.length > 0 && available.length !== sources.length) {
    throw new Error("Merge mastery requires one score for every source node.");
  }
  return {
    sources: sources.map((source) => ({ ...source, status: "superseded", supersededBy: [merged.id] })),
    merged: { ...merged, mergedFrom: sourceIds },
    inheritedMastery: available.length ? {
      nodeId: merged.id,
      mastery: available.reduce((sum, record) => sum + record.mastery, 0) / sources.length,
      masteryOrigin: "inherited-from-merge",
      sourceNodeIds: available.map((record) => record.nodeId)
    } : undefined,
    evidence: evidence.map((item) => sourceIds.includes(item.nodeId)
      ? { ...item, alsoSupportsNodeIds: Array.from(new Set([...(item.alsoSupportsNodeIds ?? []), merged.id])) }
      : item)
  };
}

export function publishKnowledgeRevision(
  node: KnowledgeNode,
  revision: KnowledgeNodeRevision
): KnowledgeNode {
  if (revision.nodeId !== node.id) throw new Error("Revision must target the stable node identity.");
  return {
    ...node,
    title: revision.title,
    description: revision.description,
    type: revision.type,
    masteryCriteria: revision.masteryCriteria,
    currentRevisionId: revision.id,
    updatedAt: revision.createdAt
  };
}

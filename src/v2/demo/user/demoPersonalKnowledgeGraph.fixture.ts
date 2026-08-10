import { globalKnowledgeGraph } from "../../knowledge/graph";
import type { KnowledgeEdge, KnowledgeGraph, KnowledgeNode, KnowledgeNodeRevision } from "../../knowledge/types";
import type { UserKnowledgeRecord, UserKnowledgeStatus } from "../../profile/types";

export const demoUserNode: KnowledgeNode = {
  id: "U-DEMO-01",
  title: "Agent 报告中的引用核验",
  description: "依据课程资料逐条核验 Agent 报告中的来源覆盖、可追溯性和引用准确性。",
  type: "procedural",
  masteryCriteria: [
    "能定位报告中每个可验证事实对应的来源",
    "能识别引用缺失、错配和来源不支持结论的情况",
    "能给出保留证据谱系的修订结果"
  ],
  scope: "user",
  ownerId: "student@knowledge-atlas.local",
  provenance: [{ sourceType: "course", sourceId: "agentic-ai", discoveredAt: "2026-07-12T08:00:00.000Z" }],
  currentRevisionId: "U-DEMO-01-r1",
  status: "active",
  createdAt: "2026-07-12T08:00:00.000Z",
  updatedAt: "2026-07-12T08:00:00.000Z"
};

export const demoUserRevision: KnowledgeNodeRevision = {
  id: demoUserNode.currentRevisionId,
  nodeId: demoUserNode.id,
  version: 1,
  title: demoUserNode.title,
  description: demoUserNode.description,
  type: demoUserNode.type,
  masteryCriteria: demoUserNode.masteryCriteria,
  createdBy: "demo-user",
  createdAt: demoUserNode.createdAt as string,
  changeReason: "Extracted from the user's course material"
};

export const demoUserRelation: KnowledgeEdge = {
  id: "user-edge-citation-verification",
  source: "K16",
  target: demoUserNode.id,
  relation: "enables",
  strength: 0.84,
  reason: "Citation construction enables systematic verification of cited claims."
};

export const demoPersonalKnowledgeGraph: KnowledgeGraph = {
  ...globalKnowledgeGraph,
  nodes: [...globalKnowledgeGraph.nodes, demoUserNode],
  revisions: [...globalKnowledgeGraph.revisions, demoUserRevision],
  edges: [...globalKnowledgeGraph.edges, demoUserRelation]
};

function courseEvidence(nodeId: string, lesson: number, alsoSupportsNodeIds?: string[]) {
  const node = demoPersonalKnowledgeGraph.nodes.find((item) => item.id === nodeId);
  return [{
    id: `evidence-${nodeId}-${lesson}`,
    nodeId,
    nodeRevisionId: node?.currentRevisionId,
    type: "course",
    label: `Agentic AI · 第 ${lesson} 课`,
    refId: lesson === 4 ? "lesson-04" : "agentic-ai",
    alsoSupportsNodeIds
  }];
}

function inheritedSplitRecords(
  sourceNodeId: string,
  successorIds: string[],
  status: UserKnowledgeStatus,
  mastery: number,
  updatedAt: string,
  lesson?: number
): UserKnowledgeRecord[] {
  const evidence = lesson ? courseEvidence(sourceNodeId, lesson, successorIds) : undefined;
  return successorIds.map((nodeId) => ({
    nodeId,
    status,
    mastery,
    masteryOrigin: "inherited-from-split",
    sourceNodeId,
    updatedAt,
    evidence
  }));
}

export const demoUserKnowledge: UserKnowledgeRecord[] = [
  { nodeId: "PY01", status: "mastered", mastery: 100, masteryOrigin: "direct", updatedAt: "2026-06-01T08:00:00.000Z" },
  { nodeId: "PY06", status: "mastered", mastery: 100, masteryOrigin: "direct", updatedAt: "2026-06-03T08:00:00.000Z" },
  { nodeId: "PY08", status: "mastered", mastery: 94, masteryOrigin: "direct", updatedAt: "2026-06-05T08:00:00.000Z" },
  { nodeId: "PY18", status: "mastered", mastery: 92, masteryOrigin: "direct", updatedAt: "2026-06-08T08:00:00.000Z" },
  { nodeId: "PY34", status: "mastered", mastery: 88, masteryOrigin: "direct", updatedAt: "2026-06-10T08:00:00.000Z" },
  { nodeId: "PY45", status: "mastered", mastery: 91, masteryOrigin: "direct", updatedAt: "2026-06-13T08:00:00.000Z" },
  { nodeId: "PY46", status: "mastered", mastery: 90, masteryOrigin: "direct", updatedAt: "2026-06-16T08:00:00.000Z" },
  ...inheritedSplitRecords("PY53", ["PY99", "PY54", "PY55"], "mastered", 82, "2026-06-19T08:00:00.000Z"),
  { nodeId: "PY56", status: "mastered", mastery: 86, masteryOrigin: "direct", updatedAt: "2026-06-22T08:00:00.000Z" },
  { nodeId: "PY57", status: "mastered", mastery: 84, masteryOrigin: "direct", updatedAt: "2026-06-25T08:00:00.000Z" },
  { nodeId: "PY58", status: "mastered", mastery: 80, masteryOrigin: "direct", updatedAt: "2026-06-28T08:00:00.000Z" },
  ...inheritedSplitRecords("PY61", ["PY100", "PY63"], "learning", 46, "2026-07-20T08:00:00.000Z"),
  { nodeId: "PY62", status: "learning", mastery: 34, masteryOrigin: "direct", updatedAt: "2026-07-24T08:00:00.000Z" },
  ...inheritedSplitRecords("H01", ["AG01", "H02", "H03"], "mastered", 100, "2026-07-01T08:00:00.000Z", 1),
  { nodeId: "P01", status: "mastered", mastery: 100, masteryOrigin: "direct", updatedAt: "2026-07-03T08:00:00.000Z", evidence: courseEvidence("P01", 2) },
  { nodeId: "P05", status: "mastered", mastery: 100, masteryOrigin: "direct", updatedAt: "2026-07-05T08:00:00.000Z", evidence: courseEvidence("P05", 2) },
  ...inheritedSplitRecords("A05", ["A01", "A02"], "mastered", 100, "2026-07-08T08:00:00.000Z", 3),
  { nodeId: "I01", status: "mastered", mastery: 82, masteryOrigin: "direct", updatedAt: "2026-07-10T08:00:00.000Z", evidence: courseEvidence("I01", 7) },
  { nodeId: "RT01", status: "mastered", mastery: 76, masteryOrigin: "direct", updatedAt: "2026-07-11T08:00:00.000Z", evidence: courseEvidence("RT01", 10) },
  { nodeId: "U-DEMO-01", status: "mastered", mastery: 88, masteryOrigin: "direct", updatedAt: "2026-07-18T08:00:00.000Z", evidence: courseEvidence("U-DEMO-01", 9) },
  ...inheritedSplitRecords("R05", ["R03", "R04", "R11", "R06", "R07", "R08", "R09"], "learning", 55, "2026-07-28T08:00:00.000Z", 4),
  ...inheritedSplitRecords("R02", ["R01", "R10"], "learning", 58, "2026-07-30T08:00:00.000Z", 4)
];

import { describe, expect, it } from "vitest";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { KnowledgeGraph } from "@/features/knowledge/types";
import type { DomainGovernanceState } from "@/features/knowledge/domain/DomainGovernanceRepository";
import { buildArchiveModel, searchArchive } from "./atlasModel";

const node = (id: string, title: string, scope: "global" | "tenant" | "user", status: "active" | "deprecated" = "active") => ({
  id, title, description: `${title} description mentions retrieval`, type: "conceptual" as const, masteryCriteria: [], scope, status,
  provenance: [{ sourceType: "manual" as const, sourceId: id }], currentRevisionId: `${id}-r1`
});

const graph: KnowledgeGraph = {
  nodes: [node("G1", "RAG 检索增强", "global"), node("G2", "向量检索", "global"), node("T1", "组织内 Agent", "tenant"), node("D1", "已弃用知识", "global", "deprecated")],
  revisions: [],
  edges: [
    { id: "e1", source: "G1", target: "G2", relation: "prerequisite", strength: "hard", reason: "factual" },
    { id: "e2", source: "G2", target: "T1", relation: "enables", strength: 1, reason: "factual" },
    { id: "e3", source: "G1", target: "D1", relation: "related", strength: 1, reason: "factual" }
  ]
};

const governance: DomainGovernanceState = {
  domains: [{ id: "d1", name: "检索", canonicalColor: "#6F8FEA", status: "active", createdBy: "t", createdAt: "t", updatedBy: "t", updatedAt: "t" }],
  assignments: [{ nodeId: "G1", domainId: "d1", source: "admin", pinned: true, assignedBy: "t", assignedAt: "t" }],
  candidates: [], proposals: [], revision: 0
};

const runtime = {
  course: { id: "c1", title: "RAG 实战", description: "检索课程", lifecycle: "published", courseType: "standard" },
  curriculum: { id: "cur", courseId: "c1", generationMode: "manual" },
  chapters: [{ id: "ch1", courseId: "c1", title: "第一章", description: "", order: 1, color: "#6F8FEA" }],
  lessons: [{ id: "l1", courseId: "c1", chapterId: "ch1", title: "第一课", description: "", order: 1, durationMinutes: 10 }],
  curriculumCoverages: [
    { id: "cov1", courseId: "c1", lessonId: "l1", nodeId: "G1", role: "introduce", order: 1 },
    { id: "cov2", courseId: "c1", lessonId: "l1", nodeId: "G2", role: "reinforce", order: 2 }
  ],
  curriculumSequences: [], assignments: [], assignmentCoverages: [], assignmentDependencies: [], chapterOutcomes: [], assignmentOutcomeCompositions: [], finalProjects: [], finalProjectOutcomeCompositions: [], materials: [], materialKnowledgeCoverages: [], revision: "r1"
} as unknown as CourseRuntimeData;

const records = [
  { nodeId: "G1", status: "learning" as const, updatedAt: new Date().toISOString() },
  { nodeId: "G2", status: "mastered" as const, updatedAt: new Date().toISOString() }
];

describe("Archive projection", () => {
  it("keeps every active visible node and factual edge, with the learner subset as an overlay", () => {
    const model = buildArchiveModel({ graph, governance, runtimes: [runtime], records });
    expect(model.nodes.map((item) => item.id)).toEqual(["G1", "G2", "T1"]);
    expect(model.edges.map((item) => item.id)).toEqual(["e1", "e2"]);
    expect(model.mineNodeIds).toEqual(new Set(["G1", "G2"]));
    expect(model.nodeById.get("G1")).toMatchObject({ isMine: true, status: "learning", color: "var(--domain-1)", domainColorIndex: 0, domainTitle: "检索" });
    expect(model.nodeById.get("T1")).toMatchObject({ isMine: false, status: "explore", scope: "tenant" });
    expect(model.nodeById.get("G1")?.isCurrent).toBe(true);
    expect(model.nodes).toHaveLength(3);
    expect(model.edges).toHaveLength(2);
    expect(model.stats).toMatchObject({ totalNodes: 3, totalEdges: 2, mine: 2, learning: 1, mastered: 1 });
    expect(model.hasLearningHistory).toBe(true);
  });

  it("uses real course coverage for the course overlay and never invents a course knowledge fact", () => {
    const model = buildArchiveModel({ graph, governance, runtimes: [runtime], records: [] });
    expect(model.courses).toHaveLength(1);
    expect(model.courses[0].coveredKnowledgeIds).toEqual(["G1", "G2"]);
    expect(model.courses[0].knowledgeCount).toBe(2);
    expect(model.courses[0].state).toBe("recommended");
  });

  it("is empty when the learner has no UserKnowledgeState", () => {
    const model = buildArchiveModel({ graph, governance, runtimes: [runtime], records: [] });
    expect(model.hasLearningHistory).toBe(false);
    expect(model.stats.mine).toBe(0);
    expect(model.nodes.every((item) => !item.isMine)).toBe(true);
  });

  it("searches knowledge, courses and preview people without changing graph facts", () => {
    const model = buildArchiveModel({ graph, governance, runtimes: [runtime], records });
    const result = searchArchive(model, "检索", [{ id: "p1", displayName: "示例 · 阿青", handle: "@preview-aqing", accent: "cyan", visibility: "public", sharedKnowledgeCount: 1, sharedKnowledgeIds: ["G1"], activityLabel: "示例", sample: true }]);
    expect(new Set(result?.knowledge.items.map((item) => item.node.id))).toEqual(new Set(["G1", "G2"]));
    expect(result?.knowledge.items[0].hitIndex).toBe(0);
    expect(result?.courses.items[0].course.id).toBe("c1");
    expect(result?.people.items[0].person.id).toBe("p1");
    expect(new Set(result?.mapHitIds)).toEqual(new Set(["G1", "G2"]));
    expect(model.nodes).toHaveLength(3);
    expect(searchArchive(model, "量子计算")?.empty).toBe(true);
    expect(searchArchive(model, "   ")).toBeNull();
  });

  it("renders Global-only for an anonymous graph", () => {
    const globalGraph = { ...graph, nodes: graph.nodes.filter((item) => item.scope === "global" && item.status === "active"), edges: graph.edges.filter((edge) => edge.id !== "e2") };
    const model = buildArchiveModel({ graph: globalGraph, governance, runtimes: [], records: [] });
    expect(model.nodes.every((item) => item.scope === "global")).toBe(true);
    expect(model.nodes.some((item) => item.isMine)).toBe(false);
    expect(model.stats.mine).toBe(0);
  });
});

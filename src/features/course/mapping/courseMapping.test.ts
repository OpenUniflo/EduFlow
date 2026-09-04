import { describe, expect, it } from "vitest";
import type { CourseRuntimeData } from "../runtime/courseRuntime";
import type { KnowledgeNode } from "@/features/knowledge/types";
import { resolveMaterialCoverage } from "./materialCoverage";
import { retrieveDependencyCandidates, validateAssignmentDAG } from "./assignmentDag";
import { parseGeneratedAssignments, parseImplementationSteps } from "./schema";
import { buildCourseMappingPlan } from "./mappingPlan";
import { matchGoldOutcomesByAssignmentSet, matchGoldPracticesByKnowledgeSet } from "./evaluation";

const runtime: CourseRuntimeData = {
  course: { id: "course-1", title: "Agent", description: "Agent course", targetOutcome: "Build a reliable Agent", generationStatus: "curriculum-generated" },
  curriculum: { id: "curriculum-1", courseId: "course-1", generationMode: "auto" },
  chapters: [{ id: "chapter-1", courseId: "course-1", title: "Foundations", description: "", order: 0, color: "#000", outcome: "Architecture report" }],
  lessons: [{ id: "lesson-1", courseId: "course-1", chapterId: "chapter-1", title: "Basics", order: 0 }],
  curriculumCoverages: [
    { id: "cc-1", courseId: "course-1", lessonId: "lesson-1", nodeId: "node-1", role: "introduce", order: 0 },
    { id: "cc-2", courseId: "course-1", lessonId: "lesson-1", nodeId: "node-2", role: "introduce", order: 1 }
  ], curriculumSequences: [], assignments: [], assignmentCoverages: [], assignmentDependencies: [], chapterOutcomes: [], assignmentOutcomeCompositions: [], finalProjects: [], finalProjectOutcomeCompositions: [],
  materials: [{ id: "material-1", courseId: "course-1", order: 0, title: "Book", type: "pdf", source: { kind: "pdf", url: "/book.pdf", pageCount: 2 }, segments: [{ id: "page-1", order: 0, page: 1 }, { id: "page-2", order: 1, page: 2 }] }],
  materialKnowledgeCoverages: [], revision: "run-1"
};
const node = (id: string, pages: number[]): KnowledgeNode => ({ id, title: id, description: id, type: "conceptual", masteryCriteria: ["explain"], scope: "user", ownerId: "user-1", currentRevisionId: `${id}-r1`, status: "active", provenance: [{ sourceType: "material", sourceId: "material-1", materialId: "material-1", courseId: "course-1", sourceLocations: pages.map((page) => ({ rawBlockId: `b-${page}`, ordinal: page, sectionPath: ["Chapter"], page })) }] });

describe("Phase 4.3 course mapping core", () => {
  it("resolves Phase 4.2 PDF provenance to formal N:M coverage without semantic search", () => {
    const result = resolveMaterialCoverage(runtime, [node("node-1", [1, 2]), node("node-2", [2])]);
    expect(result.unresolved).toEqual([]);
    expect(result.coverages.map(({ segmentId, nodeId, role }) => ({ segmentId, nodeId, role }))).toEqual([
      { segmentId: "page-1", nodeId: "node-1", role: "explain" }, { segmentId: "page-2", nodeId: "node-1", role: "explain" }, { segmentId: "page-2", nodeId: "node-2", role: "explain" }
    ]);
  });

  it("reports an honest unresolved non-PDF source instead of guessing by order", () => {
    const documentRuntime = { ...runtime, materials: [{ ...runtime.materials[0], type: "document" as const, source: undefined, segments: [{ id: "block-1", order: 0 }] }] };
    const result = resolveMaterialCoverage(documentRuntime, [node("node-1", [1])]);
    expect(result.coverages).toEqual([]);
    expect(result.unresolved[0].reason).toBe("source-location-has-no-segment");
  });

  it("supports one-to-many and many-to-one AssignmentCoverage at schema validation", () => {
    const assignments = parseGeneratedAssignments({ assignments: [
      { semanticKey: "integrated", title: "Integrated", description: "Apply both", requirements: ["r"], expectedOutput: "artifact", acceptanceCriteria: ["works"], mode: "instruction", knowledgeNodeIds: ["node-1", "node-2"] },
      { semanticKey: "second", title: "Second", description: "Apply one again", requirements: ["r"], expectedOutput: "note", acceptanceCriteria: ["clear"], mode: "instruction", knowledgeNodeIds: ["node-1"] }
    ] }, new Set(["node-1", "node-2"]), new Set());
    expect(assignments).toHaveLength(2);
    expect(assignments.flatMap((item) => item.knowledgeNodeIds)).toEqual(["node-1", "node-2", "node-1"]);
  });

  it("validates goal-constrained Steps against real Course Knowledge and full coverage", () => {
    const steps = parseImplementationSteps({ steps: [{ stepKey: "build", title: "Build", objective: "Integrate both", knowledgeNodeIds: ["node-1", "node-2"] }] }, "course-1", new Set(["node-1", "node-2"]));
    expect(steps).toHaveLength(1);
    expect(steps[0].knowledgeNodeIds).toEqual(["node-1", "node-2"]);
    expect(() => parseImplementationSteps({ steps: [{ stepKey: "x", title: "X", objective: "X", knowledgeNodeIds: [] }] }, "course-1", new Set(["node-1"]))).toThrow(/non-empty/);
    expect(() => parseImplementationSteps({ steps: [{ stepKey: "x", title: "X", objective: "X", knowledgeNodeIds: ["unknown"] }] }, "course-1", new Set(["node-1"]))).toThrow(/outside/);
    expect(() => parseImplementationSteps({ steps: [{ stepKey: "x", title: "X", objective: "X", knowledgeNodeIds: ["node-1"] }] }, "course-1", new Set(["node-1", "node-2"]))).toThrow(/without coverage/);
  });

  it("detects DAG failures and redundant transitive edges deterministically", () => {
    const assignments = ["a", "b", "c"].map((semanticKey) => ({ semanticKey, title: semanticKey, description: semanticKey, requirements: ["r"], expectedOutput: "o", acceptanceCriteria: ["c"], mode: "instruction" as const, knowledgeNodeIds: ["node-1"] }));
    const dependency = (sourceSemanticKey: string, targetSemanticKey: string) => ({ sourceSemanticKey, targetSemanticKey, strength: "hard" as const, rationale: "direct" });
    const report = validateAssignmentDAG(assignments, [dependency("a", "b"), dependency("b", "c"), dependency("a", "c")]);
    expect(report.redundantTransitiveEdges.map((edge) => `${edge.sourceSemanticKey}->${edge.targetSemanticKey}`)).toEqual(["a->c"]);
    expect(validateAssignmentDAG(assignments, [dependency("a", "a")]).selfEdges).toHaveLength(1);
    expect(validateAssignmentDAG(assignments, [dependency("a", "missing")]).danglingEdges).toHaveLength(1);
    expect(validateAssignmentDAG(assignments, [dependency("a", "b"), dependency("a", "b")]).duplicateEdges).toHaveLength(1);
    expect(validateAssignmentDAG(assignments, [dependency("a", "b"), dependency("b", "a")]).cycles).toBe(true);
  });

  it("recalls earlier Assignments through indirect prerequisite ancestors", () => {
    const assignments = ["a", "b", "c"].map((semanticKey, index) => ({ semanticKey, title: semanticKey, description: semanticKey, requirements: ["r"], expectedOutput: "o", acceptanceCriteria: ["c"], mode: "instruction" as const, knowledgeNodeIds: [`node-${index + 1}`] }));
    const edges = [{ id: "e1", source: "node-1", target: "node-2", relation: "prerequisite" as const, reason: "", strength: "hard" as const }, { id: "e2", source: "node-2", target: "node-3", relation: "prerequisite" as const, reason: "", strength: "hard" as const }];
    expect(retrieveDependencyCandidates(assignments[2], assignments, edges).map((item) => item.semanticKey)).toEqual(["b", "a"]);
  });

  it("matches Gold Practice by required Knowledge before semantic similarity", () => {
    const assignments = ["a", "b"].map((id, order) => ({ id, courseId: "course-1", order, title: id, description: id, requirements: ["r"], expectedOutput: "o", acceptanceCriteria: ["c"], mode: "instruction" as const }));
    const result = matchGoldPracticesByKnowledgeSet({ knowledgePracticeLinks: [{ knowledgeNodeId: "K1", practiceId: "P1" }], knowledgeNodeIdByGold: new Map([["K1", "node-1"]]), assignments, assignmentCoverages: [{ id: "ac-a", assignmentId: "a", nodeId: "node-1", role: "practice" }, { id: "ac-b", assignmentId: "b", nodeId: "node-2", role: "practice" }], semanticScores: new Map([["P1:a", 0.1], ["P1:b", 0.99]]) });
    expect(result.matches.get("P1")).toBe("a");
  });

  it("allows several Gold Practices to resolve to one integrated Assignment", () => {
    const assignments = [{ id: "integrated", courseId: "course-1", order: 0, title: "Integrated", description: "", requirements: ["r"], expectedOutput: "o", acceptanceCriteria: ["c"], mode: "instruction" as const }];
    const result = matchGoldPracticesByKnowledgeSet({ knowledgePracticeLinks: [{ knowledgeNodeId: "K1", practiceId: "P1" }, { knowledgeNodeId: "K2", practiceId: "P2" }], knowledgeNodeIdByGold: new Map([["K1", "node-1"], ["K2", "node-2"]]), assignments, assignmentCoverages: [{ id: "a", assignmentId: "integrated", nodeId: "node-1", role: "practice" }, { id: "b", assignmentId: "integrated", nodeId: "node-2", role: "practice" }] });
    expect(result.matches).toEqual(new Map([["P1", "integrated"], ["P2", "integrated"]]));
  });

  it("matches Outcomes by composed Assignment set before text similarity", () => {
    const result = matchGoldOutcomesByAssignmentSet({ chapterOutcomes: [{ id: "O1", practiceIds: ["P1"] }], assignmentIdByGoldPractice: new Map([["P1", "a"]]), outcomes: [{ id: "oa", courseId: "course-1", chapterId: "c1", title: "A" }, { id: "ob", courseId: "course-1", chapterId: "c2", title: "B" }], assignmentOutcomeCompositions: [{ id: "x", assignmentId: "a", outcomeId: "oa" }, { id: "y", assignmentId: "b", outcomeId: "ob" }], semanticScores: new Map([["O1:oa", 0.1], ["O1:ob", 0.99]]) });
    expect(result.matches.get("O1")).toBe("oa");
  });

  it("reports a Practice as upstream blocked when its Gold Knowledge is missing", () => {
    const result = matchGoldPracticesByKnowledgeSet({ knowledgePracticeLinks: [{ knowledgeNodeId: "K21", practiceId: "P1" }], knowledgeNodeIdByGold: new Map(), assignments: [], assignmentCoverages: [] });
    expect(result.upstreamBlocked).toEqual([{ practiceId: "P1", missingGoldKnowledgeIds: ["K21"] }]);
  });

  it("builds stable Assignment, Outcome, and FinalProject composition identities", () => {
    const generation = { materialCoverage: resolveMaterialCoverage(runtime, [node("node-1", [1]), node("node-2", [2])]), steps: [{ semanticKey: "integrated", title: "Integrated", objective: "Apply", knowledgeNodeIds: ["node-1", "node-2"] }], assignments: [{ semanticKey: "integrated", title: "Integrated", description: "Apply", requirements: ["r"], expectedOutput: "artifact", acceptanceCriteria: ["works"], mode: "instruction" as const, knowledgeNodeIds: ["node-1", "node-2"] }], dependencies: [], executions: [] };
    const first = buildCourseMappingPlan(runtime, generation);
    const second = buildCourseMappingPlan(runtime, generation);
    expect(second).toEqual(first);
    expect(first.assignmentCoverages).toHaveLength(2);
    expect(first.assignmentOutcomeCompositions).toHaveLength(1);
    expect(first.finalProjectOutcomeCompositions).toHaveLength(1);
    expect(first.finalProjects[0].description).toContain("Build a reliable Agent");
  });
});

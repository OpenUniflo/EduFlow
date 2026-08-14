import { describe, expect, it } from "vitest";
import type { CourseRuntimeData } from "../runtime/courseRuntime";
import type { KnowledgeNode } from "@/features/knowledge/types";
import { resolveMaterialCoverage } from "./materialCoverage";
import { validateAssignmentDAG } from "./assignmentDag";
import { parseGeneratedAssignments } from "./schema";
import { buildCourseMappingPlan } from "./mappingPlan";

const runtime: CourseRuntimeData = {
  course: { id: "course-1", title: "Agent", description: "Agent course", generationStatus: "curriculum-generated" },
  curriculum: { id: "curriculum-1", courseId: "course-1", generationMode: "auto" },
  chapters: [{ id: "chapter-1", courseId: "course-1", title: "Foundations", description: "", order: 0, color: "#000", outcome: "Architecture report" }],
  lessons: [{ id: "lesson-1", courseId: "course-1", chapterId: "chapter-1", title: "Basics", order: 0 }],
  curriculumCoverages: [
    { id: "cc-1", courseId: "course-1", lessonId: "lesson-1", nodeId: "node-1", role: "introduce", order: 0 },
    { id: "cc-2", courseId: "course-1", lessonId: "lesson-1", nodeId: "node-2", role: "introduce", order: 1 }
  ], curriculumSequences: [], assignments: [], assignmentCoverages: [], assignmentDependencies: [], chapterOutcomes: [], assignmentOutcomeCompositions: [], finalProjects: [], finalProjectOutcomeCompositions: [],
  materials: [{ id: "material-1", courseId: "course-1", lessonId: "lesson-1", order: 0, title: "Book", type: "pdf", source: { kind: "pdf", url: "/book.pdf", pageCount: 2 }, segments: [{ id: "page-1", order: 0, page: 1 }, { id: "page-2", order: 1, page: 2 }] }],
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

  it("builds stable Assignment, Outcome, and FinalProject composition identities", () => {
    const generation = { materialCoverage: resolveMaterialCoverage(runtime, [node("node-1", [1]), node("node-2", [2])]), assignments: [{ semanticKey: "integrated", title: "Integrated", description: "Apply", requirements: ["r"], expectedOutput: "artifact", acceptanceCriteria: ["works"], mode: "instruction" as const, knowledgeNodeIds: ["node-1", "node-2"] }], dependencies: [], executions: [] };
    const first = buildCourseMappingPlan(runtime, generation);
    const second = buildCourseMappingPlan(runtime, generation);
    expect(second).toEqual(first);
    expect(first.assignmentCoverages).toHaveLength(2);
    expect(first.assignmentOutcomeCompositions).toHaveLength(1);
    expect(first.finalProjectOutcomeCompositions).toHaveLength(1);
  });
});

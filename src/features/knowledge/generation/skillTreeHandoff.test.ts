import { describe, expect, it } from "vitest";
import { InMemoryKnowledgeRepository } from "@/features/knowledge/repository/InMemoryKnowledgeRepository";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { buildCourseGraphData, validateCourseRuntime, type CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { KnowledgeGraph } from "@/features/knowledge/types";

const graph: KnowledgeGraph = {
  nodes: ["a", "b"].map((id) => ({ id, title: id.toUpperCase(), description: id, type: "conceptual", masteryCriteria: [`Explain ${id}`], scope: "user", ownerId: "user-1", provenance: [{ sourceType: "material", sourceId: "material-1" }], currentRevisionId: `${id}-r1`, status: "active" })),
  revisions: ["a", "b"].map((id) => ({ id: `${id}-r1`, nodeId: id, version: 1, title: id.toUpperCase(), description: id, type: "conceptual", masteryCriteria: [`Explain ${id}`], createdAt: "2026-08-14T00:00:00.000Z" })),
  edges: [{ id: "e", source: "a", target: "b", relation: "prerequisite", strength: "hard", reason: "A before B" }]
};
const runtime: CourseRuntimeData = {
  course: { id: "generated-course", title: "Generated", description: "Generated", generationStatus: "curriculum-generated" },
  curriculum: { id: "generated-curriculum", courseId: "generated-course", generationMode: "auto" },
  chapters: [{ id: "chapter", courseId: "generated-course", title: "Chapter", description: "Chapter", order: 0, color: "#6f85ff", outcome: "Outcome" }],
  lessons: [{ id: "lesson", courseId: "generated-course", chapterId: "chapter", title: "Lesson", order: 0 }],
  curriculumCoverages: ["a", "b"].map((nodeId, order) => ({ id: `coverage-${nodeId}`, courseId: "generated-course", lessonId: "lesson", nodeId, role: "introduce", order })),
  curriculumSequences: [], assignments: [], assignmentCoverages: [], materials: [], materialKnowledgeCoverages: [], revision: "run-1"
};
const repository = new InMemoryKnowledgeRepository(graph);
const access = userKnowledgeAccess("user-1");

describe("real Course Skill Tree handoff before Phase 4.3 Assignments", () => {
  it("accepts an explicit curriculum-generated draft and projects the factual Knowledge graph without fake Assignments", () => {
    expect(validateCourseRuntime(runtime, repository, access)).toBe(true);
    const projected = buildCourseGraphData(runtime, { userId: "user-1", courseId: runtime.course.id, assignmentStates: {}, materialStates: {}, updatedAt: "2026-08-14T00:00:00.000Z" }, graph);
    expect(projected.knowledgeNodes.map((node) => node.id)).toEqual(["a", "b"]);
    expect(projected.knowledgeEdges).toEqual(graph.edges);
    expect(projected.knowledgeNodes.every((node) => node.assignmentContexts.length === 0 && node.assignmentCount === 0)).toBe(true);
  });

  it("keeps the complete ready invariant strict", () => {
    expect(() => validateCourseRuntime({ ...runtime, course: { ...runtime.course, generationStatus: "ready" } }, repository, access)).toThrow(/has no AssignmentCoverage/);
  });
});

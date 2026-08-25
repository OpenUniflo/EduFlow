import { describe, expect, it } from "vitest";
import { InMemoryKnowledgeRepository } from "@/features/knowledge/repository/InMemoryKnowledgeRepository";
import { globalKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { routeOnlyKnowledgeGraph, routeOnlyRuntime } from "./courseFoundation.fixture";
import { assignmentProjectionForNode, courseDrawerProjectionKind } from "../courseSelection";
import { buildCourseGraphProjection } from "../graph/courseGraphProjection";
import { auditCourseAssetCoverage, courseAssetCoverageLabel } from "./courseAssetCoverage";
import { buildCourseGraphData, validateCourseRuntime } from "./courseRuntime";

const knowledgeRepository = new InMemoryKnowledgeRepository(routeOnlyKnowledgeGraph);

describe("Course foundation contract", () => {
  it("accepts and projects a ready Knowledge route without learning assets", () => {
    expect(validateCourseRuntime(routeOnlyRuntime, knowledgeRepository, globalKnowledgeAccess)).toBe(true);

    const graphData = buildCourseGraphData(routeOnlyRuntime, {
      userId: "learner",
      courseId: routeOnlyRuntime.course.id,
      isActive: false,
      assignmentStates: {},
      materialStates: {},
      updatedAt: "2026-08-25T00:00:00.000Z"
    }, routeOnlyKnowledgeGraph);
    const projection = buildCourseGraphProjection(graphData, "full", null);

    expect(graphData.knowledgeNodes).toHaveLength(1);
    expect(graphData.assignmentSummary.assignmentCount).toBe(0);
    expect(graphData.knowledgeNodes[0]).toMatchObject({ assignmentCount: 0, materialIds: [] });
    expect(projection.nodes.map((node) => node.id)).toEqual(["chapter:route-only-chapter", "knowledge:route-knowledge"]);
    expect(routeOnlyRuntime.course.lifecycle).toBe("published");
    expect(assignmentProjectionForNode(graphData.knowledgeNodes[0], null)).toEqual({ kind: "empty", contexts: [] });
    expect(courseDrawerProjectionKind({ kind: "knowledge", id: "route-knowledge" }, "assignment", graphData.knowledgeNodes[0])).toBe("assignment-empty");
  });

  it("reports optional asset gaps without turning them into structural failures", () => {
    const audit = auditCourseAssetCoverage(routeOnlyRuntime);

    expect(audit).toMatchObject({
      knowledgeCount: 1,
      assignments: { coveredKnowledgeCount: 0, missingKnowledgeCount: 1 },
      materials: { coveredKnowledgeCount: 0, missingKnowledgeCount: 1 },
      micro: { status: "unavailable", coveredKnowledgeCount: null, missingKnowledgeCount: null },
      chapterOutcomes: { coveredChapterCount: 0, missingChapterCount: 1 },
      finalProjects: { count: 0, missing: true }
    });
    expect(audit.issues.map((issue) => issue.code)).toEqual([
      "missing-assignment-coverage",
      "missing-material-coverage",
      "micro-coverage-unavailable",
      "missing-chapter-outcome",
      "missing-final-project"
    ]);
    expect(courseAssetCoverageLabel(audit)).toBe("学习资产待补充");
  });

  it("still rejects an AssignmentCoverage with a dangling Assignment", () => {
    const invalid = {
      ...routeOnlyRuntime,
      assignments: [{
        id: "existing-assignment",
        courseId: routeOnlyRuntime.course.id,
        order: 0,
        title: "Existing Assignment",
        description: "A valid Assignment definition",
        requirements: ["Complete it"],
        expectedOutput: "Result",
        acceptanceCriteria: ["Valid result"],
        mode: "instruction" as const
      }],
      assignmentCoverages: [{ id: "dangling-assignment-coverage", assignmentId: "missing-assignment", nodeId: "route-knowledge", role: "practice" as const }]
    };
    expect(() => validateCourseRuntime(invalid, knowledgeRepository, globalKnowledgeAccess)).toThrow(/references unknown Assignment/);
  });

  it("rejects a Course with no Knowledge route", () => {
    expect(() => validateCourseRuntime({
      ...routeOnlyRuntime,
      chapters: [],
      lessons: [],
      curriculumCoverages: []
    }, knowledgeRepository, globalKnowledgeAccess)).toThrow(/at least one CurriculumCoverage Knowledge route/);
  });

  it("still rejects invalid Material Lesson, Segment, and Knowledge references", () => {
    const material = { id: "route-material", courseId: routeOnlyRuntime.course.id, lessonId: "route-only-lesson", order: 0, title: "Route material", type: "article" as const, segments: [{ id: "route-segment", order: 0 }] };
    expect(() => validateCourseRuntime({ ...routeOnlyRuntime, materials: [{ ...material, lessonId: "missing-lesson" }] }, knowledgeRepository, globalKnowledgeAccess)).toThrow(/references unknown Lesson/);
    expect(() => validateCourseRuntime({
      ...routeOnlyRuntime,
      materials: [material],
      materialKnowledgeCoverages: [{ id: "bad-segment", materialId: material.id, segmentId: "missing-segment", nodeId: "route-knowledge", role: "explain" }]
    }, knowledgeRepository, globalKnowledgeAccess)).toThrow(/references unknown Segment/);
    expect(() => validateCourseRuntime({
      ...routeOnlyRuntime,
      materials: [material],
      materialKnowledgeCoverages: [{ id: "bad-node", materialId: material.id, segmentId: "route-segment", nodeId: "missing-knowledge", role: "explain" }]
    }, knowledgeRepository, globalKnowledgeAccess)).toThrow(/references a node outside the Course/);
  });
});

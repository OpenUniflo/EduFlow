import { describe, expect, it } from "vitest";
import { DemoCourseRepository } from "./course/repository/DemoCourseRepository";
import { buildCourseGraphData, validateCourseRuntime } from "./course/runtime/courseRuntime";
import { buildCourseGraphProjection } from "./course/graph/courseGraphProjection";
import { ATOMIC_FOOTPRINT_HEIGHT, ATOMIC_FOOTPRINT_WIDTH, COMPANION_OFFSET_X, COMPANION_OFFSET_Y, KNOWLEDGE_CARD_HEIGHT, KNOWLEDGE_CARD_WIDTH, getCourseLayoutCacheKey, layoutCourseGraph } from "./course/graph/elkCourseLayout";
import { toReactFlow } from "./course/graph/reactFlowAdapter";
import { assignmentProjectionForNode, buildChapterAssignmentProjection, courseDrawerProjectionKind, detailFacetForMode, flowIdForAnchor, type SelectedAnchor } from "./course/courseSelection";
import { demoUserCourseStateSeed } from "./demo/user/demoUserCourseState.seed";
import { LocalStorageLearningProgressRepository, learningProgressStorageKey } from "./progress/LocalStorageLearningProgressRepository";
import { buildGlobalAtlasProjection } from "./knowledge/projections/atlasProjections";

const repository = new DemoCourseRepository();
const agentic = repository.getCourse("agentic-ai")!;
const python = repository.getCourse("python-engineering")!;
const agenticGraph = buildCourseGraphData(agentic, demoUserCourseStateSeed("student", agentic.course.id));
const pythonGraph = buildCourseGraphData(python, demoUserCourseStateSeed("student", python.course.id));

describe("Course Repository and runtime invariants", () => {
  it("registers two isolated Courses and rejects unknown routes", () => {
    expect(repository.listCourses().map((course) => course.id)).toEqual(["agentic-ai", "python-engineering"]);
    expect(repository.getCourse("agentic-ai")).not.toBe(repository.getCourse("python-engineering"));
    expect(repository.getCourse("not-exist")).toBeNull();
    expect(validateCourseRuntime(agentic)).toBe(true);
    expect(validateCourseRuntime(python)).toBe(true);
  });

  it("keeps Course graph data isolated", () => {
    expect(agenticGraph.courseId).not.toBe(pythonGraph.courseId);
    expect(agenticGraph.chapters.every((chapter) => chapter.courseId === agentic.course.id)).toBe(true);
    expect(pythonGraph.chapters.every((chapter) => chapter.courseId === python.course.id)).toBe(true);
    expect(agenticGraph.knowledgeNodes.some((node) => node.id === "AG01")).toBe(true);
    expect(pythonGraph.knowledgeNodes.some((node) => node.id === "PY01")).toBe(true);
    expect(python.assignments.every((assignment) => assignment.courseId === python.course.id)).toBe(true);
  });

  it("covers every Course KnowledgeNode and contains real N:M examples", () => {
    [agentic, python].forEach((runtime) => {
      const nodeIds = new Set(runtime.curriculumCoverages.map((coverage) => coverage.nodeId));
      const covered = new Set(runtime.assignmentCoverages.map((coverage) => coverage.nodeId));
      expect(covered).toEqual(nodeIds);
      expect(runtime.assignments.some((assignment) => runtime.assignmentCoverages.filter((coverage) => coverage.assignmentId === assignment.id).length > 1)).toBe(true);
    });
    expect(pythonGraph.knowledgeNodes.some((node) => node.assignmentCount > 1)).toBe(true);
  });

  it("uses courseId and structural revision as the only layout cache identity", () => {
    expect(getCourseLayoutCacheKey("agentic-ai", "v1")).not.toBe(getCourseLayoutCacheKey("python-engineering", "v1"));
    expect(getCourseLayoutCacheKey("agentic-ai", "v1")).not.toBe(getCourseLayoutCacheKey("agentic-ai", "v2"));
    expect(getCourseLayoutCacheKey(agenticGraph.courseId, agenticGraph.revision)).toBe(getCourseLayoutCacheKey(agenticGraph.courseId, agenticGraph.revision));
  });
});

describe("Material and progress generalization", () => {
  it("supports Segment → multiple KnowledgeNodes and KnowledgeNode → multiple Segments/Materials", () => {
    const segmentNodes = python.materialKnowledgeCoverages.filter((coverage) => coverage.materialId === "python-core-handbook" && coverage.segmentId === "core-control").map((coverage) => coverage.nodeId);
    expect(new Set(segmentNodes).size).toBeGreaterThan(1);
    const py06 = python.materialKnowledgeCoverages.filter((coverage) => coverage.nodeId === "PY06");
    expect(new Set(py06.map((coverage) => coverage.segmentId)).size).toBeGreaterThan(1);
    const py09 = python.materialKnowledgeCoverages.filter((coverage) => coverage.nodeId === "PY09");
    expect(new Set(py09.map((coverage) => coverage.materialId)).size).toBe(2);
  });

  it("resolves Materials only inside their owning Course", () => {
    expect(python.materials.some((material) => material.id === "python-core-handbook")).toBe(true);
    expect(agentic.materials.some((material) => material.id === "python-core-handbook")).toBe(false);
  });

  it("isolates progress by user, Course, Material, and explicit Assignment identity", () => {
    expect(learningProgressStorageKey("user-a", "agentic-ai")).not.toBe(learningProgressStorageKey("user-a", "python-engineering"));
    expect(learningProgressStorageKey("user-a", "agentic-ai")).not.toBe(learningProgressStorageKey("user-b", "agentic-ai"));
    const progress = new LocalStorageLearningProgressRepository();
    const sharedTemplateAssignments = python.assignments.filter((assignment) => assignment.workflowTemplateId === "agent-loop");
    expect(sharedTemplateAssignments.length).toBeGreaterThan(1);
    const target = sharedTemplateAssignments[0];
    const untouched = sharedTemplateAssignments[1];
    progress.updateAssignmentState("isolated-user", python.course.id, target.id, { assignmentId: target.id, status: "completed", progress: 100 });
    const state = progress.getCourseState("isolated-user", python.course.id);
    expect(state.assignmentStates[target.id]?.status).toBe("completed");
    expect(state.assignmentStates[untouched.id]?.status).not.toBe("completed");
    expect(progress.getCourseState("other-user", python.course.id).assignmentStates[target.id]?.status).not.toBe("completed");
  });

  it("projects N:M Atlas Course contexts", () => {
    const atlas = buildGlobalAtlasProjection(undefined, repository.listCourseRuntimes());
    expect(atlas.nodes.find((node) => node.id === "T11")?.courseContexts.map((context) => context.courseId).sort()).toEqual(["agentic-ai", "python-engineering"]);
  });
});

describe("Course Assignment layout and Drawer", () => {
  it("includes the companion offset in one stable footprint", () => {
    expect(ATOMIC_FOOTPRINT_WIDTH).toBe(KNOWLEDGE_CARD_WIDTH + COMPANION_OFFSET_X);
    expect(ATOMIC_FOOTPRINT_HEIGHT).toBe(KNOWLEDGE_CARD_HEIGHT + COMPANION_OFFSET_Y);
  });

  it("keeps every expanded Python footprint inside its Chapter", async () => {
    const projection = buildCourseGraphProjection(pythonGraph, "full", null);
    const layout = await layoutCourseGraph(pythonGraph, projection);
    const chapters = new Map(layout.nodes.filter((node) => node.kind === "chapter").map((node) => [node.id, node]));
    layout.nodes.filter((node) => node.kind === "knowledge" && node.parentId).forEach((node) => {
      const parent = chapters.get(node.parentId!);
      expect(parent).toBeDefined();
      expect(node.width).toBe(ATOMIC_FOOTPRINT_WIDTH);
      expect(node.height).toBe(ATOMIC_FOOTPRINT_HEIGHT);
      expect(node.x + node.width).toBeLessThanOrEqual(parent!.width + 0.01);
      expect(node.y + node.height).toBeLessThanOrEqual(parent!.height + 0.01);
    });
  });

  it("changes presentation without changing topology or geometry", async () => {
    const projection = buildCourseGraphProjection(pythonGraph, "full", null);
    const layout = await layoutCourseGraph(pythonGraph, projection);
    const knowledgeFlow = toReactFlow(layout, pythonGraph.knowledgeEdges, "knowledge", null, null);
    const assignmentFlow = toReactFlow(layout, pythonGraph.knowledgeEdges, "assignment", null, null);
    expect(assignmentFlow.nodes.map(({ id, position, parentId }) => ({ id, position, parentId }))).toEqual(knowledgeFlow.nodes.map(({ id, position, parentId }) => ({ id, position, parentId })));
    expect(assignmentFlow.edges.map((edge) => [edge.id, edge.source, edge.target])).toEqual(knowledgeFlow.edges.map((edge) => [edge.id, edge.source, edge.target]));
  });

  const multiNode = pythonGraph.knowledgeNodes.find((node) => node.assignmentCount > 1)!;
  const singleNode = pythonGraph.knowledgeNodes.find((node) => node.assignmentCount === 1)!;

  it("keeps anchor stable while mode drives Knowledge/Assignment facets", () => {
    const anchor: SelectedAnchor = { kind: "knowledge", id: multiNode.id };
    expect(courseDrawerProjectionKind(anchor, "knowledge", multiNode)).toBe("atomic-knowledge");
    expect(courseDrawerProjectionKind(anchor, "assignment", multiNode)).toBe("assignment-group");
    expect(flowIdForAnchor(anchor)).toBe(`knowledge:${multiNode.id}`);
    expect(detailFacetForMode("assignment")).toBe("assignment");
  });

  it("deduplicates Chapter Assignments and opens group/detail correctly", () => {
    const chapter = pythonGraph.chapters[0];
    const aggregate = buildChapterAssignmentProjection(chapter, pythonGraph.knowledgeNodes);
    expect(aggregate.assignments).toHaveLength(chapter.assignmentSummary.assignmentCount);
    expect(new Set(aggregate.assignments.map((item) => item.assignment.id)).size).toBe(aggregate.assignments.length);
    expect(assignmentProjectionForNode(multiNode, null)).toMatchObject({ kind: "group" });
    expect(assignmentProjectionForNode(singleNode, null)).toMatchObject({ kind: "detail", canReturnToGroup: false });
  });
});

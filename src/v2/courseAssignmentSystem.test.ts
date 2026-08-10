import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DemoCourseRepository } from "./course/repository/DemoCourseRepository";
import { buildCourseGraphData, validateCourseRuntime, type CourseRuntimeData } from "./course/runtime/courseRuntime";
import { buildCourseGraphProjection } from "./course/graph/courseGraphProjection";
import { ATOMIC_FOOTPRINT_HEIGHT, ATOMIC_FOOTPRINT_WIDTH, COMPANION_OFFSET_X, COMPANION_OFFSET_Y, KNOWLEDGE_CARD_HEIGHT, KNOWLEDGE_CARD_WIDTH, getCourseLayoutCacheKey, layoutCourseGraph } from "./course/graph/elkCourseLayout";
import { toReactFlow } from "./course/graph/reactFlowAdapter";
import { assignmentProjectionForNode, buildChapterAssignmentProjection, courseDrawerProjectionKind, detailFacetForMode, flowIdForAnchor, type SelectedAnchor } from "./course/courseSelection";
import { demoUserCourseStateSeed } from "./demo/user/demoUserCourseState.seed";
import { LocalStorageLearningProgressRepository, learningProgressStorageKey } from "./progress/LocalStorageLearningProgressRepository";
import { buildGlobalAtlasProjection } from "./knowledge/projections/atlasProjections";
import { applicationServices } from "./services/applicationServices";
import { globalKnowledgeAccess, userKnowledgeAccess } from "./knowledge/repository/KnowledgeRepository";
import { resolveInitialMaterialSegment, resolveKnowledgeMaterialEntries, resolveKnowledgeMaterialEntry, buildMaterialDeepLink } from "./material/materialNavigation";
import { classifySegmentQueryChange, selectPageAtReadingAnchor } from "./material/reader/materialReaderState";
import { createMaterialKnowledgeContextState, reduceMaterialKnowledgeContextState, resolveEffectiveKnowledgeId } from "./material/reader/materialKnowledgeContextState";
import { buildKnowledgeAssignmentContexts, buildMaterialKnowledgeContext, buildMaterialKnowledgeRoles, buildMaterialSegmentProjection } from "./material/materialProjection";
import { getDomainGovernanceSnapshot } from "./knowledge/domain/domainStore";
import { createWorkflowRunRecord, type Template } from "../app/model";
import { InMemoryKnowledgeRepository } from "./knowledge/repository/InMemoryKnowledgeRepository";
import type { KnowledgeGraph, KnowledgeNode } from "./knowledge/types";
import { buildPersonalKnowledgeGraph } from "./profile/profileGraph";
import type { AssignmentCoverage, CourseAssignment } from "./types";

const knowledgeRepository = applicationServices.knowledgeRepository;
const repository = new DemoCourseRepository(knowledgeRepository);
const access = userKnowledgeAccess("student@knowledge-atlas.local");
const visibleGraph = knowledgeRepository.getVisibleGraph(access);
const userKnowledge = applicationServices.userKnowledgeRepository.getUserKnowledge("student@knowledge-atlas.local");
const agentic = repository.getCourse("agentic-ai")!;
const python = repository.getCourse("python-engineering")!;
const agenticGraph = buildCourseGraphData(agentic, demoUserCourseStateSeed("student", agentic.course.id), visibleGraph, userKnowledge);
const pythonGraph = buildCourseGraphData(python, demoUserCourseStateSeed("student", python.course.id), visibleGraph, userKnowledge);

describe("Course Repository and runtime invariants", () => {
  it("registers two isolated Courses and rejects unknown routes", () => {
    expect(repository.listCourses().map((course) => course.id)).toEqual(["agentic-ai", "python-engineering"]);
    expect(repository.getCourse("agentic-ai")).not.toBe(repository.getCourse("python-engineering"));
    expect(repository.getCourse("not-exist")).toBeNull();
    expect(validateCourseRuntime(agentic, knowledgeRepository, access)).toBe(true);
    expect(validateCourseRuntime(python, knowledgeRepository, access)).toBe(true);
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
    const segmentNodes = python.materialKnowledgeCoverages.filter((coverage) => coverage.materialId === "python-core-handbook" && coverage.segmentId === "page-5").map((coverage) => coverage.nodeId);
    expect(new Set(segmentNodes).size).toBeGreaterThan(1);
    const py06 = python.materialKnowledgeCoverages.filter((coverage) => coverage.nodeId === "PY06");
    expect(new Set(py06.map((coverage) => coverage.segmentId)).size).toBeGreaterThan(1);
    const py09 = python.materialKnowledgeCoverages.filter((coverage) => coverage.nodeId === "PY09");
    expect(new Set(py09.map((coverage) => coverage.materialId)).size).toBe(3);
  });

  it("resolves Materials only inside their owning Course", () => {
    expect(python.materials.some((material) => material.id === "python-core-handbook")).toBe(true);
    expect(agentic.materials.some((material) => material.id === "python-core-handbook")).toBe(false);
  });

  it("resolves deterministic deep links and gives explicit URL Segment precedence", () => {
    const entry = resolveKnowledgeMaterialEntry(agentic, "R01", "lesson-04");
    expect(entry).toMatchObject({ segmentId: "page-12", role: "introduce" });
    expect(buildMaterialDeepLink({ courseId: agentic.course.id, materialId: "lesson-04", segmentId: entry!.segmentId })).toBe("/courses/agentic-ai/materials/lesson-04?segment=page-12");
    expect(resolveInitialMaterialSegment({ segmentIds: ["page-1", "page-12", "page-28"], requestedSegmentId: "page-12", recentSegmentId: "page-28" })).toBe("page-12");
    expect(resolveInitialMaterialSegment({ segmentIds: ["page-1", "page-12"], requestedSegmentId: "missing", recentSegmentId: "page-12" })).toBe("page-12");
  });

  it("commits valid PDF fixtures whose page count matches Material Segments", () => {
    for (const runtime of [agentic, python]) {
      for (const material of runtime.materials.filter((item) => item.type === "pdf")) {
        expect(material.source?.kind).toBe("pdf");
        expect(material.segments).toHaveLength(material.source!.pageCount);
        expect(material.segments.map((segment) => segment.page)).toEqual(Array.from({ length: material.source!.pageCount }, (_, index) => index + 1));
        const file = join(process.cwd(), "public", material.source!.url.replace(/^\//, ""));
        const bytes = readFileSync(file).toString("latin1");
        expect((bytes.match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(material.source!.pageCount);
      }
    }
  });

  it("rejects malformed PDF source metadata before rendering", () => {
    const invalid: CourseRuntimeData = { ...python, materials: python.materials.map((material) => material.id === "python-quality-testing" ? { ...material, source: { kind: "pdf", url: material.source!.url, pageCount: 11 } } : material) };
    expect(() => validateCourseRuntime(invalid, knowledgeRepository, access)).toThrow(/pageCount does not match Segments/);
  });

  it("prioritizes Exception's formal Lesson 04 PDF over reinforcement materials", () => {
    const entries = resolveKnowledgeMaterialEntries(python, "PY09");
    expect(entries[0]).toMatchObject({ materialId: "python-quality-testing", lessonId: "PY-L04", segmentId: "page-1", role: "introduce" });
    expect(new Set(entries.map((entry) => entry.materialId))).toEqual(new Set(["python-core-handbook", "python-quality-testing", "python-async-service-guide"]));
  });

  it("keeps Reader URL replacement out of external navigation and selects the reading anchor", () => {
    expect(classifySegmentQueryChange("page-10", "page-11", "page-11")).toBe("reader");
    expect(classifySegmentQueryChange("page-10", "page-10", null)).toBe("unchanged");
    expect(classifySegmentQueryChange("page-20", "page-8", null)).toBe("external");
    expect(selectPageAtReadingAnchor([
      { page: 10, segmentId: "page-10", top: -500, bottom: 180, intersectionRatio: 0.2 },
      { page: 11, segmentId: "page-11", top: 200, bottom: 760, intersectionRatio: 0.8 },
      { page: 12, segmentId: "page-12", top: 780, bottom: 1340, intersectionRatio: 0.1 }
    ], 100, 700)?.segmentId).toBe("page-11");
  });

  it("retains a non-PDF renderer fixture", () => {
    expect(python.materials.some((material) => material.type === "article" && material.segments.some((segment) => Boolean(segment.content)))).toBe(true);
  });

  it("separates Auto selection from explicit ID-only Pin state", () => {
    let state = createMaterialKnowledgeContextState("PY09");
    state = reduceMaterialKnowledgeContextState(state, { type: "select", nodeId: "PY27" });
    expect(state).toEqual({ selectedKnowledgeId: "PY27", pinnedKnowledgeId: null });
    state = reduceMaterialKnowledgeContextState(state, { type: "page-change", currentPagePrimaryKnowledgeId: "PY37" });
    expect(state).toEqual({ selectedKnowledgeId: "PY37", pinnedKnowledgeId: null });
    state = reduceMaterialKnowledgeContextState(state, { type: "pin" });
    state = reduceMaterialKnowledgeContextState(state, { type: "page-change", currentPagePrimaryKnowledgeId: "PY85" });
    expect(resolveEffectiveKnowledgeId(state, "PY85")).toBe("PY37");
    expect(state.pinnedKnowledgeId).toBe("PY37");
    state = reduceMaterialKnowledgeContextState(state, { type: "unpin", currentPagePrimaryKnowledgeId: "PY85" });
    expect(state).toEqual({ selectedKnowledgeId: "PY85", pinnedKnowledgeId: null });
    expect(reduceMaterialKnowledgeContextState({ selectedKnowledgeId: "PY85", pinnedKnowledgeId: "PY85" }, { type: "material-change", currentPagePrimaryKnowledgeId: "PY06" })).toEqual({ selectedKnowledgeId: "PY06", pinnedKnowledgeId: null });
  });

  it("keeps page Assignments separate from Knowledge-specific Assignments on a multi-Knowledge Segment", () => {
    const extraAssignments: CourseAssignment[] = ["PY09", "PY27", "PY37"].map((nodeId) => ({ id: `specific-${nodeId}`, courseId: python.course.id, title: `Specific ${nodeId}`, description: nodeId, requirements: [nodeId], expectedOutput: nodeId, acceptanceCriteria: [nodeId], mode: "instruction" }));
    const extraCoverages: AssignmentCoverage[] = extraAssignments.map((assignment, index) => ({ id: `specific-coverage-${index}`, assignmentId: assignment.id, nodeId: assignment.id.replace("specific-", ""), role: "assess" }));
    const runtime = { ...python, assignments: [...python.assignments, ...extraAssignments], assignmentCoverages: [...python.assignmentCoverages, ...extraCoverages] };
    const userState = demoUserCourseStateSeed("student", python.course.id);
    const material = runtime.materials.find((item) => item.id === "python-quality-testing")!;
    const projection = buildMaterialSegmentProjection(runtime, material, "page-10", userState, knowledgeRepository, access, getDomainGovernanceSnapshot())!;
    const exceptionAssignments = buildKnowledgeAssignmentContexts(runtime, "PY09", userState);
    const typeHintAssignments = buildKnowledgeAssignmentContexts(runtime, "PY27", userState);
    expect(projection.knowledgeContexts).toHaveLength(4);
    expect(projection.pageAssignmentContexts.map((context) => context.assignmentId)).toEqual(expect.arrayContaining(["specific-PY09", "specific-PY27", "specific-PY37"]));
    expect(exceptionAssignments.map((context) => context.assignmentId)).toContain("specific-PY09");
    expect(exceptionAssignments.map((context) => context.assignmentId)).not.toContain("specific-PY27");
    expect(typeHintAssignments.map((context) => context.assignmentId)).toContain("specific-PY27");
  });

  it("resolves pinned Knowledge metadata and Domain color from current repositories instead of snapshots", () => {
    const governance = getDomainGovernanceSnapshot();
    const before = buildMaterialKnowledgeContext("PY09", [], knowledgeRepository, access, governance)!;
    const changed = { ...governance, domains: governance.domains.map((domain) => domain.id === "python-engineering" ? { ...domain, canonicalColor: "#123456" } : domain) };
    const after = buildMaterialKnowledgeContext("PY09", [], knowledgeRepository, access, changed)!;
    expect(before.nodeId).toBe(after.nodeId);
    expect(after.color).toBe("#123456");
    expect(after).not.toBe(before);
    expect(buildMaterialKnowledgeRoles(python, "python-quality-testing", "PY09")).toEqual(expect.arrayContaining(["introduce", "explain"]));
  });

  it("gives the Material Header a real responsive boundary after the GlobalNav panel", () => {
    const styles = readFileSync(join(process.cwd(), "src/v2/styles.css"), "utf8");
    expect(styles).toContain("--material-global-nav-width: 242px");
    expect(styles).toContain("--material-header-left: calc(var(--material-shell-margin) + var(--material-global-nav-width) + var(--material-global-nav-gap))");
    expect(styles).toContain("--material-global-nav-width: 80px");
    expect(styles).toMatch(/material-reader-current \.atlas-lesson-header[^}]*left:\s*var\(--material-header-left\)/s);
    expect(styles).toMatch(/material-reader-current \.atlas-lesson-header[^}]*padding:\s*8px 16px/s);
    expect(styles).not.toContain("--material-global-nav-reserve");
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

  it("separates reading position from viewed completion and updates recent Lesson", () => {
    const progress = new LocalStorageLearningProgressRepository();
    progress.updateMaterialReadingState("reader", agentic.course.id, "L04", "lesson-04", { recentSegmentId: "page-32", viewedSegmentIds: ["page-32"], progress: 3 });
    const state = progress.getCourseState("reader", agentic.course.id);
    expect(state.recentLessonId).toBe("L04");
    expect(state.materialStates["lesson-04"]).toMatchObject({ recentSegmentId: "page-32", progress: 3 });
  });

  it("keeps Knowledge mastery independent from Assignment completion", () => {
    const node = agenticGraph.knowledgeNodes.find((item) => item.id === "R01")!;
    expect(node.knowledgeProgress).toBe(58);
    expect(node.assignmentStateSummary.progress).not.toBe(node.knowledgeProgress);
  });

  it("projects N:M Atlas Course contexts", () => {
    const atlas = buildGlobalAtlasProjection(knowledgeRepository.getVisibleGraph(globalKnowledgeAccess), getDomainGovernanceSnapshot(), repository.listCourseRuntimes());
    expect(atlas.nodes.find((node) => node.id === "T11")?.courseContexts.map((context) => context.courseId).sort()).toEqual(["agentic-ai", "python-engineering"]);
  });

  it("resolves visible Global/Tenant/User Knowledge while Global Atlas stays Global-only", () => {
    const node = (id: string, scope: KnowledgeNode["scope"], ownerId?: string): KnowledgeNode => ({ id, title: id, description: id, type: "conceptual", masteryCriteria: [id], scope, ownerId, provenance: [{ sourceType: "manual", sourceId: id }], currentRevisionId: `${id}-r1`, status: "active" });
    const scopedGraph: KnowledgeGraph = { domains: [], revisions: [], edges: [], nodes: [node("G", "global"), node("T", "tenant", "tenant-1"), node("U", "user", "user-1")] };
    const scopedRepository = new InMemoryKnowledgeRepository(scopedGraph);
    const scopedAccess = userKnowledgeAccess("user-1", "tenant-1");
    expect(scopedRepository.getVisibleGraph(scopedAccess).nodes.map((item) => item.id)).toEqual(["G", "T", "U"]);
    expect(buildGlobalAtlasProjection(scopedRepository.getVisibleGraph(scopedAccess), { domains: [], assignments: [], candidates: [], proposals: [], revision: 0 }, []).nodes.map((item) => item.id)).toEqual(["G"]);

    const runtime: CourseRuntimeData = {
      course: { id: "scoped-course", title: "Scoped", description: "Scoped", accentColor: "#000000" },
      curriculum: { id: "scoped-curriculum", courseId: "scoped-course", generationMode: "auto-fixed-count", requestedChapterCount: 1 },
      chapters: [{ id: "C", courseId: "scoped-course", title: "C", description: "C", lessonIds: ["L"], order: 1, color: "#000000", progress: 0, outcome: "O" }],
      lessons: [{ id: "L", courseId: "scoped-course", chapterId: "C", title: "L", order: 1 }],
      curriculumCoverages: ["G", "T", "U"].map((nodeId) => ({ id: `cc-${nodeId}`, courseId: "scoped-course", lessonId: "L", nodeId, role: "introduce" as const })),
      curriculumSequences: [],
      assignments: [{ id: "A", courseId: "scoped-course", title: "A", description: "A", requirements: ["A"], expectedOutput: "A", acceptanceCriteria: ["A"], mode: "instruction" }],
      assignmentCoverages: ["G", "T", "U"].map((nodeId) => ({ id: `ac-${nodeId}`, assignmentId: "A", nodeId, role: "practice" as const })),
      materials: [{ id: "M", courseId: "scoped-course", lessonId: "L", title: "M", type: "article", segments: [{ id: "S", order: 1, title: "S", content: {} }] }],
      materialKnowledgeCoverages: ["G", "T", "U"].map((nodeId) => ({ id: `mc-${nodeId}`, materialId: "M", segmentId: "S", nodeId, role: "introduce" as const })),
      revision: "v1"
    };
    expect(validateCourseRuntime(runtime, scopedRepository, scopedAccess)).toBe(true);
    expect(buildCourseGraphData(runtime, demoUserCourseStateSeed("user-1", "scoped-course"), scopedRepository.getVisibleGraph(scopedAccess)).knowledgeNodes).toHaveLength(3);
  });

  it("keeps shared WorkflowTemplate run identity assignment-aware", () => {
    const template: Template = { id: "same-template", name: "Shared", description: "Shared", nodes: [], edges: [], runOrder: [], result: "ok", code: "" };
    const runA = createWorkflowRunRecord(template, {}, 1, { courseId: "course-a", assignmentId: "assignment-a" });
    const runB = createWorkflowRunRecord(template, {}, 2, { courseId: "course-b", assignmentId: "assignment-b" });
    expect(runA.workflowTemplateId).toBe(runB.workflowTemplateId);
    expect(runA.assignmentId).not.toBe(runB.assignmentId);
  });

  it("projects different Personal Atlas state for different users", () => {
    const governance = getDomainGovernanceSnapshot();
    const userA = "student@knowledge-atlas.local";
    const userB = "second@knowledge-atlas.local";
    const statesFor = (userId: string) => repository.listCourseRuntimes().map((runtime) => demoUserCourseStateSeed(userId, runtime.course.id));
    const graphA = buildPersonalKnowledgeGraph(knowledgeRepository.getVisibleGraph(userKnowledgeAccess(userA)), applicationServices.userKnowledgeRepository.getUserKnowledge(userA), repository.listCourseRuntimes(), statesFor(userA), governance);
    const graphB = buildPersonalKnowledgeGraph(knowledgeRepository.getVisibleGraph(userKnowledgeAccess(userB)), applicationServices.userKnowledgeRepository.getUserKnowledge(userB), repository.listCourseRuntimes(), statesFor(userB), governance);
    expect(graphA.nodes.map((node) => node.id)).not.toEqual(graphB.nodes.map((node) => node.id));
    expect(graphA.summary).not.toEqual(graphB.summary);
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

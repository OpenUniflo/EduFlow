import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { DemoCourseRepository } from "@/demo/courses/DemoCourseRepository";
import { buildCourseGraphData, validateCourseRuntime, type CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import { buildCourseGraphProjection } from "@/features/course/graph/courseGraphProjection";
import { ATOMIC_FOOTPRINT_HEIGHT, ATOMIC_FOOTPRINT_WIDTH, COMPANION_OFFSET_X, COMPANION_OFFSET_Y, KNOWLEDGE_CARD_HEIGHT, KNOWLEDGE_CARD_WIDTH, getCourseLayoutCacheKey, layoutCourseGraph } from "@/features/course/graph/elkCourseLayout";
import { toReactFlow } from "@/features/course/graph/reactFlowAdapter";
import { assignmentProjectionForNode, buildChapterAssignmentProjection, courseDrawerProjectionKind, detailFacetForMode, flowIdForAnchor, type SelectedAnchor } from "@/features/course/courseSelection";
import { demoUserCourseStateSeed } from "@/demo/users/demoUserCourseState.seed";
import { LEARNING_PROGRESS_SCHEMA_VERSION, LocalStorageLearningProgressRepository, isValidUserCourseState, learningProgressStorageKey } from "@/features/learning/progress/LocalStorageLearningProgressRepository";
import { buildGlobalAtlasProjection } from "@/features/knowledge/projections/atlasProjections";
import { createDemoApplicationServices } from "@/demo/services/createDemoApplicationServices";
import { globalKnowledgeAccess, userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { resolveInitialMaterialSegment, resolveKnowledgeMaterialEntries, resolveKnowledgeMaterialEntry, buildMaterialDeepLink } from "@/features/material/materialNavigation";
import { classifySegmentQueryChange, selectPageAtReadingAnchor } from "@/features/material/reader/materialReaderState";
import { createMaterialKnowledgeContextState, reduceMaterialKnowledgeContextState, resolveEffectiveKnowledgeId } from "@/features/material/reader/materialKnowledgeContextState";
import { buildKnowledgeAssignmentContexts, buildMaterialKnowledgeContext, buildMaterialKnowledgeRoles, buildMaterialSegmentProjection } from "@/features/material/materialProjection";
import type { Template } from "@/features/workflow/domain/types";
import { DemoWorkflowRuntime } from "@/demo/workflows/DemoWorkflowRuntime";
import { InMemoryKnowledgeRepository } from "@/features/knowledge/repository/InMemoryKnowledgeRepository";
import type { KnowledgeGraph, KnowledgeNode } from "@/features/knowledge/types";
import { buildPersonalKnowledgeGraph } from "@/features/profile/profileGraph";
import type { AssignmentCoverage, CourseAssignment, UserCourseState } from "@/features/course/types";
import { selectPrimaryCurriculumCoverage } from "@/features/course/curriculum/curriculumOrdering";
import { sortAssignments, sortMaterials, sortMaterialSegments } from "@/features/material/materialOrdering";

const applicationServices = createDemoApplicationServices();
const getDomainGovernanceSnapshot = applicationServices.domainGovernanceService.getSnapshot;
const knowledgeRepository = applicationServices.knowledgeRepository;
const repository = new DemoCourseRepository(knowledgeRepository);
const access = userKnowledgeAccess("student@knowledge-atlas.local");
const visibleGraph = knowledgeRepository.getVisibleGraph(access);
const userKnowledge = applicationServices.userKnowledgeRepository.getUserKnowledge("student@knowledge-atlas.local");
const agentic = repository.getCourse("agentic-ai")!;
const python = repository.getCourse("python-engineering")!;
const agenticGraph = buildCourseGraphData(agentic, demoUserCourseStateSeed("student", agentic.course.id), visibleGraph, userKnowledge);
const pythonGraph = buildCourseGraphData(python, demoUserCourseStateSeed("student", python.course.id), visibleGraph, userKnowledge);

afterEach(() => vi.unstubAllGlobals());

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, value); }
  } satisfies Storage;
}

function importedSpecifiers(source: string) {
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /^\s*import\s+["']([^"']+)["']/gm
  ];
  return patterns.flatMap((pattern) => Array.from(source.matchAll(pattern), (match) => match[1]));
}

function typescriptFilesUnder(root: string) {
  const output = execFileSync("rg", ["--files", root], { cwd: process.cwd(), encoding: "utf8" });
  return output.trim().split("\n").filter((file) => /\.(ts|tsx)$/.test(file));
}

describe("Course Repository and runtime invariants", () => {
  it("registers isolated Courses and rejects unknown routes", () => {
    expect(repository.listCourseRuntimes().map((runtime) => runtime.course.id)).toEqual(["agentic-ai-golden", "agentic-ai", "python-engineering"]);
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

  it("keeps the Course page renderable when factual atomic relations form a Chapter-level cycle", () => {
    const firstChapterNodes = agenticGraph.knowledgeNodes.filter((node) => node.chapterId === agentic.chapters[0].id);
    const secondChapterNodes = agenticGraph.knowledgeNodes.filter((node) => node.chapterId === agentic.chapters[1].id);
    expect(firstChapterNodes.length).toBeGreaterThanOrEqual(2);
    expect(secondChapterNodes.length).toBeGreaterThanOrEqual(2);
    const cyclicAtChapterLevel: KnowledgeGraph = {
      nodes: visibleGraph.nodes,
      revisions: visibleGraph.revisions,
      edges: [
        { id: "regression-forward", source: firstChapterNodes[0].id, target: secondChapterNodes[0].id, relation: "prerequisite", strength: "hard", reason: "Hosted graph forward relation" },
        { id: "regression-backward", source: secondChapterNodes[1].id, target: firstChapterNodes[1].id, relation: "enables", strength: 0.8, reason: "Hosted graph backward relation" }
      ]
    };

    const graphData = buildCourseGraphData(agentic, demoUserCourseStateSeed("student", agentic.course.id), cyclicAtChapterLevel, userKnowledge);
    const orderByChapter = new Map(agentic.chapters.map((chapter) => [chapter.id, chapter.order]));
    expect(graphData.knowledgeEdges.map((edge) => edge.id)).toEqual(["regression-forward", "regression-backward"]);
    expect(graphData.chapterEdges.length).toBeGreaterThan(0);
    expect(graphData.chapterEdges.every((edge) => orderByChapter.get(edge.source)! < orderByChapter.get(edge.target)!)).toBe(true);
    expect(buildCourseGraphProjection(graphData, "overview", null).nodes.some((node) => node.kind === "chapter")).toBe(true);
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

  it.each([
    ["CurriculumCoverage", (runtime: CourseRuntimeData) => ({ ...runtime, curriculumCoverages: [...runtime.curriculumCoverages, { ...runtime.curriculumCoverages[0] }] })],
    ["CurriculumSequence", (runtime: CourseRuntimeData) => ({ ...runtime, curriculumSequences: [...runtime.curriculumSequences, { ...runtime.curriculumSequences[0] }] })],
    ["AssignmentCoverage", (runtime: CourseRuntimeData) => ({ ...runtime, assignmentCoverages: [...runtime.assignmentCoverages, { ...runtime.assignmentCoverages[0] }] })],
    ["MaterialKnowledgeCoverage", (runtime: CourseRuntimeData) => ({ ...runtime, materialKnowledgeCoverages: [...runtime.materialKnowledgeCoverages, { ...runtime.materialKnowledgeCoverages[0] }] })]
  ])("rejects duplicate %s ids", (label, mutate) => {
    expect(() => validateCourseRuntime(mutate(python), knowledgeRepository, access)).toThrow(`${label} ids must be unique`);
  });

  it("rejects cross-Course sequence/coverage ownership and unknown Chapter membership", () => {
    expect(() => validateCourseRuntime({ ...python, curriculumSequences: python.curriculumSequences.map((sequence, index) => index ? sequence : { ...sequence, courseId: "another-course" }) }, knowledgeRepository, access)).toThrow(/CurriculumSequence .* belongs to another Course/);
    expect(() => validateCourseRuntime({ ...python, lessons: python.lessons.map((lesson, index) => index ? lesson : { ...lesson, chapterId: "unknown" }) }, knowledgeRepository, access)).toThrow(/references unknown Chapter/);
    expect(() => validateCourseRuntime({ ...python, curriculumCoverages: python.curriculumCoverages.map((coverage, index) => index ? coverage : { ...coverage, courseId: "another-course" }) }, knowledgeRepository, access)).toThrow(/Coverage .* belongs to another Course/);
  });

  it("rejects self/duplicate CurriculumSequence relations", () => {
    const sequence = python.curriculumSequences[0];
    expect(() => validateCourseRuntime({ ...python, curriculumSequences: [{ ...sequence, targetLessonId: sequence.sourceLessonId }] }, knowledgeRepository, access)).toThrow(/cannot reference the same Lesson twice/);
    expect(() => validateCourseRuntime({ ...python, curriculumSequences: [...python.curriculumSequences, { ...sequence, id: "parallel-sequence" }] }, knowledgeRepository, access)).toThrow(/Duplicate CurriculumSequence relation/);
  });

  it("rejects invalid CurriculumCoverage order", () => {
    const invalidOrder = (order: number) => ({ ...python, curriculumCoverages: python.curriculumCoverages.map((coverage, index) => index ? coverage : { ...coverage, order }) });
    expect(() => validateCourseRuntime(invalidOrder(-1), knowledgeRepository, access)).toThrow(/invalid Lesson order/);
    expect(() => validateCourseRuntime(invalidOrder(0.5), knowledgeRepository, access)).toThrow(/invalid Lesson order/);
    const missing = { ...python, curriculumCoverages: python.curriculumCoverages.map((coverage, index) => index ? coverage : { ...coverage, order: undefined as never }) };
    expect(() => validateCourseRuntime(missing, knowledgeRepository, access)).toThrow(/invalid Lesson order/);
  });

  it("rejects duplicate Assignment and Material coverage facts", () => {
    const assignment = python.assignmentCoverages[0];
    expect(() => validateCourseRuntime({ ...python, assignmentCoverages: [...python.assignmentCoverages, { ...assignment, id: "duplicate-assignment-relation" }] }, knowledgeRepository, access)).toThrow(/Duplicate AssignmentCoverage relation/);
    const material = python.materialKnowledgeCoverages[0];
    expect(() => validateCourseRuntime({ ...python, materialKnowledgeCoverages: [...python.materialKnowledgeCoverages, { ...material, id: "duplicate-material-relation" }] }, knowledgeRepository, access)).toThrow(/Duplicate MaterialKnowledgeCoverage relation/);
  });

  it("treats AssignmentCoverage role as one attribute of a unique Assignment–Knowledge relation", () => {
    const coverage = python.assignmentCoverages[0];
    const duplicate = { ...coverage, id: "same-pair-different-role", role: coverage.role === "apply" ? "assess" as const : "apply" as const };
    expect(() => validateCourseRuntime({ ...python, assignmentCoverages: [...python.assignmentCoverages, duplicate] }, knowledgeRepository, access)).toThrow(/Duplicate AssignmentCoverage relation/);
  });

  it.each([
    ["Chapter", (runtime: CourseRuntimeData) => ({ ...runtime, chapters: runtime.chapters.map((item, index) => index ? item : { ...item, order: -1 }) })],
    ["Lesson", (runtime: CourseRuntimeData) => ({ ...runtime, lessons: runtime.lessons.map((item, index) => index ? item : { ...item, order: 0.5 }) })],
    ["Material", (runtime: CourseRuntimeData) => ({ ...runtime, materials: runtime.materials.map((item, index) => index ? item : { ...item, order: -1 }) })],
    ["MaterialSegment", (runtime: CourseRuntimeData) => ({
      ...runtime,
      materials: runtime.materials.map((item, index) => index ? item : {
        ...item,
        segments: item.segments.map((segment, segmentIndex) => segmentIndex ? segment : { ...segment, order: Number.NaN })
      })
    })],
    ["Assignment", (runtime: CourseRuntimeData) => ({ ...runtime, assignments: runtime.assignments.map((item, index) => index ? item : { ...item, order: -1 }) })]
  ])("rejects invalid explicit %s order", (label, mutate) => {
    expect(() => validateCourseRuntime(mutate(python), knowledgeRepository, access)).toThrow(new RegExp(`${label} .*invalid order`));
  });

  it("rejects duplicate order inside each ordering scope", () => {
    expect(() => validateCourseRuntime({ ...python, lessons: python.lessons.map((item, index) => index === 1 ? { ...item, order: python.lessons[0].order } : item) }, knowledgeRepository, access)).toThrow(/Lesson orders must be unique/);
    expect(() => validateCourseRuntime({ ...python, assignments: python.assignments.map((item, index) => index === 1 ? { ...item, order: python.assignments[0].order } : item) }, knowledgeRepository, access)).toThrow(/Assignment orders must be unique/);
    const material = python.materials[0];
    expect(() => validateCourseRuntime({ ...python, materials: python.materials.map((item) => item.id === material.id ? { ...item, segments: item.segments.map((segment, index) => index === 1 ? { ...segment, order: item.segments[0].order } : segment) } : item) }, knowledgeRepository, access)).toThrow(/MaterialSegment .* orders must be unique/);
  });

  it("keeps CurriculumChapter pure and CourseRepository definition-only", () => {
    const types = readFileSync(join(process.cwd(), "src/features/course/types.ts"), "utf8");
    const chapterType = types.match(/export type CurriculumChapter = \{([\s\S]*?)\n\};/)?.[1] ?? "";
    expect(chapterType).not.toMatch(/\bprogress\b|\blessonIds\b/);
    expect(repository).not.toHaveProperty("listCourses");
    expect(agentic.chapters.every((chapter) => !("progress" in chapter) && !("lessonIds" in chapter))).toBe(true);
    expect(python.chapters.every((chapter) => !("progress" in chapter) && !("lessonIds" in chapter))).toBe(true);
  });
});

describe("Material and progress generalization", () => {
  it("uses only the formal Material → Knowledge → Assignment relation chain", () => {
    const types = readFileSync(join(process.cwd(), "src/features/course/types.ts"), "utf8");
    const segmentType = types.match(/export type MaterialSegment = \{([\s\S]*?)\n\};/)?.[1] ?? "";
    const projection = readFileSync(join(process.cwd(), "src/features/material/materialProjection.ts"), "utf8");
    expect(segmentType).not.toContain("assignmentIds");
    expect(projection).not.toContain("material-assignment-");
    expect(projection).not.toMatch(/segment\.assignmentIds/);
    const material = python.materials.find((item) => item.id === "python-quality-testing")!;
    const result = buildMaterialSegmentProjection(python, material, "page-10", demoUserCourseStateSeed("student", python.course.id), knowledgeRepository, access, getDomainGovernanceSnapshot())!;
    expect(result.pageAssignmentContexts.every((context) => python.assignmentCoverages.some((coverage) => coverage.id === context.id))).toBe(true);
  });

  it("derives Material, Segment, and Assignment order independently of fixture array order", () => {
    expect(sortMaterials([...python.materials].reverse(), python.lessons).map((item) => item.id)).toEqual(sortMaterials(python.materials, python.lessons).map((item) => item.id));
    const article = python.materials.find((item) => item.type === "article")!;
    expect(sortMaterialSegments({ ...article, segments: [...article.segments].reverse() }).map((item) => item.id)).toEqual(sortMaterialSegments(article).map((item) => item.id));
    expect(sortAssignments([...python.assignments].reverse()).map((item) => item.id)).toEqual(sortAssignments(python.assignments).map((item) => item.id));
  });

  it("keeps graph, Material navigation, and Profile curriculum selection stable after shuffled inputs", () => {
    const shuffled: CourseRuntimeData = {
      ...python,
      materials: [...python.materials].reverse().map((material) => ({ ...material, segments: [...material.segments].reverse() })),
      assignments: [...python.assignments].reverse(),
      curriculumCoverages: [...python.curriculumCoverages].reverse(),
      assignmentCoverages: [...python.assignmentCoverages].reverse(),
      materialKnowledgeCoverages: [...python.materialKnowledgeCoverages].reverse()
    };
    const state = demoUserCourseStateSeed("student", python.course.id);
    const graphOrder = (runtime: CourseRuntimeData) => buildCourseGraphData(runtime, state, visibleGraph, userKnowledge).knowledgeNodes.map((node) => [node.id, node.primaryCoverage.id, node.assignmentIds, node.materialIds]);
    expect(graphOrder(shuffled)).toEqual(graphOrder(python));
    expect(resolveKnowledgeMaterialEntries(shuffled, "PY09")).toEqual(resolveKnowledgeMaterialEntries(python, "PY09"));
    const profileOrder = (runtime: CourseRuntimeData) => buildPersonalKnowledgeGraph(visibleGraph, userKnowledge, [runtime], [state], getDomainGovernanceSnapshot()).nodes.find((node) => node.id === "PY06")?.curriculumContexts.map((context) => context.coverageId);
    expect(profileOrder(shuffled)).toEqual(profileOrder(python));
    expect(selectPrimaryCurriculumCoverage(shuffled.curriculumCoverages.filter((coverage) => coverage.nodeId === "PY06"), shuffled.lessons)?.id).toBe(pythonGraph.knowledgeNodes.find((node) => node.id === "PY06")?.primaryCoverage.id);
  });
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
    const extraAssignments: CourseAssignment[] = ["PY09", "PY27", "PY37"].map((nodeId, index) => ({ id: `specific-${nodeId}`, courseId: python.course.id, order: python.assignments.length + index, title: `Specific ${nodeId}`, description: nodeId, requirements: [nodeId], expectedOutput: nodeId, acceptanceCriteria: [nodeId], mode: "instruction" }));
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

  it("orders Material Knowledge contexts by role priority and stable node ID regardless of coverage input order", () => {
    const material = python.materials.find((item) => item.id === "python-quality-testing")!;
    const pageCoverages = python.materialKnowledgeCoverages.filter((coverage) => coverage.materialId === material.id && coverage.segmentId === "page-10");
    const roles = ["practice-reference", "example", "introduce", "explain"] as const;
    const prioritized = pageCoverages.map((coverage, index) => ({ ...coverage, role: roles[index] }));
    const otherCoverages = python.materialKnowledgeCoverages.filter((coverage) => !pageCoverages.includes(coverage));
    const runtime = { ...python, materialKnowledgeCoverages: [...otherCoverages, ...prioritized] };
    const reordered = { ...runtime, materialKnowledgeCoverages: [...runtime.materialKnowledgeCoverages].reverse() };
    const userState = demoUserCourseStateSeed("student", python.course.id);
    const project = (input: typeof runtime) => buildMaterialSegmentProjection(input, material, "page-10", userState, knowledgeRepository, access, getDomainGovernanceSnapshot())!.knowledgeContexts.map((context) => ({ nodeId: context.nodeId, roles: context.roles }));
    expect(project(reordered)).toEqual(project(runtime));
    expect(project(runtime).map((context) => context.roles[0])).toEqual(["introduce", "explain", "example", "practice-reference"]);
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
    const styles = readFileSync(join(process.cwd(), "src/shared/styles/product.css"), "utf8");
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
    const progress = new LocalStorageLearningProgressRepository(demoUserCourseStateSeed);
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
    const progress = new LocalStorageLearningProgressRepository(demoUserCourseStateSeed);
    progress.updateMaterialReadingState("reader", agentic.course.id, "L04", "lesson-04", { recentSegmentId: "page-32", viewedSegmentIds: ["page-32"], progress: 3 });
    const state = progress.getCourseState("reader", agentic.course.id);
    expect(state.recentLessonId).toBe("L04");
    expect(state.materialStates["lesson-04"]).toMatchObject({ recentSegmentId: "page-32", progress: 3 });
  });

  it("migrates legacy learning progress to the current envelope without clearing valid edits", () => {
    const localStorage = memoryStorage();
    vi.stubGlobal("window", { localStorage });
    const state = demoUserCourseStateSeed("legacy-user", python.course.id);
    const edited: UserCourseState = { ...state, assignmentStates: { ...state.assignmentStates, "admin-edit": { assignmentId: "admin-edit", status: "completed", progress: 100 } } };
    const key = learningProgressStorageKey(edited.userId, edited.courseId);
    localStorage.setItem(key, JSON.stringify(edited));
    const loaded = new LocalStorageLearningProgressRepository(demoUserCourseStateSeed).getCourseState(edited.userId, edited.courseId);
    expect(loaded.assignmentStates["admin-edit"]).toMatchObject({ status: "completed", progress: 100 });
    expect(loaded.isActive).toBe(true);
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ schemaVersion: LEARNING_PROGRESS_SCHEMA_VERSION, state: { userId: edited.userId, courseId: edited.courseId } });
  });

  it("loads the current learning-progress envelope", () => {
    const localStorage = memoryStorage();
    vi.stubGlobal("window", { localStorage });
    const state = demoUserCourseStateSeed("current-user", agentic.course.id);
    localStorage.setItem(learningProgressStorageKey(state.userId, state.courseId), JSON.stringify({ schemaVersion: LEARNING_PROGRESS_SCHEMA_VERSION, state }));
    expect(new LocalStorageLearningProgressRepository(demoUserCourseStateSeed).getCourseState(state.userId, state.courseId)).toEqual(state);
  });

  it("falls back to the injected initial state for invalid persisted progress", () => {
    const localStorage = memoryStorage();
    vi.stubGlobal("window", { localStorage });
    const key = learningProgressStorageKey("invalid-user", agentic.course.id);
    localStorage.setItem(key, JSON.stringify({ schemaVersion: LEARNING_PROGRESS_SCHEMA_VERSION, state: { userId: "invalid-user" } }));
    expect(new LocalStorageLearningProgressRepository(demoUserCourseStateSeed).getCourseState("invalid-user", agentic.course.id)).toEqual(demoUserCourseStateSeed("invalid-user", agentic.course.id));
  });

  it("roundtrips saved learning progress through the versioned envelope", () => {
    const localStorage = memoryStorage();
    vi.stubGlobal("window", { localStorage });
    const first = new LocalStorageLearningProgressRepository(demoUserCourseStateSeed);
    first.updateAssignmentState("roundtrip-user", python.course.id, "py-runtime-model", { assignmentId: "py-runtime-model", status: "completed", progress: 100 });
    const second = new LocalStorageLearningProgressRepository(demoUserCourseStateSeed);
    expect(second.getCourseState("roundtrip-user", python.course.id).assignmentStates["py-runtime-model"]).toMatchObject({ status: "completed", progress: 100 });
  });

  it("accepts only finite learning progress in the inclusive 0–100 range", () => {
    const valid = demoUserCourseStateSeed("range-user", python.course.id);
    expect(isValidUserCourseState({ ...valid, assignmentStates: { boundary: { assignmentId: "boundary", status: "in-progress", progress: 0 } } })).toBe(true);
    expect(isValidUserCourseState({ ...valid, materialStates: { boundary: { materialId: "boundary", updatedAt: valid.updatedAt, progress: 100 } } })).toBe(true);
    for (const invalid of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isValidUserCourseState({ ...valid, assignmentStates: { invalid: { assignmentId: "invalid", status: "in-progress", progress: invalid } } })).toBe(false);
      expect(() => new LocalStorageLearningProgressRepository(demoUserCourseStateSeed).updateMaterialState("range-user", python.course.id, "invalid", { progress: invalid })).toThrow(/Learning progress is invalid/);
    }
  });

  it("keeps Core LearningProgress persistence free of Demo fixture imports", () => {
    const source = readFileSync(join(process.cwd(), "src/features/learning/progress/LocalStorageLearningProgressRepository.ts"), "utf8");
    expect(source).not.toMatch(/demo\//);
    expect(source).not.toContain("demoUserCourseStateSeed");
  });

  it("enforces the Core to Demo dependency boundary structurally", () => {
    const roots = [
      "src/features/knowledge",
      "src/features/course",
      "src/features/material",
      "src/features/learning/progress",
      "src/features/profile"
    ];
    const applicationAdapters = new Set([
      "src/features/knowledge/domain/domainStore.ts",
      "src/features/learning/progress/progressService.ts"
    ]);
    const files = roots.flatMap(typescriptFilesUnder)
      .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
      .filter((file) => !applicationAdapters.has(file));
    const violations = files.flatMap((file) => importedSpecifiers(readFileSync(join(process.cwd(), file), "utf8"))
      .filter((specifier) => specifier.split("/").includes("demo"))
      .map((specifier) => `${file} -> ${specifier}`));
    expect(violations).toEqual([]);
  });

  it("keeps Shared independent from App, Demo, and product Features", () => {
    const violations = typescriptFilesUnder("src/shared").flatMap((file) => importedSpecifiers(readFileSync(join(process.cwd(), file), "utf8"))
      .filter((specifier) => /^@\/(?:app|demo|features)(?:\/|$)/.test(specifier))
      .map((specifier) => `${file} -> ${specifier}`));
    expect(violations).toEqual([]);
  });

  it("keeps Pure Core independent from Demo, composition, React stores, and UI layers", () => {
    const pureCoreFiles = Array.from(new Set([
      ...typescriptFilesUnder("src/features/knowledge/projections"),
      ...typescriptFilesUnder("src/features/knowledge/domain").filter((file) => !file.endsWith("/domainStore.ts") && !file.endsWith("/LocalStorageDomainGovernanceRepository.ts")),
      ...typescriptFilesUnder("src/features/knowledge").filter((file) => /\/graph[^/]*\.ts$/.test(file)),
      ...typescriptFilesUnder("src/features/course/runtime"),
      ...typescriptFilesUnder("src/features/course/graph").filter((file) => file.endsWith(".ts") && !file.endsWith("/reactFlowAdapter.ts")),
      ...typescriptFilesUnder("src/features/course/curriculum"),
      "src/features/material/materialProjection.ts",
      "src/features/material/materialNavigation.ts",
      "src/features/profile/profileGraph.ts"
    ]));
    const forbidden = (specifier: string) => {
      const normalized = specifier.replace(/\.(?:ts|tsx|js|jsx)$/, "");
      const segments = normalized.split("/");
      return segments.includes("demo")
        || normalized.endsWith("/services/applicationServices")
        || normalized.endsWith("/domain/domainStore")
        || normalized === "react"
        || segments.some((segment) => segment === "pages" || segment === "admin" || segment === "components");
    };
    const violations = pureCoreFiles.flatMap((file) => importedSpecifiers(readFileSync(join(process.cwd(), file), "utf8"))
      .filter(forbidden)
      .map((specifier) => `${file} -> ${specifier}`));
    expect(violations).toEqual([]);
  });

  it("removes generic compatibility entry points for concrete Demo data", () => {
    expect(existsSync(join(process.cwd(), "src/features/data.ts"))).toBe(false);
    expect(existsSync(join(process.cwd(), "src/features/lessonData.ts"))).toBe(false);
  });

  it("uses the dedicated Assignment modal class without changing Workflow Library cards", () => {
    const lessonPage = readFileSync(join(process.cwd(), "src/features/material/pages/LessonPage.tsx"), "utf8");
    const workflowLibrary = readFileSync(join(process.cwd(), "src/features/workflow/pages/WorkflowLibraryPage.tsx"), "utf8");
    expect(lessonPage).toContain('className="atlas-workflow-modal"');
    expect(lessonPage).toContain('className="atlas-workflow-modal-card glass-v2"');
    expect(lessonPage).not.toContain('className="atlas-workflow-card glass-v2"');
    expect(workflowLibrary).toContain("atlas-workflow-card glass-v2");
  });

  it("keeps Knowledge mastery independent from Assignment completion", () => {
    const node = agenticGraph.knowledgeNodes.find((item) => item.id === "R01")!;
    expect(node.knowledgeProgress).toBe(58);
    expect(node.assignmentStateSummary.progress).not.toBe(node.knowledgeProgress);
  });

  it("projects N:M Atlas Course contexts", () => {
    const atlas = buildGlobalAtlasProjection(knowledgeRepository.getVisibleGraph(globalKnowledgeAccess), getDomainGovernanceSnapshot(), repository.listCourseRuntimes());
    expect(atlas.nodes.find((node) => node.id === "T11")?.courseContexts.map((context) => context.courseId).sort()).toEqual(["agentic-ai", "agentic-ai-golden", "python-engineering"]);
  });

  it("resolves visible Global/Tenant/User Knowledge while Global Atlas stays Global-only", () => {
    const node = (id: string, scope: KnowledgeNode["scope"], ownerId?: string): KnowledgeNode => ({ id, title: id, description: id, type: "conceptual", masteryCriteria: [id], scope, ownerId, provenance: [{ sourceType: "manual", sourceId: id }], currentRevisionId: `${id}-r1`, status: "active" });
    const scopedGraph: KnowledgeGraph = { revisions: [], edges: [], nodes: [node("G", "global"), node("T", "tenant", "tenant-1"), node("U", "user", "user-1")] };
    const scopedRepository = new InMemoryKnowledgeRepository(scopedGraph);
    const scopedAccess = userKnowledgeAccess("user-1", "tenant-1");
    expect(scopedRepository.getVisibleGraph(scopedAccess).nodes.map((item) => item.id)).toEqual(["G", "T", "U"]);
    expect(buildGlobalAtlasProjection(scopedRepository.getVisibleGraph(scopedAccess), { domains: [], assignments: [], candidates: [], proposals: [], revision: 0 }, []).nodes.map((item) => item.id)).toEqual(["G"]);

    const runtime: CourseRuntimeData = {
      course: { id: "scoped-course", title: "Scoped", description: "Scoped", accentColor: "#000000" },
      curriculum: { id: "scoped-curriculum", courseId: "scoped-course", generationMode: "auto-fixed-count", requestedChapterCount: 1 },
      chapters: [{ id: "C", courseId: "scoped-course", title: "C", description: "C", order: 1, color: "#000000", outcome: "O" }],
      lessons: [{ id: "L", courseId: "scoped-course", chapterId: "C", title: "L", order: 1 }],
      curriculumCoverages: ["G", "T", "U"].map((nodeId, order) => ({ id: `cc-${nodeId}`, courseId: "scoped-course", lessonId: "L", nodeId, role: "introduce" as const, order })),
      curriculumSequences: [],
      assignments: [{ id: "A", courseId: "scoped-course", order: 0, title: "A", description: "A", requirements: ["A"], expectedOutput: "A", acceptanceCriteria: ["A"], mode: "instruction" }],
      assignmentCoverages: ["G", "T", "U"].map((nodeId) => ({ id: `ac-${nodeId}`, assignmentId: "A", nodeId, role: "practice" as const })),
      assignmentDependencies: [], chapterOutcomes: [], assignmentOutcomeCompositions: [], finalProjects: [], finalProjectOutcomeCompositions: [],
      materials: [{ id: "M", courseId: "scoped-course", lessonId: "L", order: 0, title: "M", type: "article", segments: [{ id: "S", order: 1, title: "S", content: {} }] }],
      materialKnowledgeCoverages: ["G", "T", "U"].map((nodeId) => ({ id: `mc-${nodeId}`, materialId: "M", segmentId: "S", nodeId, role: "introduce" as const })),
      revision: "v1"
    };
    expect(validateCourseRuntime(runtime, scopedRepository, scopedAccess)).toBe(true);
    expect(buildCourseGraphData(runtime, demoUserCourseStateSeed("user-1", "scoped-course"), scopedRepository.getVisibleGraph(scopedAccess)).knowledgeNodes).toHaveLength(3);
  });

  it("keeps shared WorkflowTemplate runtime records Course-independent", () => {
    const template: Template = { id: "same-template", name: "Shared", description: "Shared", nodes: [], edges: [], runOrder: [], result: "ok", code: "" };
    const demoRuntime = new DemoWorkflowRuntime();
    const runA = demoRuntime.createRunRecord(template, {}, 1);
    const runB = demoRuntime.createRunRecord(template, {}, 2);
    expect(runA.workflowTemplateId).toBe(runB.workflowTemplateId);
    expect(runA).not.toHaveProperty("assignmentId");
    expect(runB).not.toHaveProperty("courseId");
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

  it("preserves course-scoped Lesson, Assignment, and Coverage identities in Personal Atlas", () => {
    const node: KnowledgeNode = {
      id: "shared-node",
      title: "Shared Node",
      description: "Shared Node",
      type: "conceptual",
      masteryCriteria: ["Explain the node"],
      scope: "global",
      provenance: [{ sourceType: "manual", sourceId: "test" }],
      currentRevisionId: "shared-node-r1",
      status: "active"
    };
    const graph: KnowledgeGraph = { nodes: [node], revisions: [], edges: [] };
    const runtime = (courseId: string, title: string): CourseRuntimeData => ({
      course: { id: courseId, title, description: title },
      curriculum: { id: "curriculum-01", courseId, generationMode: "manual" },
      chapters: [{ id: "chapter-01", courseId, title: `${title} Chapter`, description: title, order: 0, color: "#000000", outcome: title }],
      lessons: [{ id: "lesson-01", courseId, chapterId: "chapter-01", title: `${title} Lesson`, order: 0 }],
      curriculumCoverages: [{ id: "coverage-01", courseId, lessonId: "lesson-01", nodeId: node.id, role: "introduce", order: 0 }],
      curriculumSequences: [],
      assignments: [{ id: "assignment-01", courseId, order: 0, title: `${title} Assignment`, description: title, requirements: [title], expectedOutput: title, acceptanceCriteria: [title], mode: "instruction" }],
      assignmentCoverages: [{ id: "assignment-coverage-01", assignmentId: "assignment-01", nodeId: node.id, role: "practice" }],
      assignmentDependencies: [], chapterOutcomes: [], assignmentOutcomeCompositions: [], finalProjects: [], finalProjectOutcomeCompositions: [],
      materials: [],
      materialKnowledgeCoverages: [],
      revision: "v1"
    });
    const runtimeA = runtime("course-a", "Course A");
    const runtimeB = runtime("course-b", "Course B");
    const state = (courseId: string, completed: boolean): UserCourseState => ({
      userId: "user-1",
      courseId,
      isActive: true,
      assignmentStates: {
        "assignment-01": { assignmentId: "assignment-01", status: completed ? "completed" : "not-started", progress: completed ? 100 : 0 }
      },
      materialStates: {},
      updatedAt: "2026-08-10T00:00:00.000Z"
    });
    const states = [state("course-a", true), state("course-b", false)];
    const userRecord = [{ nodeId: node.id, status: "mastered" as const, mastery: 100 }];
    const governance = { domains: [], assignments: [], candidates: [], proposals: [], revision: 0 };

    const projected = buildPersonalKnowledgeGraph(graph, userRecord, [runtimeA, runtimeB], states, governance);
    const reversed = buildPersonalKnowledgeGraph(graph, userRecord, [runtimeB, runtimeA], states, governance);
    const projectedNode = projected.nodes[0];

    expect(projectedNode.curriculumContexts.map((context) => [context.courseId, context.lessonId, context.coverageId])).toEqual([
      ["course-a", "lesson-01", "coverage-01"],
      ["course-b", "lesson-01", "coverage-01"]
    ]);
    expect(projectedNode.assignmentContexts.map((context) => [context.courseId, context.assignmentId, context.title, context.status])).toEqual([
      ["course-a", "assignment-01", "Course A Assignment", "completed"],
      ["course-b", "assignment-01", "Course B Assignment", "not-started"]
    ]);
    expect(projected.summary.completedAssignments).toBe(1);
    expect(reversed.nodes[0].curriculumContexts).toEqual(projectedNode.curriculumContexts);
    expect(reversed.nodes[0].assignmentContexts).toEqual(projectedNode.assignmentContexts);
    expect(reversed.summary).toEqual(projected.summary);
  });
});

describe("Course Assignment layout and Drawer", () => {
  it("aggregates multiple Segment coverages into one Material context", () => {
    const node = pythonGraph.knowledgeNodes.find((candidate) => {
      const coverageCounts = candidate.materialContexts.map((context) => python.materialKnowledgeCoverages.filter((coverage) => coverage.nodeId === candidate.id && coverage.materialId === context.materialId).length);
      return coverageCounts.some((count) => count > 1);
    })!;
    const context = node.materialContexts.find((candidate) => python.materialKnowledgeCoverages.filter((coverage) => coverage.nodeId === node.id && coverage.materialId === candidate.materialId).length > 1)!;
    const rawCoverages = python.materialKnowledgeCoverages.filter((coverage) => coverage.nodeId === node.id && coverage.materialId === context.materialId);
    expect(node.materialContexts.filter((candidate) => candidate.materialId === context.materialId)).toHaveLength(1);
    expect(context.segmentIds).toEqual(Array.from(new Set(rawCoverages.map((coverage) => coverage.segmentId))));
  });

  it("includes the companion offset in one stable footprint", () => {
    expect(ATOMIC_FOOTPRINT_WIDTH).toBe(KNOWLEDGE_CARD_WIDTH + COMPANION_OFFSET_X);
    expect(ATOMIC_FOOTPRINT_HEIGHT).toBe(KNOWLEDGE_CARD_HEIGHT + COMPANION_OFFSET_Y);
  });

  it("routes overview Chapter edges from the final React Flow handles", async () => {
    const projection = buildCourseGraphProjection(agenticGraph, "overview", null);
    const layout = await layoutCourseGraph(agenticGraph, projection);
    const flow = toReactFlow(layout, agenticGraph.knowledgeEdges, "knowledge", null, null);
    const chapterEdges = layout.edges.filter((edge) => edge.kind === "chapter");
    expect(chapterEdges.length).toBeGreaterThan(0);
    expect(chapterEdges.every((edge) => edge.routing === "react-flow" && !edge.path)).toBe(true);
    expect(flow.edges.every((edge) => edge.sourceHandle === "out" && edge.targetHandle === "in")).toBe(true);
  });

  it("orders same-Lesson Knowledge by CurriculumCoverage.order instead of KnowledgeNode or Coverage IDs", () => {
    const base = pythonGraph.knowledgeNodes[0];
    const variants = [
      { ...base, id: "ZZZ", primaryCoverage: { ...base.primaryCoverage, id: "coverage-uuid-z", order: 0 } },
      { ...base, id: "AAA", primaryCoverage: { ...base.primaryCoverage, id: "coverage-uuid-a", order: 1 } }
    ];
    const projection = buildCourseGraphProjection({ ...pythonGraph, knowledgeNodes: variants, knowledgeEdges: [], chapterEdges: [] }, "full", null);
    const orderedIds = projection.nodes.filter((node) => node.kind === "knowledge").sort((left, right) => left.order - right.order).map((node) => node.knowledge!.id);
    expect(orderedIds).toEqual(["ZZZ", "AAA"]);
  });

  it("selects introduce coverage first, then Lesson order, coverage order, and stable ID", () => {
    const target = "PY06";
    const baseCoverages = python.curriculumCoverages.filter((coverage) => coverage.nodeId === target);
    expect(baseCoverages.some((coverage) => coverage.role === "reinforce" && python.lessons.find((lesson) => lesson.id === coverage.lessonId)!.order > 1)).toBe(true);
    const extra = [
      { ...baseCoverages[0], id: "coverage-earlier-reinforce", lessonId: "PY-L01", order: 0, role: "reinforce" as const },
      { ...baseCoverages[0], id: "coverage-z", order: 0, role: "introduce" as const },
      { ...baseCoverages[0], id: "coverage-a", order: 0, role: "introduce" as const }
    ];
    const runtime = { ...python, curriculumCoverages: [...python.curriculumCoverages, ...extra] };
    const graph = buildCourseGraphData(runtime, demoUserCourseStateSeed("student", python.course.id), visibleGraph, userKnowledge);
    expect(graph.knowledgeNodes.find((node) => node.id === target)?.primaryCoverage.id).toBe("coverage-a");
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

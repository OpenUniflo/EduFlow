import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { buildCourseGraphData, validateCourseRuntime, type CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import { buildCourseGraphProjection } from "@/features/course/graph/courseGraphProjection";
import { ATOMIC_FOOTPRINT_HEIGHT, ATOMIC_FOOTPRINT_WIDTH, COMPANION_OFFSET_X, COMPANION_OFFSET_Y, KNOWLEDGE_CARD_HEIGHT, KNOWLEDGE_CARD_WIDTH, getCourseLayoutCacheKey, layoutCourseGraph } from "@/features/course/graph/elkCourseLayout";
import { toReactFlow } from "@/features/course/graph/reactFlowAdapter";
import { assignmentProjectionForNode, buildChapterAssignmentProjection, courseDrawerProjectionKind, detailFacetForMode, flowIdForAnchor, type SelectedAnchor } from "@/features/course/courseSelection";
import { LEARNING_PROGRESS_SCHEMA_VERSION, LocalStorageLearningProgressRepository, isValidUserCourseState, learningProgressStorageKey } from "@/features/learning/progress/LocalStorageLearningProgressRepository";
import { buildGlobalAtlasProjection } from "@/features/knowledge/projections/atlasProjections";
import { globalKnowledgeAccess, userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { resolveInitialMaterialSegment, resolveKnowledgeMaterialEntries, resolveKnowledgeMaterialEntry, buildMaterialDeepLink } from "@/features/material/materialNavigation";
import { classifySegmentQueryChange, selectPageAtReadingAnchor } from "@/features/material/reader/materialReaderState";
import { createMaterialKnowledgeContextState, reduceMaterialKnowledgeContextState, resolveEffectiveKnowledgeId } from "@/features/material/reader/materialKnowledgeContextState";
import { buildKnowledgeAssignmentContexts, buildMaterialKnowledgeContext, buildMaterialKnowledgeRoles, buildMaterialSegmentProjection } from "@/features/material/materialProjection";
import { InMemoryKnowledgeRepository } from "@/features/knowledge/repository/InMemoryKnowledgeRepository";
import type { KnowledgeGraph, KnowledgeNode } from "@/features/knowledge/types";
import { buildPersonalKnowledgeGraph } from "@/features/profile/profileGraph";
import type { AssignmentCoverage, CourseAssignment, UserCourseState } from "@/features/course/types";
import { selectPrimaryCurriculumCoverage } from "@/features/course/curriculum/curriculumOrdering";
import { sortAssignments, sortMaterials, sortMaterialSegments } from "@/features/material/materialOrdering";
import { syntheticPersonalKnowledgeGraph, syntheticDomainGovernance, syntheticDomains } from "../../../tests/fixtures/knowledge";
import { SyntheticCourseRepository, syntheticAlphaRuntime, syntheticBetaRuntime, syntheticUserCourseState, syntheticUserKnowledge } from "../../../tests/fixtures/courses";

const knowledgeRepository = new InMemoryKnowledgeRepository(syntheticPersonalKnowledgeGraph);
const repository = new SyntheticCourseRepository(knowledgeRepository);
const getDomainGovernanceSnapshot = syntheticDomainGovernance;
const access = userKnowledgeAccess("fixture-user-a");
const visibleGraph = knowledgeRepository.getVisibleGraph(access);
const userKnowledge = syntheticUserKnowledge("fixture-user-a");
const alpha = repository.getCourse("fixture-course-alpha")!;
const beta = repository.getCourse("fixture-course-beta")!;
const alphaGraph = buildCourseGraphData(alpha, syntheticUserCourseState("fixture-user-a", alpha.course.id), visibleGraph, userKnowledge);
const betaGraph = buildCourseGraphData(beta, syntheticUserCourseState("fixture-user-a", beta.course.id), visibleGraph, userKnowledge);

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
    expect(repository.listCourseRuntimes().map((runtime) => runtime.course.id)).toEqual(["fixture-course-alpha", "fixture-course-beta"]);
    expect(repository.getCourse("fixture-course-alpha")).not.toBe(repository.getCourse("fixture-course-beta"));
    expect(repository.getCourse("not-exist")).toBeNull();
    expect(validateCourseRuntime(alpha, knowledgeRepository, access)).toBe(true);
    expect(validateCourseRuntime(beta, knowledgeRepository, access)).toBe(true);
  });

  it("keeps Course graph data isolated", () => {
    expect(alphaGraph.courseId).not.toBe(betaGraph.courseId);
    expect(alphaGraph.chapters.every((chapter) => chapter.courseId === alpha.course.id)).toBe(true);
    expect(betaGraph.chapters.every((chapter) => chapter.courseId === beta.course.id)).toBe(true);
    expect(alphaGraph.knowledgeNodes.some((node) => node.id === "syn-a")).toBe(true);
    expect(betaGraph.knowledgeNodes.some((node) => node.id === "syn-e")).toBe(true);
    expect(beta.assignments.every((assignment) => assignment.courseId === beta.course.id)).toBe(true);
  });

  it("keeps the Course page renderable when factual atomic relations form a Chapter-level cycle", () => {
    const firstChapterNodes = alphaGraph.knowledgeNodes.filter((node) => node.chapterId === alpha.chapters[0].id);
    const secondChapterNodes = alphaGraph.knowledgeNodes.filter((node) => node.chapterId === alpha.chapters[1].id);
    expect(firstChapterNodes.length).toBeGreaterThanOrEqual(2);
    expect(secondChapterNodes.length).toBeGreaterThanOrEqual(2);
    const cyclicAtChapterLevel: KnowledgeGraph = {
      nodes: visibleGraph.nodes,
      revisions: visibleGraph.revisions,
      edges: [
        { id: "regression-forward", source: firstChapterNodes[0].id, target: secondChapterNodes[0].id, relation: "prerequisite", strength: "hard", reason: "Synthetic forward relation" },
        { id: "regression-backward", source: secondChapterNodes[1].id, target: firstChapterNodes[1].id, relation: "enables", strength: 0.8, reason: "Synthetic backward relation" }
      ]
    };

    const graphData = buildCourseGraphData(alpha, syntheticUserCourseState("fixture-user-a", alpha.course.id), cyclicAtChapterLevel, userKnowledge);
    const orderByChapter = new Map(alpha.chapters.map((chapter) => [chapter.id, chapter.order]));
    expect(graphData.knowledgeEdges.map((edge) => edge.id)).toEqual(["regression-forward", "regression-backward"]);
    expect(graphData.chapterEdges.length).toBeGreaterThan(0);
    expect(graphData.chapterEdges.every((edge) => orderByChapter.get(edge.source)! < orderByChapter.get(edge.target)!)).toBe(true);
    expect(buildCourseGraphProjection(graphData, "overview", null).nodes.some((node) => node.kind === "chapter")).toBe(true);
  });

  it("covers every Course KnowledgeNode and contains real N:M examples", () => {
    [alpha, beta].forEach((runtime) => {
      const nodeIds = new Set(runtime.curriculumCoverages.map((coverage) => coverage.nodeId));
      const covered = new Set(runtime.assignmentCoverages.map((coverage) => coverage.nodeId));
      expect(covered).toEqual(nodeIds);
      expect(runtime.assignments.some((assignment) => runtime.assignmentCoverages.filter((coverage) => coverage.assignmentId === assignment.id).length > 1)).toBe(true);
    });
    expect(alphaGraph.knowledgeNodes.some((node) => node.assignmentCount > 1)).toBe(true);
  });

  it("uses courseId and structural revision as the only layout cache identity", () => {
    expect(getCourseLayoutCacheKey("fixture-course-alpha", "v1")).not.toBe(getCourseLayoutCacheKey("fixture-course-beta", "v1"));
    expect(getCourseLayoutCacheKey("fixture-course-alpha", "v1")).not.toBe(getCourseLayoutCacheKey("fixture-course-alpha", "v2"));
    expect(getCourseLayoutCacheKey(alphaGraph.courseId, alphaGraph.revision)).toBe(getCourseLayoutCacheKey(alphaGraph.courseId, alphaGraph.revision));
  });

  it.each([
    ["CurriculumCoverage", (runtime: CourseRuntimeData) => ({ ...runtime, curriculumCoverages: [...runtime.curriculumCoverages, { ...runtime.curriculumCoverages[0] }] })],
    ["CurriculumSequence", (runtime: CourseRuntimeData) => ({ ...runtime, curriculumSequences: [...runtime.curriculumSequences, { ...runtime.curriculumSequences[0] }] })],
    ["AssignmentCoverage", (runtime: CourseRuntimeData) => ({ ...runtime, assignmentCoverages: [...runtime.assignmentCoverages, { ...runtime.assignmentCoverages[0] }] })],
    ["MaterialKnowledgeCoverage", (runtime: CourseRuntimeData) => ({ ...runtime, materialKnowledgeCoverages: [...runtime.materialKnowledgeCoverages, { ...runtime.materialKnowledgeCoverages[0] }] })]
  ])("rejects duplicate %s ids", (label, mutate) => {
    expect(() => validateCourseRuntime(mutate(beta), knowledgeRepository, access)).toThrow(`${label} ids must be unique`);
  });

  it("rejects cross-Course sequence/coverage ownership and unknown Chapter membership", () => {
    expect(() => validateCourseRuntime({ ...beta, curriculumSequences: beta.curriculumSequences.map((sequence, index) => index ? sequence : { ...sequence, courseId: "another-course" }) }, knowledgeRepository, access)).toThrow(/CurriculumSequence .* belongs to another Course/);
    expect(() => validateCourseRuntime({ ...beta, lessons: beta.lessons.map((lesson, index) => index ? lesson : { ...lesson, chapterId: "unknown" }) }, knowledgeRepository, access)).toThrow(/references unknown Chapter/);
    expect(() => validateCourseRuntime({ ...beta, curriculumCoverages: beta.curriculumCoverages.map((coverage, index) => index ? coverage : { ...coverage, courseId: "another-course" }) }, knowledgeRepository, access)).toThrow(/Coverage .* belongs to another Course/);
  });

  it("rejects self/duplicate CurriculumSequence relations", () => {
    const sequence = beta.curriculumSequences[0];
    expect(() => validateCourseRuntime({ ...beta, curriculumSequences: [{ ...sequence, targetLessonId: sequence.sourceLessonId }] }, knowledgeRepository, access)).toThrow(/cannot reference the same Lesson twice/);
    expect(() => validateCourseRuntime({ ...beta, curriculumSequences: [...beta.curriculumSequences, { ...sequence, id: "parallel-sequence" }] }, knowledgeRepository, access)).toThrow(/Duplicate CurriculumSequence relation/);
  });

  it("rejects invalid CurriculumCoverage order", () => {
    const invalidOrder = (order: number) => ({ ...beta, curriculumCoverages: beta.curriculumCoverages.map((coverage, index) => index ? coverage : { ...coverage, order }) });
    expect(() => validateCourseRuntime(invalidOrder(-1), knowledgeRepository, access)).toThrow(/invalid Lesson order/);
    expect(() => validateCourseRuntime(invalidOrder(0.5), knowledgeRepository, access)).toThrow(/invalid Lesson order/);
    const missing = { ...beta, curriculumCoverages: beta.curriculumCoverages.map((coverage, index) => index ? coverage : { ...coverage, order: undefined as never }) };
    expect(() => validateCourseRuntime(missing, knowledgeRepository, access)).toThrow(/invalid Lesson order/);
  });

  it("rejects duplicate Assignment and Material coverage facts", () => {
    const assignment = beta.assignmentCoverages[0];
    expect(() => validateCourseRuntime({ ...beta, assignmentCoverages: [...beta.assignmentCoverages, { ...assignment, id: "duplicate-assignment-relation" }] }, knowledgeRepository, access)).toThrow(/Duplicate AssignmentCoverage relation/);
    const material = beta.materialKnowledgeCoverages[0];
    expect(() => validateCourseRuntime({ ...beta, materialKnowledgeCoverages: [...beta.materialKnowledgeCoverages, { ...material, id: "duplicate-material-relation" }] }, knowledgeRepository, access)).toThrow(/Duplicate MaterialKnowledgeCoverage relation/);
  });

  it("treats AssignmentCoverage role as one attribute of a unique Assignment–Knowledge relation", () => {
    const coverage = beta.assignmentCoverages[0];
    const duplicate = { ...coverage, id: "same-pair-different-role", role: coverage.role === "apply" ? "assess" as const : "apply" as const };
    expect(() => validateCourseRuntime({ ...beta, assignmentCoverages: [...beta.assignmentCoverages, duplicate] }, knowledgeRepository, access)).toThrow(/Duplicate AssignmentCoverage relation/);
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
    expect(() => validateCourseRuntime(mutate(beta), knowledgeRepository, access)).toThrow(new RegExp(`${label} .*invalid order`));
  });

  it("rejects duplicate order inside each ordering scope", () => {
    expect(() => validateCourseRuntime({ ...beta, lessons: beta.lessons.map((item, index) => index === 1 ? { ...item, order: beta.lessons[0].order } : item) }, knowledgeRepository, access)).toThrow(/Lesson orders must be unique/);
    expect(() => validateCourseRuntime({ ...beta, assignments: beta.assignments.map((item, index) => index === 1 ? { ...item, order: beta.assignments[0].order } : item) }, knowledgeRepository, access)).toThrow(/Assignment orders must be unique/);
    const material = beta.materials[0];
    expect(() => validateCourseRuntime({ ...beta, materials: beta.materials.map((item) => item.id === material.id ? { ...item, segments: item.segments.map((segment, index) => index === 1 ? { ...segment, order: item.segments[0].order } : segment) } : item) }, knowledgeRepository, access)).toThrow(/MaterialSegment .* orders must be unique/);
  });

  it("keeps CurriculumChapter pure and CourseRepository definition-only", () => {
    const types = readFileSync(join(process.cwd(), "src/features/course/types.ts"), "utf8");
    const chapterType = types.match(/export type CurriculumChapter = \{([\s\S]*?)\n\};/)?.[1] ?? "";
    expect(chapterType).not.toMatch(/\bprogress\b|\blessonIds\b/);
    expect(repository).not.toHaveProperty("listCourses");
    expect(alpha.chapters.every((chapter) => !("progress" in chapter) && !("lessonIds" in chapter))).toBe(true);
    expect(beta.chapters.every((chapter) => !("progress" in chapter) && !("lessonIds" in chapter))).toBe(true);
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
    const material = alpha.materials.find((item) => item.id === "alpha-article")!;
    const result = buildMaterialSegmentProjection(alpha, material, "alpha-seg-1", syntheticUserCourseState("fixture-user-a", alpha.course.id), knowledgeRepository, access, getDomainGovernanceSnapshot())!;
    expect(result.pageAssignmentContexts.every((context) => alpha.assignmentCoverages.some((coverage) => coverage.id === context.id))).toBe(true);
  });

  it("derives Material, Segment, and Assignment order independently of fixture array order", () => {
    expect(sortMaterials([...alpha.materials].reverse()).map((item) => item.id)).toEqual(sortMaterials(alpha.materials).map((item) => item.id));
    const article = alpha.materials.find((item) => item.type === "article")!;
    expect(sortMaterialSegments({ ...article, segments: [...article.segments].reverse() }).map((item) => item.id)).toEqual(sortMaterialSegments(article).map((item) => item.id));
    expect(sortAssignments([...alpha.assignments].reverse()).map((item) => item.id)).toEqual(sortAssignments(alpha.assignments).map((item) => item.id));
  });

  it("keeps graph, Material navigation, and Profile curriculum selection stable after shuffled inputs", () => {
    const shuffled: CourseRuntimeData = {
      ...alpha,
      materials: [...alpha.materials].reverse().map((material) => ({ ...material, segments: [...material.segments].reverse() })),
      assignments: [...alpha.assignments].reverse(),
      curriculumCoverages: [...alpha.curriculumCoverages].reverse(),
      assignmentCoverages: [...alpha.assignmentCoverages].reverse(),
      materialKnowledgeCoverages: [...alpha.materialKnowledgeCoverages].reverse()
    };
    const state = syntheticUserCourseState("fixture-user-a", alpha.course.id);
    const graphOrder = (runtime: CourseRuntimeData) => buildCourseGraphData(runtime, state, visibleGraph, userKnowledge).knowledgeNodes.map((node) => [node.id, node.primaryCoverage.id, node.assignmentIds, node.materialIds]);
    expect(graphOrder(shuffled)).toEqual(graphOrder(alpha));
    expect(resolveKnowledgeMaterialEntries(shuffled, "syn-b")).toEqual(resolveKnowledgeMaterialEntries(alpha, "syn-b"));
    const profileOrder = (runtime: CourseRuntimeData) => buildPersonalKnowledgeGraph(visibleGraph, userKnowledge, [runtime], [state], getDomainGovernanceSnapshot()).nodes.find((node) => node.id === "syn-b")?.curriculumContexts.map((context) => context.coverageId);
    expect(profileOrder(shuffled)).toEqual(profileOrder(alpha));
    expect(selectPrimaryCurriculumCoverage(shuffled.curriculumCoverages.filter((coverage) => coverage.nodeId === "syn-b"), shuffled.lessons)?.id).toBe(alphaGraph.knowledgeNodes.find((node) => node.id === "syn-b")?.primaryCoverage.id);
  });

  it("supports Segment → multiple KnowledgeNodes and KnowledgeNode → multiple Segments/Materials", () => {
    const segmentNodes = alpha.materialKnowledgeCoverages.filter((coverage) => coverage.materialId === "alpha-article" && coverage.segmentId === "alpha-seg-1").map((coverage) => coverage.nodeId);
    expect(new Set(segmentNodes).size).toBeGreaterThan(1);
    const synB = alpha.materialKnowledgeCoverages.filter((coverage) => coverage.nodeId === "syn-b");
    expect(new Set(synB.map((coverage) => coverage.segmentId)).size).toBeGreaterThan(1);
    expect(new Set(synB.map((coverage) => coverage.materialId)).size).toBe(2);
  });

  it("resolves Materials only inside their owning Course", () => {
    expect(alpha.materials.some((material) => material.id === "alpha-article")).toBe(true);
    expect(beta.materials.some((material) => material.id === "alpha-article")).toBe(false);
  });

  it("resolves deterministic deep links and gives explicit URL Segment precedence", () => {
    const entry = resolveKnowledgeMaterialEntry(alpha, "syn-b", "alpha-article");
    expect(entry).toMatchObject({ materialId: "alpha-article", segmentId: "alpha-seg-1", role: "explain" });
    expect(buildMaterialDeepLink({ courseId: alpha.course.id, materialId: "alpha-article", segmentId: entry!.segmentId })).toBe("/courses/fixture-course-alpha/materials/alpha-article?segment=alpha-seg-1");
    expect(resolveInitialMaterialSegment({ segmentIds: ["alpha-seg-1", "alpha-seg-2", "alpha-seg-3"], requestedSegmentId: "alpha-seg-2", recentSegmentId: "alpha-seg-3" })).toBe("alpha-seg-2");
    expect(resolveInitialMaterialSegment({ segmentIds: ["alpha-seg-1", "alpha-seg-2"], requestedSegmentId: "missing", recentSegmentId: "alpha-seg-2" })).toBe("alpha-seg-2");
  });

  it("rejects malformed PDF source metadata before rendering", () => {
    const invalid: CourseRuntimeData = { ...alpha, materials: alpha.materials.map((material) => material.id === "alpha-article" ? { ...material, type: "pdf" as const, source: { kind: "pdf" as const, url: "/materials/fixture.pdf", pageCount: 2 } } : material) };
    expect(() => validateCourseRuntime(invalid, knowledgeRepository, access)).toThrow(/pageCount does not match Segments/);
  });

  it("keeps Reader URL replacement out of external navigation and selects the reading anchor", () => {
    expect(classifySegmentQueryChange("alpha-seg-1", "alpha-seg-2", "alpha-seg-2")).toBe("reader");
    expect(classifySegmentQueryChange("alpha-seg-1", "alpha-seg-1", null)).toBe("unchanged");
    expect(classifySegmentQueryChange("alpha-seg-1", "beta-seg-1", null)).toBe("external");
    expect(selectPageAtReadingAnchor([
      { page: 10, segmentId: "alpha-seg-1", top: -500, bottom: 180, intersectionRatio: 0.2 },
      { page: 11, segmentId: "alpha-seg-2", top: 200, bottom: 760, intersectionRatio: 0.8 },
      { page: 12, segmentId: "alpha-seg-3", top: 780, bottom: 1340, intersectionRatio: 0.1 }
    ], 100, 700)?.segmentId).toBe("alpha-seg-2");
  });

  it("retains a non-PDF renderer fixture", () => {
    expect(alpha.materials.some((material) => material.type === "article" && material.segments.some((segment) => Boolean(segment.content)))).toBe(true);
  });

  it("separates Auto selection from explicit ID-only Pin state", () => {
    let state = createMaterialKnowledgeContextState("syn-b");
    state = reduceMaterialKnowledgeContextState(state, { type: "select", nodeId: "syn-c" });
    expect(state).toEqual({ selectedKnowledgeId: "syn-c", pinnedKnowledgeId: null });
    state = reduceMaterialKnowledgeContextState(state, { type: "page-change", currentPagePrimaryKnowledgeId: "syn-d" });
    expect(state).toEqual({ selectedKnowledgeId: "syn-d", pinnedKnowledgeId: null });
    state = reduceMaterialKnowledgeContextState(state, { type: "pin" });
    state = reduceMaterialKnowledgeContextState(state, { type: "page-change", currentPagePrimaryKnowledgeId: "syn-e" });
    expect(resolveEffectiveKnowledgeId(state, "syn-e")).toBe("syn-d");
    expect(state.pinnedKnowledgeId).toBe("syn-d");
    state = reduceMaterialKnowledgeContextState(state, { type: "unpin", currentPagePrimaryKnowledgeId: "syn-e" });
    expect(state).toEqual({ selectedKnowledgeId: "syn-e", pinnedKnowledgeId: null });
    expect(reduceMaterialKnowledgeContextState({ selectedKnowledgeId: "syn-e", pinnedKnowledgeId: "syn-static" }, { type: "page-change", currentPagePrimaryKnowledgeId: "syn-f" })).toEqual({ selectedKnowledgeId: "syn-e", pinnedKnowledgeId: "syn-static" });
  });

  it("keeps page Assignments separate from Knowledge-specific Assignments on a multi-Knowledge Segment", () => {
    const assignmentContexts = buildKnowledgeAssignmentContexts(alpha, "syn-b", syntheticUserCourseState("fixture-user-a", alpha.course.id));
    expect(assignmentContexts.map((context) => context.assignmentId).sort()).toEqual(["alpha-practice-ab"]);
    const pageAssignments = new Set(alpha.assignmentCoverages.filter((coverage) => ["syn-a", "syn-b"].includes(coverage.nodeId)).map((coverage) => coverage.assignmentId));
    expect([...pageAssignments].sort()).toEqual(["alpha-chapter-1", "alpha-practice-ab"]);
  });

  it("orders Material Knowledge contexts by role priority and stable node ID regardless of coverage input order", () => {
    const material = alpha.materials.find((item) => item.id === "alpha-article")!;
    const base = alpha.materialKnowledgeCoverages.filter((coverage) => coverage.materialId === material.id && coverage.segmentId === "alpha-seg-1");
    const roles = ["practice-reference", "example", "introduce", "explain"] as const;
    const nodeIds = ["syn-a", "syn-b", "syn-c", "syn-d"];
    const prioritized = nodeIds.map((nodeId, index) => ({ ...base[0], id: `priority-coverage-${index}`, nodeId, role: roles[index] }));
    const otherCoverages = alpha.materialKnowledgeCoverages.filter((coverage) => !base.includes(coverage));
    const runtime = { ...alpha, materialKnowledgeCoverages: [...otherCoverages, ...prioritized] };
    const reordered = { ...runtime, materialKnowledgeCoverages: [...runtime.materialKnowledgeCoverages].reverse() };
    const state = syntheticUserCourseState("fixture-user-a", alpha.course.id);
    const project = (input: typeof runtime) => buildMaterialSegmentProjection(input, material, "alpha-seg-1", state, knowledgeRepository, access, getDomainGovernanceSnapshot())!.knowledgeContexts.map((context) => ({ nodeId: context.nodeId, roles: context.roles }));
    expect(project(reordered)).toEqual(project(runtime));
    expect(project(runtime).map((context) => context.roles[0])).toEqual(["introduce", "explain", "example", "practice-reference"]);
  });

  it("resolves pinned Knowledge metadata and Domain color from current repositories instead of snapshots", () => {
    const governance = getDomainGovernanceSnapshot();
    const before = buildMaterialKnowledgeContext("syn-a", [], knowledgeRepository, access, governance)!;
    const changed = { ...governance, domains: syntheticDomains.map((domain) => domain.id === "fixture-domain-alpha" ? { ...domain, canonicalColor: "#123456" } : domain) };
    const after = buildMaterialKnowledgeContext("syn-a", [], knowledgeRepository, access, changed)!;
    expect(before.nodeId).toBe(after.nodeId);
    expect(after.color).toBe("#123456");
    expect(after).not.toBe(before);
    expect(buildMaterialKnowledgeRoles(alpha, "alpha-article", "syn-b")).toEqual(expect.arrayContaining(["explain", "example"]));
  });

  it("gives the Material Header a real responsive boundary after the GlobalNav panel", () => {
    const css = readFileSync(join(process.cwd(), "src/shared/styles/product.css"), "utf8");
    expect(css).toContain(".atlas-lesson-header");
    expect(css).toMatch(/@media\(max-width:/);
  });

  it("isolates progress by user, Course, Material, and explicit Assignment identity", () => {
    const progress = new LocalStorageLearningProgressRepository(syntheticUserCourseState);
    const first = alpha.assignments[0];
    const untouched = alpha.assignments[1];
    progress.updateAssignmentState("isolated-user", alpha.course.id, first.id, { assignmentId: first.id, status: "completed", progress: 100 });
    const state = progress.getCourseState("isolated-user", alpha.course.id);
    expect(state.assignmentStates[first.id]?.status).toBe("completed");
    expect(state.assignmentStates[untouched.id]?.status).not.toBe("completed");
    expect(progress.getCourseState("other-user", alpha.course.id).assignmentStates[first.id]?.status).not.toBe("completed");
  });

  it("separates reading position from viewed completion and updates recent Lesson", () => {
    const progress = new LocalStorageLearningProgressRepository(syntheticUserCourseState);
    progress.updateMaterialReadingState("reader", alpha.course.id, "alpha-lesson-1", "alpha-article", { recentSegmentId: "alpha-seg-2", viewedSegmentIds: ["alpha-seg-2"], progress: 3 });
    const state = progress.getCourseState("reader", alpha.course.id);
    expect(state.recentLessonId).toBe("alpha-lesson-1");
    expect(state.materialStates["alpha-article"]).toMatchObject({ recentSegmentId: "alpha-seg-2", progress: 3 });
    progress.updateMaterialReadingState("reader", alpha.course.id, undefined, "alpha-article", { recentSegmentId: "unmapped-page", viewedSegmentIds: ["alpha-seg-2", "unmapped-page"], progress: 6 });
    const unmapped = progress.getCourseState("reader", alpha.course.id);
    expect(unmapped.recentLessonId).toBe("alpha-lesson-1");
    expect(unmapped.materialStates["alpha-article"]).toMatchObject({ recentSegmentId: "unmapped-page", progress: 6 });
  });

  it("migrates legacy learning progress to the current envelope without clearing valid edits", () => {
    const localStorage = memoryStorage();
    vi.stubGlobal("window", { localStorage });
    const state = syntheticUserCourseState("legacy-user", alpha.course.id);
    const edited: UserCourseState = { ...state, assignmentStates: { ...state.assignmentStates, "admin-edit": { assignmentId: "admin-edit", status: "completed", progress: 100 } } };
    const key = learningProgressStorageKey(edited.userId, edited.courseId);
    localStorage.setItem(key, JSON.stringify(edited));
    const loaded = new LocalStorageLearningProgressRepository(syntheticUserCourseState).getCourseState(edited.userId, edited.courseId);
    expect(loaded.assignmentStates["admin-edit"]).toMatchObject({ status: "completed", progress: 100 });
    expect(loaded.isActive).toBe(true);
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ schemaVersion: LEARNING_PROGRESS_SCHEMA_VERSION, state: { userId: edited.userId, courseId: edited.courseId } });
  });

  it("loads the current learning-progress envelope", () => {
    const localStorage = memoryStorage();
    vi.stubGlobal("window", { localStorage });
    const state = syntheticUserCourseState("current-user", alpha.course.id);
    localStorage.setItem(learningProgressStorageKey(state.userId, state.courseId), JSON.stringify({ schemaVersion: LEARNING_PROGRESS_SCHEMA_VERSION, state }));
    expect(new LocalStorageLearningProgressRepository(syntheticUserCourseState).getCourseState(state.userId, state.courseId)).toEqual(state);
  });

  it("falls back to the injected initial state for invalid persisted progress", () => {
    const localStorage = memoryStorage();
    vi.stubGlobal("window", { localStorage });
    const key = learningProgressStorageKey("invalid-user", alpha.course.id);
    localStorage.setItem(key, JSON.stringify({ schemaVersion: LEARNING_PROGRESS_SCHEMA_VERSION, state: { userId: "invalid-user" } }));
    expect(new LocalStorageLearningProgressRepository(syntheticUserCourseState).getCourseState("invalid-user", alpha.course.id)).toEqual(syntheticUserCourseState("invalid-user", alpha.course.id));
  });

  it("roundtrips saved learning progress through the versioned envelope", () => {
    const localStorage = memoryStorage();
    vi.stubGlobal("window", { localStorage });
    const first = new LocalStorageLearningProgressRepository(syntheticUserCourseState);
    first.updateAssignmentState("roundtrip-user", alpha.course.id, "alpha-practice-ab", { assignmentId: "alpha-practice-ab", status: "completed", progress: 100 });
    const second = new LocalStorageLearningProgressRepository(syntheticUserCourseState);
    expect(second.getCourseState("roundtrip-user", alpha.course.id).assignmentStates["alpha-practice-ab"]).toMatchObject({ status: "completed", progress: 100 });
  });

  it("accepts only finite learning progress in the inclusive 0–100 range", () => {
    const valid = syntheticUserCourseState("range-user", alpha.course.id);
    expect(isValidUserCourseState({ ...valid, assignmentStates: { boundary: { assignmentId: "boundary", status: "in-progress", progress: 0 } } })).toBe(true);
    expect(isValidUserCourseState({ ...valid, materialStates: { boundary: { materialId: "boundary", updatedAt: valid.updatedAt, progress: 100 } } })).toBe(true);
    for (const invalid of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isValidUserCourseState({ ...valid, assignmentStates: { invalid: { assignmentId: "invalid", status: "in-progress", progress: invalid } } })).toBe(false);
      expect(() => new LocalStorageLearningProgressRepository(syntheticUserCourseState).updateMaterialState("range-user", alpha.course.id, "invalid", { progress: invalid })).toThrow(/Learning progress is invalid/);
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

  it("keeps the Assignment modal distinct from the unified Workflow Library", () => {
    const lessonPage = readFileSync(join(process.cwd(), "src/features/material/pages/LessonPage.tsx"), "utf8");
    const workflowLibrary = readFileSync(join(process.cwd(), "src/features/workflow/pages/WorkflowLibraryPage.tsx"), "utf8");
    expect(lessonPage).toContain('className="atlas-workflow-modal"');
    expect(lessonPage).toContain('className="atlas-workflow-modal-card glass-v2"');
    expect(lessonPage).not.toContain('className="atlas-workflow-card glass-v2"');
    expect(workflowLibrary).toContain("ef-works-page");
    expect(workflowLibrary).toContain("ef-works-card");
  });

  it("keeps Knowledge mastery independent from Assignment completion", () => {
    const node = alphaGraph.knowledgeNodes.find((item) => item.id === "syn-a")!;
    expect(node.knowledgeProgress).toBe(70);
    expect(node.assignmentStateSummary.progress).not.toBe(node.knowledgeProgress);
  });

  it("projects N:M Atlas Course contexts", () => {
    const atlas = buildGlobalAtlasProjection(knowledgeRepository.getVisibleGraph(globalKnowledgeAccess), getDomainGovernanceSnapshot(), repository.listCourseRuntimes());
    expect(atlas.nodes.find((node) => node.id === "syn-c")?.courseContexts.map((context) => context.courseId).sort()).toEqual(["fixture-course-alpha", "fixture-course-beta"]);
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
      materials: [{ id: "M", courseId: "scoped-course", order: 0, title: "M", type: "article", segments: [{ id: "S", order: 1, title: "S", content: {} }] }],
      materialKnowledgeCoverages: ["G", "T", "U"].map((nodeId) => ({ id: `mc-${nodeId}`, materialId: "M", segmentId: "S", nodeId, role: "introduce" as const })),
      revision: "v1"
    };
    expect(validateCourseRuntime(runtime, scopedRepository, scopedAccess)).toBe(true);
    expect(buildCourseGraphData(runtime, syntheticUserCourseState("user-1", "scoped-course"), scopedRepository.getVisibleGraph(scopedAccess)).knowledgeNodes).toHaveLength(3);
  });

  it("projects different Personal Atlas state for different users", () => {
    const governance = getDomainGovernanceSnapshot();
    const userA = "fixture-user-a";
    const userB = "fixture-user-b";
    const statesFor = (userId: string) => repository.listCourseRuntimes().map((runtime) => syntheticUserCourseState(userId, runtime.course.id));
    const graphA = buildPersonalKnowledgeGraph(knowledgeRepository.getVisibleGraph(userKnowledgeAccess(userA)), syntheticUserKnowledge(userA), repository.listCourseRuntimes(), statesFor(userA), governance);
    const graphB = buildPersonalKnowledgeGraph(knowledgeRepository.getVisibleGraph(userKnowledgeAccess(userB)), syntheticUserKnowledge(userB), repository.listCourseRuntimes(), statesFor(userB), governance);
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
      assignmentStates: { "assignment-01": { assignmentId: "assignment-01", status: completed ? "completed" : "not-started", progress: completed ? 100 : 0 } },
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
    const node = alphaGraph.knowledgeNodes.find((candidate) => {
      const coverageCounts = candidate.materialContexts.map((context) => alpha.materialKnowledgeCoverages.filter((coverage) => coverage.nodeId === candidate.id && coverage.materialId === context.materialId).length);
      return coverageCounts.some((count) => count > 1);
    })!;
    const context = node.materialContexts.find((candidate) => alpha.materialKnowledgeCoverages.filter((coverage) => coverage.nodeId === node.id && coverage.materialId === candidate.materialId).length > 1)!;
    const rawCoverages = alpha.materialKnowledgeCoverages.filter((coverage) => coverage.nodeId === node.id && coverage.materialId === context.materialId);
    expect(node.materialContexts.filter((candidate) => candidate.materialId === context.materialId)).toHaveLength(1);
    expect(context.segmentIds).toEqual(Array.from(new Set(rawCoverages.map((coverage) => coverage.segmentId))));
  });

  it("includes the companion offset in one stable footprint", () => {
    expect(ATOMIC_FOOTPRINT_WIDTH).toBe(KNOWLEDGE_CARD_WIDTH + COMPANION_OFFSET_X);
    expect(ATOMIC_FOOTPRINT_HEIGHT).toBe(KNOWLEDGE_CARD_HEIGHT + COMPANION_OFFSET_Y);
  });

  it("routes overview Chapter edges from the final React Flow handles", async () => {
    const projection = buildCourseGraphProjection(alphaGraph, "overview", null);
    const layout = await layoutCourseGraph(alphaGraph, projection);
    const flow = toReactFlow(layout, alphaGraph.knowledgeEdges, "knowledge", null, null);
    const chapterEdges = layout.edges.filter((edge) => edge.kind === "chapter");
    expect(chapterEdges.length).toBeGreaterThan(0);
    expect(chapterEdges.every((edge) => edge.routing === "react-flow" && !edge.path)).toBe(true);
    expect(flow.edges.every((edge) => edge.sourceHandle === "out" && edge.targetHandle === "in")).toBe(true);
  });

  it("orders same-Lesson Knowledge by CurriculumCoverage.order instead of KnowledgeNode or Coverage IDs", () => {
    const base = alphaGraph.knowledgeNodes[0];
    const variants = [
      { ...base, id: "ZZZ", primaryCoverage: { ...base.primaryCoverage, id: "coverage-uuid-z", order: 0 } },
      { ...base, id: "AAA", primaryCoverage: { ...base.primaryCoverage, id: "coverage-uuid-a", order: 1 } }
    ];
    const projection = buildCourseGraphProjection({ ...alphaGraph, knowledgeNodes: variants, knowledgeEdges: [], chapterEdges: [] }, "full", null);
    const orderedIds = projection.nodes.filter((node) => node.kind === "knowledge").sort((left, right) => left.order - right.order).map((node) => node.knowledge!.id);
    expect(orderedIds).toEqual(["ZZZ", "AAA"]);
  });

  it("selects introduce coverage first, then Lesson order, coverage order, and stable ID", () => {
    const coverages = [
      { id: "coverage-z", courseId: alpha.course.id, lessonId: "alpha-lesson-2", nodeId: "syn-b", role: "reinforce" as const, order: 0 },
      { id: "coverage-b", courseId: alpha.course.id, lessonId: "alpha-lesson-1", nodeId: "syn-b", role: "introduce" as const, order: 1 },
      { id: "coverage-a", courseId: alpha.course.id, lessonId: "alpha-lesson-1", nodeId: "syn-b", role: "introduce" as const, order: 1 }
    ];
    expect(selectPrimaryCurriculumCoverage(coverages, alpha.lessons)?.id).toBe("coverage-a");
  });

  it("keeps every expanded footprint inside its Chapter", async () => {
    const projection = buildCourseGraphProjection(betaGraph, "full", null);
    const layout = await layoutCourseGraph(betaGraph, projection);
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
    const projection = buildCourseGraphProjection(betaGraph, "full", null);
    const layout = await layoutCourseGraph(betaGraph, projection);
    const knowledgeFlow = toReactFlow(layout, betaGraph.knowledgeEdges, "knowledge", null, null);
    const assignmentFlow = toReactFlow(layout, betaGraph.knowledgeEdges, "assignment", null, null);
    expect(assignmentFlow.nodes.map(({ id, position, parentId }) => ({ id, position, parentId }))).toEqual(knowledgeFlow.nodes.map(({ id, position, parentId }) => ({ id, position, parentId })));
    expect(assignmentFlow.edges.map((edge) => [edge.id, edge.source, edge.target])).toEqual(knowledgeFlow.edges.map((edge) => [edge.id, edge.source, edge.target]));
  });

  const multiNode = alphaGraph.knowledgeNodes.find((node) => node.assignmentCount > 1)!;
  const singleNode = alphaGraph.knowledgeNodes.find((node) => node.assignmentCount === 1)!;

  it("keeps anchor stable while mode drives Knowledge/Assignment facets", () => {
    const anchor: SelectedAnchor = { kind: "knowledge", id: multiNode.id };
    expect(courseDrawerProjectionKind(anchor, "knowledge", multiNode)).toBe("atomic-knowledge");
    expect(courseDrawerProjectionKind(anchor, "assignment", multiNode)).toBe("assignment-group");
    expect(flowIdForAnchor(anchor)).toBe(`knowledge:${multiNode.id}`);
    expect(detailFacetForMode("assignment")).toBe("assignment");
  });

  it("deduplicates Chapter Assignments and opens group/detail correctly", () => {
    const chapter = alphaGraph.chapters[0];
    const aggregate = buildChapterAssignmentProjection(chapter, alphaGraph.knowledgeNodes);
    expect(aggregate.assignments).toHaveLength(chapter.assignmentSummary.assignmentCount);
    expect(new Set(aggregate.assignments.map((item) => item.assignment.id)).size).toBe(aggregate.assignments.length);
    expect(assignmentProjectionForNode(multiNode, null)).toMatchObject({ kind: "group" });
    expect(assignmentProjectionForNode(singleNode, null)).toMatchObject({ kind: "detail", canReturnToGroup: false });
  });
});

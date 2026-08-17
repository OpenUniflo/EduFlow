import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { KnowledgeGraph } from "@/features/knowledge/types";
import { selectPrimaryCurriculumCoverage } from "@/features/course/curriculum/curriculumOrdering";
import { applyCourseAuthoringDraft, createEditableKnowledgeGraph, type CourseAuthoringDraftState } from "./courseAuthoringDraft";

export type AuthoringValidationIssue = { code: string; message: string };
export type CourseAuthoringValidation = {
  fatal: AuthoringValidationIssue[];
  warnings: AuthoringValidationIssue[];
  summary: { chapterCount: number; knowledgeCount: number; assignmentCoveredCount: number; materialCoveredCount: number; candidateCount: number; dagValid: boolean };
};

function findCycle(nodeIds: Set<string>, edges: Array<{ source: string; target: string }>) {
  const outgoing = new Map<string, string[]>();
  edges.forEach((edge) => outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(nodeId: string): boolean {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    if ((outgoing.get(nodeId) ?? []).some(visit)) return true;
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  }
  return [...nodeIds].some(visit);
}

export function validateCourseAuthoring(runtime: CourseRuntimeData, baseGraph: KnowledgeGraph, state: CourseAuthoringDraftState): CourseAuthoringValidation {
  const editable = applyCourseAuthoringDraft(runtime, state);
  const graph = createEditableKnowledgeGraph(baseGraph, state);
  const fatal: AuthoringValidationIssue[] = [];
  const warnings: AuthoringValidationIssue[] = [];
  const chapterIds = editable.chapters.map((chapter) => chapter.id);
  const chapterOrders = editable.chapters.map((chapter) => chapter.order);
  if (new Set(chapterIds).size !== chapterIds.length) fatal.push({ code: "duplicate-chapter", message: "篇章 ID 必须唯一。" });
  if (chapterOrders.some((order) => !Number.isInteger(order) || order < 0) || new Set(chapterOrders).size !== chapterOrders.length) fatal.push({ code: "invalid-chapter-order", message: "篇章顺序必须是唯一的非负整数。" });

  const courseNodeIds = new Set(editable.curriculumCoverages.map((coverage) => coverage.nodeId));
  const graphNodeIds = new Set(graph.nodes.map((node) => node.id));
  const coveragePairs = editable.curriculumCoverages.map((coverage) => `${coverage.lessonId}:${coverage.nodeId}`);
  if (new Set(coveragePairs).size !== coveragePairs.length) fatal.push({ code: "duplicate-coverage", message: "同一课次不能重复覆盖同一个 Knowledge。" });
  courseNodeIds.forEach((nodeId) => { if (!graphNodeIds.has(nodeId)) fatal.push({ code: "missing-knowledge", message: `课程引用了不存在的 Knowledge：${nodeId}` }); });

  state.addedDependencies.forEach((edge) => {
    if (!courseNodeIds.has(edge.source) || !courseNodeIds.has(edge.target)) fatal.push({ code: "broken-dependency", message: `依赖 ${edge.id} 引用了课程外 Knowledge。` });
  });
  const courseEdges = graph.edges.filter((edge) => courseNodeIds.has(edge.source) && courseNodeIds.has(edge.target));
  const pairs = new Set<string>();
  courseEdges.forEach((edge) => {
    if (edge.source === edge.target) fatal.push({ code: "self-dependency", message: `依赖 ${edge.id} 不能连接自身。` });
    const pair = `${edge.source}:${edge.target}`;
    if (pairs.has(pair)) fatal.push({ code: "duplicate-dependency", message: `依赖 ${edge.source} → ${edge.target} 重复。` });
    pairs.add(pair);
  });
  const dagValid = !findCycle(courseNodeIds, courseEdges);
  if (!dagValid) fatal.push({ code: "dependency-cycle", message: "Knowledge 依赖图存在循环。" });

  const lessonById = new Map(editable.lessons.map((lesson) => [lesson.id, lesson]));
  const primaryChapterByNode = new Map([...courseNodeIds].map((nodeId) => {
    const coverage = selectPrimaryCurriculumCoverage(editable.curriculumCoverages.filter((item) => item.nodeId === nodeId), editable.lessons);
    return [nodeId, coverage ? lessonById.get(coverage.lessonId)?.chapterId : undefined];
  }));
  const chapterPairs = new Map<string, { source: string; target: string }>();
  courseEdges.filter((edge) => edge.relation !== "related").forEach((edge) => {
    const source = primaryChapterByNode.get(edge.source);
    const target = primaryChapterByNode.get(edge.target);
    if (source && target && source !== target) chapterPairs.set(`${source}:${target}`, { source, target });
  });
  const incidentChapterIds = new Set([...chapterPairs.values()].flatMap((edge) => [edge.source, edge.target]));
  editable.chapters.filter((chapter) => chapter.order > 1 && !incidentChapterIds.has(chapter.id)).forEach((chapter) => {
    const sequence = [...editable.curriculumSequences].reverse().find((item) => lessonById.get(item.targetLessonId)?.chapterId === chapter.id && lessonById.get(item.sourceLessonId)?.chapterId !== chapter.id);
    const source = sequence ? lessonById.get(sequence.sourceLessonId)?.chapterId : undefined;
    if (source) chapterPairs.set(`${source}:${chapter.id}`, { source, target: chapter.id });
  });
  const chapterDagValid = !findCycle(new Set(chapterIds), [...chapterPairs.values()]);
  if (!chapterDagValid) fatal.push({ code: "chapter-dependency-cycle", message: "该变更会让篇章聚合依赖形成循环，请选择其他篇章或调整 Knowledge 依赖。" });

  const materials = new Map(editable.materials.map((material) => [material.id, material]));
  editable.materialKnowledgeCoverages.forEach((coverage) => {
    const material = materials.get(coverage.materialId);
    if (!material || !material.segments.some((segment) => segment.id === coverage.segmentId) || !courseNodeIds.has(coverage.nodeId)) fatal.push({ code: "broken-material-reference", message: `课件关联 ${coverage.id} 存在无效引用。` });
  });
  const assignmentCovered = new Set(editable.assignmentCoverages.map((coverage) => coverage.nodeId));
  const materialCovered = new Set(editable.materialKnowledgeCoverages.map((coverage) => coverage.nodeId));
  const missingAssignments = [...courseNodeIds].filter((id) => !assignmentCovered.has(id));
  const missingMaterials = [...courseNodeIds].filter((id) => !materialCovered.has(id));
  if (missingAssignments.length) warnings.push({ code: "missing-assignment", message: `${missingAssignments.length} 个 Knowledge 尚无 Assignment 覆盖。` });
  if (missingMaterials.length) warnings.push({ code: "missing-material", message: `${missingMaterials.length} 个 Knowledge 尚无课件覆盖。` });
  const candidates = state.addedKnowledgeCandidates.filter((candidate) => courseNodeIds.has(candidate.id));
  if (candidates.length) warnings.push({ code: "draft-candidate", message: `${candidates.length} 个课程草稿知识点尚未进入全局治理。` });
  const outcomeChapters = new Set(editable.chapterOutcomes.map((outcome) => outcome.chapterId));
  const missingOutcomes = editable.chapters.filter((chapter) => !outcomeChapters.has(chapter.id));
  if (missingOutcomes.length) warnings.push({ code: "missing-chapter-outcome", message: `${missingOutcomes.length} 个篇章没有正式 ChapterOutcome。` });
  if (!editable.finalProjects.length) warnings.push({ code: "missing-final-project", message: "课程尚未配置 FinalProject。" });

  return { fatal, warnings, summary: { chapterCount: editable.chapters.length, knowledgeCount: courseNodeIds.size, assignmentCoveredCount: assignmentCovered.size, materialCoveredCount: materialCovered.size, candidateCount: candidates.length, dagValid: dagValid && chapterDagValid } };
}

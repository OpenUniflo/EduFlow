import type { CourseRuntimeData } from "../course/runtime/courseRuntime";
import type { MaterialKnowledgeCoverageRole } from "@/features/course/types";
import { selectPrimaryCurriculumCoverage } from "../course/curriculum/curriculumOrdering";
import { compareMaterialKnowledgeCoverages, MATERIAL_COVERAGE_ROLE_PRIORITY } from "./materialCoverageOrdering";
import { getMaterialSegmentOrder } from "./materialOrdering";

export type KnowledgeMaterialEntry = {
  materialId: string;
  materialTitle: string;
  lessonId: string;
  segmentId: string;
  segmentTitle?: string;
  segmentOrder: number;
  role: MaterialKnowledgeCoverageRole;
};

export function buildMaterialDeepLink(input: { courseId: string; materialId: string; segmentId?: string }) {
  const query = input.segmentId ? `?${new URLSearchParams({ segment: input.segmentId }).toString()}` : "";
  return `/courses/${input.courseId}/materials/${input.materialId}${query}`;
}

export function resolveInitialMaterialSegment(input: { segmentIds: string[]; requestedSegmentId?: string | null; recentSegmentId?: string }) {
  const valid = new Set(input.segmentIds);
  if (input.requestedSegmentId && valid.has(input.requestedSegmentId)) return input.requestedSegmentId;
  if (input.recentSegmentId && valid.has(input.recentSegmentId)) return input.recentSegmentId;
  return input.segmentIds[0] ?? "";
}

export function resolveKnowledgeMaterialEntry(runtime: CourseRuntimeData, nodeId: string, materialId: string): KnowledgeMaterialEntry | null {
  const material = runtime.materials.find((item) => item.id === materialId);
  if (!material) return null;
  const segmentById = new Map(material.segments.map((segment) => [segment.id, segment]));
  const segmentOrderById = new Map(material.segments.map((segment) => [segment.id, getMaterialSegmentOrder(material, segment)]));
  const coverage = runtime.materialKnowledgeCoverages
    .filter((item) => item.nodeId === nodeId && item.materialId === materialId && segmentById.has(item.segmentId))
    .sort((left, right) => compareMaterialKnowledgeCoverages(left, right, segmentOrderById))[0];
  const segment = coverage ? segmentById.get(coverage.segmentId) : undefined;
  return coverage && segment ? {
    materialId,
    materialTitle: material.title,
    lessonId: material.lessonId,
    segmentId: segment.id,
    segmentTitle: segment.title,
    segmentOrder: getMaterialSegmentOrder(material, segment),
    role: coverage.role
  } : null;
}

export function resolveKnowledgeMaterialEntries(runtime: CourseRuntimeData, nodeId: string) {
  const nodeCoverages = runtime.curriculumCoverages.filter((coverage) => coverage.nodeId === nodeId);
  const primaryLessonId = selectPrimaryCurriculumCoverage(nodeCoverages, runtime.lessons)?.lessonId;
  const materialById = new Map(runtime.materials.map((material) => [material.id, material]));
  const lessonOrderById = new Map(runtime.lessons.map((lesson) => [lesson.id, lesson.order]));
  const materialIds = Array.from(new Set(runtime.materialKnowledgeCoverages.filter((coverage) => coverage.nodeId === nodeId).map((coverage) => coverage.materialId)));
  return materialIds.flatMap((materialId) => {
    const entry = resolveKnowledgeMaterialEntry(runtime, nodeId, materialId);
    return entry ? [entry] : [];
  }).sort((left, right) => Number(right.lessonId === primaryLessonId) - Number(left.lessonId === primaryLessonId)
    || MATERIAL_COVERAGE_ROLE_PRIORITY[left.role] - MATERIAL_COVERAGE_ROLE_PRIORITY[right.role]
    || (lessonOrderById.get(left.lessonId) ?? Number.MAX_SAFE_INTEGER) - (lessonOrderById.get(right.lessonId) ?? Number.MAX_SAFE_INTEGER)
    || (materialById.get(left.materialId)?.order ?? Number.MAX_SAFE_INTEGER) - (materialById.get(right.materialId)?.order ?? Number.MAX_SAFE_INTEGER)
    || left.segmentOrder - right.segmentOrder
    || left.materialId.localeCompare(right.materialId));
}

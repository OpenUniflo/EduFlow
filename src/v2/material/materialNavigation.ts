import type { CourseRuntimeData } from "../course/runtime/courseRuntime";
import type { MaterialKnowledgeCoverageRole } from "../types";

const ROLE_PRIORITY: Record<MaterialKnowledgeCoverageRole, number> = {
  introduce: 0,
  explain: 1,
  example: 2,
  "practice-reference": 3
};

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
  const coverage = runtime.materialKnowledgeCoverages
    .filter((item) => item.nodeId === nodeId && item.materialId === materialId && segmentById.has(item.segmentId))
    .sort((left, right) => ROLE_PRIORITY[left.role] - ROLE_PRIORITY[right.role]
      || (segmentById.get(left.segmentId)?.order ?? Number.MAX_SAFE_INTEGER) - (segmentById.get(right.segmentId)?.order ?? Number.MAX_SAFE_INTEGER)
      || left.id.localeCompare(right.id))[0];
  const segment = coverage ? segmentById.get(coverage.segmentId) : undefined;
  return coverage && segment ? {
    materialId,
    materialTitle: material.title,
    lessonId: material.lessonId,
    segmentId: segment.id,
    segmentTitle: segment.title,
    segmentOrder: segment.order,
    role: coverage.role
  } : null;
}

export function resolveKnowledgeMaterialEntries(runtime: CourseRuntimeData, nodeId: string) {
  const lessonOrderById = new Map(runtime.lessons.map((lesson) => [lesson.id, lesson.order]));
  const nodeCoverages = runtime.curriculumCoverages.filter((coverage) => coverage.nodeId === nodeId);
  const introduced = nodeCoverages.filter((coverage) => coverage.role === "introduce");
  const primaryLessonId = [...(introduced.length ? introduced : nodeCoverages)].sort((left, right) => (lessonOrderById.get(left.lessonId) ?? Number.MAX_SAFE_INTEGER) - (lessonOrderById.get(right.lessonId) ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id))[0]?.lessonId;
  const materialIds = Array.from(new Set(runtime.materialKnowledgeCoverages.filter((coverage) => coverage.nodeId === nodeId).map((coverage) => coverage.materialId)));
  return materialIds.flatMap((materialId) => {
    const entry = resolveKnowledgeMaterialEntry(runtime, nodeId, materialId);
    return entry ? [entry] : [];
  }).sort((left, right) => Number(right.lessonId === primaryLessonId) - Number(left.lessonId === primaryLessonId)
    || ROLE_PRIORITY[left.role] - ROLE_PRIORITY[right.role]
    || (lessonOrderById.get(left.lessonId) ?? Number.MAX_SAFE_INTEGER) - (lessonOrderById.get(right.lessonId) ?? Number.MAX_SAFE_INTEGER)
    || left.materialTitle.localeCompare(right.materialTitle)
    || left.segmentOrder - right.segmentOrder);
}

import type { CourseAssignment, CurriculumLesson, Material, MaterialSegment } from "../types";

export function getMaterialSegmentOrder(material: Material, segment: MaterialSegment) {
  return material.type === "pdf" ? (segment.page ?? Number.MAX_SAFE_INTEGER) : segment.order;
}

export function sortMaterialSegments(material: Material) {
  return [...material.segments].sort((left, right) => getMaterialSegmentOrder(material, left) - getMaterialSegmentOrder(material, right) || left.id.localeCompare(right.id));
}

export function compareMaterials(left: Material, right: Material, lessonOrderById: ReadonlyMap<string, number>) {
  return (lessonOrderById.get(left.lessonId) ?? Number.MAX_SAFE_INTEGER) - (lessonOrderById.get(right.lessonId) ?? Number.MAX_SAFE_INTEGER)
    || left.order - right.order
    || left.id.localeCompare(right.id);
}

export function sortMaterials(materials: readonly Material[], lessons: readonly CurriculumLesson[]) {
  const lessonOrderById = new Map(lessons.map((lesson) => [lesson.id, lesson.order]));
  return [...materials].sort((left, right) => compareMaterials(left, right, lessonOrderById));
}

export function compareAssignments(left: CourseAssignment, right: CourseAssignment) {
  return left.order - right.order || left.id.localeCompare(right.id);
}

export function sortAssignments(assignments: readonly CourseAssignment[]) {
  return [...assignments].sort(compareAssignments);
}

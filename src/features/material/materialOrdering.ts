import type { CourseAssignment, Material, MaterialSegment } from "@/features/course/types";

export function getMaterialSegmentOrder(material: Material, segment: MaterialSegment) {
  return material.type === "pdf" ? (segment.page ?? Number.MAX_SAFE_INTEGER) : segment.order;
}

export function sortMaterialSegments(material: Material) {
  return [...material.segments].sort((left, right) => getMaterialSegmentOrder(material, left) - getMaterialSegmentOrder(material, right) || left.id.localeCompare(right.id));
}

export function compareMaterials(left: Material, right: Material) {
  return left.order - right.order || left.id.localeCompare(right.id);
}

export function sortMaterials(materials: readonly Material[]) {
  return [...materials].sort(compareMaterials);
}

export function compareAssignments(left: CourseAssignment, right: CourseAssignment) {
  return left.order - right.order || left.id.localeCompare(right.id);
}

export function sortAssignments(assignments: readonly CourseAssignment[]) {
  return [...assignments].sort(compareAssignments);
}

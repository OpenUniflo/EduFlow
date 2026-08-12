import type { MaterialKnowledgeCoverage, MaterialKnowledgeCoverageRole } from "@/features/course/types";

export const MATERIAL_COVERAGE_ROLE_PRIORITY: Record<MaterialKnowledgeCoverageRole, number> = {
  introduce: 0,
  explain: 1,
  example: 2,
  "practice-reference": 3
};

export function compareMaterialKnowledgeCoverages(left: MaterialKnowledgeCoverage, right: MaterialKnowledgeCoverage, segmentOrderById: ReadonlyMap<string, number>) {
  return MATERIAL_COVERAGE_ROLE_PRIORITY[left.role] - MATERIAL_COVERAGE_ROLE_PRIORITY[right.role]
    || (segmentOrderById.get(left.segmentId) ?? Number.MAX_SAFE_INTEGER) - (segmentOrderById.get(right.segmentId) ?? Number.MAX_SAFE_INTEGER)
    || left.nodeId.localeCompare(right.nodeId)
    || left.id.localeCompare(right.id);
}

export function sortMaterialCoverageRoles(roles: readonly MaterialKnowledgeCoverageRole[]) {
  return Array.from(new Set(roles)).sort((left, right) => MATERIAL_COVERAGE_ROLE_PRIORITY[left] - MATERIAL_COVERAGE_ROLE_PRIORITY[right]);
}

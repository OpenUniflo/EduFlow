import type { AssignmentContext, Material, MaterialKnowledgeCoverage, MaterialSegment, UserCourseState } from "../types";
import type { CourseRuntimeData } from "../course/runtime/courseRuntime";
import type { KnowledgeRepository, KnowledgeAccessContext } from "../knowledge/repository/KnowledgeRepository";
import type { DomainGovernanceState } from "../knowledge/domain/DomainGovernanceRepository";
import { resolveNodeDomain } from "../knowledge/domain/domainResolution";
import { UNCLASSIFIED_DOMAIN_COLOR } from "../knowledge/domain/domainColors";
import { MATERIAL_COVERAGE_ROLE_PRIORITY, sortMaterialCoverageRoles } from "./materialCoverageOrdering";
import { sortAssignments } from "./materialOrdering";

export type MaterialSegmentProjection = {
  segment: MaterialSegment;
  knowledgeContexts: MaterialKnowledgeContext[];
  pageAssignmentContexts: AssignmentContext[];
};

export type MaterialKnowledgeContext = {
  nodeId: string;
  title: string;
  description: string;
  roles: MaterialKnowledgeCoverage["role"][];
  color: string;
};

export function getCourseMaterial(runtime: CourseRuntimeData, materialId: string) {
  return runtime.materials.find((material) => material.id === materialId) ?? null;
}

export function buildMaterialKnowledgeContext(nodeId: string, roles: MaterialKnowledgeCoverage["role"][], knowledgeRepository: KnowledgeRepository, access: KnowledgeAccessContext, governance: DomainGovernanceState): MaterialKnowledgeContext | null {
  const node = knowledgeRepository.getNode(nodeId, access);
  if (!node) return null;
  const domain = resolveNodeDomain(nodeId, governance).domain;
  return { nodeId, title: node.title, description: node.description, roles: sortMaterialCoverageRoles(roles), color: domain?.canonicalColor ?? UNCLASSIFIED_DOMAIN_COLOR };
}

export function buildKnowledgeAssignmentContexts(runtime: CourseRuntimeData, nodeId: string | null, userState: UserCourseState): AssignmentContext[] {
  if (!nodeId) return [];
  const coverages = runtime.assignmentCoverages.filter((coverage) => coverage.nodeId === nodeId);
  const coverageByAssignmentId = new Map<string, typeof coverages[number]>();
  coverages.forEach((coverage) => {
    if (coverageByAssignmentId.has(coverage.assignmentId)) throw new Error(`Duplicate AssignmentCoverage relation ${coverage.assignmentId}:${nodeId}`);
    coverageByAssignmentId.set(coverage.assignmentId, coverage);
  });
  return sortAssignments(runtime.assignments).flatMap((assignment) => {
    const coverage = coverageByAssignmentId.get(assignment.id);
    return coverage ? [{ ...coverage, assignment, state: userState.assignmentStates[assignment.id] }] : [];
  });
}

export function buildMaterialKnowledgeRoles(runtime: CourseRuntimeData, materialId: string, nodeId: string | null): MaterialKnowledgeCoverage["role"][] {
  if (!nodeId) return [];
  return sortMaterialCoverageRoles(runtime.materialKnowledgeCoverages
    .filter((coverage) => coverage.materialId === materialId && coverage.nodeId === nodeId)
    .map((coverage) => coverage.role));
}

export function buildMaterialSegmentProjection(runtime: CourseRuntimeData, material: Material, segmentId: string, userState: UserCourseState, knowledgeRepository: KnowledgeRepository, access: KnowledgeAccessContext, governance: DomainGovernanceState): MaterialSegmentProjection | null {
  const segment = material.segments.find((item) => item.id === segmentId);
  if (!segment) return null;
  const coverages = runtime.materialKnowledgeCoverages.filter((coverage) => coverage.materialId === material.id && coverage.segmentId === segment.id);
  const coverageByNode = new Map<string, MaterialKnowledgeCoverage[]>();
  coverages.forEach((coverage) => coverageByNode.set(coverage.nodeId, [...(coverageByNode.get(coverage.nodeId) ?? []), coverage]));
  const knowledgeContexts = Array.from(coverageByNode).flatMap(([nodeId, items]) => {
    const context = buildMaterialKnowledgeContext(nodeId, items.map((item) => item.role), knowledgeRepository, access, governance);
    return context ? [context] : [];
  }).sort((left, right) => MATERIAL_COVERAGE_ROLE_PRIORITY[left.roles[0]] - MATERIAL_COVERAGE_ROLE_PRIORITY[right.roles[0]] || left.nodeId.localeCompare(right.nodeId));
  const assignmentCoverageById = new Map<string, typeof runtime.assignmentCoverages[number]>();
  runtime.assignmentCoverages.filter((coverage) => coverageByNode.has(coverage.nodeId)).forEach((coverage) => {
    const relation = `${coverage.assignmentId}:${coverage.nodeId}`;
    if (assignmentCoverageById.has(relation)) throw new Error(`Duplicate AssignmentCoverage relation ${relation}`);
    assignmentCoverageById.set(relation, coverage);
  });
  const coveragesByAssignmentId = new Map<string, typeof runtime.assignmentCoverages>();
  assignmentCoverageById.forEach((coverage) => coveragesByAssignmentId.set(coverage.assignmentId, [...(coveragesByAssignmentId.get(coverage.assignmentId) ?? []), coverage]));
  const pageAssignmentContexts = sortAssignments(runtime.assignments).flatMap((assignment) => {
    const coverage = [...(coveragesByAssignmentId.get(assignment.id) ?? [])].sort((left, right) => left.nodeId.localeCompare(right.nodeId) || left.id.localeCompare(right.id))[0];
    return coverage ? [{ ...coverage, assignment, state: userState.assignmentStates[assignment.id] }] : [];
  });
  return { segment, knowledgeContexts, pageAssignmentContexts };
}

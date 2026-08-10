import type { AssignmentContext, Material, MaterialKnowledgeCoverage, MaterialSegment, UserCourseState } from "../types";
import type { CourseRuntimeData } from "../course/runtime/courseRuntime";
import type { KnowledgeRepository, KnowledgeAccessContext } from "../knowledge/repository/KnowledgeRepository";
import type { DomainGovernanceState } from "../knowledge/domain/DomainGovernanceRepository";
import { resolveNodeDomain } from "../knowledge/domain/domainStore";
import { UNCLASSIFIED_DOMAIN_COLOR } from "../knowledge/domain/domainColors";

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
  return { nodeId, title: node.title, description: node.description, roles: Array.from(new Set(roles)), color: domain?.canonicalColor ?? UNCLASSIFIED_DOMAIN_COLOR };
}

export function buildKnowledgeAssignmentContexts(runtime: CourseRuntimeData, nodeId: string | null, userState: UserCourseState): AssignmentContext[] {
  if (!nodeId) return [];
  const coverages = runtime.assignmentCoverages.filter((coverage) => coverage.nodeId === nodeId);
  const coverageByAssignmentId = new Map(coverages.map((coverage) => [coverage.assignmentId, coverage]));
  return runtime.assignments.flatMap((assignment) => {
    const coverage = coverageByAssignmentId.get(assignment.id);
    return coverage ? [{ ...coverage, assignment, state: userState.assignmentStates[assignment.id] }] : [];
  });
}

export function buildMaterialKnowledgeRoles(runtime: CourseRuntimeData, materialId: string, nodeId: string | null): MaterialKnowledgeCoverage["role"][] {
  if (!nodeId) return [];
  return Array.from(new Set(runtime.materialKnowledgeCoverages
    .filter((coverage) => coverage.materialId === materialId && coverage.nodeId === nodeId)
    .map((coverage) => coverage.role)));
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
  });
  const assignmentIds = new Set([
    ...(segment.assignmentIds ?? []),
    ...runtime.assignmentCoverages.filter((coverage) => coverageByNode.has(coverage.nodeId)).map((coverage) => coverage.assignmentId)
  ]);
  const pageAssignmentContexts = runtime.assignments.filter((assignment) => assignmentIds.has(assignment.id)).map((assignment) => {
    const coverage = runtime.assignmentCoverages.find((item) => item.assignmentId === assignment.id && coverageByNode.has(item.nodeId));
    return { id: coverage?.id ?? `material-assignment-${material.id}-${segment.id}-${assignment.id}`, assignmentId: assignment.id, nodeId: coverage?.nodeId ?? knowledgeContexts[0]?.nodeId ?? "", role: coverage?.role ?? "practice", assignment, state: userState.assignmentStates[assignment.id] };
  });
  return { segment, knowledgeContexts, pageAssignmentContexts };
}

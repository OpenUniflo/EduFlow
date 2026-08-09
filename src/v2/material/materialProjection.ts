import { globalKnowledgeGraph } from "../knowledge/graph";
import type { AssignmentContext, Material, MaterialKnowledgeCoverage, MaterialSegment, UserCourseState } from "../types";
import type { CourseRuntimeData } from "../course/runtime/courseRuntime";

export type MaterialSegmentProjection = {
  segment: MaterialSegment;
  knowledgeContexts: Array<{ nodeId: string; title: string; description: string; roles: MaterialKnowledgeCoverage["role"][] }>;
  assignmentContexts: AssignmentContext[];
};

export function getCourseMaterial(runtime: CourseRuntimeData, materialId: string) {
  return runtime.materials.find((material) => material.id === materialId) ?? null;
}

export function buildMaterialSegmentProjection(runtime: CourseRuntimeData, material: Material, segmentId: string, userState: UserCourseState): MaterialSegmentProjection | null {
  const segment = material.segments.find((item) => item.id === segmentId);
  if (!segment) return null;
  const coverages = runtime.materialKnowledgeCoverages.filter((coverage) => coverage.materialId === material.id && coverage.segmentId === segment.id);
  const coverageByNode = new Map<string, MaterialKnowledgeCoverage[]>();
  coverages.forEach((coverage) => coverageByNode.set(coverage.nodeId, [...(coverageByNode.get(coverage.nodeId) ?? []), coverage]));
  const knowledgeById = new Map(globalKnowledgeGraph.nodes.map((node) => [node.id, node]));
  const knowledgeContexts = Array.from(coverageByNode).flatMap(([nodeId, items]) => {
    const node = knowledgeById.get(nodeId);
    return node ? [{ nodeId, title: node.title, description: node.description, roles: Array.from(new Set(items.map((item) => item.role))) }] : [];
  });
  const assignmentIds = new Set([
    ...(segment.assignmentIds ?? []),
    ...runtime.assignmentCoverages.filter((coverage) => coverageByNode.has(coverage.nodeId)).map((coverage) => coverage.assignmentId)
  ]);
  const assignmentContexts = runtime.assignments.filter((assignment) => assignmentIds.has(assignment.id)).map((assignment) => {
    const coverage = runtime.assignmentCoverages.find((item) => item.assignmentId === assignment.id && coverageByNode.has(item.nodeId));
    return { id: coverage?.id ?? `material-assignment-${material.id}-${segment.id}-${assignment.id}`, assignmentId: assignment.id, nodeId: coverage?.nodeId ?? knowledgeContexts[0]?.nodeId ?? "", role: coverage?.role ?? "practice", assignment, state: userState.assignmentStates[assignment.id] };
  });
  return { segment, knowledgeContexts, assignmentContexts };
}

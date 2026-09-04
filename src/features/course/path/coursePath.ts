import type { CourseGraphData } from "../runtime/courseRuntime";
import type { CourseSkillTreeNode } from "../types";
import type { UserKnowledgeRecord } from "@/features/profile/types";
import { evaluatePrerequisiteReachability } from "../runtime/courseUnlockPolicy";

export type CoursePathItem = {
  node: CourseSkillTreeNode;
  state: "completed" | "learned" | "underway" | "available" | "blocked";
  blockedBy: string[];
};

/** Deterministic learner path: curriculum order for sequence, factual prerequisites for eligibility. */
export function buildCoursePath(graph: CourseGraphData, userKnowledge: UserKnowledgeRecord[]): CoursePathItem[] {
  const statusByNode = new Map(userKnowledge.map((item) => [item.nodeId, item.status]));
  const nodeById = new Map(graph.knowledgeNodes.map((node) => [node.id, node]));
  const prerequisites = new Map<string, string[]>();
  graph.knowledgeEdges.filter((edge) => edge.relation === "prerequisite").forEach((edge) => prerequisites.set(edge.target, [...(prerequisites.get(edge.target) ?? []), edge.source]));
  return [...graph.knowledgeNodes].sort((left, right) => left.primaryCoverage.lessonOrder - right.primaryCoverage.lessonOrder || left.primaryCoverage.order - right.primaryCoverage.order || left.id.localeCompare(right.id)).map((node) => {
    const status = statusByNode.get(node.id);
    const prerequisiteIds = prerequisites.get(node.id) ?? [];
    const reachability = evaluatePrerequisiteReachability(status, prerequisiteIds.map((id) => statusByNode.get(id)));
    const state = reachability === "completed" ? "completed" : status === "learned" ? "learned" : reachability === "learning" ? "underway" : reachability === "locked" ? "blocked" : "available";
    const blockedBy = state === "blocked" ? prerequisiteIds.filter((id) => statusByNode.get(id) !== "mastered").map((id) => nodeById.get(id)?.title ?? id) : [];
    return { node, state, blockedBy };
  });
}

import type { CourseGraphData } from "../runtime/courseRuntime";
import type { CourseSkillTreeNode } from "../types";
import type { UserKnowledgeRecord } from "@/features/profile/types";

export type CoursePathItem = {
  node: CourseSkillTreeNode;
  state: "completed" | "underway" | "available" | "blocked";
  blockedBy: string[];
};

const complete = (status: UserKnowledgeRecord["status"] | undefined) => status === "mastered";
const underway = (status: UserKnowledgeRecord["status"] | undefined) => status === "learning" || status === "learned" || status === "practicing";

/** Deterministic learner path: curriculum order for sequence, factual prerequisites for eligibility. */
export function buildCoursePath(graph: CourseGraphData, userKnowledge: UserKnowledgeRecord[]): CoursePathItem[] {
  const statusByNode = new Map(userKnowledge.map((item) => [item.nodeId, item.status]));
  const nodeById = new Map(graph.knowledgeNodes.map((node) => [node.id, node]));
  const prerequisites = new Map<string, string[]>();
  graph.knowledgeEdges.filter((edge) => edge.relation === "prerequisite").forEach((edge) => prerequisites.set(edge.target, [...(prerequisites.get(edge.target) ?? []), edge.source]));
  return [...graph.knowledgeNodes].sort((left, right) => left.primaryCoverage.lessonOrder - right.primaryCoverage.lessonOrder || left.primaryCoverage.order - right.primaryCoverage.order || left.id.localeCompare(right.id)).map((node) => {
    const status = statusByNode.get(node.id);
    if (complete(status)) return { node, state: "completed", blockedBy: [] };
    if (underway(status)) return { node, state: "underway", blockedBy: [] };
    const blockedBy = (prerequisites.get(node.id) ?? []).filter((id) => !complete(statusByNode.get(id))).map((id) => nodeById.get(id)?.title ?? id);
    return blockedBy.length ? { node, state: "blocked", blockedBy } : { node, state: "available", blockedBy: [] };
  });
}

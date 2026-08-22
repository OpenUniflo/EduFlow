import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { UserCourseState } from "@/features/course/types";
import type { KnowledgeGraph } from "@/features/knowledge/types";
import type { MicroLearningRepository } from "@/features/learning/micro/microLearning";
import { projectKnowledgeLearningResources, type KnowledgeLearningResources } from "@/features/learning/resources/knowledgeLearningResources";
import type { UserKnowledgeRecord } from "@/features/profile/types";

export type ActiveLearningKnowledge = {
  knowledgeId: string;
  title: string;
  description: string;
  status: "learning" | "learned" | "practicing";
  updatedAt?: string;
  resources: KnowledgeLearningResources;
};

const activeStatuses = new Set<UserKnowledgeRecord["status"]>(["learning", "learned", "practicing"]);

/** Today is an active-work projection, never a recommendation or curriculum sequence. */
export function buildActiveLearningKnowledge(input: { runtimes: CourseRuntimeData[]; graph: KnowledgeGraph; userKnowledge: UserKnowledgeRecord[]; courseStates: UserCourseState[]; microRepository: MicroLearningRepository }) {
  const nodeById = new Map(input.graph.nodes.map((node) => [node.id, node]));
  return input.userKnowledge.flatMap((record): ActiveLearningKnowledge[] => {
    const node = nodeById.get(record.nodeId);
    if (!node || node.status !== "active" || !activeStatuses.has(record.status)) return [];
    return [{ knowledgeId: node.id, title: node.title, description: node.description, status: record.status as ActiveLearningKnowledge["status"], updatedAt: record.updatedAt, resources: projectKnowledgeLearningResources({ knowledgeId: node.id, runtimes: input.runtimes, courseStates: input.courseStates, microRepository: input.microRepository }) }];
  }).sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") || left.title.localeCompare(right.title) || left.knowledgeId.localeCompare(right.knowledgeId));
}

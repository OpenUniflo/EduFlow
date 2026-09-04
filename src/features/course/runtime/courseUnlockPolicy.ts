import type { KnowledgeNode } from "../../knowledge/types";
import type { UserKnowledgeRecord } from "../../profile/types";
import type { CurriculumLesson, CurriculumSequence, LearningStatus, UserCourseState } from "@/features/course/types";

export type CourseUnlockPolicyInput = {
  knowledge: KnowledgeNode;
  lesson: CurriculumLesson;
  lessons: CurriculumLesson[];
  sequences: CurriculumSequence[];
  userCourseState?: UserCourseState;
  userKnowledge?: UserKnowledgeRecord;
  prerequisiteKnowledge: UserKnowledgeRecord[];
};

export type CourseUnlockPolicy = (input: CourseUnlockPolicyInput) => LearningStatus;

export function evaluatePrerequisiteReachability(status: UserKnowledgeRecord["status"] | undefined, prerequisiteStatuses: Array<UserKnowledgeRecord["status"] | undefined>): LearningStatus {
  if (status === "mastered") return "completed";
  if (status === "learning" || status === "learned" || status === "practicing") return "learning";
  return prerequisiteStatuses.every((prerequisiteStatus) => prerequisiteStatus === "mastered") ? "available" : "locked";
}

/** Factual prerequisite mastery controls reachability; curriculum order does not create eligibility. */
export const defaultCourseUnlockPolicy: CourseUnlockPolicy = ({ userKnowledge, prerequisiteKnowledge }) => {
  return evaluatePrerequisiteReachability(userKnowledge?.status, prerequisiteKnowledge.map((record) => record.status));
};

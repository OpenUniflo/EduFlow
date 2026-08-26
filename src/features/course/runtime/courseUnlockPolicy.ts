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
};

export type CourseUnlockPolicy = (input: CourseUnlockPolicyInput) => LearningStatus;

/** Conservative default: evidence controls learning; curriculum sequence controls availability. */
export const defaultCourseUnlockPolicy: CourseUnlockPolicy = ({ lesson, lessons, sequences, userCourseState, userKnowledge }) => {
  if (userKnowledge?.status === "mastered") return "completed";
  if (userKnowledge?.status === "learning" || userKnowledge?.status === "learned" || userKnowledge?.status === "practicing") return "learning";
  const firstOrder = Math.min(...lessons.map((item) => item.order));
  if (!userCourseState) return "available";
  if (!userCourseState.recentLessonId) return lesson.order === firstOrder ? "available" : "locked";
  if (lesson.id === userCourseState.recentLessonId) return "available";
  if (sequences.some((sequence) => sequence.sourceLessonId === userCourseState.recentLessonId && sequence.targetLessonId === lesson.id)) return "available";
  return "locked";
};

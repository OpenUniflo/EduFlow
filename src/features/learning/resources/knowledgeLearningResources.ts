import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { UserCourseState } from "@/features/course/types";
import type { MicroLearningPath, MicroLearningRepository } from "@/features/learning/micro/microLearning";
import { resolveKnowledgeMaterialEntries, type KnowledgeMaterialEntry } from "@/features/material/materialNavigation";

export type KnowledgeCourseResource = { courseId: string; courseTitle: string; updatedAt?: string };
export type KnowledgeMaterialResource = KnowledgeMaterialEntry & { courseId: string; courseTitle: string };
export type KnowledgeAssignmentResource = { courseId: string; courseTitle: string; assignmentId: string; title: string; status: string };
export type KnowledgeLearningResources = {
  knowledgeId: string;
  courses: KnowledgeCourseResource[];
  primaryCourse?: KnowledgeCourseResource;
  micro: { available: boolean; path: MicroLearningPath | null; source: "course" | "global" | "none" };
  materials: KnowledgeMaterialResource[];
  assignments: KnowledgeAssignmentResource[];
};

export function projectKnowledgeLearningResources(input: { knowledgeId: string; runtimes: CourseRuntimeData[]; courseStates: UserCourseState[]; microRepository: MicroLearningRepository; preferredCourseId?: string }): KnowledgeLearningResources {
  const stateByCourse = new Map(input.courseStates.map((state) => [state.courseId, state]));
  const relevant = input.runtimes.filter((runtime) => runtime.curriculumCoverages.some((coverage) => coverage.nodeId === input.knowledgeId));
  const courses = relevant.map((runtime) => ({ courseId: runtime.course.id, courseTitle: runtime.course.title, updatedAt: stateByCourse.get(runtime.course.id)?.updatedAt })).sort((left, right) => {
    if (left.courseId === input.preferredCourseId) return -1;
    if (right.courseId === input.preferredCourseId) return 1;
    return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") || left.courseTitle.localeCompare(right.courseTitle) || left.courseId.localeCompare(right.courseId);
  });
  const primaryCourse = courses[0];
  const path = input.microRepository.getPath(input.knowledgeId, { courseId: primaryCourse?.courseId, mode: "learn" });
  const materials = relevant.flatMap((runtime) => resolveKnowledgeMaterialEntries(runtime, input.knowledgeId).map((entry) => ({ ...entry, courseId: runtime.course.id, courseTitle: runtime.course.title })));
  const assignments = relevant.flatMap((runtime) => runtime.assignmentCoverages.filter((coverage) => coverage.nodeId === input.knowledgeId).flatMap((coverage) => {
    const assignment = runtime.assignments.find((item) => item.id === coverage.assignmentId);
    return assignment ? [{ courseId: runtime.course.id, courseTitle: runtime.course.title, assignmentId: assignment.id, title: assignment.title, status: stateByCourse.get(runtime.course.id)?.assignmentStates[assignment.id]?.status ?? "not_started" }] : [];
  }));
  return { knowledgeId: input.knowledgeId, courses, primaryCourse, micro: { available: Boolean(path), path, source: path?.scope ?? "none" }, materials, assignments };
}

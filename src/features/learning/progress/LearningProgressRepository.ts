import type { UserAssignmentState, UserCourseState, UserMaterialState } from "@/features/course/types";

export type UserCourseStateFactory = (userId: string, courseId: string) => UserCourseState;

export interface LearningProgressRepository {
  getCourseState(userId: string, courseId: string): UserCourseState;
  activateCourse(courseId: string): Promise<UserCourseState>;
  deactivateCourse(courseId: string): Promise<UserCourseState>;
  updateAssignmentState(userId: string, courseId: string, assignmentId: string, state: UserAssignmentState): void;
  updateMaterialState(userId: string, courseId: string, materialId: string, state: Partial<UserMaterialState>): void;
  updateMaterialReadingState(userId: string, courseId: string, lessonId: string | undefined, materialId: string, state: Partial<UserMaterialState>): void;
  subscribe(listener: () => void): () => void;
}

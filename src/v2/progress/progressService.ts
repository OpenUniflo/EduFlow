import { useSyncExternalStore } from "react";
import type { UserAssignmentState, UserCourseState, UserMaterialState, WorkflowLaunchContext } from "../types";
import { learningProgressRepository } from "./LocalStorageLearningProgressRepository";

export function getUserCourseState(userId: string, courseId: string) {
  return learningProgressRepository.getCourseState(userId, courseId);
}

export function useUserCourseState(userId: string, courseId: string): UserCourseState {
  return useSyncExternalStore(
    (listener) => learningProgressRepository.subscribe(listener),
    () => learningProgressRepository.getCourseState(userId, courseId),
    () => learningProgressRepository.getCourseState(userId, courseId)
  );
}

export function updateAssignmentState(userId: string, courseId: string, assignmentId: string, state: UserAssignmentState) {
  learningProgressRepository.updateAssignmentState(userId, courseId, assignmentId, state);
}

export function completeAssignment(context: Pick<WorkflowLaunchContext, "courseId" | "assignmentId"> & { userId: string }) {
  updateAssignmentState(context.userId, context.courseId, context.assignmentId, { assignmentId: context.assignmentId, status: "completed", progress: 100 });
}

export function updateMaterialState(userId: string, courseId: string, materialId: string, state: Partial<UserMaterialState>) {
  learningProgressRepository.updateMaterialState(userId, courseId, materialId, state);
}

export function workflowLaunchUrl(context: WorkflowLaunchContext) {
  const query = new URLSearchParams({ courseId: context.courseId, assignmentId: context.assignmentId });
  return `/workflows/${context.workflowTemplateId}?${query.toString()}`;
}

export function workflowLaunchContextFromLocation(workflowTemplateId: string, search: string): WorkflowLaunchContext | null {
  const query = new URLSearchParams(search);
  const courseId = query.get("courseId");
  const assignmentId = query.get("assignmentId");
  return courseId && assignmentId ? { courseId, assignmentId, workflowTemplateId } : null;
}

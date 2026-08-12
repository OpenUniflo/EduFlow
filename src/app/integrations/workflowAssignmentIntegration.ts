import type { CourseRepository } from "@/features/course/repository/CourseRepository";
import type { LearningProgressRepository } from "@/features/learning/progress/LearningProgressRepository";
import type { WorkflowRunRecord } from "@/features/workflow/runtime/types";

export type WorkflowAssignmentContext = {
  courseId: string;
  assignmentId: string;
  workflowTemplateId: string;
};

export function resolveWorkflowAssignmentContext(
  courseRepository: CourseRepository,
  workflowTemplateId: string,
  search: string
): WorkflowAssignmentContext | null {
  const query = new URLSearchParams(search);
  const courseId = query.get("courseId");
  const assignmentId = query.get("assignmentId");
  if (!courseId || !assignmentId) return null;
  const runtime = courseRepository.getCourse(courseId);
  const assignment = runtime?.assignments.find((item) => item.id === assignmentId);
  if (!assignment || assignment.mode !== "workflow" || assignment.workflowTemplateId !== workflowTemplateId) return null;
  return { courseId, assignmentId, workflowTemplateId };
}

export function attachWorkflowAssignmentMetadata(
  record: WorkflowRunRecord,
  context: WorkflowAssignmentContext | null
): WorkflowRunRecord {
  if (!context || context.workflowTemplateId !== record.workflowTemplateId) return record;
  return { ...record, courseId: context.courseId, assignmentId: context.assignmentId };
}

export function completeWorkflowAssignmentRun(
  learningProgressRepository: LearningProgressRepository,
  userId: string,
  record: WorkflowRunRecord
) {
  if (!record.courseId || !record.assignmentId) return false;
  learningProgressRepository.updateAssignmentState(userId, record.courseId, record.assignmentId, {
    assignmentId: record.assignmentId,
    status: "completed",
    progress: 100
  });
  return true;
}

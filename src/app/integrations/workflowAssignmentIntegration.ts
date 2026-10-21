import type { CourseRepository } from "@/features/course/repository/CourseRepository";
import type { JsonValue } from "@/features/workflow/domain/v2/types";

export type WorkflowAssignmentContext = {
  courseId: string;
  assignmentId: string;
  workflowTemplateId: string;
  workflowInput?: JsonValue;
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
  const context = { courseId, assignmentId, workflowTemplateId };
  return assignment.workflowInput === undefined ? context : { ...context, workflowInput: assignment.workflowInput as JsonValue };
}

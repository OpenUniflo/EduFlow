import type { CourseRepository } from "@/features/course/repository/CourseRepository";

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

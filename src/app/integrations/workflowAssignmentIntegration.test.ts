import { describe, expect, it } from "vitest";
import { resolveWorkflowAssignmentContext } from "./workflowAssignmentIntegration";
import type { CourseRepository } from "@/features/course/repository/CourseRepository";

const repository = {
  getCourse: () => ({
    course: { id: "fixture-course" },
    assignments: [
      { id: "fixture-task-a", mode: "workflow", workflowTemplateId: "fixture-template" },
      { id: "fixture-task-b", mode: "workflow", workflowTemplateId: "fixture-template" },
      { id: "fixture-task-c", mode: "workflow", workflowTemplateId: "other-template" }
    ]
  })
} as unknown as CourseRepository;

describe("Workflow Assignment application integration", () => {
  it("accepts only explicit Course/Assignment/Template relationships", () => {
    expect(resolveWorkflowAssignmentContext(repository, "fixture-template", "?courseId=fixture-course&assignmentId=fixture-task-a")).toEqual({ courseId: "fixture-course", assignmentId: "fixture-task-a", workflowTemplateId: "fixture-template" });
    expect(resolveWorkflowAssignmentContext(repository, "fixture-template", "?courseId=fixture-course&assignmentId=fixture-task-b")).toEqual({ courseId: "fixture-course", assignmentId: "fixture-task-b", workflowTemplateId: "fixture-template" });
    expect(resolveWorkflowAssignmentContext(repository, "other-template", "?courseId=fixture-course&assignmentId=fixture-task-a")).toBeNull();
    expect(resolveWorkflowAssignmentContext(repository, "fixture-template", "?courseId=fixture-course&assignmentId=missing")).toBeNull();
    expect(resolveWorkflowAssignmentContext(repository, "fixture-template", "")).toBeNull();
  });

  it("carries caller-provided workflow input through the Assignment context", () => {
    const withInput = {
      getCourse: () => ({
        assignments: [{ id: "caller-task", mode: "workflow", workflowTemplateId: "fixture-template", workflowInput: { query: "fixture-value" } }]
      })
    } as unknown as CourseRepository;
    expect(resolveWorkflowAssignmentContext(withInput, "fixture-template", "?courseId=course&assignmentId=caller-task")).toEqual({
      courseId: "course",
      assignmentId: "caller-task",
      workflowTemplateId: "fixture-template",
      workflowInput: { query: "fixture-value" }
    });
  });
});

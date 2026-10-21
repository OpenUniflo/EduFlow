import { describe, expect, it } from "vitest";
import { createDemoApplicationServices } from "@/demo/services/createDemoApplicationServices";
import { resolveWorkflowAssignmentContext } from "./workflowAssignmentIntegration";
import type { CourseRepository } from "@/features/course/repository/CourseRepository";

const applicationServices = createDemoApplicationServices();

describe("Workflow Assignment application integration", () => {
  it("accepts only explicit Course/Assignment/Template relationships", () => {
    const repository = applicationServices.courseRepository;
    const runtime = repository.getCourse("python-engineering")!;
    const shared = runtime.assignments.filter((item) => item.workflowTemplateId === "agent-loop");
    expect(shared.length).toBeGreaterThan(1);
    const validA = resolveWorkflowAssignmentContext(repository, "agent-loop", `?courseId=${runtime.course.id}&assignmentId=${shared[0].id}`);
    const validB = resolveWorkflowAssignmentContext(repository, "agent-loop", `?courseId=${runtime.course.id}&assignmentId=${shared[1].id}`);
    expect(validA).toEqual({ courseId: runtime.course.id, assignmentId: shared[0].id, workflowTemplateId: "agent-loop" });
    expect(validB).toEqual({ courseId: runtime.course.id, assignmentId: shared[1].id, workflowTemplateId: "agent-loop" });
    expect(validA?.assignmentId).not.toBe(validB?.assignmentId);
    expect(resolveWorkflowAssignmentContext(repository, "minimal", `?courseId=${runtime.course.id}&assignmentId=${shared[0].id}`)).toBeNull();
    expect(resolveWorkflowAssignmentContext(repository, "agent-loop", `?courseId=${runtime.course.id}&assignmentId=missing`)).toBeNull();
    expect(resolveWorkflowAssignmentContext(repository, "agent-loop", "")).toBeNull();
  });

  it("carries caller-provided workflow input through the Assignment context", () => {
    const repository = {
      getCourse: () => ({
        assignments: [{ id: "caller-task", mode: "workflow", workflowTemplateId: "agent-loop", workflowInput: { query: "A1001" } }],
      }),
    } as unknown as CourseRepository;
    expect(resolveWorkflowAssignmentContext(repository, "agent-loop", "?courseId=course&assignmentId=caller-task")).toEqual({
      courseId: "course",
      assignmentId: "caller-task",
      workflowTemplateId: "agent-loop",
      workflowInput: { query: "A1001" },
    });
  });

});

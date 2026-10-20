import { describe, expect, it } from "vitest";
import { createDemoApplicationServices } from "@/demo/services/createDemoApplicationServices";
import { resolveWorkflowAssignmentContext } from "./workflowAssignmentIntegration";

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

});

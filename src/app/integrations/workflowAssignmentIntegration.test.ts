import { describe, expect, it, vi } from "vitest";
import { applicationServices } from "@/app/services/applicationServices";
import type { LearningProgressRepository } from "@/features/learning/progress/LearningProgressRepository";
import type { WorkflowRunRecord } from "@/features/workflow/runtime/types";
import { completeWorkflowAssignmentRun, resolveWorkflowAssignmentContext } from "./workflowAssignmentIntegration";

function record(context?: { courseId: string; assignmentId: string }): WorkflowRunRecord {
  return { id: "run", workflowId: "agent-loop", workflowTemplateId: "agent-loop", courseId: context?.courseId, assignmentId: context?.assignmentId, workflowName: "Run", createdAt: "now", status: "success", nodeCount: 0, outputSummary: "ok", finalState: {}, nodes: [] };
}

describe("Workflow Assignment application integration", () => {
  it("accepts only explicit Course/Assignment/Template relationships", () => {
    const repository = applicationServices.courseRepository;
    const runtime = repository.getCourse("python-engineering")!;
    const shared = runtime.assignments.filter((item) => item.workflowTemplateId === "agent-loop");
    expect(shared.length).toBeGreaterThan(1);
    const valid = resolveWorkflowAssignmentContext(repository, "agent-loop", `?courseId=${runtime.course.id}&assignmentId=${shared[0].id}`);
    expect(valid).toEqual({ courseId: runtime.course.id, assignmentId: shared[0].id, workflowTemplateId: "agent-loop" });
    expect(resolveWorkflowAssignmentContext(repository, "minimal", `?courseId=${runtime.course.id}&assignmentId=${shared[0].id}`)).toBeNull();
    expect(resolveWorkflowAssignmentContext(repository, "agent-loop", `?courseId=${runtime.course.id}&assignmentId=missing`)).toBeNull();
    expect(resolveWorkflowAssignmentContext(repository, "agent-loop", "")).toBeNull();
  });

  it("independent runs complete nothing and shared templates complete exactly the launched Assignment", () => {
    const updates = vi.fn();
    const repository = { updateAssignmentState: updates } as unknown as LearningProgressRepository;
    expect(completeWorkflowAssignmentRun(repository, "user", record())).toBe(false);
    expect(updates).not.toHaveBeenCalled();
    completeWorkflowAssignmentRun(repository, "user", record({ courseId: "course", assignmentId: "assignment-a" }));
    expect(updates).toHaveBeenCalledOnce();
    expect(updates).toHaveBeenCalledWith("user", "course", "assignment-a", { assignmentId: "assignment-a", status: "completed", progress: 100 });
  });
});

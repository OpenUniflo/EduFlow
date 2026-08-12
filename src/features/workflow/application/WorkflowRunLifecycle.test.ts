import { describe, expect, it, vi } from "vitest";
import type { WorkflowRunRecord } from "../runtime/types";
import { canExecuteWorkflow, nextWorkflowStepIndex, resolveGeneratedWorkflow, WorkflowRunLifecycle } from "./WorkflowRunLifecycle";

function record(workflowId = "workflow", id = "base"): WorkflowRunRecord {
  return { id, workflowId, workflowTemplateId: workflowId, workflowName: workflowId, createdAt: "now", status: "success", nodeCount: 0, outputSummary: "ok", finalState: {}, nodes: [] };
}

const context = (courseId: string, assignmentId: string) => (run: WorkflowRunRecord): WorkflowRunRecord => ({ ...run, courseId, assignmentId });

describe("Workflow Run application lifecycle", () => {
  it("enforces the Schema guard and advances Step without completing a Run", () => {
    const lifecycle = new WorkflowRunLifecycle();
    expect(canExecuteWorkflow(false)).toBe(false);
    expect(canExecuteWorkflow(true)).toBe(true);
    expect(nextWorkflowStepIndex(-1, 3)).toBe(0);
    expect(nextWorkflowStepIndex(0, 3)).toBe(1);
    expect(nextWorkflowStepIndex(2, 3)).toBe(0);
    expect(lifecycle.complete(record(), [])).toBeNull();
  });

  it("returns the inferred Workflow so routing can follow Generate from Description", () => {
    const infer = vi.fn(() => "showcase");
    expect(resolveGeneratedWorkflow("build an agent tool loop", "minimal", infer)).toEqual({ description: "build an agent tool loop", templateId: "showcase" });
    expect(infer).toHaveBeenCalledWith("build an agent tool loop");
  });

  it("keeps launch A when the current Assignment context becomes null", () => {
    const lifecycle = new WorkflowRunLifecycle();
    let currentFinalize: ReturnType<typeof context> | null = context("course-a", "assignment-a");
    lifecycle.start("workflow", currentFinalize, "run-a");
    currentFinalize = null;
    expect(currentFinalize).toBeNull();
    expect(lifecycle.complete(record(), [])?.record).toMatchObject({ id: "run-a", courseId: "course-a", assignmentId: "assignment-a" });
  });

  it("keeps launch A when the current Assignment context changes to B", () => {
    const lifecycle = new WorkflowRunLifecycle();
    lifecycle.start("workflow", context("course-a", "assignment-a"), "run-b");
    const currentFinalize = context("course-b", "assignment-b");
    expect(currentFinalize(record())).toHaveProperty("assignmentId", "assignment-b");
    expect(lifecycle.complete(record(), [])?.record).toMatchObject({ id: "run-b", courseId: "course-a", assignmentId: "assignment-a" });
  });

  it("keeps an independent launch independent when a later Assignment context appears", () => {
    const lifecycle = new WorkflowRunLifecycle();
    lifecycle.start("workflow", (run) => run, "independent");
    expect(context("course-b", "assignment-b")(record())).toHaveProperty("assignmentId", "assignment-b");
    expect(lifecycle.complete(record(), [])?.record).not.toHaveProperty("assignmentId");
  });

  it("completes exactly once and caps newest-first history at 20 records", () => {
    const lifecycle = new WorkflowRunLifecycle();
    const finalize = vi.fn((run: WorkflowRunRecord) => run);
    const onCompleted = vi.fn();
    const existing = Array.from({ length: 20 }, (_, index) => record("workflow", `old-${index}`));
    lifecycle.start("workflow", finalize, "new");
    const completed = lifecycle.complete(record(), existing, onCompleted)!;
    expect(completed.history).toHaveLength(20);
    expect(completed.history[0].id).toBe("new");
    expect(completed.history.some((item) => item.id === "old-19")).toBe(false);
    expect(finalize).toHaveBeenCalledOnce();
    expect(onCompleted).toHaveBeenCalledOnce();
    expect(onCompleted).toHaveBeenCalledWith(completed.record);
    expect(lifecycle.complete(record(), completed.history, onCompleted)).toBeNull();
    expect(finalize).toHaveBeenCalledOnce();
    expect(onCompleted).toHaveBeenCalledOnce();
  });

  it("stop and template mismatch cancel completion and do not leak into the next Run", () => {
    const lifecycle = new WorkflowRunLifecycle();
    const onCompleted = vi.fn();
    lifecycle.start("workflow-a", context("course-a", "assignment-a"), "stopped");
    lifecycle.stop();
    expect(lifecycle.complete(record("workflow-a"), [], onCompleted)).toBeNull();
    expect(onCompleted).not.toHaveBeenCalled();

    lifecycle.start("workflow-a", context("course-a", "assignment-a"), "switched");
    expect(lifecycle.complete(record("workflow-b"), [])).toBeNull();
    lifecycle.stop();
    lifecycle.start("workflow-b", (run) => run, "fresh");
    const fresh = lifecycle.complete(record("workflow-b"), [])?.record;
    expect(fresh).toMatchObject({ id: "fresh", workflowId: "workflow-b" });
    expect(fresh).not.toHaveProperty("assignmentId");
  });
});

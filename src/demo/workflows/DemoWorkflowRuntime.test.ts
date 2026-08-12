import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoWorkflowRuntime } from "@/demo/workflows/DemoWorkflowRuntime";
import { demoWorkflowTemplates } from "@/demo/workflows/demoWorkflowTemplates";

describe("Demo Workflow runtime", () => {
  afterEach(() => vi.useRealTimers());

  it("advances in the existing run order and creates a Course-independent execution record", () => {
    const runtime = new DemoWorkflowRuntime();
    const template = demoWorkflowTemplates.find((item) => item.id === "minimal")!;
    const first = runtime.createStateSnapshot(template, { user_input: "hello" }, 0);
    const last = runtime.createStateSnapshot(template, { user_input: "hello" }, template.runOrder.length - 1);
    expect(first.messages).toEqual(["start"]);
    expect(last.final_answer).toBe(template.result);
    const run = runtime.createRunRecord(template, { user_input: "hello" }, 1);
    expect(run).toMatchObject({ workflowId: template.id, workflowTemplateId: template.id, status: "success" });
    expect(run).not.toHaveProperty("courseId");
    expect(run).not.toHaveProperty("assignmentId");
    expect(run.nodes.map((item) => item.id)).toEqual(["start", "process", "end"]);
  });

  it("preserves the 760ms scheduled-step behavior and supports cancellation", () => {
    vi.useFakeTimers();
    const runtime = new DemoWorkflowRuntime();
    const advance = vi.fn();
    runtime.scheduleNextStep(advance);
    vi.advanceTimersByTime(759);
    expect(advance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(advance).toHaveBeenCalledOnce();
    const cancelled = vi.fn();
    runtime.scheduleNextStep(cancelled)();
    vi.advanceTimersByTime(760);
    expect(cancelled).not.toHaveBeenCalled();
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { WorkflowNodeV2, WorkflowStepV2 } from "../../domain/v2/types";
import { ExecutionDetails } from "./ExecutionDetails";

const node = { id: "review", label: "评审", type: "core.transform", typeVersion: 1, config: { operationRef: "core.identity" }, inputs: {}, writes: {} } as WorkflowNodeV2;
const step = (invocation: number, taskId: string, task: string): WorkflowStepV2 => ({
  stepId: `step-${invocation}`, runId: "run", nodeId: "review", invocation, attempt: 1, status: "completed",
  input: { task }, output: { ok: true }, execution: { taskId, namespace: `ns-${invocation}`, checkpointId: `cp-${invocation}`, attempt: 1 },
  startedAt: "2026-10-21T00:00:00Z", finishedAt: "2026-10-21T00:00:01Z",
} as WorkflowStepV2);

it("shows task identity and input summary in the invocation selector without opening raw data", () => {
  const html = renderToStaticMarkup(createElement(ExecutionDetails, {
    node,
    steps: [step(1, "task-cost", "成本"), step(2, "task-risk", "风险")],
    events: [],
    stepId: null,
    onSelect: () => undefined,
  }));
  expect(html).toContain("任务 task-cos");
  expect(html).toContain("任务 task-ris");
  expect(html).toContain("成本");
  expect(html).toContain("风险");
  expect(html).toContain("当前记录：任务 task-ris");
  expect(html).toContain("输入摘要：task · 风险");
});

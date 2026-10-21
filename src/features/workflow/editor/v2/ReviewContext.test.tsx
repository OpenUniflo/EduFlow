import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createNodeV2, createWorkflowV2 } from "../../domain/v2/factory";
import type { WorkflowStepV2, WorkflowThreadV2 } from "../../domain/v2/types";
import { ReviewContext } from "./ReviewContext";

const schema = { type: "object", properties: { approved: { type: "boolean" }, comment: { type: "string" } }, required: ["approved"], additionalProperties: false };
const definition = createWorkflowV2("审核");
definition.revision = 3;
definition.nodes.push({
  ...createNodeV2("core.transform", "total"),
  label: "汇总差旅费用",
  inputs: { value: { source: "state", pointer: "/approved", onMissing: { mode: "error" } } },
  writes: { receipt: "" },
  config: { operationRef: "core.identity", operationVersion: 1, authoring: { interrupt: { title: "请确认费用", schema, resumeWrites: { approved: "approved" } } } },
});
const thread: WorkflowThreadV2 = {
  threadId: "thread", workflowId: "workflow", revision: 3, status: "waiting", currentRunId: "run-12345678", checkpointId: "checkpoint-1234",
  state: { approved: true, receipt: "R-1", secret: "hidden" }, stateVersion: 2,
  interrupts: [{ id: "interrupt-1", nodeId: "total", title: "请确认费用", schema, taskId: "task-abcdefgh" }],
  updatedAt: "2026-10-21T00:00:00Z", nodeExecutions: 2, toolCalls: 0, computeMs: 0,
};
const steps: WorkflowStepV2[] = [{ stepId: "step-1", runId: "run-12345678", nodeId: "total", invocation: 1, attempt: 1, status: "completed", output: { receipt: "R-1" } }];

it("shows the actual review object, related state, output and write target without dumping unrelated State", () => {
  const html = renderToStaticMarkup(createElement(ReviewContext, { definition, thread, interrupt: thread.interrupts[0], steps }));
  expect(html).toContain("审核依据");
  expect(html).toContain("请确认费用");
  expect(html).toContain("汇总差旅费用");
  expect(html).toContain("Run run-1234");
  expect(html).toContain("检查点 checkpo");
  expect(html).toContain("任务 task-abc");
  expect(html).toContain("主图");
  expect(html).toContain("approved");
  expect(html).toContain("R-1");
  expect(html).toContain("approved → State.approved");
  expect(html).not.toContain("hidden");
});

it("warns when no related output or State fact is available", () => {
  const emptyThread: WorkflowThreadV2 = { ...thread, state: {}, checkpointId: "checkpoint-5678" };
  const html = renderToStaticMarkup(createElement(ReviewContext, { definition, thread: emptyThread, interrupt: emptyThread.interrupts[0], steps: [] }));
  expect(html).toContain("暂无已完成步骤输出");
  expect(html).toContain("当前没有可用的审核依据");
});

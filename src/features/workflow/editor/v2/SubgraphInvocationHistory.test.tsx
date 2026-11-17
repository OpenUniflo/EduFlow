import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createNodeV2, createWorkflowV2 } from "../../domain/v2/factory";
import type { WorkflowDefinitionV2, WorkflowStepV2 } from "../../domain/v2/types";
import type { RunReferenceSnapshot } from "../../domain/v2/runReferences";
import { SubgraphInvocationHistory } from "./SubgraphInvocationHistory";
import { stepInvocationIdentity, subgraphInvocationDetails, subgraphInvocations } from "./subgraphInvocations";

function step(id: string, graphPath: string[], namespace: string, startedAt: string, invocation = 1, extra: Partial<WorkflowStepV2> = {}): WorkflowStepV2 {
  return { stepId: id, runId: "run", nodeId: "inner", invocation, attempt: 1, status: "completed", graphPath, execution: { taskId: `task-${id}`, namespace, checkpointId: `checkpoint-${id}`, attempt: 1 }, startedAt, finishedAt: startedAt, ...extra } as WorkflowStepV2;
}

function targetDefinition(value: string, revision = 1): WorkflowDefinitionV2 {
  const definition = createWorkflowV2("子流程");
  definition.workflowId = "child";
  definition.revision = revision;
  definition.nodes.push({ ...createNodeV2("core.transform", "inner"), label: "子步骤", inputs: { value: { source: "literal", value } } });
  return definition;
}

function snapshot(revision = 1): RunReferenceSnapshot {
  return {
    available: true, version: 1, root: { workflowId: "root", revision: 1 }, rootEnvironmentRef: "local",
    targets: [{ workflowId: "child", revision, environmentRef: "local", name: "子流程", definition: targetDefinition("v1", revision) }],
    environments: [{ environmentRef: "local", environmentRevision: "env-1" }], targetCount: 1,
  };
}

function referenceRoot(): WorkflowDefinitionV2 {
  const definition = createWorkflowV2("父流程");
  definition.workflowId = "root";
  definition.revision = 1;
  definition.nodes.push(
    { ...createNodeV2("core.subgraph", "call1"), label: "第一次调用", config: { workflowRef: { workflowId: "child", revision: 1 }, environmentRef: "local" } },
    { ...createNodeV2("core.subgraph", "call2"), label: "第二次调用", config: { workflowRef: { workflowId: "child", revision: 1 }, environmentRef: "local" } },
  );
  return definition;
}

function parentCallStep(id: string, nodeId: string, output: string): WorkflowStepV2 {
  return step(id, [], "root-ns", "2026-10-21T00:00:00Z", 1, {
    nodeId, status: "completed", input: { value: id }, output: { answer: output },
    execution: { taskId: `parent-${id}`, namespace: "root-ns", checkpointId: `checkpoint-${id}`, attempt: 1, workflowPath: [] },
  });
}

function childStep(id: string, callNode: string, namespace: string, startedAt: string, extra: Partial<WorkflowStepV2> = {}): WorkflowStepV2 {
  return step(id, [callNode], namespace, startedAt, 1, {
    nodeId: "inner",
    execution: {
      taskId: `child-${id}`, namespace, checkpointId: `checkpoint-${id}`, attempt: 1,
      workflowPath: [{ parentWorkflowId: "root", parentRevision: 1, nodeId: callNode, workflowId: "child", revision: 1, environmentRef: "local", invocationId: `parent-${callNode}` }],
    },
    ...extra,
  });
}

it("groups steps by child graph path and namespace, ignoring root steps", () => {
  const root = step("root", [], "", "2026-10-21T00:00:00Z");
  const first = step("a1", ["sub"], "ns-a", "2026-10-21T00:00:01Z");
  expect(stepInvocationIdentity(root)).toBeUndefined();
  expect(stepInvocationIdentity(first)?.key).toContain("ns-a");
  const groups = subgraphInvocations([
    root,
    first,
    step("a2", ["sub"], "ns-a", "2026-10-21T00:00:02Z", 2),
    step("b1", ["sub"], "ns-b", "2026-10-21T00:00:03Z"),
  ]);
  expect(groups).toHaveLength(2);
  expect(groups[0].namespace).toBe("ns-a");
  expect(groups[0].steps.map(item => item.stepId)).toEqual(["a1", "a2"]);
  expect(groups[0].startedAt).toBe("2026-10-21T00:00:01Z");
  expect(groups[0].finishedAt).toBe("2026-10-21T00:00:02Z");
  expect(groups[1].namespace).toBe("ns-b");
});

it("renders each invocation with its own child step list and time identity", () => {
  const definition = createWorkflowV2("子图历史");
  const child = createWorkflowV2("子流程");
  child.nodes.push({ ...createNodeV2("core.transform", "inner"), label: "子步骤" });
  definition.nodes.push({ ...createNodeV2("core.subgraph", "sub"), label: "评审子图", config: { graph: child } });
  const html = renderToStaticMarkup(createElement(SubgraphInvocationHistory, {
    definition,
    steps: [
      step("a1", ["sub"], "ns-a", "2026-10-21T00:00:01Z"),
      step("b1", ["sub"], "ns-b", "2026-10-21T00:00:03Z"),
    ],
  }));
  expect(html).toContain("子流程调用（2）");
  expect(html).toContain("实例 A");
  expect(html).toContain("实例 B");
  expect(html).toContain("评审子图");
  expect(html).toContain("子步骤");
  expect(html).toContain("调用输入");
  expect(html).toContain("返回值");
});

it("keeps repeated calls to one target separate by invocation task and call path", () => {
  const definition = referenceRoot();
  const steps = [
    parentCallStep("call1", "call1", "first-return"),
    parentCallStep("call2", "call2", "second-return"),
    childStep("child1", "call1", "ns-call1", "2026-10-21T00:00:01Z"),
    childStep("child2", "call2", "ns-call2", "2026-10-21T00:00:02Z"),
  ];
  const details = subgraphInvocationDetails(steps, definition, snapshot());
  expect(details).toHaveLength(2);
  expect(details[0]).toMatchObject({ callerNodeId: "call1", targetAvailable: true, output: { answer: "first-return" } });
  expect(details[1]).toMatchObject({ callerNodeId: "call2", targetAvailable: true, output: { answer: "second-return" } });
  expect(details[0].callStep?.stepId).toBe("call1");
  expect(details[1].callStep?.stepId).toBe("call2");
  expect(details[0].target?.revision).toBe(1);
  expect(details[0].workflowPath?.[0]).toMatchObject({ nodeId: "call1", environmentRef: "local" });
});

it("shows an explicit unavailable message when the frozen target is missing", () => {
  const definition = referenceRoot();
  const html = renderToStaticMarkup(createElement(SubgraphInvocationHistory, {
    definition,
    steps: [parentCallStep("call1", "call1", "first-return"), childStep("child1", "call1", "ns-call1", "2026-10-21T00:00:01Z")],
    referenceSnapshot: { available: false, reason: "missing", targets: [], environments: [] },
    onOpenPath: () => undefined,
  }));
  expect(html).toContain("冻结引用快照缺失");
  expect(html).toContain("不会回退到目标当前最新版本");
  expect(html).not.toContain("打开当时只读画布");
  expect(html).not.toContain("在历史画布中定位");
});

it("keeps the step locate action when the frozen target is available", () => {
  const definition = referenceRoot();
  const html = renderToStaticMarkup(createElement(SubgraphInvocationHistory, {
    definition,
    steps: [parentCallStep("call1", "call1", "first-return"), childStep("child1", "call1", "ns-call1", "2026-10-21T00:00:01Z")],
    referenceSnapshot: snapshot(),
    onOpenPath: () => undefined,
  }));
  expect(html).toContain("打开当时只读画布");
  expect(html).toContain("在历史画布中定位");
});

it("binds a just-completed live Run's frozen target before any history row is selected", () => {
  const definition = referenceRoot();
  const html = renderToStaticMarkup(createElement(SubgraphInvocationHistory, {
    definition,
    steps: [
      parentCallStep("call1", "call1", "first-return"),
      childStep("child1", "call1", "ns-call1", "2026-10-21T00:00:01Z"),
    ],
    referenceSnapshot: snapshot(),
    referenceLoading: false,
    onOpenPath: () => undefined,
  }));
  expect(html).toContain("子流程 · 版本 1 · 环境 local（本 Run 冻结定义）");
  expect(html).toContain("打开当时只读画布");
  expect(html).not.toContain("冻结定义缺失");
  expect(html).not.toContain("正在读取此 Run 的冻结引用快照");
});


it("keeps a successful parent call successful after an earlier child attempt failed", () => {
  const definition = referenceRoot();
  const steps = [
    parentCallStep("call1", "call1", "ok"),
    childStep("child1", "call1", "ns-call1", "2026-10-21T00:00:01Z", {
      attempt: 1, status: "failed", error: { code: "TEMP", message: "temporary failure" },
    }),
    childStep("child1", "call1", "ns-call1", "2026-10-21T00:00:02Z", { attempt: 2, status: "completed" }),
  ];
  const detail = subgraphInvocationDetails(steps, definition, snapshot())[0];
  expect(detail.status).toBe("completed");
  expect(detail.error).toBeUndefined();
  expect(detail.output).toEqual({ answer: "ok" });
  expect(detail.steps.map(step => [step.attempt, step.status, step.error?.code])).toEqual([
    [1, "failed", "TEMP"],
    [2, "completed", undefined],
  ]);
  const html = renderToStaticMarkup(createElement(SubgraphInvocationHistory, { definition, steps, referenceSnapshot: snapshot() }));
  expect(html).toContain("已完成");
  expect(html).not.toContain("调用失败：TEMP");
});

it("uses the failed parent call as the final failure and keeps its error", () => {
  const definition = referenceRoot();
  const parent = parentCallStep("call1", "call1", "not-used");
  parent.status = "failed";
  parent.output = undefined;
  parent.error = { code: "SUBGRAPH_FAILED", message: "child failed" };
  const child = childStep("child1", "call1", "ns-call1", "2026-10-21T00:00:01Z", {
    status: "failed", error: { code: "INNER_FAILED", message: "inner failed" },
  });
  const detail = subgraphInvocationDetails([parent, child], definition, snapshot())[0];
  expect(detail.status).toBe("failed");
  expect(detail.error).toEqual({ code: "SUBGRAPH_FAILED", message: "child failed" });
  expect(detail.output).toBeUndefined();
  expect(detail.steps).toHaveLength(1);
});

it("does not default a missing parent call to completed when the latest child attempt is active", () => {
  const definition = referenceRoot();
  for (const status of ["running", "waiting"] as const) {
    const detail = subgraphInvocationDetails([
      childStep("child1", "call1", `ns-${status}`, "2026-10-21T00:00:01Z", { status }),
    ], definition, snapshot())[0];
    expect(detail.callStep).toBeUndefined();
    expect(detail.status).toBe(status);
    expect(detail.error).toBeUndefined();
  }
});

it("infers a missing parent call from the latest child attempt, not an older failure", () => {
  const definition = referenceRoot();
  const steps = [
    childStep("child1", "call1", "ns-call1", "2026-10-21T00:00:01Z", {
      attempt: 1, status: "failed", error: { code: "OLD", message: "old failure" },
    }),
    childStep("child1", "call1", "ns-call1", "2026-10-21T00:00:02Z", { attempt: 2, status: "completed" }),
  ];
  const detail = subgraphInvocationDetails(steps, definition, snapshot())[0];
  expect(detail.callStep).toBeUndefined();
  expect(detail.status).toBe("completed");
  expect(detail.error).toBeUndefined();
  expect(detail.steps.map(step => step.attempt)).toEqual([1, 2]);
});

it("infers a missing parent call as failed from the latest failed attempt", () => {
  const definition = referenceRoot();
  const steps = [
    childStep("child1", "call1", "ns-call1", "2026-10-21T00:00:01Z", {
      attempt: 1, status: "failed", error: { code: "OLD", message: "old failure" },
    }),
    childStep("child1", "call1", "ns-call1", "2026-10-21T00:00:02Z", {
      attempt: 2, status: "failed", error: { code: "NEW", message: "latest failure" },
    }),
  ];
  const detail = subgraphInvocationDetails(steps, definition, snapshot())[0];
  expect(detail.status).toBe("failed");
  expect(detail.error).toEqual({ code: "NEW", message: "latest failure" });
});

it("separates repeated invocations that share a checkpoint namespace but have distinct call tasks", () => {
  const definition = referenceRoot();
  const first = childStep("child1", "call1", "shared-ns", "2026-10-21T00:00:01Z");
  const second = childStep("child2", "call1", "shared-ns", "2026-10-21T00:00:02Z");
  first.execution = { ...first.execution!, parentTaskId: "parent-call-1" };
  second.execution = { ...second.execution!, parentTaskId: "parent-call-2" };
  const groups = subgraphInvocations([first, second]);
  expect(groups).toHaveLength(2);
  expect(groups.map(group => group.taskId)).toEqual(["parent-call-1", "parent-call-2"]);
  expect(subgraphInvocationDetails([parentCallStep("call1", "call1", "a"), first, second], definition, snapshot())).toHaveLength(2);
});

it("does not merge retry attempts or same node ids at different nested paths", () => {
  const definition = referenceRoot();
  const steps = [
    parentCallStep("call1", "call1", "first-return"),
    childStep("child1", "call1", "ns-call1", "2026-10-21T00:00:01Z", { attempt: 1 }),
    childStep("child1", "call1", "ns-call1", "2026-10-21T00:00:02Z", { attempt: 2, status: "failed", nodeId: "inner" }),
    step("nested", ["call1", "nested"], "ns-nested", "2026-10-21T00:00:03Z", 1, { nodeId: "inner" }),
  ];
  const details = subgraphInvocationDetails(steps, definition, snapshot());
  expect(details).toHaveLength(2);
  expect(details.find(item => item.graphPath.join("/") === "call1/nested")).toBeTruthy();
  const direct = details.find(item => item.graphPath.join("/") === "call1");
  expect(direct?.steps.map(item => item.attempt)).toEqual([1, 2]);
  expect(direct?.attemptCount).toBe(2);
});

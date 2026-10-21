import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createNodeV2, createWorkflowV2 } from "../../domain/v2/factory";
import type { WorkflowStepV2 } from "../../domain/v2/types";
import { SubgraphInvocationHistory } from "./SubgraphInvocationHistory";
import { stepInvocationIdentity, subgraphInvocations } from "./subgraphInvocations";

function step(id: string, graphPath: string[], namespace: string, startedAt: string, invocation = 1): WorkflowStepV2 {
  return { stepId: id, runId: "run", nodeId: "inner", invocation, attempt: 1, status: "completed", graphPath, execution: { taskId: `task-${id}`, namespace, checkpointId: `checkpoint-${id}`, attempt: 1 }, startedAt, finishedAt: startedAt } as WorkflowStepV2;
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
  expect(html).toContain("子图调用实例（2）");
  expect(html).toContain("实例 A");
  expect(html).toContain("实例 B");
  expect(html).toContain("评审子图");
  expect(html).toContain("子步骤");
  expect(html).toContain("输入");
  expect(html).toContain("返回");
});

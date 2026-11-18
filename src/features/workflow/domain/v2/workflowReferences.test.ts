import { describe, expect, it } from "vitest";
import { authoringDiagnostics } from "./authoring";
import { createWorkflowV2 } from "./factory";
import { fixedReferenceIssue, workflowReferenceInNode, workflowReferenceIssue, workflowReferenceUsages } from "./workflowReferences";
import type { WorkflowDefinitionV2, WorkflowNodeV2 } from "./types";

const referenceNode = (id: string, workflowId: string, revision: number, extra: Record<string, unknown> = {}): WorkflowNodeV2 => ({
  id, label: id, type: "core.subgraph", typeVersion: 1,
  config: { workflowRef: { workflowId, revision }, environmentRef: "local", ...extra } as never,
  inputs: { value: { source: "literal", value: 1 } }, writes: { answer: "/answer" },
});
const embeddedNode = (id: string, graph: WorkflowDefinitionV2): WorkflowNodeV2 => ({ id, label: id, type: "core.subgraph", typeVersion: 1, config: { graph: graph as never }, inputs: {}, writes: {} });

function definition(workflowId: string, nodes: WorkflowNodeV2[]): WorkflowDefinitionV2 {
  const base = createWorkflowV2("test");
  return { ...base, workflowId, revision: 1, nodes, transitions: [], outputBindings: {} };
}

describe("fixed independent Workflow reference", () => {
  it("parses an exact revision and keeps the legacy embedded graph path valid", () => {
    const node = referenceNode("call", "child", 2);
    expect(workflowReferenceInNode(node)).toEqual({ workflowId: "child", revision: 2, environmentRef: "local", stateMode: "independent" });
    expect(workflowReferenceIssue(node)).toBeUndefined();
    expect(workflowReferenceIssue(embeddedNode("legacy", createWorkflowV2("child")))).toBeUndefined();
  });

  it("rejects double configuration, missing revision, missing environment and shared state", () => {
    const double = referenceNode("call", "child", 1, { graph: createWorkflowV2("child") });
    const missing = referenceNode("call", "child", 1);
    missing.config.workflowRef = { workflowId: "child" } as never;
    const noEnvironment = referenceNode("call", "child", 1);
    delete noEnvironment.config.environmentRef;
    const shared = referenceNode("call", "child", 1, { stateMode: "shared" });
    expect(workflowReferenceIssue(double)).toMatch(/不能同时/);
    expect(workflowReferenceIssue(missing)).toMatch(/正整数/);
    expect(workflowReferenceIssue(noEnvironment)).toMatch(/目标运行环境/);
    expect(workflowReferenceIssue(shared)).toMatch(/隔离状态/);
    expect(workflowReferenceIssue(referenceNode("call", "child", 0))).toMatch(/正整数/);
  });

  it("flattens references inside embedded graphs and supports target reuse", () => {
    const graph = definition("child", []);
    const parent = definition("parent", [referenceNode("first", "child", 1), referenceNode("second", "child", 1), embeddedNode("wrapper", definition("wrapper", [referenceNode("inner", "child", 1)]))]);
    expect(workflowReferenceUsages(parent)).toMatchObject([
      { graphPath: [], nodeId: "first", workflowId: "child", revision: 1 },
      { graphPath: [], nodeId: "second", workflowId: "child", revision: 1 },
      { graphPath: ["wrapper"], nodeId: "inner", workflowId: "child", revision: 1 },
    ]);
    expect(workflowReferenceUsages(parent).some((usage) => usage.nodeId === "first" && usage.inputs.value)).toBe(true);
    expect(graph.workflowId).toBe("child");
  });

  it("detects a fixed-revision cycle and depth limit while permitting reuse", () => {
    const a = definition("a", [referenceNode("to-b", "b", 1)]);
    const b = definition("b", [referenceNode("to-a", "a", 1)]);
    expect(fixedReferenceIssue({ workflowId: "a", revision: 1 }, (id) => id === "a" ? a : id === "b" ? b : undefined)).toMatchObject({ code: "WORKFLOW_REFERENCE_CYCLE" });
    const reused = definition("a", [referenceNode("first", "b", 1), referenceNode("second", "b", 1)]);
    expect(fixedReferenceIssue({ workflowId: "a", revision: 1 }, (id) => id === "a" ? reused : definition("b", []) )).toBeUndefined();
    const chain = new Map<string, WorkflowDefinitionV2>();
    for (let index = 0; index < 10; index += 1) chain.set(`w${index}`, definition(`w${index}`, [referenceNode("next", `w${index + 1}`, 1)]));
    expect(fixedReferenceIssue({ workflowId: "w0", revision: 1 }, (id) => chain.get(id))).toMatchObject({ code: "WORKFLOW_REFERENCE_LIMIT" });
  });

  it("keeps the existing authoring diagnostics from rejecting a valid fixed reference", () => {
    const graph = definition("parent", [referenceNode("call", "child", 1)]);
    const issues = authoringDiagnostics(graph);
    expect(issues.some((issue) => issue.includes("子图定义无效"))).toBe(false);
    expect(issues.some((issue) => issue.includes("固定版本引用"))).toBe(false);
  });
});

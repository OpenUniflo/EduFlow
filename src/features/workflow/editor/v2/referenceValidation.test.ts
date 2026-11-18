import { describe, expect, it, vi } from "vitest";
import { createEditorV2, createWorkflowV2 } from "../../domain/v2/factory";
import type { Binding, JsonSchema, JsonValue, WorkflowDefinitionV2, WorkflowDocumentV2, WorkflowNodeV2 } from "../../domain/v2/types";
import { workflowReferenceUsages } from "../../domain/v2/workflowReferences";
import { ReferenceDocumentStore, referenceDocumentKey, type ReferenceDocumentLoadResult } from "./referenceDocuments";
import { firstBlockingReferenceUsage, referenceDocumentPlan, validateWorkflowReferences } from "./referenceValidation";

const objectSchema = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({ type: "object", properties, required, additionalProperties: false });
const stateBinding = (pointer: string): Binding => ({ source: "state", pointer, onMissing: { mode: "error" } });

function referenceNode(id: string, workflowId: string, revision: number, inputs: Record<string, Binding>, writes: Record<string, string>): WorkflowNodeV2 {
  return {
    id, label: id, type: "core.subgraph", typeVersion: 1,
    config: { workflowRef: { workflowId, revision }, environmentRef: "local" } as Record<string, JsonValue>,
    inputs, writes,
  };
}

function embeddedNode(id: string, graph: WorkflowDefinitionV2): WorkflowNodeV2 {
  return { id, label: id, type: "core.subgraph", typeVersion: 1, config: { graph: graph as unknown as JsonValue }, inputs: {}, writes: { answer: "/answer" } };
}

const targetDefinition: WorkflowDefinitionV2 = {
  ...createWorkflowV2("目标"),
  workflowId: "target", revision: 1,
  inputSchema: objectSchema({ question: { type: "string", title: "问题" } }, ["question"]),
  outputSchema: objectSchema({ answer: { type: "string", title: "回答" } }),
};
const targetDocument: WorkflowDocumentV2 = { definition: targetDefinition, editor: createEditorV2(targetDefinition) };
const targetKey = referenceDocumentKey("target", 1);

function innerGraph(stateType: "string" | "number" = "string"): WorkflowDefinitionV2 {
  const base = createWorkflowV2("内嵌组");
  return {
    ...base,
    workflowId: "parent", revision: 1,
    inputSchema: objectSchema({}),
    outputSchema: objectSchema({ answer: { type: "string" } }),
    state: {
      schema: objectSchema({ innerAnswer: { type: stateType } }),
      initial: { innerAnswer: stateType === "number" ? 0 : "" },
      inputBindings: {},
      reducers: {},
    },
    nodes: [
      base.nodes[0],
      referenceNode("inner_call", "target", 1, { question: stateBinding("/innerAnswer") }, { innerAnswer: "/answer" }),
      base.nodes[1],
    ],
    transitions: [],
    outputBindings: { answer: stateBinding("/innerAnswer") },
  };
}

/** Root and inner State deliberately use different fields for the same target interface. */
function rootGraph(inner = innerGraph()): WorkflowDefinitionV2 {
  const base = createWorkflowV2("父流程");
  return {
    ...base,
    workflowId: "parent", revision: 1,
    inputSchema: objectSchema({}),
    outputSchema: objectSchema({ answer: { type: "string" } }),
    state: {
      schema: objectSchema({ answer: { type: "string" } }),
      initial: { answer: "" },
      inputBindings: {},
      reducers: {},
    },
    nodes: [
      base.nodes[0],
      embeddedNode("group", inner),
      referenceNode("root_call", "target", 1, { question: stateBinding("/answer") }, { answer: "/answer" }),
      base.nodes[1],
    ],
    transitions: [],
    outputBindings: { answer: stateBinding("/answer") },
  };
}

const ready = { [targetKey]: { status: "ready" as const, document: targetDocument, latestRevision: 1 } };

describe("whole-document fixed-reference validation", () => {
  it("uses each usage's own graph schema, so different root and nested fields are both legal", () => {
    const validation = validateWorkflowReferences(rootGraph(), ready);
    expect(validation.loading).toBe(false);
    expect(validation.unavailable).toEqual([]);
    expect(validation.mapping).toEqual([]);
    expect(validation.saveBlocked).toBe(false);
    expect(validation.usages.map(usage => [usage.graphPath.join("/"), usage.nodeId])).toEqual([["group", "inner_call"], ["", "root_call"]]);
  });

  it("blocks a real nested type error and locates the exact graph path and node", () => {
    const validation = validateWorkflowReferences(rootGraph(innerGraph("number")), ready);
    expect(validation.saveBlocked).toBe(true);
    const blocker = validation.mapping.find(item => item.usage.nodeId === "inner_call");
    expect(blocker?.usage).toMatchObject({ nodeId: "inner_call", graphPath: ["group"] });
    expect(blocker?.issues.map(issue => issue.kind)).toEqual(expect.arrayContaining(["input-source-type", "output-state-type"]));
    expect(validation.mapping.some(item => item.usage.nodeId === "root_call")).toBe(false);
    expect(firstBlockingReferenceUsage(validation)).toMatchObject({ nodeId: "inner_call", graphPath: ["group"] });
  });

  it("blocks an unvalidated save while any reference document is still loading or unavailable", () => {
    const pending = validateWorkflowReferences(rootGraph(), {});
    expect(pending).toMatchObject({ loading: true, saveBlocked: true, mapping: [], unavailable: [] });
    const failed = validateWorkflowReferences(rootGraph(), { [targetKey]: { status: "error", message: "读取失败", missing: false } });
    expect(failed).toMatchObject({ loading: false, saveBlocked: true });
    expect(failed.unavailable.map(usage => usage.nodeId)).toEqual(expect.arrayContaining(["inner_call", "root_call"]));
  });

  it("collects every document reference before a node is selected and keeps one request per target", () => {
    const usages = workflowReferenceUsages(rootGraph());
    expect(usages).toHaveLength(2);
    const plan = referenceDocumentPlan(usages);
    expect(plan).toEqual([{ key: targetKey, workflowId: "target", revision: 1 }]);

    const store = new ReferenceDocumentStore();
    const load = vi.fn(() => new Promise<ReferenceDocumentLoadResult>(() => undefined));
    for (const target of plan) store.ensure(target.key, load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()[targetKey]).toEqual({ status: "loading" });

    // Selecting or navigating away re-runs the same document plan; it must
    // neither restart the request nor leave a second loading entry behind.
    for (const target of plan) store.ensure(target.key, load);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it } from "vitest";
import type { JsonValue, WorkflowDefinitionV2, WorkflowNodeV2 } from "./types";
import { workflowResourceReferences } from "./resourceReferences";

const policy = { timeoutMs: 120000, nodeTimeoutMs: 30000, maxNodeExecutions: 50, maxToolCalls: 10, maxInputBytes: 65536, maxStateBytes: 1048576, maxEventBytes: 65536, maxOutputTokens: 2048, maxAttempts: 1 };

function definition(nodes: WorkflowNodeV2[]): WorkflowDefinitionV2 {
  return {
    schemaVersion: "2.0", workflowId: "workflow", revision: 1, name: "test", description: "",
    inputSchema: { type: "object" }, outputSchema: { type: "object" },
    state: { schema: { type: "object" }, initial: {}, inputBindings: {}, reducers: {} },
    entryNodeId: nodes[0]?.id ?? "start", nodes, transitions: [], outputBindings: {}, policy, requiredCapabilities: [],
  };
}

function node(id: string, type: string, config: Record<string, JsonValue>): WorkflowNodeV2 {
  return { id, label: id, type, typeVersion: 1, config, inputs: {}, writes: {} };
}

describe("workflow resource references", () => {
  it("deduplicates one provider shared by three model nodes and keeps every usage", () => {
    const references = workflowResourceReferences(definition([
      node("research", "core.llm", { providerRef: "p4:owner:deepseek:1", modelRef: "deepseek-flash" }),
      node("draft", "core.llm", { providerRef: "p4:owner:deepseek:1", modelRef: "deepseek-reasoner" }),
      node("review", "core.llm", { providerRef: "p4:owner:deepseek:1", modelRef: "deepseek-flash" }),
    ]));
    expect(references).toHaveLength(1);
    expect(references[0]).toMatchObject({ key: "provider:p4:owner:deepseek:1", kind: "provider" });
    expect(references[0].usages.map(usage => usage.label)).toEqual(["research", "draft", "review"]);
  });

  it("includes APIs, registered functions, inline functions and variables", () => {
    const inline = node("transform", "core.function", { implementation: "code", language: "python", code: "return {}", inputSchema: { type: "object" }, outputSchema: { type: "object" } });
    const input = node("input", "core.llm", { providerRef: "deepseek", allowedToolRefs: [] });
    input.inputs = { topic: { source: "environment", pointer: "/TOPIC", onMissing: { mode: "error" } } };
    const references = workflowResourceReferences(definition([
      node("call", "core.tool", { toolRef: "p4:owner:search:1", contractDigest: "d1" }),
      node("registered", "core.function", { implementation: "registered", functionRef: "cleanup", functionVersion: 3 }),
      inline,
      input,
    ]));
    expect(new Set(references.map(reference => reference.key))).toEqual(new Set([
      "api:p4:owner:search:1",
      "function:cleanup",
      "function::inline:transform",
      "provider:deepseek",
      "variable:TOPIC",
    ]));
    expect(references.find(reference => reference.key === "function::inline:transform")?.inline).toMatchObject({ label: "transform" });
    expect(references.find(reference => reference.key === "function:cleanup")?.usages[0].functionVersion).toBe(3);
  });

  it("finds references inside subgraphs", () => {
    const child = definition([node("inner", "core.llm", { providerRef: "p4:owner:model:1", modelRef: "m" })]);
    const root = definition([node("sub", "core.subgraph", { graph: child as unknown as JsonValue, stateMode: "independent" })]);
    const usage = workflowResourceReferences(root)[0].usages[0];
    expect(usage.graphPath).toEqual(["sub"]);
    expect(usage.nodeId).toBe("inner");
  });
});

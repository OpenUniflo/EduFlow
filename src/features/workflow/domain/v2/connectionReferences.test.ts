import { describe, expect, it } from "vitest";
import type { JsonValue, WorkflowDefinitionV2, WorkflowNodeV2, WorkflowTool } from "./types";
import { applyCapabilityBindings, applyConnectionUpdates, connectionReferences, connectionUpdates, unresolvedCapabilities, type CapabilityBinding, type ConnectionCatalogEntry } from "./connectionReferences";

const policy = { timeoutMs: 120000, nodeTimeoutMs: 30000, maxNodeExecutions: 50, maxToolCalls: 10, maxInputBytes: 65536, maxStateBytes: 1048576, maxEventBytes: 65536, maxOutputTokens: 2048, maxAttempts: 1 };

function emptyDefinition(): WorkflowDefinitionV2 {
  return {
    schemaVersion: "2.0", workflowId: "workflow", revision: 1, name: "test", description: "",
    inputSchema: { type: "object" }, outputSchema: { type: "object" },
    state: { schema: { type: "object" }, initial: {}, inputBindings: {}, reducers: {} },
    entryNodeId: "start", nodes: [], transitions: [], outputBindings: {}, policy, requiredCapabilities: [],
  };
}

function node(id: string, type: string, config: Record<string, JsonValue>): WorkflowNodeV2 {
  return { id, label: id, type, typeVersion: 1, config, inputs: {}, writes: {} };
}

function connection(ref: string, version: number, content: Record<string, JsonValue>, disabled = false): ConnectionCatalogEntry {
  return { connectionKey: `p4:owner:${ref}:${version}`, ref, version, disabled, content };
}

function tool(ref: string, contractDigest: string, available = true): WorkflowTool {
  return { ref, name: ref, contractDigest, inputSchema: { type: "object" }, available };
}

function graph(): WorkflowDefinitionV2 {
  const child = emptyDefinition();
  child.nodes = [
    node("tool", "core.tool", { toolRef: "p4:owner:search:1", contractDigest: "old" }),
    node("dispatch", "core.tool_dispatch", { allowedToolRefs: ["p4:owner:search:1"] }),
  ];
  const root = emptyDefinition();
  root.nodes = [
    node("llm", "core.llm", { providerRef: "p4:owner:model:1", modelRef: "deepseek-flash", allowedToolRefs: ["p4:owner:search:1", "environment-tool"] }),
    node("sub", "core.subgraph", { graph: child as unknown as JsonValue, stateMode: "independent" }),
    node("environment", "core.llm", { providerRef: "deepseek", modelRef: "deepseek-flash" }),
  ];
  return root;
}

const connections = [
  connection("model", 1, { type: "deepseek", modelRefs: ["deepseek-flash"] }),
  connection("model", 2, { type: "deepseek", modelRefs: ["deepseek-flash"] }),
  connection("search", 1, { type: "http" }),
  connection("search", 2, { type: "http" }),
];

describe("connection references", () => {
  it("scans root, subgraph, tool dispatch and tool whitelists", () => {
    const references = connectionReferences(graph());
    expect(references).toHaveLength(4);
    expect(references.filter(reference => reference.graphPath.join("/") === "sub")).toHaveLength(2);
    expect(references.some(reference => reference.field === "allowedToolRefs" && reference.index === 0)).toBe(true);
    expect(references.some(reference => reference.oldRef === "environment-tool")).toBe(false);
  });

  it("carries modelRef for user model references and keeps it on proposed updates", () => {
    const definition = graph();
    const provider = connectionReferences(definition).find(reference => reference.field === "providerRef" && reference.nodeId === "llm");
    expect(provider?.modelRef).toBe("deepseek-flash");
    expect(connectionReferences(definition).every(reference => reference.field === "providerRef" || reference.modelRef === undefined)).toBe(true);

    const update = connectionUpdates({ definition, connections, tools: [] }).find(item => item.kind === "provider");
    expect(update?.modelRef).toBe("deepseek-flash");
    expect(update?.newRef).toBe("p4:owner:model:2");
  });

  it("omits modelRef when the model node does not declare one", () => {
    const definition = emptyDefinition();
    definition.nodes = [node("llm", "core.llm", { providerRef: "p4:owner:model:1" })];
    const provider = connectionReferences(definition).find(reference => reference.field === "providerRef");
    expect(provider).toBeDefined();
    expect(provider && "modelRef" in provider).toBe(false);
  });

  it("proposes the latest enabled version and requires confirmation when the tool contract changed", () => {
    const updates = connectionUpdates({ definition: graph(), connections, tools: [tool("p4:owner:search:2", "new")] });
    const provider = updates.find(update => update.kind === "provider");
    expect(provider?.newRef).toBe("p4:owner:model:2");
    expect(provider?.requiresConfirmation).toBe(false);
    const tools = updates.filter(update => update.kind === "tool");
    expect(tools).toHaveLength(3);
    expect(tools.filter(update => update.requiresConfirmation)).toHaveLength(1);
    expect(tools.find(update => update.field === "toolRef")?.reason).toContain("工具合同已变化");
    expect(tools.filter(update => update.field === "allowedToolRefs").every(update => !update.requiresConfirmation)).toBe(true);
  });

  it("ignores a disabled latest version and reports a missing new tool contract", () => {
    const disabledLatest = [connections[0], { ...connections[1], disabled: true }, connections[2], connections[3]];
    const updates = connectionUpdates({ definition: graph(), connections: disabledLatest, tools: [] });
    expect(updates.some(update => update.kind === "provider")).toBe(false);
    expect(updates.every(update => update.requiresConfirmation)).toBe(true);
    expect(updates[0].reason).toContain("尚未读取");
  });

  it("requires a manual model choice when the new version omits the current model", () => {
    const changed = [connections[0], connection("model", 2, { type: "deepseek", modelRefs: ["other-model"] }), connections[2], connections[3]];
    const provider = connectionUpdates({ definition: graph(), connections: changed, tools: [] }).find(update => update.kind === "provider");
    expect(provider?.requiresConfirmation).toBe(true);
    expect(provider?.reason).toContain("不包含当前模型");
  });

  it("applies updates across the root and nested subgraph without touching environment references", () => {
    const definition = graph();
    const updates = connectionUpdates({ definition, connections, tools: [tool("p4:owner:search:2", "new")] });
    const updated = applyConnectionUpdates(definition, updates);
    const llm = updated.nodes.find(item => item.id === "llm");
    expect(llm?.config.providerRef).toBe("p4:owner:model:2");
    expect((llm?.config.allowedToolRefs as string[])[0]).toBe("p4:owner:search:2");
    expect((llm?.config.allowedToolRefs as string[])[1]).toBe("environment-tool");
    const child = updated.nodes.find(item => item.id === "sub")?.config.graph as unknown as WorkflowDefinitionV2;
    const toolNode = child.nodes.find(item => item.id === "tool");
    expect(toolNode?.config.toolRef).toBe("p4:owner:search:2");
    expect(toolNode?.config.contractDigest).toBe("new");
    expect(updated.nodes.find(item => item.id === "environment")?.config.providerRef).toBe("deepseek");
    expect(definition.nodes.find(item => item.id === "llm")?.config.providerRef).toBe("p4:owner:model:1");
  });

  it("binds unset template capabilities in the root and a nested subgraph", () => {
    const definition = emptyDefinition();
    const child = emptyDefinition();
    child.nodes = [node("tool", "core.tool", { toolRef: "", contractDigest: "" })];
    definition.nodes = [
      node("model", "core.llm", { providerRef: "", modelRef: "" }),
      node("sub", "core.subgraph", { graph: child as unknown as JsonValue }),
    ];
    const unresolved = unresolvedCapabilities(definition);
    expect(unresolved.map(item => `${item.nodeId}:${item.field}`)).toEqual(["model:providerRef", "tool:toolRef"]);
    const bindings: CapabilityBinding[] = [
      { ...unresolved[0], reference: "p4:owner:model:1", modelRef: "deepseek-flash" },
      { ...unresolved[1], reference: "p4:owner:search:1", contractDigest: "digest" },
    ];
    const bound = applyCapabilityBindings(definition, bindings);
    expect(bound.nodes.find(item => item.id === "model")?.config.providerRef).toBe("p4:owner:model:1");
    expect(bound.nodes.find(item => item.id === "model")?.config.modelRef).toBe("deepseek-flash");
    const childTool = (bound.nodes.find(item => item.id === "sub")?.config.graph as unknown as WorkflowDefinitionV2).nodes.find(item => item.id === "tool");
    expect(childTool?.config.toolRef).toBe("p4:owner:search:1");
    expect(childTool?.config.contractDigest).toBe("digest");
    expect(unresolvedCapabilities(definition)).toHaveLength(2);
  });
});

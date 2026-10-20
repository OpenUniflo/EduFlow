import type { Binding, EditorDocumentV2, WorkflowDefinitionV2, WorkflowNodeV2 } from "./types";

export const workflowPolicy = { timeoutMs: 120000, nodeTimeoutMs: 30000, maxNodeExecutions: 50, maxToolCalls: 10, maxInputBytes: 65536, maxStateBytes: 1048576, maxEventBytes: 65536, maxOutputTokens: 2048, maxAttempts: 1 };
const objectSchema = { type: "object", properties: {}, additionalProperties: false };
export function createWorkflowV2(name = "新建工作流"): WorkflowDefinitionV2 {
  return { schemaVersion: "2.0", workflowId: "", revision: 0, name, description: "", inputSchema: { ...objectSchema }, outputSchema: { ...objectSchema },
    state: { schema: { ...objectSchema }, initial: {}, inputBindings: {}, reducers: {} }, entryNodeId: "start",
    nodes: [createNodeV2("core.start", "start"), createNodeV2("core.end", "end")], transitions: [{ id: "start-next-end", from: "start", outlet: "next", to: "end" }],
    outputBindings: {}, policy: { ...workflowPolicy }, requiredCapabilities: [] };
}
export function createEditorV2(definition: WorkflowDefinitionV2): EditorDocumentV2 {
  return { schemaVersion: 1, workflowId: definition.workflowId, editorRevision: 0, definitionRevision: definition.revision,
    nodes: Object.fromEntries(definition.nodes.map((node, index) => [node.id, { x: 80 + index * 260, y: 160 }])), edges: {} };
}
export const nodeTypesV2 = [
  { type: "core.start", label: "入口" }, { type: "core.end", label: "结束" },
  { type: "core.transform", label: "数据转换" }, { type: "core.llm", label: "模型" },
  { type: "core.router", label: "条件路由" }, { type: "core.tool", label: "工具" },
  { type: "core.tool_dispatch", label: "工具调用批次" }
];
export const stateBinding = (pointer: string): Binding => ({ source: "state", pointer, onMissing: { mode: "error" } });
export function createNodeV2(type: string, id: string): WorkflowNodeV2 {
  const common: WorkflowNodeV2 = { id, label: nodeTypesV2.find(item => item.type === type)?.label ?? type, type, typeVersion: 1, config: {}, inputs: {}, writes: {} };
  if (type === "core.llm") return { ...common, config: { providerRef: "", modelRef: "", modelParameters: {}, allowedToolRefs: [] }, inputs: { messages: stateBinding("/messages") }, writes: { messages: "/messages", pendingCalls: "/toolCalls" } };
  if (type === "core.tool") return { ...common, config: { toolRef: "", contractDigest: "" }, inputs: { arguments: { source: "literal", value: {} } }, writes: {} };
  if (type === "core.tool_dispatch") return { ...common, config: { allowedToolRefs: [] }, inputs: { toolCalls: stateBinding("/pendingCalls") }, writes: { messages: "/toolMessages" } };
  if (type === "core.router") return { ...common, config: { cases: [{ id: "has_calls", priority: 1, predicate: { op: "nonEmpty", source: "state", pointer: "/pendingCalls" } }], defaultOutlet: "default" } };
  if (type === "core.transform") return { ...common, config: { operationRef: "core.identity", operationVersion: 1 }, inputs: { value: { source: "literal", value: {} } } };
  return common;
}

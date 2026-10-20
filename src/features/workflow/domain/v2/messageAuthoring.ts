import type { JsonSchema, WorkflowDefinitionV2, WorkflowDocumentV2, WorkflowNodeV2 } from "./types";
/** Defaults are workflow authoring data, not a learner conversation or runtime message adapter. */
export function withModelState(definition: WorkflowDefinitionV2): WorkflowDefinitionV2 {
  const fields = (definition.state.schema.properties ?? {}) as Record<string,JsonSchema>;
  const properties = { ...fields }; const initial = { ...definition.state.initial }; const reducers = { ...definition.state.reducers };
  for (const [key, title] of [["messages", "对话消息"], ["pendingCalls", "待执行工具"]]) if (!Object.prototype.hasOwnProperty.call(fields, key)) {
    properties[key] = { type: "array", title, items: { type: "object" } }; initial[key] = []; reducers[key] = { name: key === "messages" ? "messages" : "replace", version: 1 };
  }
  return { ...definition, state: { ...definition.state, schema: { ...definition.state.schema, properties }, initial, reducers } };
}
export function insertAuthoringNode(current: WorkflowDocumentV2, node: WorkflowNodeV2, x: number, y: number): WorkflowDocumentV2 {
  const empty = current.definition.nodes.every(item => ["core.start", "core.end"].includes(item.type));
  let definition = ["core.llm", "core.tool_dispatch"].includes(node.type) ? withModelState(current.definition) : current.definition;
  if (node.type === "core.llm") {
    node = { ...node, inputs: { ...node.inputs, messages: node.inputs.messages?.source === "literal" ? node.inputs.messages : { source: "literal", value: [] } } };
    if (empty && !Object.keys(definition.outputBindings).length) definition = { ...definition, outputSchema: { type: "object", properties: { messages: { type: "array", items: { type: "object" } } }, required: ["messages"], additionalProperties: false }, outputBindings: { messages: { source: "state", pointer: "/messages", onMissing: { mode: "error" } } } };
  }
  return { definition: { ...definition, nodes: [...definition.nodes, node] }, editor: { ...current.editor, nodes: { ...current.editor.nodes, [node.id]: { x, y } } } };
}
export function messageAuthoringIssue(node: WorkflowNodeV2): string | undefined {
  const binding = node.inputs.messages;
  if (node.type !== "core.llm" || binding?.source !== "literal") return undefined;
  if (!Array.isArray(binding.value)) return "模型的固定对话消息需要是消息列表，请使用消息表单添加问题。";
  if (!binding.value.length) return "请在模型节点的“读取 → 固定对话消息”中添加至少一条问题或指令。";
  for (const message of binding.value) if (message && typeof message === "object" && !Array.isArray(message) && ["user", "system"].includes(String(message.role)) && Array.isArray(message.content) && !message.content.some(block => block && typeof block === "object" && !Array.isArray(block) && typeof block.text === "string" && block.text.trim())) return "请填写模型消息的内容，不能只保留空消息。";
  return undefined;
}

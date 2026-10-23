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
    // The v2 model node declares its parameters; the prompt references their names, so no
    // literal messages input is injected any more. State.answer receives the model text.
    const properties = (definition.state.schema.properties ?? {}) as Record<string, JsonSchema>;
    if (!Object.prototype.hasOwnProperty.call(properties, "answer")) definition = { ...definition, state: { ...definition.state, schema: { ...definition.state.schema, properties: { ...properties, answer: { type: "string", title: "模型回答" } } }, initial: { ...definition.state.initial, answer: "" } } };
    if (empty && !Object.keys(definition.outputBindings).length) definition = { ...definition, outputSchema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false }, outputBindings: { answer: { source: "state", pointer: "/answer", onMissing: { mode: "error" } } } };
  }
  return { definition: { ...definition, nodes: [...definition.nodes, node] }, editor: { ...current.editor, nodes: { ...current.editor.nodes, [node.id]: { x, y } } } };
}

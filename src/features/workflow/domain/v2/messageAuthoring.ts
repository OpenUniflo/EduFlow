import type { JsonSchema, WorkflowDefinitionV2, WorkflowDocumentV2, WorkflowNodeV2 } from "./types";
import { withDefaultNodeOutput } from "./stateAuthoring";
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
  const withOutput = withDefaultNodeOutput(definition, node);
  definition = withOutput.definition;
  node = withOutput.node;
  if (node.type === "core.llm" && empty && !Object.keys(definition.outputBindings).length) {
    // The first model node becomes the readable graph output; later nodes still write State.
    const field = Object.keys(node.writes)[0] ?? "answer";
    definition = { ...definition, outputSchema: { type: "object", properties: { [field]: { type: "string" } }, required: [field], additionalProperties: false }, outputBindings: { [field]: { source: "state", pointer: `/${field}`, onMissing: { mode: "error" } } } };
  }
  return { definition: { ...definition, nodes: [...definition.nodes, node] }, editor: { ...current.editor, nodes: { ...current.editor.nodes, [node.id]: { x, y } } } };
}

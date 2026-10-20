import type { JsonSchema, WorkflowDefinitionV2 } from "./types";

/** Removing a declared interface field also removes its owned mappings, never unrelated State or node bindings. */
export function replaceInterfaceSchema(graph: WorkflowDefinitionV2, kind: "input" | "output", schema: JsonSchema): WorkflowDefinitionV2 {
  const key = kind === "input" ? "inputSchema" : "outputSchema";
  const removed = new Set(Object.keys(graph[key].properties ?? {}).filter(name => !Object.prototype.hasOwnProperty.call(schema.properties ?? {}, name)));
  if (kind === "output") return { ...graph, outputSchema: schema, outputBindings: Object.fromEntries(Object.entries(graph.outputBindings).filter(([name]) => !removed.has(name))) };
  return { ...graph, inputSchema: schema, state: { ...graph.state, inputBindings: Object.fromEntries(Object.entries(graph.state.inputBindings).filter(([, binding]) => binding.source !== "input" || !binding.pointer || !removed.has(binding.pointer.split("/")[1].replace(/~1/g, "/").replace(/~0/g, "~")))) } };
}

import type { Binding, JsonSchema, JsonValue, WorkflowTool } from "./types";

/** One editable row of a tool node's Schema-driven input table. */
export type ToolParamRow = { name: string; title: string; description?: string; schema: JsonSchema; required: boolean; binding?: Binding };

export type ToolInputReconciliation = { inputs: Record<string, Binding>; added: string[]; removed: string[]; newlyRequired: string[] };

function propertySchemas(schema: JsonSchema | undefined): Record<string, JsonValue> | undefined {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return undefined;
  const properties = schema.properties;
  return properties && typeof properties === "object" && !Array.isArray(properties) ? properties as Record<string, JsonValue> : undefined;
}

function requiredNames(schema: JsonSchema | undefined): string[] {
  if (!schema || typeof schema !== "object" || Array.isArray(schema) || !Array.isArray(schema.required)) return [];
  return schema.required.filter((name): name is string => typeof name === "string");
}

function asSchema(value: JsonValue | undefined): JsonSchema {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonSchema : {};
}

/**
 * Builds the tool node input table from the tool's `inputSchema.properties`, preserving Schema
 * property order. The persisted binding (if any) is returned unchanged; this function never
 * invents or rewrites bindings.
 */
export function toolParamRows(inputSchema: JsonSchema | undefined, inputs: Readonly<Record<string, Binding>> = {}): ToolParamRow[] {
  const properties = propertySchemas(inputSchema);
  if (!properties) return [];
  const required = new Set(requiredNames(inputSchema));
  return Object.entries(properties).map(([name, value]) => {
    const schema = asSchema(value);
    const title = typeof schema.title === "string" ? schema.title : name;
    const description = typeof schema.description === "string" ? schema.description : undefined;
    const binding = inputs && Object.prototype.hasOwnProperty.call(inputs, name) ? inputs[name] : undefined;
    return { name, title, ...(description === undefined ? {} : { description }), schema, required: required.has(name), ...(binding ? { binding } : {}) };
  });
}

/**
 * Mirrors the Worker M11 rule: iterate the node's declared inputs, take each resolved value, and
 * omit optional parameters that resolved to a missing value. Literal bindings can never be missing,
 * so they fall back to their own value when the caller did not precompute a `resolved` entry.
 */
export function assembleToolArguments(
  inputs: Readonly<Record<string, Binding>>,
  resolved: Readonly<Record<string, JsonValue | undefined>> = {},
): Record<string, JsonValue> {
  const args: Record<string, JsonValue> = {};
  for (const [name, binding] of Object.entries(inputs ?? {})) {
    let value = resolved && Object.prototype.hasOwnProperty.call(resolved, name) ? resolved[name] : undefined;
    if (value === undefined && binding && binding.source === "literal") value = binding.value;
    if (value === undefined) continue;
    args[name] = value;
  }
  return args;
}

/**
 * Preserves same-named bindings when a tool version changes its input Schema (plan 3.5). Bindings
 * for removed parameters are dropped; a new Schema without a `properties` object is treated as an
 * open Schema and keeps every binding. The input record is never mutated.
 */
export function reconcileToolInputs(
  oldSchema: JsonSchema | undefined,
  newSchema: JsonSchema | undefined,
  inputs: Readonly<Record<string, Binding>>,
): ToolInputReconciliation {
  const source = inputs && typeof inputs === "object" ? inputs : {};
  if (!newSchema || typeof newSchema !== "object" || Array.isArray(newSchema)) {
    return { inputs: { ...source }, added: [], removed: [], newlyRequired: [] };
  }
  const oldProperties = propertySchemas(oldSchema);
  const newProperties = propertySchemas(newSchema);
  const oldNames = oldProperties ? Object.keys(oldProperties) : [];
  const newNames = newProperties ? Object.keys(newProperties) : [];
  const added = newProperties ? newNames.filter(name => !oldNames.includes(name)) : [];
  const removed = newProperties ? Object.keys(source).filter(name => !newNames.includes(name)) : [];
  const oldRequired = new Set(requiredNames(oldSchema));
  const newlyRequired = requiredNames(newSchema)
    .filter(name => !oldRequired.has(name))
    .filter(name => !newProperties || newNames.includes(name));
  const nextInputs: Record<string, Binding> = {};
  for (const [name, binding] of Object.entries(source)) if (!removed.includes(name)) nextInputs[name] = binding;
  return { inputs: nextInputs, added, removed, newlyRequired };
}

export type ToolContractRefresh = {
  /** Node config with only `contractDigest` replaced; `toolRef` and every other key are preserved. */
  config: Record<string, JsonValue>;
  inputs: Record<string, Binding>;
  removed: string[];
  missingRequired: string[];
};

/**
 * Refreshes a tool node's contract digest after the registered tool definition changed. Bindings
 * whose names still exist stay untouched (variable sources, literal values and missing-value rules
 * included); bindings for removed parameters are dropped; required parameters without a binding
 * are reported so the node panel can ask for them instead of inventing a value.
 */
export function refreshToolContract(
  { config, inputs, tool }: { config: Readonly<Record<string, JsonValue>>; inputs: Readonly<Record<string, Binding>>; tool: Pick<WorkflowTool, "contractDigest" | "inputSchema"> },
): ToolContractRefresh {
  const source = inputs && typeof inputs === "object" ? inputs : {};
  const schema = tool.inputSchema;
  const properties = propertySchemas(schema);
  let nextInputs: Record<string, Binding>;
  let removed: string[];
  if (!schema || typeof schema !== "object" || Array.isArray(schema) || !properties) {
    nextInputs = { ...source };
    removed = [];
  } else {
    const names = Object.keys(properties);
    removed = Object.keys(source).filter(name => !names.includes(name));
    nextInputs = {};
    for (const [name, binding] of Object.entries(source)) if (!removed.includes(name)) nextInputs[name] = binding;
  }
  const missingRequired = requiredNames(schema).filter(name => !Object.prototype.hasOwnProperty.call(nextInputs, name));
  return { config: { ...config, contractDigest: tool.contractDigest }, inputs: nextInputs, removed, missingRequired };
}

/** Chinese feedback for a refresh result; an untouched wiring keeps the short confirmation. */
export function toolContractRefreshMessage({ removed, missingRequired }: Pick<ToolContractRefresh, "removed" | "missingRequired">): string {
  if (!removed.length && !missingRequired.length) return "已刷新，参数接线保持不变";
  const parts: string[] = [];
  if (removed.length) parts.push(`已移除参数：${removed.join("、")}。`);
  if (missingRequired.length) parts.push(`需补充的必填参数：${missingRequired.join("、")}，请在参数表中接上。`);
  return `已刷新。${parts.join("")}`;
}

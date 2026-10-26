import type { Binding, JsonSchema, JsonValue, WorkflowDefinitionV2, WorkflowNodeV2, WorkflowTool } from "./types";
import { primaryToolOutput, stateTypeForOutput } from "./outputStructure";
import { pointerFieldName, stateFieldConsumers, stateFieldProducers } from "./dataFlow";

/**
 * Pure State authoring operations. The Node panel, the workbench and the State table must
 * create fields through these helpers instead of editing slices in React components.
 */

export const STATE_FIELD_TYPE_LABELS = {
  string: "文本",
  number: "数字",
  boolean: "是或否",
  array: "列表",
  object: "对象",
} as const;

export type StateFieldType = keyof typeof STATE_FIELD_TYPE_LABELS;

const RESERVED_STATE_FIELD_NAMES = ["__proto__", "constructor", "prototype"];

export function stateTypeLabel(type: unknown): string {
  if (typeof type === "string" && type in STATE_FIELD_TYPE_LABELS) return STATE_FIELD_TYPE_LABELS[type as StateFieldType];
  if (type === "integer") return "数字";
  if (type === "null") return "空值";
  return "未指定";
}

/** Why a new State field name is invalid, or `undefined` when it can be created. */
export function stateFieldNameIssue(stateSchema: JsonSchema, field: string): string | undefined {
  const name = field.trim();
  if (!name) return "字段名不能为空。";
  if (RESERVED_STATE_FIELD_NAMES.includes(name)) return `「${name}」是保留名称，不能用作字段名。`;
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) return "字段名需以字母或下划线开头，只含字母、数字、下划线，最长 64 个字符。";
  const properties = stateSchema.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties) && Object.prototype.hasOwnProperty.call(properties, name)) {
    return `字段「${name}」已存在，请直接从列表选择。`;
  }
  return undefined;
}

export function stateFieldSchema(type: StateFieldType, title?: string): JsonSchema {
  return {
    type,
    ...(title ? { title } : {}),
    ...(type === "array" ? { items: { type: "object" } } : {}),
  };
}

export function stateFieldInitial(type: StateFieldType): JsonValue {
  if (type === "number") return 0;
  if (type === "boolean") return false;
  if (type === "array") return [];
  if (type === "object") return {};
  return "";
}

/** Adds a declared State field with its initial value and default reducer. Idempotent by name. */
export function withStateField(definition: WorkflowDefinitionV2, field: string, type: StateFieldType = "string", title?: string): WorkflowDefinitionV2 {
  const name = field.trim();
  if (!name) return definition;
  const properties = (definition.state.schema.properties ?? {}) as Record<string, JsonSchema>;
  if (Object.prototype.hasOwnProperty.call(properties, name)) return definition;
  return {
    ...definition,
    state: {
      ...definition.state,
      schema: { ...definition.state.schema, properties: { ...properties, [name]: stateFieldSchema(type, title) } },
      initial: { ...definition.state.initial, [name]: definition.state.initial[name] ?? stateFieldInitial(type) },
      reducers: { ...definition.state.reducers, [name]: definition.state.reducers[name] ?? { name: "replace", version: 1 } },
    },
  };
}

function withNode(definition: WorkflowDefinitionV2, nodeId: string, update: (node: WorkflowNodeV2) => WorkflowNodeV2): WorkflowDefinitionV2 {
  return { ...definition, nodes: definition.nodes.map(node => node.id === nodeId ? update(node) : node) };
}

/** Replaces one node input binding. */
export function withNodeInputBinding(definition: WorkflowDefinitionV2, nodeId: string, name: string, binding: WorkflowNodeV2["inputs"][string]): WorkflowDefinitionV2 {
  return withNode(definition, nodeId, node => ({ ...node, inputs: { ...node.inputs, [name]: binding } }));
}

/** Creates a State field and binds one node input to it in one definition update. */
export function withStateFieldInput(definition: WorkflowDefinitionV2, nodeId: string, name: string, field: string, type: StateFieldType = "string"): WorkflowDefinitionV2 {
  const next = withStateField(definition, field, type);
  return withNodeInputBinding(next, nodeId, name, { source: "state", pointer: `/${field.trim()}`, onMissing: { mode: "error" } });
}

/** Creates a State field and maps one node output write to it in one definition update. */
export function withStateFieldWrite(definition: WorkflowDefinitionV2, nodeId: string, field: string, type: StateFieldType, pointer: string): WorkflowDefinitionV2 {
  const next = withStateField(definition, field, type);
  return withNode(next, nodeId, node => ({ ...node, writes: { ...node.writes, [field.trim()]: pointer } }));
}

/** Changes one State field's update strategy. */
export function withStateReducer(definition: WorkflowDefinitionV2, field: string, reducer: string): WorkflowDefinitionV2 {
  const name = reducer.trim();
  if (!name) return definition;
  return { ...definition, state: { ...definition.state, reducers: { ...definition.state.reducers, [field]: { name, version: 1 } } } };
}

/** Patches a declared State field's schema (type, description, items). */
export function withStateFieldSchema(definition: WorkflowDefinitionV2, field: string, patch: JsonSchema): WorkflowDefinitionV2 {
  const properties = (definition.state.schema.properties ?? {}) as Record<string, JsonSchema>;
  if (!Object.prototype.hasOwnProperty.call(properties, field)) return definition;
  return { ...definition, state: { ...definition.state, schema: { ...definition.state.schema, properties: { ...properties, [field]: { ...properties[field], ...patch } } } } };
}

/** Sets or clears one State field's initial value. */
export function withStateFieldInitial(definition: WorkflowDefinitionV2, field: string, value: JsonValue | undefined): WorkflowDefinitionV2 {
  const initial = { ...definition.state.initial };
  if (value === undefined) delete initial[field];
  else initial[field] = value;
  return { ...definition, state: { ...definition.state, initial } };
}

/** Rewrites a State pointer's first segment (`/from` or `/from/...`) to the renamed field. */
function renameStatePointer(pointer: string, from: string, to: string): string {
  if (pointer === `/${from}`) return `/${to}`;
  if (pointer.startsWith(`/${from}/`)) return `/${to}${pointer.slice(from.length + 1)}`;
  return pointer;
}

function renameStateBinding<T extends Binding>(binding: T, from: string, to: string): T {
  if (!binding || typeof binding !== "object" || binding.source !== "state" || typeof binding.pointer !== "string") return binding;
  const pointer = renameStatePointer(binding.pointer, from, to);
  return pointer === binding.pointer ? binding : { ...binding, pointer };
}

function renameBindings(record: Record<string, Binding>, from: string, to: string): Record<string, Binding> {
  let changed = false;
  const entries = Object.entries(record ?? {}).map(([key, binding]): [string, Binding] => {
    const renamed = renameStateBinding(binding, from, to);
    if (renamed !== binding) changed = true;
    return [key, renamed];
  });
  return changed ? Object.fromEntries(entries) : record;
}

function renamePredicate(predicate: unknown, from: string, to: string): unknown {
  if (!predicate || typeof predicate !== "object" || Array.isArray(predicate)) return predicate;
  const record = predicate as Record<string, unknown>;
  let changed = false;
  const next: Record<string, unknown> = { ...record };
  if (record.source === "state" && typeof record.pointer === "string") {
    const pointer = renameStatePointer(record.pointer, from, to);
    if (pointer !== record.pointer) { next.pointer = pointer; changed = true; }
  }
  for (const name of ["left", "right", "value"]) {
    const binding = record[name];
    if (!binding || typeof binding !== "object" || Array.isArray(binding)) continue;
    const renamed = renameStateBinding(binding as Binding, from, to);
    if (renamed !== binding) { next[name] = renamed; changed = true; }
  }
  const originalChildren = record.children;
  if (Array.isArray(originalChildren)) {
    const children = originalChildren.map(child => renamePredicate(child, from, to));
    if (children.some((child, index) => child !== originalChildren[index])) { next.children = children; changed = true; }
  }
  if (record.child && typeof record.child === "object" && !Array.isArray(record.child)) {
    const child = renamePredicate(record.child, from, to);
    if (child !== record.child) { next.child = child; changed = true; }
  }
  return changed ? next : predicate;
}

function renamePromptSegments(segments: unknown, from: string, to: string): unknown {
  if (!Array.isArray(segments)) return segments;
  let changed = false;
  const next = segments.map(segment => {
    if (!segment || typeof segment !== "object" || Array.isArray(segment)) return segment;
    const record = segment as Record<string, unknown>;
    if (record.type !== "param" || record.name !== from) return segment;
    changed = true;
    return { ...record, name: to };
  });
  return changed ? next : segments;
}

/** Rewrites a model prompt's parameter segments after a parameter name change. */
function renamePrompt(prompt: unknown, from: string, to: string): unknown {
  if (!prompt || typeof prompt !== "object" || Array.isArray(prompt)) return prompt;
  const record = prompt as Record<string, unknown>;
  const system = renamePromptSegments(record.system, from, to);
  const messages = Array.isArray(record.messages)
    ? record.messages.map(message => {
      if (!message || typeof message !== "object" || Array.isArray(message)) return message;
      const item = message as Record<string, unknown>;
      const content = renamePromptSegments(item.content, from, to);
      return content === item.content ? message : { ...item, content };
    })
    : record.messages;
  if (system === record.system && messages === record.messages) return prompt;
  return { ...record, system, messages };
}

function renameNodeStateReferences(node: WorkflowNodeV2, from: string, to: string): WorkflowNodeV2 {
  let changed = false;
  // A parameter named exactly like the field it reads follows the field rename,
  // so the prompt segment that references that parameter keeps working.
  const renameParam = !Object.prototype.hasOwnProperty.call(node.inputs ?? {}, to);
  const paramNames = new Map<string, string>();
  if (renameParam) {
    for (const [name, binding] of Object.entries(node.inputs ?? {})) {
      if (name !== from || binding?.source !== "state" || pointerFieldName(binding.pointer) !== from) continue;
      paramNames.set(name, to);
    }
  }
  const inputs = Object.fromEntries(Object.entries(node.inputs ?? {}).map(([name, binding]) => {
    const nextName = paramNames.get(name) ?? name;
    const nextBinding = renameStateBinding(binding, from, to);
    if (nextName !== name || nextBinding !== binding) changed = true;
    return [nextName, nextBinding];
  }));
  const writes = Object.fromEntries(Object.entries(node.writes ?? {}).map(([field, pointer]) => {
    const nextField = field === from ? to : field;
    if (nextField !== field) changed = true;
    return [nextField, pointer];
  }));
  let config = node.config;
  if (paramNames.size && node.type === "core.llm") {
    const prompt = config?.prompt;
    if (prompt !== undefined) {
      const nextPrompt = renamePrompt(prompt, from, to);
      if (nextPrompt !== prompt) { config = { ...config, prompt: nextPrompt as JsonValue }; changed = true; }
    }
  }
  const originalCases = config?.cases;
  if (node.type === "core.router" && Array.isArray(originalCases)) {
    const cases = originalCases.map(item => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const record = item as Record<string, unknown>;
      const predicate = renamePredicate(record.predicate, from, to);
      return predicate === record.predicate ? item : { ...record, predicate };
    });
    if (cases.some((item, index) => item !== originalCases[index])) { config = { ...config, cases: cases as JsonValue }; changed = true; }
  }
  return changed ? { ...node, inputs, writes, config } : node;
}

function renameDefinitionStateReferences(definition: WorkflowDefinitionV2, from: string, to: string): WorkflowDefinitionV2 {
  let changed = false;
  const nodes = definition.nodes.map(node => {
    let next = renameNodeStateReferences(node, from, to);
    if (next.type === "core.subgraph") {
      const graph = next.config?.graph;
      if (graph && typeof graph === "object" && !Array.isArray(graph) && Array.isArray((graph as unknown as WorkflowDefinitionV2).nodes)) {
        const renamed = renameDefinitionStateReferences(graph as unknown as WorkflowDefinitionV2, from, to);
        if (renamed !== graph) { next = { ...next, config: { ...next.config, graph: renamed as unknown as JsonValue } }; }
      }
    }
    if (next !== node) changed = true;
    return next;
  });
  const outputBindings = renameBindings(definition.outputBindings, from, to);
  if (outputBindings !== definition.outputBindings) changed = true;
  return changed ? { ...definition, nodes, outputBindings } : definition;
}

function renameRecordKey<T>(record: Record<string, T> | undefined, from: string, to: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record ?? {}).map(([key, value]) => [key === from ? to : key, value]));
}

/**
 * Renames one State field and every reference to it: the schema, initial value,
 * reducer, startup binding, node writes, node/router/output bindings and the
 * prompt parameters of model nodes whose parameter was named after the field.
 * Invalid or colliding names leave the definition untouched.
 */
export function renameStateField(definition: WorkflowDefinitionV2, from: string, to: string): WorkflowDefinitionV2 {
  const name = to.trim();
  if (!name || name === from) return definition;
  if (stateFieldNameIssue(definition.state.schema, name)) return definition;
  const properties = (definition.state.schema.properties ?? {}) as Record<string, JsonSchema>;
  if (!Object.prototype.hasOwnProperty.call(properties, from)) return definition;
  // A write to the target name would otherwise collide with the moved writer.
  if (stateFieldProducers(definition).has(name)) return definition;
  const schemaEntries = Object.entries(properties).map(([key, value]): [string, JsonSchema] => [key === from ? name : key, value]);
  const required = Array.isArray(definition.state.schema.required)
    ? definition.state.schema.required.map(item => item === from ? name : item)
    : definition.state.schema.required;
  const next: WorkflowDefinitionV2 = {
    ...definition,
    state: {
      ...definition.state,
      schema: { ...definition.state.schema, properties: Object.fromEntries(schemaEntries), ...(required !== undefined ? { required } : {}) },
      initial: renameRecordKey(definition.state.initial, from, name),
      inputBindings: renameRecordKey(definition.state.inputBindings, from, name),
      reducers: renameRecordKey(definition.state.reducers, from, name),
    },
    outputBindings: renameBindings(definition.outputBindings, from, name),
  };
  return renameDefinitionStateReferences(next, from, name);
}

/** Removes a State field and its initial value/reducer/input initialization. */
export function removeStateField(definition: WorkflowDefinitionV2, field: string): WorkflowDefinitionV2 {
  const properties = { ...((definition.state.schema.properties ?? {}) as Record<string, JsonSchema>) };
  const initial = { ...definition.state.initial };
  const reducers = { ...definition.state.reducers };
  const inputBindings = { ...definition.state.inputBindings };
  delete properties[field];
  delete initial[field];
  delete reducers[field];
  delete inputBindings[field];
  return { ...definition, state: { ...definition.state, schema: { ...definition.state.schema, properties }, initial, reducers, inputBindings } };
}

/**
 * Deletes fields that lost their last writer in the same definition update. A
 * field survives while any node still writes or reads it, or while the graph
 * initializes it from startup input. Only the fields named by the caller are
 * considered, so a sibling orphan is never removed as a side effect.
 */
export function pruneOrphanStateFields(definition: WorkflowDefinitionV2, fields: Iterable<string>): WorkflowDefinitionV2 {
  const properties = (definition.state.schema.properties ?? {}) as Record<string, JsonSchema>;
  const producers = stateFieldProducers(definition);
  const consumers = stateFieldConsumers(definition);
  let next = definition;
  for (const field of new Set(fields)) {
    if (!Object.prototype.hasOwnProperty.call(properties, field)) continue;
    if (producers.get(field)?.length) continue;
    if (consumers.get(field)?.length) continue;
    if (Object.prototype.hasOwnProperty.call(definition.state.inputBindings ?? {}, field)) continue;
    next = removeStateField(next, field);
  }
  return next;
}

export type DefaultNodeOutput = { field: string; pointer: string; type: StateFieldType; title: string };

/** User-facing purpose-to-field defaults for newly added nodes. */
export function defaultNodeOutput(type: string): DefaultNodeOutput | undefined {
  switch (type) {
    case "core.llm": return { field: "answer", pointer: "/text", type: "string", title: "模型回答" };
    case "core.tool": return { field: "result", pointer: "/result", type: "object", title: "工具结果" };
    case "core.tool_dispatch": return { field: "toolMessages", pointer: "/toolMessages", type: "array", title: "工具消息" };
    case "core.transform": return { field: "value", pointer: "/value", type: "object", title: "处理结果" };
    case "core.function": return { field: "result", pointer: "/result", type: "object", title: "函数结果" };
    case "core.subgraph": return { field: "result", pointer: "/result", type: "object", title: "子图结果" };
    case "core.memory": return { field: "memoryValue", pointer: "/value", type: "object", title: "记忆内容" };
    case "core.progress": return { field: "progressMessage", pointer: "/message", type: "string", title: "进度说明" };
    default: return undefined;
  }
}

function uniqueFieldName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 10000; suffix++) {
    const candidate = `${base}_${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return base;
}

/**
 * Gives a new node a default output field named by its purpose. When the preferred name is
 * already declared or written by another node, a numeric suffix keeps both fields distinct.
 */
export function withDefaultNodeOutput(definition: WorkflowDefinitionV2, node: WorkflowNodeV2, tool?: WorkflowTool): { definition: WorkflowDefinitionV2; node: WorkflowNodeV2 } {
  const primary = node.type === "core.tool" ? primaryToolOutput(tool) : undefined;
  const output: DefaultNodeOutput | undefined = primary
    ? { field: primary.name, pointer: primary.pointer, type: stateTypeForOutput(primary.type) ?? "object", title: primary.name }
    : defaultNodeOutput(node.type);
  if (!output) return { definition, node };
  const fields = Object.keys((definition.state.schema.properties ?? {}) as Record<string, JsonSchema>);
  const otherWrites = definition.nodes.filter(item => item.id !== node.id).flatMap(item => Object.keys(item.writes ?? {}));
  const field = uniqueFieldName(output.field, new Set([...fields, ...otherWrites]));
  const writes = { ...node.writes };
  // createNodeV2 already seeds `answer`; rename that placeholder when another writer owns it.
  if (writes[output.field] !== undefined && field !== output.field) delete writes[output.field];
  if (!Object.keys(writes).length) writes[field] = output.pointer;
  const next = withStateField(definition, field, output.type, output.title);
  return { definition: next, node: { ...node, writes } };
}

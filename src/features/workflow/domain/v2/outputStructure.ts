import type { JsonSchema, JsonValue, StructuredOutputField, StructuredOutputFieldType, WorkflowNodeV2, WorkflowTool } from "./types";
import { readOutputPointer } from "./runData";

/**
 * Pure output-structure rules shared by the node panel, run preflight and the
 * workbench. A node's output type always comes from its declared structure
 * first (tool/function output Schema, model answer or structured fields); the
 * most recent run value is only a fallback when no structure exists.
 */

export const OUTPUT_VALUE_TYPES = ["string", "number", "boolean", "array", "object", "any"] as const;
export type OutputValueType = typeof OUTPUT_VALUE_TYPES[number];

export const OUTPUT_TYPE_LABELS: Record<OutputValueType, string> = {
  string: "文本",
  number: "数字",
  boolean: "是否",
  array: "列表",
  object: "对象",
  any: "任意",
};

export const STRUCTURED_OUTPUT_TYPES: readonly StructuredOutputFieldType[] = ["string", "number", "boolean", "array", "object"];

export type NodeOutputItem = {
  /** Short display name, e.g. 回答 / hits / keywords. */
  key: string;
  /** JSON Pointer into the node's step output. Empty string means the whole output. */
  pointer: string;
  type: OutputValueType;
  description?: string;
  /** Model conversation/tool-call outputs are secondary and only listed when written. */
  advanced?: boolean;
  /** Declared by the user as a model structured-output field. */
  structured?: boolean;
  /**
   * A nested field inside an array. It is shown for context only: a JSON
   * Pointer cannot address every item, so it must never become a write.
   */
  displayOnly?: boolean;
  /** The legacy `/text` answer replaced by model structured output. */
  replacedByStructured?: boolean;
  children?: NodeOutputItem[];
};

function objectValue(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, JsonValue> : undefined;
}

export function asOutputSchema(value: JsonValue | undefined): JsonSchema | undefined {
  const object = objectValue(value);
  return object ? object as JsonSchema : undefined;
}

function schemaProperties(schema: JsonSchema | undefined): [string, JsonSchema][] {
  const properties = schema?.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return [];
  return Object.entries(properties).map(([name, value]) => [name, asOutputSchema(value) ?? {}]);
}

/** Maps a JSON Schema type to the small set of output types the UI understands. */
export function schemaOutputType(schema: JsonSchema | undefined): OutputValueType {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return "any";
  const declared = schema.type;
  const types = Array.isArray(declared) ? declared.filter((value): value is string => typeof value === "string") : typeof declared === "string" ? [declared] : [];
  const concrete = types.filter(type => type !== "null");
  if (!concrete.length) {
    if (schema.properties) return "object";
    if (schema.items) return "array";
    return "any";
  }
  if (concrete.includes("string")) return "string";
  if (concrete.includes("number") || concrete.includes("integer")) return "number";
  if (concrete.includes("boolean")) return "boolean";
  if (concrete.includes("array")) return "array";
  if (concrete.includes("object")) return "object";
  return "any";
}

/** Runtime-type fallback used only when the node declares no output structure. */
export function valueOutputType(value: JsonValue | undefined): OutputValueType {
  if (value === undefined || value === null) return "any";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "object";
  return "string";
}

function joinPointer(base: string, key: string): string {
  return `${base}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
}

/**
 * Builds the selectable tree for a declared output Schema. Array item fields
 * are marked display-only because a State write must resolve to one concrete
 * JSON Pointer; writing `/items/0` would silently store only the first item.
 */
export function outputSchemaItems(schema: JsonSchema | undefined, base = "", depth = 0, displayOnly = false): NodeOutputItem[] {
  return schemaProperties(schema).map(([name, child]) => {
    const pointer = joinPointer(base, name);
    const type = schemaOutputType(child);
    const nestedSchema = type === "array" ? asOutputSchema((child.items as JsonValue | undefined)) : child;
    const children = depth >= 3 ? [] : outputSchemaItems(nestedSchema, type === "array" ? joinPointer(pointer, "0") : pointer, depth + 1, displayOnly || type === "array");
    return { key: name, pointer, type, ...(displayOnly ? { displayOnly: true } : {}), ...(typeof child.description === "string" ? { description: child.description } : {}), ...(children.length ? { children } : {}) };
  });
}

/** Last-resort tree built from an actual run/test result when no Schema exists. */
export function outputValueItems(value: JsonValue | undefined, base = "", depth = 0, displayOnly = false): NodeOutputItem[] {
  const object = objectValue(value);
  if (!object || depth >= 3) return [];
  return Object.entries(object).map(([name, child]) => {
    const pointer = joinPointer(base, name);
    const type = valueOutputType(child);
    const children = depth >= 2 ? [] : outputValueItems(type === "array" ? (Array.isArray(child) ? child[0] : undefined) : child, type === "array" ? joinPointer(pointer, "0") : pointer, depth + 1, displayOnly || type === "array");
    return { key: name, pointer, type, ...(displayOnly ? { displayOnly: true } : {}), ...(children.length ? { children } : {}) };
  });
}

export function flattenOutputItems(items: readonly NodeOutputItem[]): NodeOutputItem[] {
  return items.flatMap(item => [item, ...flattenOutputItems(item.children ?? [])]);
}

export function outputItemAt(items: readonly NodeOutputItem[], pointer: string): NodeOutputItem | undefined {
  return flattenOutputItems(items).find(item => item.pointer === pointer);
}

export function structuredOutputFields(node: WorkflowNodeV2): StructuredOutputField[] {
  if (node.type !== "core.llm") return [];
  const config = objectValue(node.config);
  const structured = config ? objectValue(config.structuredOutput) : undefined;
  const fields = structured?.fields;
  if (!Array.isArray(fields)) return [];
  return fields.flatMap(value => {
    const field = objectValue(value);
    if (!field || typeof field.name !== "string" || !STRUCTURED_OUTPUT_TYPES.includes(field.type as StructuredOutputFieldType)) return [];
    return [{ name: field.name, type: field.type as StructuredOutputFieldType, ...(typeof field.description === "string" ? { description: field.description } : {}) }];
  });
}

/** All output items a node can expose, in the order the output table and add menu use. */
export function nodeOutputItems(node: WorkflowNodeV2, tool?: WorkflowTool): NodeOutputItem[] {
  switch (node.type) {
    case "core.llm": {
      const fields = structuredOutputFields(node);
      const items: NodeOutputItem[] = [fields.length
        ? { key: "原始回答（JSON）", pointer: "/text", type: "string", replacedByStructured: true }
        : { key: "回答", pointer: "/text", type: "string" }];
      for (const field of fields) {
        items.push({ key: field.name, pointer: `/${field.name.replace(/~/g, "~0").replace(/\//g, "~1")}`, type: field.type, structured: true, ...(field.description ? { description: field.description } : {}) });
      }
      items.push({ key: "对话消息", pointer: "/messages", type: "array", advanced: true });
      items.push({ key: "工具调用", pointer: "/toolCalls", type: "array", advanced: true });
      return items;
    }
    case "core.tool": {
      const schema = tool?.outputSchema;
      const declared = outputSchemaItems(schema, "/result");
      return declared.length ? declared : [{ key: "工具结果", pointer: "/result", type: "object" }];
    }
    case "core.tool_dispatch":
      return [{ key: "工具消息", pointer: "/toolMessages", type: "array" }];
    case "core.transform":
      return String(node.config.operationRef) === "core.message" ? [{ key: "对话消息", pointer: "/messages", type: "array" }] : [{ key: "处理结果", pointer: "/value", type: "any" }];
    case "core.function": {
      const declared = outputSchemaItems(asOutputSchema(node.config.outputSchema), "");
      return declared.length ? declared : [{ key: "函数结果", pointer: "", type: "any" }];
    }
    case "core.memory":
      return [{ key: "记忆内容", pointer: "/value", type: "any" }];
    case "core.progress":
      return [{ key: "进度说明", pointer: "/message", type: "string" }, { key: "进度百分比", pointer: "/percent", type: "number" }];
    case "core.subgraph": {
      const graph = objectValue(node.config.graph);
      const outputSchema = graph ? asOutputSchema(graph.outputSchema) : undefined;
      const declared = outputSchemaItems(outputSchema, "");
      return declared.length ? declared : [{ key: "子图结果", pointer: "", type: "any" }];
    }
    default:
      return [];
  }
}

/**
 * Resolves one write's output type. Structure wins; without a structure the
 * last run's value is used; otherwise the honest answer is 任意 rather than 文本.
 */
export function writeOutputType(node: WorkflowNodeV2, pointer: string, tool?: WorkflowTool, lastOutput?: JsonValue): OutputValueType {
  const declared = outputItemAt(nodeOutputItems(node, tool), pointer);
  if (declared) return declared.type;
  const value = lastOutput === undefined ? undefined : readOutputPointer(lastOutput, pointer);
  return valueOutputType(value);
}

export function writeOutputItem(node: WorkflowNodeV2, pointer: string, tool?: WorkflowTool, lastOutput?: JsonValue): NodeOutputItem | undefined {
  const declared = outputItemAt(nodeOutputItems(node, tool), pointer);
  if (declared) return declared;
  if (lastOutput === undefined) return undefined;
  const value = readOutputPointer(lastOutput, pointer);
  if (value === undefined) return undefined;
  const token = pointer.split("/").filter(Boolean).pop() ?? "输出";
  return { key: token.replace(/~1/g, "/").replace(/~0/g, "~"), pointer, type: valueOutputType(value) };
}

/** State field type used when an output creates a new field. */
export function stateTypeForOutput(type: OutputValueType): StructuredOutputFieldType | undefined {
  return type === "any" ? undefined : type;
}

export function stateFieldOutputType(schema: JsonSchema | undefined): OutputValueType {
  return schemaOutputType(schema);
}

/**
 * Why an output cannot be written into an existing field, or undefined when
 * the types are compatible. `any` is allowed to flow into a typed field only
 * when it is the deliberate fallback, so callers skip the check for it.
 */
export function outputTypeMismatch(output: OutputValueType, field: JsonSchema | undefined): string | undefined {
  if (output === "any") return undefined;
  const target = stateFieldOutputType(field);
  if (target === "any") return undefined;
  if (target === output) return undefined;
  // Integer schemas are numbers to the output table.
  if (target === "number" && output === "number") return undefined;
  return `${OUTPUT_TYPE_LABELS[target]}，类型不符`;
}

/** First top-level field of a tool's declared result, used as the default write. */
export function primaryToolOutput(tool: WorkflowTool | undefined): { name: string; pointer: string; type: OutputValueType } | undefined {
  const properties = schemaProperties(tool?.outputSchema);
  const first = properties[0];
  if (!first) return undefined;
  const [name, schema] = first;
  return { name, pointer: `/result/${name.replace(/~/g, "~0").replace(/\//g, "~1")}`, type: schemaOutputType(schema) };
}

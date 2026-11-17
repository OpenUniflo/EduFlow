import type { Binding, JsonSchema, JsonValue, WorkflowDefinitionV2 } from "./types";

/**
 * Pure rules for a fixed Workflow reference's visible interface and mapping.
 *
 * The target revision's real input/output Schema is the only source: a renamed
 * target field is a mapping that must be repaired by the user, never deleted or
 * invented while switching targets. These functions do not resolve or fetch a
 * target; callers pass the exact revision's Definition.
 */

export type ReferenceField = {
  name: string;
  title: string;
  description?: string;
  schema: JsonSchema;
  required: boolean;
  defaultValue?: JsonValue;
};

export type ReferenceMappingIssueKind = "input-missing" | "input-extra" | "input-type" | "input-source-type" | "output-extra" | "output-state-missing" | "output-state-type";

export type ReferenceMappingIssue = {
  kind: ReferenceMappingIssueKind;
  field: string;
  message: string;
};

const objectValue = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const asSchema = (value: unknown): JsonSchema => objectValue(value) as JsonSchema | undefined ?? {};

function propertySchemas(schema: JsonSchema | undefined): [string, JsonSchema][] {
  const properties = objectValue(schema?.properties);
  if (!properties) return [];
  return Object.entries(properties).map(([name, value]) => [name, asSchema(value)]);
}

function requiredNames(schema: JsonSchema | undefined): string[] {
  return Array.isArray(schema?.required) ? schema.required.filter((name): name is string => typeof name === "string") : [];
}

function fieldTitle(name: string, schema: JsonSchema): string {
  return typeof schema.title === "string" && schema.title.trim() ? schema.title : name;
}

/** Inputs a caller sees for one exact target revision, in Schema order. */
export function referenceInputFields(inputSchema: JsonSchema | undefined): ReferenceField[] {
  const required = new Set(requiredNames(inputSchema));
  return propertySchemas(inputSchema).map(([name, schema]) => ({
    name,
    title: fieldTitle(name, schema),
    ...(typeof schema.description === "string" && schema.description.trim() ? { description: schema.description } : {}),
    schema,
    required: required.has(name),
    ...(schema.default !== undefined ? { defaultValue: schema.default } : {}),
  }));
}

/** Outputs a caller may map into parent State, in Schema order. */
export function referenceOutputFields(outputSchema: JsonSchema | undefined): ReferenceField[] {
  const required = new Set(requiredNames(outputSchema));
  return propertySchemas(outputSchema).map(([name, schema]) => ({
    name,
    title: fieldTitle(name, schema),
    ...(typeof schema.description === "string" && schema.description.trim() ? { description: schema.description } : {}),
    schema,
    required: required.has(name),
  }));
}

/** First JSON Pointer token, decoded; undefined for the whole-output pointer. */
export function referencePointerRoot(pointer: string): string | undefined {
  if (pointer === "") return undefined;
  const token = pointer.split("/")[1] ?? "";
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** Whether extra input keys are rejected by the target Schema. */
export function referenceInputsClosed(inputSchema: JsonSchema | undefined): boolean {
  return Boolean(inputSchema && (inputSchema.additionalProperties === false || inputSchema.properties !== undefined && inputSchema.additionalProperties !== true));
}

/**
 * Declared top-level JSON types, mirroring the Worker compiler's
 * `declared_root_types`: this is a necessary-type check, not a second JSON
 * Schema validator. References and unknown/`anyOf`-only schemas stay runtime
 * decisions. `integer` is normalized to `number` exactly as the compiler does.
 */
export function referenceSchemaTypes(schema: JsonSchema | undefined): string[] | undefined {
  if (!schema || typeof schema !== "object" || Array.isArray(schema) || "$ref" in schema) return undefined;
  const declared = typeof schema.type === "string" ? [schema.type] : Array.isArray(schema.type) ? schema.type.filter((value): value is string => typeof value === "string") : [];
  if (!declared.length || declared.length !== (Array.isArray(schema.type) ? schema.type.length : 1)) return undefined;
  return [...new Set(declared.map(type => type === "integer" ? "number" : type))];
}

/** No declared type on either side, or an overlap, is compatible. */
export function referenceTypesCompatible(source: string[] | undefined, target: string[] | undefined): boolean {
  if (!source?.length || !target?.length) return true;
  return source.some(type => target.includes(type));
}

/**
 * Conservative JSON Pointer resolver for mapped output values. It follows the
 * subset used by the Workflow output Schema (object properties and array
 * items) and returns undefined for `$ref` or an undeclared closed field, where
 * the Worker's own resolver remains authoritative.
 */
export function referenceSchemaAtPointer(schema: JsonSchema | undefined, pointer: string): JsonSchema | undefined {
  if (pointer === "") return schema;
  if (!pointer.startsWith("/")) return undefined;
  let current = schema;
  for (const raw of pointer.slice(1).split("/")) {
    const token = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!current || typeof current !== "object" || Array.isArray(current) || "$ref" in current) return undefined;
    if (current.type === "array") { current = asSchema(current.items); continue; }
    const properties = objectValue(current.properties);
    if (properties && Object.prototype.hasOwnProperty.call(properties, token)) { current = asSchema(properties[token]); continue; }
    if (current.additionalProperties === false) return undefined;
    return {};
  }
  return current;
}

/**
 * Mapping repairs required after choosing this exact target revision.
 *
 * Existing keys are always preserved by target switches. This function only
 * reports what the user must fix; removing a row remains an explicit action.
 */
export function referenceMappingIssues(
  target: Pick<WorkflowDefinitionV2, "inputSchema" | "outputSchema"> | undefined,
  inputs: Readonly<Record<string, Binding>>,
  writes: Readonly<Record<string, string>>,
  options: { includeOutput?: boolean; inputSchema?: JsonSchema; stateSchema?: JsonSchema } = {},
): ReferenceMappingIssue[] {
  if (!target) return [];
  const issues: ReferenceMappingIssue[] = [];
  const fields = referenceInputFields(target.inputSchema);
  const known = new Map(fields.map(field => [field.name, field]));
  for (const field of fields) {
    if (field.required && !Object.prototype.hasOwnProperty.call(inputs, field.name)) {
      issues.push({ kind: "input-missing", field: field.name, message: `必填输入「${field.title}」尚未连接取值` });
    }
  }
  if (referenceInputsClosed(target.inputSchema)) {
    for (const name of Object.keys(inputs)) {
      if (!known.has(name)) issues.push({ kind: "input-extra", field: name, message: `输入「${name}」不在目标接口中，运行时会失败` });
    }
  }
  for (const [name, binding] of Object.entries(inputs)) {
    const field = known.get(name);
    if (!field) continue;
    if (binding.source === "literal") {
      const issue = literalTypeIssue(binding.value, field.schema);
      if (issue) issues.push({ kind: "input-type", field: name, message: `输入「${field.title}」应为${issue}，当前固定值类型不符` });
      continue;
    }
    if (binding.source === "environment") continue;
    const sourceSchema = binding.source === "input" ? options.inputSchema : options.stateSchema;
    if (!sourceSchema) continue;
    const sourceTypes = referenceSchemaTypes(referenceSchemaAtPointer(sourceSchema, binding.pointer));
    const targetTypes = referenceSchemaTypes(field.schema);
    if (sourceTypes && binding.onMissing.mode === "default") {
      for (const type of jsonTypes(binding.onMissing.value)) if (!sourceTypes.includes(type)) sourceTypes.push(type);
    }
    if (!referenceTypesCompatible(sourceTypes, targetTypes)) {
      issues.push({
        kind: "input-source-type",
        field: name,
        message: `输入「${field.title}」的取值来源类型（${sourceTypes?.join(" / ")}）与目标字段（${targetTypes?.join(" / ")}）不兼容`,
      });
    }
  }
  if (options.includeOutput !== false) {
    const outputs = new Set(referenceOutputFields(target.outputSchema).map(field => field.name));
    const closedOutputs = Boolean(target.outputSchema?.additionalProperties === false || target.outputSchema?.properties !== undefined && target.outputSchema.additionalProperties !== true);
    const invalidOutputs = new Set<string>();
    if (outputs.size || closedOutputs) {
      for (const [destination, pointer] of Object.entries(writes)) {
        if (typeof pointer !== "string") continue;
        const root = referencePointerRoot(pointer);
        if (root !== undefined && !outputs.has(root)) {
          invalidOutputs.add(destination);
          issues.push({ kind: "output-extra", field: destination, message: `输出「${destination}」取自目标未声明的字段 ${pointer}` });
        }
      }
    }
    if (options.stateSchema) {
      const stateProperties = objectValue(options.stateSchema.properties);
      for (const [destination, pointer] of Object.entries(writes)) {
        if (typeof pointer !== "string" || invalidOutputs.has(destination)) continue;
        const destinationSchema = stateProperties && Object.prototype.hasOwnProperty.call(stateProperties, destination) ? asSchema(stateProperties[destination]) : undefined;
        if (stateProperties && !destinationSchema) {
          issues.push({ kind: "output-state-missing", field: destination, message: `输出目标「${destination}」不在父流程 State 中，运行时会失败` });
          continue;
        }
        const sourceSchema = referenceSchemaAtPointer(target.outputSchema, pointer);
        const sourceTypes = referenceSchemaTypes(sourceSchema);
        const targetTypes = referenceSchemaTypes(destinationSchema);
        if (!referenceTypesCompatible(sourceTypes, targetTypes)) {
          issues.push({
            kind: "output-state-type",
            field: destination,
            message: `输出「${destination}」的类型（${sourceTypes?.join(" / ")}）与父流程 State 字段（${targetTypes?.join(" / ")}）不兼容`,
          });
        }
      }
    }
  }
  return issues;
}

function jsonTypes(value: JsonValue): string[] {
  const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value === "number" ? "number" : typeof value;
  return [type];
}

function literalTypeIssue(value: JsonValue, schema: JsonSchema): string | undefined {
  const declared = Array.isArray(schema.type) ? schema.type.filter((type): type is string => typeof type === "string") : typeof schema.type === "string" ? [schema.type] : [];
  if (!declared.length) return undefined;
  const actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value === "number" ? (Number.isInteger(value) ? "integer" : "number") : typeof value;
  if (declared.includes(actual) || actual === "integer" && declared.includes("number")) return undefined;
  if (actual === "null" && declared.includes("null")) return undefined;
  return declared.filter(type => type !== "null").join(" / ") || "null";
}

export type ReferenceRevisionStatus = {
  tone: "current" | "outdated" | "missing" | "archived";
  label: string;
  readOnly: boolean;
};

/** Presentation of the pinned revision relative to the target's current head. */
export function referenceRevisionStatus(args: { pinnedRevision: number; currentRevision?: number; archived?: boolean; missing?: boolean }): ReferenceRevisionStatus {
  if (args.missing) return { tone: "missing", label: "目标版本不存在或无权访问", readOnly: true };
  if (args.archived) return { tone: "archived", label: "目标已归档，不能继续执行", readOnly: true };
  const current = args.currentRevision;
  if (current !== undefined && args.pinnedRevision > current) return { tone: "missing", label: `固定版本 ${args.pinnedRevision} 高于当前版本 ${current}`, readOnly: true };
  if (current !== undefined && args.pinnedRevision < current) return { tone: "outdated", label: `固定旧版本 ${args.pinnedRevision}（目标最新 ${current}）`, readOnly: true };
  return { tone: "current", label: `固定版本 ${args.pinnedRevision}（目标当前版本）`, readOnly: false };
}

/** Fixed reference config; only the three selected identities change. */
export function workflowReferenceConfig(workflowId: string, revision: number, environmentRef: string): Record<string, JsonValue> {
  return { workflowRef: { workflowId, revision }, environmentRef, stateMode: "independent", persistence: "per-invocation" };
}

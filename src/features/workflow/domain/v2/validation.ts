import Ajv2020 from "ajv/dist/2020";
import canonicalize from "canonicalize";
import { jsonValueSchema, llmConfigV2Schema } from "./schema";
import { isRetiredNode } from "./nodeVersions";
import type { JsonSchema, LlmConfigV2, WorkflowDefinitionV2, WorkflowDiagnostic } from "./types";

const ajv = new Ajv2020({ allErrors: true, strict: false, coerceTypes: false, useDefaults: false, validateFormats: false });
// $schema is a retained annotation in the V2 subset, not a request to change validators.
function executionSchema(schema: JsonSchema): JsonSchema {
  const normalized = { ...schema }; delete normalized.$schema;
  for (const key of ["properties", "$defs"]) {
    const child = normalized[key];
    if (child && typeof child === "object" && !Array.isArray(child)) normalized[key] = Object.fromEntries(Object.entries(child).map(([name, value]) => [name, value && typeof value === "object" && !Array.isArray(value) ? executionSchema(value) : value]));
  }
  for (const key of ["items", "additionalProperties"]) {
    const child = normalized[key]; if (child && typeof child === "object" && !Array.isArray(child)) normalized[key] = executionSchema(child);
  }
  return normalized;
}
const allowedKeywords = new Set(["$schema", "$defs", "$ref", "title", "description", "default", "type", "properties", "required", "additionalProperties", "items", "enum", "const", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "minItems", "maxItems", "minProperties", "maxProperties"]);
export function schemaDiagnostics(schema: JsonSchema, pointer = ""): WorkflowDiagnostic[] {
  const diagnostics: WorkflowDiagnostic[] = [];
  const references = new Set<string>();
  function visit(value: unknown, path: string) {
    if (typeof value === "boolean") return;
    if (!value || typeof value !== "object" || Array.isArray(value)) { diagnostics.push({ code: "INVALID_SCHEMA", severity: "error", pointer: path, message: "Schema 必须是对象或布尔值。" }); return; }
    for (const [key, child] of Object.entries(value)) {
      if (!allowedKeywords.has(key) && !key.startsWith('x-')) diagnostics.push({ code: "UNSUPPORTED_SCHEMA_KEYWORD", severity: "error", pointer: `${path}/${key}`, message: `M1 不支持 Schema 关键字 ${key}。` });
      if (key === "$ref" && (typeof child !== "string" || !child.startsWith("#/$defs/"))) diagnostics.push({ code: "UNSUPPORTED_SCHEMA_REFERENCE", severity: "error", pointer: `${path}/$ref`, message: "仅支持本地 $defs 引用。" });
      if ((key === "properties" || key === "$defs") && child && typeof child === "object") for (const [name, nested] of Object.entries(child)) visit(nested, `${path}/${key}/${name}`);
      if (key === "items" || (key === "additionalProperties" && typeof child !== "boolean")) visit(child, `${path}/${key}`);
    }
  }
  function inspectReferences(value: unknown, active: Set<string>) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    if (typeof record.$ref === "string" && record.$ref.startsWith("#/$defs/")) {
      if (active.has(record.$ref)) { diagnostics.push({ code: "UNSUPPORTED_SCHEMA_REFERENCE", severity: "error", pointer, message: "M1 不支持递归 Schema。" }); return; }
      const target = record.$ref.slice(8).split("/").reduce<unknown>((current, token) => current && typeof current === "object" ? (current as Record<string, unknown>)[token.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined, schema.$defs);
      if (!references.has(record.$ref)) { const next = new Set(active); next.add(record.$ref); inspectReferences(target, next); references.add(record.$ref); }
    }
    if (record.properties && typeof record.properties === "object") Object.values(record.properties).forEach(nested => inspectReferences(nested, active));
    if (record.$defs && typeof record.$defs === "object") Object.values(record.$defs).forEach(nested => inspectReferences(nested, active));
    inspectReferences(record.items, active); inspectReferences(record.additionalProperties, active);
  }
  visit(schema, pointer); inspectReferences(schema, new Set());
  if (!diagnostics.length) { try { ajv.compile(executionSchema(schema)); } catch { diagnostics.push({ code: "INVALID_SCHEMA", severity: "error", pointer, message: "Schema 结构或引用无效。" }); } }
  return diagnostics;
}
export function validateSchemaValue(schema: JsonSchema, value: unknown): { valid: boolean; errors: string[]; issues: { pointer: string; keyword: string }[] } {
  const unsupported = schemaDiagnostics(schema);
  if (unsupported.length) return { valid: false, errors: unsupported.map(item => item.message), issues: [] };
  const validate = ajv.compile(executionSchema(schema));
  const valid = validate(value);
  return { valid: Boolean(valid), errors: (validate.errors ?? []).map(error => `${error.instancePath || "/"}: ${error.message}`), issues: (validate.errors ?? []).map(error => ({ keyword: error.keyword, pointer: error.keyword === "required" ? `${error.instancePath}/${String(error.params.missingProperty).replace(/~/g,"~0").replace(/\//g,"~1")}` : error.instancePath })) };
}
export function validateWorkflowDraft(definition: WorkflowDefinitionV2): WorkflowDiagnostic[] {
  const diagnostics = [ ...schemaDiagnostics(definition.inputSchema, "/inputSchema"), ...schemaDiagnostics(definition.outputSchema, "/outputSchema"), ...schemaDiagnostics(definition.state.schema, "/state/schema") ];
  const ids = new Set<string>();
  for (const node of definition.nodes) {
    if (!node.id || ids.has(node.id)) diagnostics.push({ code: "DUPLICATE_NODE_ID", severity: "error", nodeId: node.id, message: "节点 ID 必须存在且唯一。" });
    ids.add(node.id);
    if (isRetiredNode(node)) {
      diagnostics.push({ code: "NODE_VERSION_RETIRED", severity: "error", nodeId: node.id, pointer: `/nodes/${definition.nodes.indexOf(node)}/typeVersion`, message: "此节点是旧版本，请删除后重新添加。" });
      continue;
    }
    if (node.type === "core.llm" && node.typeVersion === 2) diagnostics.push(...llmConfigDiagnostics(node, definition));
  }
  for (const edge of definition.transitions) if (!ids.has(edge.from) || !ids.has(edge.to)) diagnostics.push({ code: "DANGLING_NODE", severity: "error", transitionId: edge.id, message: "连线引用了不存在的节点。" });
  return diagnostics;
}
export function canonicalSemanticJson(definition: WorkflowDefinitionV2): string {
  jsonValueSchema.parse(definition);
  const semantic = {
    schemaVersion: definition.schemaVersion, inputSchema: definition.inputSchema, outputSchema: definition.outputSchema,
    state: definition.state, entryNodeId: definition.entryNodeId,
    nodes: definition.nodes.map(({ id, type, typeVersion, config, inputs, writes }) => ({ id, type, typeVersion, config, inputs, writes })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    transitions: [...definition.transitions].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    outputBindings: definition.outputBindings, policy: definition.policy, requiredCapabilities: [...new Set(definition.requiredCapabilities)].sort()
  };
  const result = canonicalize(semantic);
  if (!result) throw new Error("定义无法规范化。");
  return result;
}

/** Frontend mirror of the Worker's core.llm v2 validation: structure plus declared prompt parameters. */
export function llmConfigDiagnostics(node: WorkflowDefinitionV2["nodes"][number], definition: WorkflowDefinitionV2): WorkflowDiagnostic[] {
  const diagnostics: WorkflowDiagnostic[] = [];
  const index = definition.nodes.indexOf(node);
  const parsed = llmConfigV2Schema.safeParse(node.config);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) diagnostics.push({ code: "INVALID_LLM_CONFIG", severity: "error", nodeId: node.id, pointer: `/nodes/${index}/config/${issue.path.join("/")}`, message: issue.message });
    return diagnostics;
  }
  const config = parsed.data as unknown as LlmConfigV2;
  const reservedOutputs = new Set(["text", "messages", "toolCalls"]);
  const structuredNames = new Set<string>();
  (config.structuredOutput?.fields ?? []).forEach((field, fieldIndex) => {
    if (reservedOutputs.has(field.name)) diagnostics.push({ code: "INVALID_STRUCTURED_OUTPUT", severity: "error", nodeId: node.id, pointer: `/nodes/${index}/config/structuredOutput/fields/${fieldIndex}/name`, message: `结构化字段「${field.name}」与模型内置输出重名，请换一个字段名。` });
    if (structuredNames.has(field.name)) diagnostics.push({ code: "INVALID_STRUCTURED_OUTPUT", severity: "error", nodeId: node.id, pointer: `/nodes/${index}/config/structuredOutput/fields/${fieldIndex}/name`, message: `结构化字段「${field.name}」重复。` });
    structuredNames.add(field.name);
  });
  const declared = new Set(Object.keys(node.inputs));
  const checkSegments = (segments: LlmConfigV2["prompt"]["system"], pointer: string) => {
    segments.forEach((segment, segmentIndex) => {
      if (segment && segment.type === "param" && !declared.has(segment.name) && segment.name !== "history") diagnostics.push({ code: "PROMPT_PARAM_UNDECLARED", severity: "error", nodeId: node.id, pointer: `${pointer}/${segmentIndex}`, message: `提示词引用了未声明的参数「${segment.name}」，请先在输入中声明。` });
    });
  };
  checkSegments(config.prompt.system, `/nodes/${index}/config/prompt/system`);
  config.prompt.messages.forEach((message, messageIndex) => checkSegments(message.content, `/nodes/${index}/config/prompt/messages/${messageIndex}/content`));
  return diagnostics;
}

import type { JsonSchema, JsonValue, StructuredOutputFieldType, WorkflowDefinitionV2, WorkflowEnvironment, WorkflowNodeV2, WorkflowTool } from "../../domain/v2/types";
import { nodeOutputItems, outputItemAt, outputTypeMismatch, OUTPUT_TYPE_LABELS, stateFieldOutputType, stateTypeForOutput } from "../../domain/v2/outputStructure";
import { llmConfigDiagnostics } from "../../domain/v2/validation";

export type RunPreflightTab = "run" | "node" | "state" | "environment";
export type RunPreflightIssue = {
  id: string;
  title: string;
  detail: string;
  tab: RunPreflightTab;
  nodeId?: string;
  pointer?: string;
  /** One-line explanation used by the run-blocked notice and node marker. */
  summary?: string;
  /** One-click repair for a write type conflict. */
  fix?: { field: string; type: StructuredOutputFieldType };
};

export type RunPreflightInput = {
  definition: WorkflowDefinitionV2;
  input: JsonValue;
  environment?: WorkflowEnvironment;
  tools: readonly WorkflowTool[];
  /** Resolved ordinary variables, when available. */
  variableValues?: Record<string, string | number | boolean>;
};

function record(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, JsonValue> : {};
}
function pointerField(pointer: string): string {
  return pointer.replace(/^\//, "").split("/")[0].replace(/~1/g, "/").replace(/~0/g, "~");
}
function properties(schema: JsonSchema | undefined): Record<string, JsonSchema> {
  const value = schema?.properties;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, JsonSchema> : {};
}
function required(schema: JsonSchema | undefined): string[] {
  return Array.isArray(schema?.required) ? schema.required.filter((name): name is string => typeof name === "string") : [];
}
function closed(schema: JsonSchema | undefined): boolean {
  return schema?.additionalProperties === false;
}
function missing(value: JsonValue | undefined, schema: JsonSchema | undefined): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value) && value.length === 0 && typeof schema?.minItems === "number" && schema.minItems > 0) return true;
  return false;
}
function labelOf(node: WorkflowNodeV2): string { return node.label || node.id; }

/** Local pre-run checklist. It mirrors the runtime's structural sources and blocks before a run is created. */
export function runPreflight({ definition, input, environment, tools, variableValues }: RunPreflightInput): RunPreflightIssue[] {
  const issues: RunPreflightIssue[] = [];
  const inputProperties = properties(definition.inputSchema);
  const inputValue = record(input);
  for (const field of required(definition.inputSchema)) {
    const schema = inputProperties[field];
    if (missing(inputValue[field], schema)) {
      issues.push({ id: `input:${field}`, title: `填写启动输入「${String(schema?.title ?? field)}」`, detail: "这是本次运行的必填输入。", tab: "run", pointer: `/${field}` });
    }
  }
  const stateProperties = properties(definition.state.schema);
  const variables = variableValues ?? environment?.variables ?? {};
  const toolIndex = new Map(tools.map(tool => [tool.ref, tool]));
  for (const [field, binding] of Object.entries(definition.state.inputBindings)) {
    if (binding.source === "input") {
      const source = pointerField(binding.pointer);
      if (closed(definition.inputSchema) && !Object.prototype.hasOwnProperty.call(inputProperties, source)) issues.push({ id: `state-input:${field}`, title: `流程数据字段「${field}」的初始化来源不存在`, detail: `启动输入中没有字段「${source}」。`, tab: "state", pointer: binding.pointer });
    } else if (binding.source === "state") {
      const source = pointerField(binding.pointer);
      if (!Object.prototype.hasOwnProperty.call(stateProperties, source)) issues.push({ id: `state-input:${field}:state`, title: `流程数据字段「${field}」的初始化来源不存在`, detail: `流程数据中没有字段「${source}」。`, tab: "state", pointer: binding.pointer });
    }
  }
  for (const [field, binding] of Object.entries(definition.outputBindings)) {
    if (binding.source === "state" && !Object.prototype.hasOwnProperty.call(stateProperties, pointerField(binding.pointer))) issues.push({ id: `state-output:${field}`, title: `图输出「${field}」的来源不存在`, detail: `流程数据中没有字段「${pointerField(binding.pointer)}」。`, tab: "state", pointer: binding.pointer });
  }
  for (const node of definition.nodes) {
    for (const [name, binding] of Object.entries(node.inputs)) {
      if (binding.source === "input") {
        const field = pointerField(binding.pointer);
        if (closed(definition.inputSchema) && !Object.prototype.hasOwnProperty.call(inputProperties, field)) {
          issues.push({ id: `binding:${node.id}:${name}:input`, title: `「${labelOf(node)}」的参数 ${name} 来源不存在`, detail: `启动输入中没有字段「${field}」。`, tab: "node", nodeId: node.id, pointer: binding.pointer });
        }
      } else if (binding.source === "state") {
        const field = pointerField(binding.pointer);
        if (!Object.prototype.hasOwnProperty.call(stateProperties, field)) {
          issues.push({ id: `binding:${node.id}:${name}:state`, title: `「${labelOf(node)}」的参数 ${name} 来源不存在`, detail: `流程数据中没有字段「${field}」。`, tab: "state", nodeId: node.id, pointer: binding.pointer });
        }
      } else if (binding.source === "environment") {
        const key = pointerField(binding.pointer);
        if (!Object.prototype.hasOwnProperty.call(variables, key)) {
          issues.push({ id: `binding:${node.id}:${name}:environment`, title: `「${labelOf(node)}」的参数 ${name} 来源不存在`, detail: `变量环境中没有变量「${key}」。`, tab: "environment", nodeId: node.id, pointer: binding.pointer });
        }
      }
    }
    if (node.type === "core.llm") {
      const providerRef = typeof node.config.providerRef === "string" ? node.config.providerRef : "";
      const modelRef = typeof node.config.modelRef === "string" ? node.config.modelRef : "";
      if (!providerRef || !modelRef) {
        issues.push({ id: `model:${node.id}:missing`, title: `为「${labelOf(node)}」选择模型`, detail: "这个模型节点还没有连接模型。", tab: "node", nodeId: node.id });
      } else {
        const provider = environment?.providers.find(item => item.ref === providerRef);
        if (!provider) issues.push({ id: `model:${node.id}:provider`, title: `「${labelOf(node)}」的模型连接不可用`, detail: "原连接已不存在，请重新选择模型。", tab: "node", nodeId: node.id });
        else if (!provider.modelRefs.includes(modelRef)) issues.push({ id: `model:${node.id}:model`, title: `「${labelOf(node)}」的模型未启用`, detail: `连接「${provider.name}」中没有模型「${modelRef}」，请重新选择。`, tab: "node", nodeId: node.id });
      }
    }
    if (node.type === "core.tool") {
      const toolRef = typeof node.config.toolRef === "string" ? node.config.toolRef : "";
      if (!toolRef) {
        issues.push({ id: `tool:${node.id}:missing`, title: `为「${labelOf(node)}」选择工具`, detail: "这个工具节点还没有选择要调用的工具。", tab: "node", nodeId: node.id });
      } else {
        const tool = toolIndex.get(toolRef);
        if (!tool || tool.available === false) issues.push({ id: `tool:${node.id}:unavailable`, title: `「${labelOf(node)}」的工具不可用`, detail: "工具连接已失效或未授权，请重新选择。", tab: "node", nodeId: node.id });
        else {
          const digest = typeof node.config.contractDigest === "string" ? node.config.contractDigest : "";
          if (digest !== tool.contractDigest) issues.push({ id: `tool:${node.id}:digest`, title: `「${labelOf(node)}」的工具配置已变化`, detail: "请重新选择工具以刷新参数。", tab: "node", nodeId: node.id });
        }
      }
    }
    const outputTool = node.type === "core.tool" ? toolIndex.get(String(node.config.toolRef ?? "")) : undefined;
    const items = nodeOutputItems(node, outputTool);
    for (const [field, pointer] of Object.entries(node.writes)) {
      if (typeof pointer !== "string") continue;
      const fieldSchema = stateProperties[field];
      if (!fieldSchema) {
        issues.push({ id: `write:${node.id}:${field}:missing`, title: `「${labelOf(node)}」的写入字段「${field}」不存在`, detail: "请重新选择写入到，或先在数据面板创建这个字段。", tab: "node", nodeId: node.id, pointer });
        continue;
      }
      const item = outputItemAt(items, pointer);
      if (!item) continue;
      const mismatch = outputTypeMismatch(item.type, fieldSchema);
      if (!mismatch) continue;
      const fieldType = stateFieldOutputType(fieldSchema);
      const fixType = stateTypeForOutput(item.type);
      issues.push({
        id: `write:${node.id}:${field}:type`,
        title: `「${labelOf(node)}」的「${item.key}」写入类型不符`,
        detail: `「${item.key}」是${OUTPUT_TYPE_LABELS[item.type]}，但字段「${field}」是${OUTPUT_TYPE_LABELS[fieldType]}。请换一个兼容字段，或在数据面板修改字段类型。`,
        summary: `${labelOf(node)} 的 ${item.key} 输出是${OUTPUT_TYPE_LABELS[item.type]}，但字段 ${field} 是${OUTPUT_TYPE_LABELS[fieldType]}`,
        ...(fixType ? { fix: { field, type: fixType } } : {}),
        tab: "node",
        nodeId: node.id,
        pointer,
      });
    }
    if (node.type === "core.llm") {
      for (const diagnostic of llmConfigDiagnostics(node, definition)) {
        if (diagnostic.code !== "INVALID_STRUCTURED_OUTPUT") continue;
        issues.push({ id: `structured:${node.id}:${diagnostic.pointer ?? issues.length}`, title: `「${labelOf(node)}」的输出字段配置需要修正`, detail: diagnostic.message, tab: "node", nodeId: node.id });
      }
    }
    if (node.type === "control.send") {
      const target = typeof node.config.target === "string" ? node.config.target : "";
      if (target && !definition.nodes.some(item => item.id === target)) issues.push({ id: `send:${node.id}:target`, title: `「${labelOf(node)}」的分发目标不存在`, detail: "请重新选择逐项派发目标。", tab: "node", nodeId: node.id });
    }
  }
  return issues;
}

/** The first run-blocking issue that belongs to one node, with a readable reason. */
export function nodeIssueReason(issue: RunPreflightIssue | undefined): string | undefined {
  if (!issue) return undefined;
  return issue.summary ?? `${issue.title}${issue.detail ? `：${issue.detail}` : ""}`;
}

/** Node tests only inspect this node; other nodes' conflicts must not disable the test. */
export function nodeTestBlockReason(issues: readonly RunPreflightIssue[], nodeId: string): string | undefined {
  return nodeIssueReason(issues.find(issue => issue.nodeId === nodeId));
}

import type { JsonSchema, JsonValue, WorkflowNodeV2 } from "./types";

/**
 * Canvas card summary (batch 2 design). The second line of a node card answers
 * "what is this node configured to do" without repeating the type badge:
 * model name, tool display name, `Python · 3 个输出`, or `按「字段」判断`.
 *
 * Pure and dependency-free so the canvas never has to import editor state.
 */

export type NodeCardSummaryContext = {
  /** Display name of the selected tool from the environment registry. */
  toolName?: string;
  /** Selected model id, already resolved from the provider connection. */
  modelName?: string;
  /** Output field count for nodes whose outputs are derived by the editor. */
  outputCount?: number;
};

export type NodeCardSummary = { text: string; mono: boolean };

const TRANSFORM_LABELS: Record<string, string> = {
  "core.identity": "原样传递",
  "core.add": "数字相加",
  "core.concat": "文本连接",
  "core.message": "构建对话消息",
};

function objectValue(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, JsonValue> : undefined;
}

/** Last path token of a JSON pointer, decoded for display. */
export function pointerFieldName(pointer: unknown): string | undefined {
  if (typeof pointer !== "string" || !pointer) return undefined;
  const token = pointer.split("/").filter(Boolean).pop();
  if (!token) return undefined;
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** The State field a router case tests, read from its structured predicate. */
export function routerCaseField(predicate: JsonValue | undefined): string | undefined {
  const value = objectValue(predicate);
  if (!value) return undefined;
  const left = objectValue(value.left);
  const compare = objectValue(value.value);
  return pointerFieldName(value.pointer) ?? pointerFieldName(left?.pointer) ?? pointerFieldName(compare?.pointer);
}

/** First configured router case's field, used by the card summary. */
export function routerSummaryField(node: WorkflowNodeV2): string | undefined {
  const cases = Array.isArray(node.config.cases) ? node.config.cases : [];
  for (const item of cases) {
    const entry = objectValue(item);
    const field = routerCaseField(entry?.predicate);
    if (field) return field;
  }
  return undefined;
}

/** Count of fields a function declares in its output Schema (1 when unspecified). */
export function functionOutputCount(node: WorkflowNodeV2): number {
  const schema = objectValue(node.config.outputSchema) as JsonSchema | undefined;
  const properties = objectValue(schema?.properties as JsonValue | undefined);
  return properties ? Object.keys(properties).length : 1;
}

function languageLabel(value: JsonValue | undefined): string {
  return String(value ?? "python") === "javascript" ? "JavaScript" : "Python";
}

/**
 * Card summary for the canvas. Never returns raw internal identity (`p4:`,
 * `core.*`, UUIDs); unresolved configuration reads as an actionable choice.
 */
export function nodeCardSummary(node: WorkflowNodeV2, context: NodeCardSummaryContext = {}): NodeCardSummary {
  switch (node.type) {
    case "core.start":
      return { text: "启动入口", mono: false };
    case "core.end":
      return { text: "流程结束", mono: false };
    case "core.llm": {
      const model = context.modelName ?? String(node.config.modelRef ?? "");
      const visible = model && !model.startsWith("p4:") ? model : "";
      return { text: visible || "选择模型", mono: true };
    }
    case "core.tool":
    case "core.tool_dispatch": {
      const tool = context.toolName?.trim() ?? "";
      const configured = String(node.config.toolRef ?? "").trim();
      if (tool) return { text: tool, mono: false };
      if (node.type === "core.tool_dispatch") return { text: "执行模型的工具请求", mono: false };
      // A saved tool ref must never look unconfigured while the registry loads.
      return { text: configured ? "工具已配置" : "选择工具", mono: false };
    }
    case "core.router": {
      const field = routerSummaryField(node);
      return { text: field ? `按「${field}」判断` : "按条件判断", mono: false };
    }
    case "core.function":
      return { text: `${languageLabel(node.config.language)} · ${context.outputCount ?? functionOutputCount(node)} 个输出`, mono: false };
    case "core.subgraph": {
      const graph = objectValue(node.config.graph);
      const count = Array.isArray(graph?.nodes) ? graph.nodes.length : 0;
      return { text: count ? `子图 · ${count} 个节点` : "子图", mono: false };
    }
    case "core.transform":
      return { text: TRANSFORM_LABELS[String(node.config.operationRef ?? "")] ?? "数据处理", mono: false };
    case "core.memory":
      return { text: "读取长期记忆", mono: false };
    case "core.progress":
      return { text: "记录处理阶段", mono: false };
    case "control.fork":
      return { text: "并行执行", mono: false };
    case "control.join":
      return { text: "等待汇合", mono: false };
    case "control.send":
      return { text: "逐项派发", mono: false };
    default:
      return { text: "未配置", mono: false };
  }
}

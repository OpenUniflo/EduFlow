import { createEditorV2 } from "./factory";
import type { JsonValue, WorkflowDefinitionV2, WorkflowDocumentV2, WorkflowTool } from "./types";

/**
 * Presentation helpers for server-provided starting templates. Product template
 * content lives in `workflow_templates` (purpose = 'starter'); this module only
 * applies a fetched definition to the current Workflow identity.
 */
export type StartingTemplateVisual = "assistant" | "search" | "triage" | "flow";

export type StartingModelOptions = {
  providerRef?: string;
  modelRef?: string;
  /** Built-in real HN search tool as exposed by the execution environment. */
  hnTool?: Pick<WorkflowTool, "ref" | "contractDigest">;
  /**
   * Starting flows answer ordinary questions, so DeepSeek flash/chat explicitly
   * disables provider-side thinking. Otherwise reasoning tokens can consume the
   * whole node budget before the first visible character. Users can re-enable it
   * on the model node afterwards.
   */
  disableReasoning?: boolean;
};

function modelParameters(options: StartingModelOptions): Record<string, JsonValue> {
  if (options.disableReasoning === false) return {};
  return /^deepseek-(flash|chat)/i.test(options.modelRef ?? "") ? { thinking: { type: "disabled" } } : {};
}

/** Applies a fetched starter definition to an existing Workflow identity. */
export function applyStartingTemplate(template: WorkflowDefinitionV2, base: WorkflowDefinitionV2, options: StartingModelOptions = {}): WorkflowDocumentV2 {
  const definition = structuredClone(template);
  definition.workflowId = base.workflowId;
  definition.revision = base.revision;
  definition.name = base.name;
  const thinking = modelParameters(options);
  for (const node of definition.nodes) {
    if (node.type === "core.llm") {
      if (options.providerRef && !String(node.config.providerRef ?? "").trim()) node.config.providerRef = options.providerRef;
      if (options.modelRef && !String(node.config.modelRef ?? "").trim()) node.config.modelRef = options.modelRef;
      if (Object.keys(thinking).length) node.config.modelParameters = { ...(node.config.modelParameters as Record<string, JsonValue> | undefined), ...thinking };
    }
    if (node.type === "core.tool" && !String(node.config.toolRef ?? "").trim()) {
      node.config.toolRef = options.hnTool?.ref ?? "hn_search";
      node.config.contractDigest = options.hnTool?.contractDigest ?? "";
    }
  }
  return { definition, editor: createEditorV2(definition) };
}

export function startingTemplateVisual(definition?: WorkflowDefinitionV2): StartingTemplateVisual {
  if (!definition) return "flow";
  if (definition.nodes.some(node => node.type === "core.router")) return "triage";
  if (definition.nodes.some(node => node.type === "core.tool")) return "search";
  if (definition.nodes.some(node => node.type === "core.llm")) return "assistant";
  return "flow";
}

/** A short, graph-derived chain label for chooser cards; not stored content. */
export function startingTemplateChain(definition?: WorkflowDefinitionV2): string {
  if (!definition) return "";
  const labels: Record<string, string> = { "core.llm": "模型", "core.tool": "工具", "core.router": "条件路由", "core.transform": "转换", "core.end": "结束" };
  const byId = new Map(definition.nodes.map(node => [node.id, node]));
  const transitions = new Map<string, WorkflowDefinitionV2["transitions"]>();
  for (const edge of definition.transitions) transitions.set(edge.from, [...(transitions.get(edge.from) ?? []), edge]);
  const chain: string[] = [];
  const seen = new Set<string>();
  let current = definition.entryNodeId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = byId.get(current);
    if (!node) break;
    if (labels[node.type]) chain.push(labels[node.type]);
    if (node.type === "core.router") { chain.push("…"); break; }
    const next = transitions.get(current)?.find(edge => edge.outlet === "next" || edge.outlet === "default") ?? transitions.get(current)?.[0];
    if (!next) break;
    current = next.to;
  }
  return chain.join(" → ");
}

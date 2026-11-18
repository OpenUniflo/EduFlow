import type { Binding, WorkflowDefinitionV2, WorkflowNodeV2 } from "./types";

/** A `core.subgraph` node may carry one embedded graph or one fixed reference, never both. */
export type WorkflowReference = {
  workflowId: string;
  revision: number;
  environmentRef: string;
  stateMode: "independent";
  persistence?: "per-invocation";
};

export type WorkflowReferenceUsage = {
  graphPath: string[];
  nodeId: string;
  nodeLabel: string;
  workflowId: string;
  revision: number;
  environmentRef: string;
  inputs: Record<string, Binding>;
  writes: Record<string, string>;
};

export const MAX_WORKFLOW_REFERENCE_DEPTH = 8;
export const MAX_WORKFLOW_REFERENCE_NODES = 64;
export const MAX_WORKFLOW_REFERENCE_CHAIN_NODES = 256;
export const MAX_WORKFLOW_REFERENCE_WORKFLOWS = 32;

const objectValue = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const positiveInteger = (value: unknown): number | undefined => typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2147483647 ? value : undefined;

/** Parses the fixed reference of a node. Embedded or malformed nodes return undefined. */
export function workflowReferenceInNode(node: WorkflowNodeV2): WorkflowReference | undefined {
  if (node.type !== "core.subgraph") return undefined;
  const config = objectValue(node.config); const reference = objectValue(config?.workflowRef);
  if (!config || !reference || config.graph !== undefined) return undefined;
  const workflowId = typeof reference.workflowId === "string" ? reference.workflowId.trim() : "";
  const revision = positiveInteger(reference.revision);
  const environmentRef = typeof config.environmentRef === "string" ? config.environmentRef.trim() : "";
  if (!workflowId || workflowId.length > 128 || revision === undefined || !environmentRef || environmentRef.length > 160) return undefined;
  if (config.stateMode !== undefined && config.stateMode !== "independent") return undefined;
  if (config.persistence !== undefined && config.persistence !== "per-invocation") return undefined;
  const keys = Object.keys(reference);
  if (keys.length !== 2 || !keys.includes("workflowId") || !keys.includes("revision")) return undefined;
  if (Object.keys(config).some((key) => !["workflowRef", "environmentRef", "stateMode", "persistence"].includes(key))) return undefined;
  return { workflowId, revision, environmentRef, stateMode: "independent", ...(config.persistence === "per-invocation" ? { persistence: "per-invocation" as const } : {}) };
}

/** Authoring issue for a reference-shaped node; embedded graphs and valid references stay silent. */
export function workflowReferenceIssue(node: WorkflowNodeV2): string | undefined {
  if (node.type !== "core.subgraph") return undefined;
  const config = objectValue(node.config);
  if (!config) return "子图配置无效";
  if (config.graph !== undefined && config.workflowRef !== undefined) return "不能同时保存内嵌子图和固定版本引用";
  if (config.workflowRef === undefined) {
    const graph = objectValue(config.graph);
    return graph && Array.isArray(graph.nodes) ? undefined : "缺少内嵌子图或固定版本引用";
  }
  if (workflowReferenceInNode(node)) return undefined;
  const reference = objectValue(config.workflowRef);
  if (!reference) return "固定版本引用格式无效";
  if (typeof reference.workflowId !== "string" || !reference.workflowId.trim() || reference.workflowId.trim().length > 128) return "目标工作流标识无效";
  if (positiveInteger(reference.revision) === undefined) return "固定修订必须是正整数";
  if (typeof config.environmentRef !== "string" || !config.environmentRef.trim() || config.environmentRef.trim().length > 160) return "必须指定目标运行环境";
  if (config.stateMode !== undefined && config.stateMode !== "independent") return "引用只能使用隔离状态";
  if (config.persistence !== undefined && config.persistence !== "per-invocation") return "引用只能使用每次调用隔离的检查点";
  return "固定版本引用配置包含未知字段";
}

/** Flattens fixed reference usages across embedded graphs without resolving target revisions. */
export function workflowReferenceUsages(definition: WorkflowDefinitionV2): WorkflowReferenceUsage[] {
  const usages: WorkflowReferenceUsage[] = [];
  const visit = (graph: WorkflowDefinitionV2, graphPath: string[]) => {
    for (const node of graph.nodes) {
      const reference = workflowReferenceInNode(node);
      if (reference) usages.push({ graphPath: [...graphPath], nodeId: node.id, nodeLabel: node.label || node.id, ...reference, inputs: node.inputs, writes: node.writes });
      const child = node.type === "core.subgraph" ? objectValue(node.config.graph) : undefined;
      if (child && Array.isArray(child.nodes) && graphPath.length < MAX_WORKFLOW_REFERENCE_DEPTH) visit(child as unknown as WorkflowDefinitionV2, [...graphPath, node.id]);
    }
  };
  visit(definition, []);
  return usages;
}

export type FixedReferenceIssue = { code: "WORKFLOW_REFERENCE_CYCLE" | "WORKFLOW_REFERENCE_LIMIT"; message: string };

/**
 * Walks the actual fixed-revision closure. Callers supply an exact-revision
 * resolver; missing targets are a separate availability check. Reusing one
 * target from many nodes is legal and does not count as a cycle.
 */
export function fixedReferenceIssue(root: { workflowId: string; revision: number }, resolve: (workflowId: string, revision: number) => WorkflowDefinitionV2 | undefined): FixedReferenceIssue | undefined {
  const rootIdentity = `${root.workflowId}@${root.revision}`;
  const targets = new Set<string>();
  let nodes = 0;
  const visit = (workflowId: string, revision: number, path: string[]): FixedReferenceIssue | undefined => {
    const identity = `${workflowId}@${revision}`;
    if (path.includes(identity)) return { code: "WORKFLOW_REFERENCE_CYCLE", message: `固定版本引用形成循环：${[...path, identity].join(" -> ")}` };
    if (path.length > MAX_WORKFLOW_REFERENCE_DEPTH) return { code: "WORKFLOW_REFERENCE_LIMIT", message: `固定版本引用超过 ${MAX_WORKFLOW_REFERENCE_DEPTH} 层` };
    const definition = resolve(workflowId, revision);
    if (!definition) return undefined;
    for (const usage of workflowReferenceUsages(definition)) {
      nodes += 1;
      targets.add(`${usage.workflowId}@${usage.revision}`);
      if (nodes > MAX_WORKFLOW_REFERENCE_CHAIN_NODES) return { code: "WORKFLOW_REFERENCE_LIMIT", message: `引用闭包超过 ${MAX_WORKFLOW_REFERENCE_CHAIN_NODES} 个引用节点` };
      if (targets.size > MAX_WORKFLOW_REFERENCE_WORKFLOWS) return { code: "WORKFLOW_REFERENCE_LIMIT", message: `引用闭包超过 ${MAX_WORKFLOW_REFERENCE_WORKFLOWS} 个目标修订` };
      const issue = visit(usage.workflowId, usage.revision, [...path, identity]);
      if (issue) return issue;
    }
    return undefined;
  };
  return visit(root.workflowId, root.revision, []);
}

import type { JsonValue, WorkflowDefinitionV2, WorkflowNodeV2, WorkflowTool } from "../../domain/v2/types";

export type ConnectionCatalogEntry = {
  connectionKey: string;
  ref: string;
  version: number;
  disabled: boolean;
  content: Record<string, JsonValue>;
};

export type ConnectionReference = {
  nodeId: string;
  graphPath: string[];
  field: "providerRef" | "toolRef" | "allowedToolRefs";
  index?: number;
  kind: "provider" | "tool";
  oldRef: string;
  modelRef?: string;
  contractDigest?: string;
};

export type ConnectionUpdate = ConnectionReference & {
  newRef: string;
  connectionRef: string;
  version: number;
  requiresConfirmation: boolean;
  reason: string;
  contractDigest?: string;
};

const USER_REF = "p4:";

function walk(definition: WorkflowDefinitionV2, graphPath: string[], references: ConnectionReference[]) {
  for (const node of definition.nodes) {
    const config = node.config;
    if (node.type === "core.llm" && typeof config.providerRef === "string" && config.providerRef.startsWith(USER_REF)) {
      references.push({
        nodeId: node.id,
        graphPath,
        field: "providerRef",
        kind: "provider",
        oldRef: config.providerRef,
        ...(typeof config.modelRef === "string" ? { modelRef: config.modelRef } : {}),
      });
    }
    if (node.type === "core.tool" && typeof config.toolRef === "string" && config.toolRef.startsWith(USER_REF)) {
      references.push({
        nodeId: node.id,
        graphPath,
        field: "toolRef",
        kind: "tool",
        oldRef: config.toolRef,
        ...(typeof config.contractDigest === "string" ? { contractDigest: config.contractDigest } : {}),
      });
    }
    if ((node.type === "core.llm" || node.type === "core.tool_dispatch") && Array.isArray(config.allowedToolRefs)) {
      config.allowedToolRefs.forEach((value, index) => {
        if (typeof value === "string" && value.startsWith(USER_REF)) {
          references.push({ nodeId: node.id, graphPath, field: "allowedToolRefs", index, kind: "tool", oldRef: value });
        }
      });
    }
    if (node.type === "core.subgraph") {
      const graph = node.config.graph;
      if (graph && typeof graph === "object" && Array.isArray((graph as unknown as WorkflowDefinitionV2).nodes)) {
        walk(graph as unknown as WorkflowDefinitionV2, [...graphPath, node.id], references);
      }
    }
  }
}

export function connectionReferences(definition: WorkflowDefinitionV2): ConnectionReference[] {
  const references: ConnectionReference[] = [];
  walk(definition, [], references);
  return references;
}

export function connectionUpdates({ definition, connections, tools }: {
  definition: WorkflowDefinitionV2;
  connections: readonly ConnectionCatalogEntry[];
  tools: readonly WorkflowTool[];
}): ConnectionUpdate[] {
  const catalog = new Map(connections.map(connection => [connection.connectionKey, connection]));
  const toolCatalog = new Map(tools.map(tool => [tool.ref, tool]));
  const updates: ConnectionUpdate[] = [];
  for (const reference of connectionReferences(definition)) {
    const current = catalog.get(reference.oldRef);
    if (!current) continue;
    const next = connections
      .filter(connection => connection.ref === current.ref && !connection.disabled && connection.version > current.version)
      .sort((left, right) => right.version - left.version)[0];
    if (!next) continue;
    const type = String(next.content.type ?? "");
    if (reference.kind === "provider" && type !== "deepseek") continue;
    if (reference.kind === "tool" && type !== "http" && type !== "mcp-http") continue;

    const tool = reference.kind === "tool" ? toolCatalog.get(next.connectionKey) : undefined;
    let requiresConfirmation = reference.kind === "tool" && !tool;
    let reason = requiresConfirmation ? "新版本工具合同尚未读取，请先刷新工具目录" : "";
    if (reference.kind === "provider") {
      const models = Array.isArray(next.content.modelRefs) ? next.content.modelRefs.map(String) : [];
      if (reference.modelRef && !models.includes(reference.modelRef)) {
        requiresConfirmation = true;
        reason = "新版本不包含当前模型，请在节点中重新选择模型";
      }
    }
    if (reference.kind === "tool" && tool) {
      if (tool.available === false) {
        requiresConfirmation = true;
        reason = "新版本工具当前不可用";
      } else if (reference.contractDigest && tool.contractDigest !== reference.contractDigest) {
        requiresConfirmation = true;
        reason = "工具合同已变化，需要人工确认";
      }
    }
    updates.push({
      ...reference,
      newRef: next.connectionKey,
      connectionRef: current.ref,
      version: next.version,
      requiresConfirmation,
      reason,
      ...(tool ? { contractDigest: tool.contractDigest } : {}),
    });
  }
  return updates;
}

function findNode(definition: WorkflowDefinitionV2, graphPath: string[], nodeId: string): WorkflowNodeV2 | undefined {
  let graph = definition;
  for (const segment of graphPath) {
    const parent = graph.nodes.find(node => node.id === segment);
    const child = parent?.config.graph;
    if (!child || typeof child !== "object" || !Array.isArray((child as unknown as WorkflowDefinitionV2).nodes)) return undefined;
    graph = child as unknown as WorkflowDefinitionV2;
  }
  return graph.nodes.find(node => node.id === nodeId);
}

/** Applies only explicit updates to the current definition; never touches saved revisions or Run history. */
export function applyConnectionUpdates(definition: WorkflowDefinitionV2, updates: readonly ConnectionUpdate[]): WorkflowDefinitionV2 {
  const next = structuredClone(definition);
  for (const update of updates) {
    const node = findNode(next, update.graphPath, update.nodeId);
    if (!node) continue;
    if (update.field === "providerRef") node.config.providerRef = update.newRef;
    else if (update.field === "toolRef") {
      node.config.toolRef = update.newRef;
      if (update.contractDigest) node.config.contractDigest = update.contractDigest;
    } else if (typeof update.index === "number") {
      const refs = Array.isArray(node.config.allowedToolRefs) ? [...node.config.allowedToolRefs] : [];
      refs[update.index] = update.newRef;
      node.config.allowedToolRefs = refs;
    }
  }
  return next;
}

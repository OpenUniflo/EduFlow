import type { JsonValue, WorkflowDefinitionV2, WorkflowNodeV2, WorkflowTool } from "../../domain/v2/types";
import { workflowResourceReferences } from "./resourceReferences";

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

export type UnresolvedCapability = {
  nodeId: string;
  graphPath: string[];
  field: "providerRef" | "toolRef";
  kind: "provider" | "tool";
  label: string;
};

export type CapabilityBinding = UnresolvedCapability & {
  reference: string;
  modelRef?: string;
  contractDigest?: string;
};

const USER_REF = "p4:";

export function connectionReferences(definition: WorkflowDefinitionV2): ConnectionReference[] {
  const references: ConnectionReference[] = [];
  for (const resource of workflowResourceReferences(definition)) {
    if (!resource.ref.startsWith(USER_REF)) continue;
    for (const usage of resource.usages) {
      if (resource.kind === "provider") {
        references.push({
          nodeId: usage.nodeId,
          graphPath: usage.graphPath,
          field: "providerRef",
          kind: "provider",
          oldRef: resource.ref,
          ...(usage.modelRef ? { modelRef: usage.modelRef } : {}),
        });
      } else if (resource.kind === "api" && usage.field) {
        references.push({
          nodeId: usage.nodeId,
          graphPath: usage.graphPath,
          field: usage.field,
          kind: "tool",
          oldRef: resource.ref,
          ...(typeof usage.index === "number" ? { index: usage.index } : {}),
          ...(usage.contractDigest ? { contractDigest: usage.contractDigest } : {}),
        });
      }
    }
  }
  return references;
}

function walkUnresolved(definition: WorkflowDefinitionV2, graphPath: string[], unresolved: UnresolvedCapability[]) {
  for (const node of definition.nodes) {
    const config = node.config;
    if (node.type === "core.llm" && typeof config.providerRef === "string" && !config.providerRef.trim()) {
      unresolved.push({ nodeId: node.id, graphPath, field: "providerRef", kind: "provider", label: node.label });
    }
    if (node.type === "core.tool" && typeof config.toolRef === "string" && !config.toolRef.trim()) {
      unresolved.push({ nodeId: node.id, graphPath, field: "toolRef", kind: "tool", label: node.label });
    }
    if (node.type === "core.subgraph") {
      const graph = node.config.graph;
      if (graph && typeof graph === "object" && Array.isArray((graph as unknown as WorkflowDefinitionV2).nodes)) {
        walkUnresolved(graph as unknown as WorkflowDefinitionV2, [...graphPath, node.id], unresolved);
      }
    }
  }
}

export function unresolvedCapabilities(definition: WorkflowDefinitionV2): UnresolvedCapability[] {
  const unresolved: UnresolvedCapability[] = [];
  walkUnresolved(definition, [], unresolved);
  return unresolved;
}

export function applyCapabilityBindings(definition: WorkflowDefinitionV2, bindings: readonly CapabilityBinding[]): WorkflowDefinitionV2 {
  const next = structuredClone(definition);
  for (const binding of bindings) {
    const node = findNode(next, binding.graphPath, binding.nodeId);
    if (!node) continue;
    if (binding.field === "providerRef") {
      node.config.providerRef = binding.reference;
      if (binding.modelRef) node.config.modelRef = binding.modelRef;
    } else {
      node.config.toolRef = binding.reference;
      if (binding.contractDigest) node.config.contractDigest = binding.contractDigest;
    }
  }
  return next;
}

function updateForReference(
  reference: ConnectionReference,
  connections: readonly ConnectionCatalogEntry[],
  catalog: ReadonlyMap<string, ConnectionCatalogEntry>,
  toolCatalog: ReadonlyMap<string, WorkflowTool>,
): ConnectionUpdate | undefined {
  const current = catalog.get(reference.oldRef);
  if (!current) return undefined;
  const next = connections
    .filter(connection => connection.ref === current.ref && !connection.disabled && connection.version > current.version)
    .sort((left, right) => right.version - left.version)[0];
  if (!next) return undefined;
  const type = String(next.content.type ?? "");
  if (reference.kind === "provider" && type !== "deepseek" && type !== "openai-compatible") return undefined;
  if (reference.kind === "tool" && type !== "http" && type !== "mcp-http") return undefined;

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
  return {
    ...reference,
    newRef: next.connectionKey,
    connectionRef: current.ref,
    version: next.version,
    requiresConfirmation,
    reason,
    ...(tool ? { contractDigest: tool.contractDigest } : {}),
  };
}

/** Per-node upgrade candidates; EnvironmentPanel applies these to the definition. */
export function connectionUpdates({ definition, connections, tools }: {
  definition: WorkflowDefinitionV2;
  connections: readonly ConnectionCatalogEntry[];
  tools: readonly WorkflowTool[];
}): ConnectionUpdate[] {
  const catalog = new Map(connections.map(connection => [connection.connectionKey, connection]));
  const toolCatalog = new Map(tools.map(tool => [tool.ref, tool]));
  const updates: ConnectionUpdate[] = [];
  for (const reference of connectionReferences(definition)) {
    const update = updateForReference(reference, connections, catalog, toolCatalog);
    if (update) updates.push(update);
  }
  return updates;
}

/**
 * One row per referenced resource with an available upgrade, not one row per
 * node. The toolbar count and the resource panel therefore describe the same
 * set of resources even when several nodes share one provider or API.
 */
export function referencedResourceUpdates({ definition, connections, tools }: {
  definition: WorkflowDefinitionV2;
  connections: readonly ConnectionCatalogEntry[];
  tools: readonly WorkflowTool[];
}): ConnectionUpdate[] {
  const catalog = new Map(connections.map(connection => [connection.connectionKey, connection]));
  const toolCatalog = new Map(tools.map(tool => [tool.ref, tool]));
  const unique = new Map<string, ConnectionUpdate>();
  for (const reference of connectionReferences(definition)) {
    const update = updateForReference(reference, connections, catalog, toolCatalog);
    if (!update) continue;
    const identity = `${update.kind}:${update.connectionRef}`;
    const current = unique.get(identity);
    if (!current) {
      unique.set(identity, update);
    } else if (update.requiresConfirmation && !current.requiresConfirmation) {
      unique.set(identity, { ...current, requiresConfirmation: true, reason: update.reason });
    }
  }
  return [...unique.values()];
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

import type { KnowledgeGraph, KnowledgeNode } from "../types";
import type { KnowledgeAccessContext, KnowledgeRepository } from "./KnowledgeRepository";

function isVisible(node: KnowledgeNode, context: KnowledgeAccessContext) {
  if (!context.visibleScopes.includes(node.scope)) return false;
  if (node.scope === "global") return true;
  if (node.scope === "tenant") return Boolean(context.tenantId && node.ownerId === context.tenantId);
  return Boolean(context.userId && node.ownerId === context.userId);
}

export class InMemoryKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly graph: KnowledgeGraph) {}

  getNode(nodeId: string, context: KnowledgeAccessContext) {
    const node = this.graph.nodes.find((item) => item.id === nodeId);
    return node && isVisible(node, context) ? node : null;
  }

  getNodes(nodeIds: string[], context: KnowledgeAccessContext) {
    const requested = new Set(nodeIds);
    return this.graph.nodes.filter((node) => requested.has(node.id) && isVisible(node, context));
  }

  getVisibleGraph(context: KnowledgeAccessContext): KnowledgeGraph {
    const nodes = this.graph.nodes.filter((node) => isVisible(node, context));
    const nodeIds = new Set(nodes.map((node) => node.id));
    return {
      nodes,
      revisions: this.graph.revisions.filter((revision) => nodeIds.has(revision.nodeId)),
      edges: this.graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    };
  }
}

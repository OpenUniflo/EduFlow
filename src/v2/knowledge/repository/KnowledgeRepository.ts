import type { KnowledgeGraph, KnowledgeNode, KnowledgeScope } from "../types";

export type KnowledgeAccessContext = {
  userId?: string;
  tenantId?: string;
  visibleScopes: KnowledgeScope[];
};

/** Scoped lookup infrastructure over KnowledgeGraph data; it is not an ontology layer. */
export interface KnowledgeRepository {
  getNode(nodeId: string, context: KnowledgeAccessContext): KnowledgeNode | null;
  getNodes(nodeIds: string[], context: KnowledgeAccessContext): KnowledgeNode[];
  getVisibleGraph(context: KnowledgeAccessContext): KnowledgeGraph;
}

export const globalKnowledgeAccess: KnowledgeAccessContext = { visibleScopes: ["global"] };

export function userKnowledgeAccess(userId: string, tenantId?: string): KnowledgeAccessContext {
  return { userId, tenantId, visibleScopes: ["global", "tenant", "user"] };
}

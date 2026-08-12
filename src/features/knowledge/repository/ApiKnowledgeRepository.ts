import { InMemoryKnowledgeRepository } from "./InMemoryKnowledgeRepository";
import type { KnowledgeAccessContext, KnowledgeRepository } from "./KnowledgeRepository";
import type { KnowledgeGraph } from "../types";

export class ApiKnowledgeRepository implements KnowledgeRepository {
  private delegate = new InMemoryKnowledgeRepository({ nodes: [], revisions: [], edges: [] });

  hydrate(graph: KnowledgeGraph) {
    this.delegate = new InMemoryKnowledgeRepository(graph);
  }

  getNode(nodeId: string, context: KnowledgeAccessContext) {
    return this.delegate.getNode(nodeId, context);
  }

  getNodes(nodeIds: string[], context: KnowledgeAccessContext) {
    return this.delegate.getNodes(nodeIds, context);
  }

  getVisibleGraph(context: KnowledgeAccessContext) {
    return this.delegate.getVisibleGraph(context);
  }
}

import type { DomainAssignment } from "./domain/domainTypes";
import type { KnowledgeGraph } from "./types";

export function getKnowledgeNode(id: string, graph: KnowledgeGraph) {
  return graph.nodes.find((node) => node.id === id);
}

export function getKnowledgeDomain(id: string, graph: KnowledgeGraph) {
  return graph.domains.find((domain) => domain.id === id);
}

export function getNodesByDomain(domainId: string, graph: KnowledgeGraph, assignments: DomainAssignment[]) {
  const nodeIds = new Set(assignments.filter((item) => item.domainId === domainId).map((item) => item.nodeId));
  return graph.nodes.filter((node) => nodeIds.has(node.id));
}

export function getKnowledgeNeighbors(id: string, graph: KnowledgeGraph) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.edges.flatMap((edge) => {
    if (edge.source !== id && edge.target !== id) return [];
    const neighbor = nodeById.get(edge.source === id ? edge.target : edge.source);
    return neighbor ? [neighbor] : [];
  });
}

export function getEdgesForNodes(nodeIds: Iterable<string>, graph: KnowledgeGraph) {
  const allowed = new Set(nodeIds);
  return graph.edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target));
}

export function getEdgesTouchingNodes(nodeIds: Iterable<string>, graph: KnowledgeGraph) {
  const allowed = new Set(nodeIds);
  return graph.edges.filter((edge) => allowed.has(edge.source) || allowed.has(edge.target));
}

export function getOneHopNeighbors(nodeIds: Iterable<string>, graph: KnowledgeGraph) {
  const core = new Set(nodeIds);
  const neighbors = new Set<string>();
  graph.edges.forEach((edge) => {
    if (core.has(edge.source) && !core.has(edge.target)) neighbors.add(edge.target);
    if (core.has(edge.target) && !core.has(edge.source)) neighbors.add(edge.source);
  });
  return graph.nodes.filter((node) => neighbors.has(node.id));
}

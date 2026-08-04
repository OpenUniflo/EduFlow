import { globalKnowledgeGraph } from "./graph";
import type { KnowledgeEdge, KnowledgeGraph, KnowledgeNode } from "./types";

const nodeById = new Map(globalKnowledgeGraph.nodes.map((node) => [node.id, node]));
const domainById = new Map(globalKnowledgeGraph.domains.map((domain) => [domain.id, domain]));
const clusterById = new Map(globalKnowledgeGraph.clusters.map((cluster) => [cluster.id, cluster]));
const edgesByNode = new Map<string, KnowledgeEdge[]>();

globalKnowledgeGraph.edges.forEach((edge) => {
  edgesByNode.set(edge.source, [...(edgesByNode.get(edge.source) ?? []), edge]);
  edgesByNode.set(edge.target, [...(edgesByNode.get(edge.target) ?? []), edge]);
});

export function getKnowledgeNode(id: string) {
  return nodeById.get(id);
}

export function getKnowledgeDomain(id: string) {
  return domainById.get(id);
}

export function getKnowledgeCluster(id?: string) {
  return id ? clusterById.get(id) : undefined;
}

export function getNodesByDomain(domainId: string) {
  return globalKnowledgeGraph.nodes.filter((node) => node.domainId === domainId);
}

export function getKnowledgeNeighbors(id: string, graph: KnowledgeGraph = globalKnowledgeGraph): KnowledgeNode[] {
  const graphNodeById = graph === globalKnowledgeGraph ? nodeById : new Map(graph.nodes.map((node) => [node.id, node]));
  const graphEdges = graph === globalKnowledgeGraph ? (edgesByNode.get(id) ?? []) : graph.edges.filter((edge) => edge.source === id || edge.target === id);
  return graphEdges.flatMap((edge) => {
    const neighbor = graphNodeById.get(edge.source === id ? edge.target : edge.source);
    return neighbor ? [neighbor] : [];
  });
}

export function getEdgesForNodes(nodeIds: Iterable<string>, graph: KnowledgeGraph = globalKnowledgeGraph) {
  const allowed = new Set(nodeIds);
  return graph.edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target));
}

export function getEdgesTouchingNodes(nodeIds: Iterable<string>, graph: KnowledgeGraph = globalKnowledgeGraph) {
  const allowed = new Set(nodeIds);
  return graph.edges.filter((edge) => allowed.has(edge.source) || allowed.has(edge.target));
}

export function getOneHopNeighbors(nodeIds: Iterable<string>, graph: KnowledgeGraph = globalKnowledgeGraph) {
  const core = new Set(nodeIds);
  const neighbors = new Set<string>();
  graph.edges.forEach((edge) => {
    if (core.has(edge.source) && !core.has(edge.target)) neighbors.add(edge.target);
    if (core.has(edge.target) && !core.has(edge.source)) neighbors.add(edge.source);
  });
  return graph.nodes.filter((node) => neighbors.has(node.id));
}

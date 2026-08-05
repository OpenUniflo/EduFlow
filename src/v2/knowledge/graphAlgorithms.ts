import type { KnowledgeEdge, KnowledgeGraph } from "./types";

export type PotentialBridge = {
  nodeId: string;
  groupIndexes: number[];
  pathNodeIds: string[];
  pathEdgeIds: string[];
  missingNodeIds: string[];
  score: number;
};

export function buildStructuralAdjacency(nodeIds: Iterable<string>, edges: KnowledgeEdge[]) {
  const adjacency = new Map<string, Set<string>>();
  Array.from(nodeIds).forEach((id) => adjacency.set(id, new Set()));
  edges.forEach((edge) => {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) return;
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  });
  return adjacency;
}

export function buildDirectedLearningAdjacency(nodeIds: Iterable<string>, edges: KnowledgeEdge[]) {
  const adjacency = new Map<string, Set<string>>();
  Array.from(nodeIds).forEach((id) => adjacency.set(id, new Set()));
  edges.forEach((edge) => {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) return;
    adjacency.get(edge.source)?.add(edge.target);
    if (edge.relation === "related") adjacency.get(edge.target)?.add(edge.source);
  });
  return adjacency;
}

export function findConnectedComponents(nodeIds: Iterable<string>, edges: KnowledgeEdge[]) {
  const ids = Array.from(new Set(nodeIds));
  const adjacency = buildStructuralAdjacency(ids, edges);
  const visited = new Set<string>();
  const components: string[][] = [];

  ids.forEach((id) => {
    if (visited.has(id)) return;
    const component: string[] = [];
    const queue = [id];
    visited.add(id);
    while (queue.length) {
      const current = queue.shift();
      if (!current) continue;
      component.push(current);
      adjacency.get(current)?.forEach((neighbor) => {
        if (visited.has(neighbor)) return;
        visited.add(neighbor);
        queue.push(neighbor);
      });
    }
    components.push(component.sort());
  });

  return components.sort((left, right) => right.length - left.length || left[0].localeCompare(right[0]));
}

export function calculateKnowledgeConnectivity(coreNodeIds: Iterable<string>, effectiveEdges: KnowledgeEdge[]) {
  const core = new Set(coreNodeIds);
  if (!core.size) return 0;
  const connected = new Set<string>();
  effectiveEdges.forEach((edge) => {
    if (core.has(edge.source) && core.has(edge.target)) {
      connected.add(edge.source);
      connected.add(edge.target);
    }
  });
  return Math.round((connected.size / core.size) * 100);
}

export function calculateCrossDomainConnections(graph: KnowledgeGraph, coreNodeIds: Iterable<string>, effectiveEdges: KnowledgeEdge[]) {
  const core = new Set(coreNodeIds);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  return effectiveEdges.filter((edge) => {
    if (!core.has(edge.source) || !core.has(edge.target)) return false;
    return nodeById.get(edge.source)?.domainId !== nodeById.get(edge.target)?.domainId;
  }).length;
}

function directedPathBetweenGroups(
  sources: string[],
  targetIds: Set<string>,
  adjacency: Map<string, Set<string>>,
  maxDepth: number
) {
  const queue: Array<{ id: string; path: string[] }> = sources.sort().map((id) => ({ id, path: [id] }));
  const visited = new Set(sources);
  while (queue.length) {
    const current = queue.shift();
    if (!current || current.path.length - 1 > maxDepth) continue;
    if (current.path.length > 1 && targetIds.has(current.id)) return current.path;
    adjacency.get(current.id)?.forEach((neighbor) => {
      if (visited.has(neighbor)) return;
      visited.add(neighbor);
      queue.push({ id: neighbor, path: [...current.path, neighbor] });
    });
  }
  return undefined;
}

export function findPotentialBridges(
  graph: KnowledgeGraph,
  groups: string[][],
  coreNodeIds: Iterable<string>,
  options: { maxDepth?: number; limit?: number } = {}
): PotentialBridge[] {
  if (groups.length < 2) return [];
  const maxDepth = options.maxDepth ?? 6;
  const limit = options.limit ?? 3;
  const core = new Set(coreNodeIds);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeByPair = new Map<string, KnowledgeEdge>();
  graph.edges.forEach((edge) => {
    edgeByPair.set(`${edge.source}:${edge.target}`, edge);
    edgeByPair.set(`${edge.target}:${edge.source}`, edge);
  });
  const adjacency = buildDirectedLearningAdjacency(graph.nodes.map((node) => node.id), graph.edges);
  const paths: Array<{ sourceGroup: number; targetGroup: number; path: string[] }> = [];
  groups.forEach((sourceGroup, sourceGroupIndex) => groups.forEach((targetGroup, targetGroupIndex) => {
    if (sourceGroupIndex === targetGroupIndex) return;
    const path = directedPathBetweenGroups(sourceGroup, new Set(targetGroup), adjacency, maxDepth);
    if (path?.some((id) => !core.has(id))) paths.push({ sourceGroup: sourceGroupIndex, targetGroup: targetGroupIndex, path });
  }));

  const suggestions = paths.map(({ sourceGroup, targetGroup, path }) => {
      const missingNodeIds = path.filter((id) => !core.has(id));
      const nodeId = missingNodeIds[Math.floor((missingNodeIds.length - 1) / 2)];
      const pathEdgeIds = path.slice(1).flatMap((id, index) => {
        const edge = edgeByPair.get(`${path[index]}:${id}`);
        return edge ? [edge.id] : [];
      });
      const node = nodeById.get(nodeId);
      const crossDomainNeighbors = Array.from(adjacency.get(nodeId) ?? []).filter((id) => nodeById.get(id)?.domainId !== node?.domainId).length;
      return {
        nodeId,
        groupIndexes: [sourceGroup, targetGroup],
        pathNodeIds: path,
        pathEdgeIds,
        missingNodeIds,
        score: 200 + crossDomainNeighbors * 12 - path.length * 8
      };
    });
  const bestByNode = new Map<string, PotentialBridge>();
  suggestions.forEach((suggestion) => {
    const current = bestByNode.get(suggestion.nodeId);
    if (!current || suggestion.score > current.score || (suggestion.score === current.score && suggestion.pathNodeIds.join(":") < current.pathNodeIds.join(":"))) {
      bestByNode.set(suggestion.nodeId, suggestion);
    }
  });
  return Array.from(bestByNode.values())
    .sort((left, right) => right.score - left.score || left.missingNodeIds.length - right.missingNodeIds.length || left.nodeId.localeCompare(right.nodeId))
    .slice(0, limit);
}

import type { KnowledgeEdge, KnowledgeGraph } from "./types";

export type PotentialBridge = {
  nodeId: string;
  componentIndexes: number[];
  pathNodeIds: string[];
  pathEdgeIds: string[];
  missingNodeIds: string[];
  score: number;
};

function makeAdjacency(nodeIds: Iterable<string>, edges: KnowledgeEdge[]) {
  const adjacency = new Map<string, Set<string>>();
  Array.from(nodeIds).forEach((id) => adjacency.set(id, new Set()));
  edges.forEach((edge) => {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) return;
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  });
  return adjacency;
}

export function findConnectedComponents(nodeIds: Iterable<string>, edges: KnowledgeEdge[]) {
  const ids = Array.from(new Set(nodeIds));
  const adjacency = makeAdjacency(ids, edges);
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

function nearestCorePaths(start: string, adjacency: Map<string, Set<string>>, componentByNode: Map<string, number>, maxDepth: number) {
  const queue: Array<{ id: string; path: string[] }> = [{ id: start, path: [start] }];
  const visited = new Set([start]);
  const paths = new Map<number, string[]>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || current.path.length - 1 > maxDepth) continue;
    const componentIndex = componentByNode.get(current.id);
    if (componentIndex !== undefined && !paths.has(componentIndex)) paths.set(componentIndex, current.path);
    if (paths.size >= 2 && current.path.length - 1 >= maxDepth) continue;
    adjacency.get(current.id)?.forEach((neighbor) => {
      if (visited.has(neighbor)) return;
      visited.add(neighbor);
      queue.push({ id: neighbor, path: [...current.path, neighbor] });
    });
  }
  return paths;
}

export function findPotentialBridges(
  graph: KnowledgeGraph,
  components: string[][],
  coreNodeIds: Iterable<string>,
  options: { maxDepth?: number; limit?: number } = {}
): PotentialBridge[] {
  if (components.length < 2) return [];
  const maxDepth = options.maxDepth ?? 6;
  const limit = options.limit ?? 3;
  const core = new Set(coreNodeIds);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeByPair = new Map<string, KnowledgeEdge>();
  graph.edges.forEach((edge) => {
    edgeByPair.set(`${edge.source}:${edge.target}`, edge);
    edgeByPair.set(`${edge.target}:${edge.source}`, edge);
  });
  const componentByNode = new Map<string, number>();
  components.forEach((component, index) => component.forEach((id) => componentByNode.set(id, index)));
  const adjacency = makeAdjacency(graph.nodes.map((node) => node.id), graph.edges);

  return graph.nodes
    .filter((node) => !core.has(node.id))
    .flatMap((node) => {
      const paths = nearestCorePaths(node.id, adjacency, componentByNode, maxDepth);
      if (paths.size < 2) return [];
      const rankedPaths = Array.from(paths.entries())
        .sort((left, right) => left[1].length - right[1].length || left[0] - right[0])
        .slice(0, 2);
      const pathNodeIds = Array.from(new Set(rankedPaths.flatMap(([, path]) => path)));
      const pathEdgeIds = Array.from(new Set(rankedPaths.flatMap(([, path]) => path.slice(1).flatMap((id, index) => {
        const edge = edgeByPair.get(`${path[index]}:${id}`);
        return edge ? [edge.id] : [];
      }))));
      const adjacentCoreCount = Array.from(adjacency.get(node.id) ?? []).filter((id) => core.has(id)).length;
      const crossDomainNeighbors = Array.from(adjacency.get(node.id) ?? []).filter((id) => nodeById.get(id)?.domainId !== node.domainId).length;
      const totalDistance = rankedPaths.reduce((sum, [, path]) => sum + path.length - 1, 0);
      return [{
        nodeId: node.id,
        componentIndexes: rankedPaths.map(([index]) => index),
        pathNodeIds,
        pathEdgeIds,
        missingNodeIds: pathNodeIds.filter((id) => !core.has(id)),
        score: paths.size * 100 + adjacentCoreCount * 25 + crossDomainNeighbors * 12 - totalDistance * 8
      }];
    })
    .sort((left, right) => right.score - left.score || left.missingNodeIds.length - right.missingNodeIds.length || left.nodeId.localeCompare(right.nodeId))
    .slice(0, limit);
}

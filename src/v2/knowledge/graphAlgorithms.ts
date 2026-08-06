import type { KnowledgeEdge, KnowledgeGraph, KnowledgeGraphLayout } from "./types";

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

type DirectedEdge = { source: string; target: string };

function stronglyConnectedComponents(nodeIds: string[], edges: DirectedEdge[]) {
  const adjacency = new Map(nodeIds.map((id) => [id, [] as string[]]));
  edges.forEach((edge) => adjacency.get(edge.source)?.push(edge.target));
  adjacency.forEach((targets) => targets.sort());
  let cursor = 0;
  const indexes = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  function visit(id: string) {
    indexes.set(id, cursor);
    lowLinks.set(id, cursor);
    cursor += 1;
    stack.push(id);
    onStack.add(id);
    adjacency.get(id)?.forEach((target) => {
      if (!indexes.has(target)) {
        visit(target);
        lowLinks.set(id, Math.min(lowLinks.get(id) as number, lowLinks.get(target) as number));
      } else if (onStack.has(target)) {
        lowLinks.set(id, Math.min(lowLinks.get(id) as number, indexes.get(target) as number));
      }
    });
    if (lowLinks.get(id) !== indexes.get(id)) return;
    const component: string[] = [];
    while (stack.length) {
      const member = stack.pop() as string;
      onStack.delete(member);
      component.push(member);
      if (member === id) break;
    }
    components.push(component.sort());
  }
  nodeIds.forEach((id) => { if (!indexes.has(id)) visit(id); });
  return components;
}

/** @deprecated Production course rendering is owned by ELK. Retained for tests and migration comparison only. */
export function buildLayeredDagLayout(
  nodeIds: Iterable<string>,
  edges: DirectedEdge[],
  stableOrder: (id: string) => number,
  config: { layerGap?: number; rowGap?: number; marginX?: number; marginY?: number; sweeps?: number } = {}
): KnowledgeGraphLayout {
  const ids = Array.from(new Set(nodeIds)).sort((left, right) => stableOrder(left) - stableOrder(right) || left.localeCompare(right));
  const allowed = new Set(ids);
  const activeEdges = edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target) && edge.source !== edge.target);
  const components = stronglyConnectedComponents(ids, activeEdges);
  const componentByNode = new Map<string, number>();
  components.forEach((component, index) => component.forEach((id) => componentByNode.set(id, index)));
  const componentEdges = new Map<number, Set<number>>(components.map((_, index) => [index, new Set()]));
  const indegree = new Map<number, number>(components.map((_, index) => [index, 0]));
  activeEdges.forEach((edge) => {
    const source = componentByNode.get(edge.source) as number;
    const target = componentByNode.get(edge.target) as number;
    if (source === target || componentEdges.get(source)?.has(target)) return;
    componentEdges.get(source)?.add(target);
    indegree.set(target, (indegree.get(target) ?? 0) + 1);
  });
  const componentOrder = (index: number) => Math.min(...components[index].map(stableOrder));
  const queue = components.map((_, index) => index).filter((index) => indegree.get(index) === 0)
    .sort((left, right) => componentOrder(left) - componentOrder(right) || left - right);
  const rank = new Map<number, number>(components.map((_, index) => [index, 0]));
  while (queue.length) {
    const source = queue.shift() as number;
    Array.from(componentEdges.get(source) ?? []).sort((left, right) => componentOrder(left) - componentOrder(right) || left - right).forEach((target) => {
      rank.set(target, Math.max(rank.get(target) ?? 0, (rank.get(source) ?? 0) + 1));
      indegree.set(target, (indegree.get(target) ?? 0) - 1);
      if (indegree.get(target) === 0) {
        queue.push(target);
        queue.sort((left, right) => componentOrder(left) - componentOrder(right) || left - right);
      }
    });
  }
  const rankByNode = new Map(ids.map((id) => [id, rank.get(componentByNode.get(id) as number) ?? 0]));
  const maxRank = Math.max(0, ...rankByNode.values());
  const layers = Array.from({ length: maxRank + 1 }, () => [] as string[]);
  ids.forEach((id) => layers[rankByNode.get(id) ?? 0].push(id));
  const incoming = new Map(ids.map((id) => [id, [] as string[]]));
  const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
  activeEdges.forEach((edge) => { incoming.get(edge.target)?.push(edge.source); outgoing.get(edge.source)?.push(edge.target); });
  const sweeps = config.sweeps ?? 4;
  for (let sweep = 0; sweep < sweeps; sweep += 1) {
    const forward = sweep % 2 === 0;
    const layerIndexes = forward ? layers.map((_, index) => index) : layers.map((_, index) => index).reverse();
    const positions = new Map<string, number>();
    layers.forEach((layer) => layer.forEach((id, index) => positions.set(id, index)));
    layerIndexes.forEach((layerIndex) => {
      const neighbors = forward ? incoming : outgoing;
      layers[layerIndex].sort((left, right) => {
        const score = (id: string) => {
          const values = (neighbors.get(id) ?? []).map((neighbor) => positions.get(neighbor)).filter((value): value is number => value !== undefined);
          return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : stableOrder(id);
        };
        return score(left) - score(right) || stableOrder(left) - stableOrder(right) || left.localeCompare(right);
      });
      layers[layerIndex].forEach((id, index) => positions.set(id, index));
    });
  }
  const maxRows = Math.max(1, ...layers.map((layer) => layer.length));
  const layerGap = config.layerGap ?? 270;
  const rowGap = config.rowGap ?? 132;
  const marginX = config.marginX ?? 50;
  const marginY = config.marginY ?? 50;
  return Object.fromEntries(layers.flatMap((layer, layerIndex) => layer.map((id, rowIndex) => [id, {
    x: marginX + layerIndex * layerGap,
    y: marginY + (rowIndex + (maxRows - layer.length) / 2) * rowGap
  }])));
}

export function assertDirectedAcyclic(nodeIds: Iterable<string>, edges: DirectedEdge[]) {
  const ids = Array.from(new Set(nodeIds));
  if (stronglyConnectedComponents(ids, edges).some((component) => component.length > 1)) throw new Error("Directed graph contains a cycle");
}

export function transitiveReduction<T extends DirectedEdge>(nodeIds: Iterable<string>, edges: T[]): T[] {
  const ids = new Set(nodeIds);
  return edges.filter((edge, skippedIndex) => {
    const adjacency = new Map(Array.from(ids, (id) => [id, [] as string[]]));
    edges.forEach((candidate, index) => { if (index !== skippedIndex) adjacency.get(candidate.source)?.push(candidate.target); });
    const visited = new Set([edge.source]);
    const queue = [...(adjacency.get(edge.source) ?? [])];
    while (queue.length) {
      const current = queue.shift() as string;
      if (current === edge.target) return false;
      if (visited.has(current)) continue;
      visited.add(current);
      queue.push(...(adjacency.get(current) ?? []));
    }
    return true;
  });
}

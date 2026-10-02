/** Presentation over the visible directed graph; roles and learning colors are irrelevant. */
export function computeDownstreamSubgraph(selectedId: string, edges: readonly { id: string; source: string; target: string }[]) {
  const outgoing = new Map<string, typeof edges[number][]>();
  for (const edge of edges) {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source)!.push(edge);
  }
  const nodeIds = new Set([selectedId]);
  const edgeIds = new Set<string>();
  const queue = [selectedId];
  for (let i = 0; i < queue.length; i++) for (const edge of outgoing.get(queue[i]) ?? []) {
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.target)) { nodeIds.add(edge.target); queue.push(edge.target); }
  }
  return { nodeIds, edgeIds };
}

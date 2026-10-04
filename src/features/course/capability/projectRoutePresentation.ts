import type { KnowledgeGraph } from '@/features/knowledge/types';
import type { CapabilityRelation, SelectedRoute } from '@/shared/learning/routePlanning';
import { routeRelations, type RouteOverlay, type RouteOverlayState } from '@/shared/learning/routePresentation';

/** Structural range only. Acquired state and route edits must never alter force input. */
export function projectStructuralGraph(graph: KnowledgeGraph, targetIds: readonly string[]): KnowledgeGraph {
  const active = new Set(graph.nodes.filter(node => node.status === 'active').map(node => node.id));
  const facts = graph.edges.filter(edge => edge.relation !== 'related' && active.has(edge.source) && active.has(edge.target));
  const incoming = new Map<string, string[]>();
  for (const edge of facts) incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
  const members = new Set(targetIds.filter(id => active.has(id)));
  const queue = [...members];
  for (let index = 0; index < queue.length; index++) {
    for (const source of incoming.get(queue[index]) ?? []) if (!members.has(source)) {
      members.add(source); queue.push(source);
    }
  }
  return {
    nodes: graph.nodes.filter(node => members.has(node.id)).sort((a, b) => a.id.localeCompare(b.id)),
    edges: facts.filter(edge => members.has(edge.source) && members.has(edge.target)).sort((a, b) => a.id.localeCompare(b.id)),
    revisions: graph.revisions.filter(revision => members.has(revision.nodeId)),
  };
}

/** Snapshot prerequisites are authoritative; enables come from real structural facts. */
export function projectRouteOverlay(graph: KnowledgeGraph, current: SelectedRoute | null, preview: SelectedRoute | null): RouteOverlay {
  const facts: CapabilityRelation[] = graph.edges.flatMap<CapabilityRelation>(edge => edge.relation === 'prerequisite' ? [edge]
    : edge.relation === 'enables' ? [{ ...edge, relation: 'enables' }] : []);
  const byId = new Map(facts.map(edge => [edge.id, edge]));
  const nodeIds = new Set(graph.nodes.map(node => node.id));
  const edgesFor = (route: SelectedRoute | null) => new Set(route ? routeRelations(route, facts).filter(edge => {
    const fact = byId.get(edge.id);
    return fact?.source === edge.source && fact.target === edge.target && fact.relation === edge.relation;
  }).map(edge => edge.id) : []);
  const nodesFor = (route: SelectedRoute | null) => new Set(route?.selectedNodeIds.filter(id => nodeIds.has(id)) ?? []);
  const diff = (before: Set<string>, after: Set<string>) => [...new Set([...before, ...after])].sort().map(id => ({
    id, state: (!preview ? 'current' : before.has(id) ? after.has(id) ? 'kept' : 'removed' : 'added') as RouteOverlayState,
  }));
  return { nodes: diff(nodesFor(current), nodesFor(preview)), edges: diff(edgesFor(current), edgesFor(preview)), preview: preview !== null };
}

import { executionRelations,type RouteExecutionStep } from '@/shared/learning/routeExecution';
import type { KnowledgeGraph } from '@/features/knowledge/types';
import { projectAncestorNodeIds, type CapabilityRelation, type SelectedRoute } from '@/shared/learning/routePlanning';
import { type RouteOverlay, type RouteOverlayState } from '@/shared/learning/routePresentation';

/** Structural range only. Acquired state and route edits must never alter force input. */
export function projectStructuralGraph(graph: KnowledgeGraph, targetIds: readonly string[]): KnowledgeGraph {
  const active = new Set(graph.nodes.filter(node => node.status === 'active').map(node => node.id));
  const facts = graph.edges.filter(edge => edge.relation !== 'related' && active.has(edge.source) && active.has(edge.target));
  const members = new Set(projectAncestorNodeIds([...active], targetIds, facts));
  return {
    nodes: graph.nodes.filter(node => members.has(node.id)).sort((a, b) => a.id.localeCompare(b.id)),
    edges: facts.filter(edge => members.has(edge.source) && members.has(edge.target)).sort((a, b) => a.id.localeCompare(b.id)),
    revisions: graph.revisions.filter(revision => members.has(revision.nodeId)),
  };
}

/** Snapshot prerequisites are authoritative; enables come from real structural facts. */
export function projectRouteOverlay(graph: KnowledgeGraph, current: (SelectedRoute & {executionSteps?:RouteExecutionStep[]}) | null, preview: (SelectedRoute & {executionSteps?:RouteExecutionStep[]}) | null): RouteOverlay {
  const facts: CapabilityRelation[] = graph.edges.flatMap<CapabilityRelation>(edge => edge.relation === 'prerequisite' ? [edge]
    : edge.relation === 'enables' ? [{ ...edge, relation: 'enables' }] : []);
  const byId = new Map(facts.map(edge => [edge.id, edge]));
  const nodeIds = new Set(graph.nodes.map(node => node.id));
  const edgesFor = (route: (SelectedRoute & {executionSteps?:RouteExecutionStep[]}) | null) => new Set(route ? executionRelations(route, facts).filter(edge => {
    const fact = byId.get(edge.id);
    return fact?.source === edge.source && fact.target === edge.target && fact.relation === edge.relation;
  }).map(edge => edge.id) : []);
  const nodesFor = (route: (SelectedRoute & {executionSteps?:RouteExecutionStep[]}) | null) => new Set(route?.selectedNodeIds.filter(id => nodeIds.has(id)) ?? []);
  const diff = (before: Set<string>, after: Set<string>) => [...new Set([...before, ...after])].sort().map(id => ({
    id, state: (!preview ? 'current' : before.has(id) ? after.has(id) ? 'kept' : 'removed' : 'added') as RouteOverlayState,
  }));
  return { nodes: diff(nodesFor(current), nodesFor(preview)), edges: diff(edgesFor(current), edgesFor(preview)), preview: preview !== null };
}

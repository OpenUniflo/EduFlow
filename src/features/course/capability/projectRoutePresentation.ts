import { executionRelations,type RouteExecutionStep } from '@/shared/learning/routeExecution';
import type { KnowledgeGraph } from '@/features/knowledge/types';
import { type CapabilityModel, type CapabilityRelation, type SelectedRoute } from '@/shared/learning/routePlanning';
import { type RouteOverlay, type RouteOverlayState } from '@/shared/learning/routePresentation';

/** Renderer projection of the one current model; no second ancestor builder. */
export function projectCapabilityGraph(graph: KnowledgeGraph, model: CapabilityModel | null): KnowledgeGraph {
  const members = new Set(model?.orderedNodeIds ?? []);
  const facts = new Set(model?.supportEdges.map(edge => edge.id) ?? []);
  return {
    nodes: graph.nodes.filter(node => members.has(node.id)).sort((a, b) => a.id.localeCompare(b.id)),
    edges: graph.edges.filter(edge => facts.has(edge.id)).sort((a, b) => a.id.localeCompare(b.id)),
    revisions: graph.revisions.filter(revision => members.has(revision.nodeId)),
  };
}

/** Graph, search, counters and inspectors share all current model members. */
export function projectVisibleNodeIds(graph: KnowledgeGraph): Set<string> {
  return new Set(graph.nodes.map(node => node.id));
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

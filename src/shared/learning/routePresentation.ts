import type { CapabilityRelation, SelectedRoute } from './routePlanning';

export type RouteOverlayState = 'current' | 'kept' | 'added' | 'removed';
export type RouteOverlay = {
  nodes: { id: string; state: RouteOverlayState }[];
  edges: { id: string; state: RouteOverlayState }[];
  preview: boolean;
};

/** Reading order is never a source of relationship facts. */
export function routeRelations(route: SelectedRoute, supportEdges: readonly CapabilityRelation[]): CapabilityRelation[] {
  const members = new Set(route.selectedNodeIds);
  return [
    ...route.prerequisiteEdges.map(edge => ({ ...edge, relation: 'prerequisite' as const })),
    ...supportEdges.filter(edge => edge.relation === 'enables'),
  ].filter(edge => members.has(edge.source) && members.has(edge.target)).sort((a, b) => a.id.localeCompare(b.id));
}
export function relationLabel(edge: CapabilityRelation) {
  return edge.relation === 'enables' ? '能力支撑' : edge.strength === 'hard' ? '必要前置' : '推荐前置';
}

/**
 * One-hop relation for the Archive and the learner course tree. The selected
 * node plus every neighbour joined by one factual (or capability-support) edge,
 * plus the route step before / after it. This is the single definition both
 * pages use; the old course page walked a complete capability path and drifted
 * away from the Archive.
 */

export type SelectionEdge = {
  id: string;
  source: string;
  target: string;
  /** Presentation hint only; never used to invent an endpoint. */
  kind?: string;
};

export type OneHopSelectionInput = {
  selectedIds: readonly string[];
  /** Every selectable id known to the scene. Endpoints outside it are ignored. */
  nodeIds?: readonly string[];
  edges: readonly SelectionEdge[];
  /** Knowledge order; only adjacent steps are one hop away. */
  routeOrder?: readonly string[];
};

export type OneHopSelection = {
  /** The ids the caller selected (a practice may cover several Knowledge). */
  selectedIds: ReadonlySet<string>;
  /** Selected + one-hop neighbours, including plane-outside Knowledge. */
  nodeIds: ReadonlySet<string>;
  /** Edges whose two endpoints both belong to the related set. */
  edgeIds: ReadonlySet<string>;
  /** Neighbours reached only through route adjacency (no graph edge). */
  routeNeighborIds: ReadonlySet<string>;
  /** Any selected id is on the route order (the pulse beam stays lit). */
  onRoute: boolean;
};

export function oneHopSelection(input: OneHopSelectionInput): OneHopSelection {
  const known = input.nodeIds ? new Set(input.nodeIds) : null;
  const selected = new Set(input.selectedIds.filter(Boolean));
  const related = new Set<string>(selected);
  const edgeIds = new Set<string>();
  const routeNeighbors = new Set<string>();
  const exists = (id: string) => known === null || known.has(id);

  for (const edge of input.edges) {
    if (!edge.source || !edge.target) continue;
    const touches = selected.has(edge.source) || selected.has(edge.target);
    if (!touches) continue;
    if (!exists(edge.source) || !exists(edge.target)) continue;
    related.add(edge.source);
    related.add(edge.target);
    edgeIds.add(edge.id);
  }

  if (input.routeOrder?.length) {
    const order = input.routeOrder;
    for (const id of selected) {
      const index = order.indexOf(id);
      if (index < 0) continue;
      const before = index > 0 ? order[index - 1] : null;
      const after = index < order.length - 1 ? order[index + 1] : null;
      if (before && exists(before) && !selected.has(before)) {
        related.add(before);
        routeNeighbors.add(before);
      }
      if (after && exists(after) && !selected.has(after)) {
        related.add(after);
        routeNeighbors.add(after);
      }
    }
  }

  return {
    selectedIds: selected,
    nodeIds: related,
    edgeIds,
    routeNeighborIds: routeNeighbors,
    onRoute: [...selected].some((id) => input.routeOrder?.includes(id) ?? false)
  };
}

/** True when the node is selected or one hop from it. */
export function isRelated(selection: OneHopSelection | null, id: string): boolean {
  return Boolean(selection?.nodeIds.has(id));
}

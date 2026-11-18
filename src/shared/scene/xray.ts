/**
 * Selection x-ray guide lines shared by the Archive course plane and the
 * learner course tree. The line set is derived from the selected node and the
 * lit one-hop edges, so every drawn line has a real neighbour endpoint.
 * Callers own "actually drawn": their screen query returns null for a node
 * that is not on screen (behind the camera, culled, or too faint).
 */

export type XrayEdge = {
  id?: string;
  source?: string;
  target?: string;
};

export type XrayScreenPoint = {
  x: number;
  y: number;
  /** Clip-space depth; > 1 means outside the camera frustum. */
  z?: number;
};

export type XraySegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type SelectionXrayInput = {
  selectedId: string;
  /** Edges lit by the current selection (capability support / route hops included). */
  edges: readonly XrayEdge[];
  /** Actual screen position of a node, or null when it is not drawn. */
  screenFor(id: string): XrayScreenPoint | null;
  /**
   * One-hop neighbours with no lit edge of their own (route adjacency). Kept
   * optional so the Archive keeps deriving neighbours from its factual edges.
   */
  neighborIds?: readonly string[];
};

export type SelectionXray = {
  segments: XraySegment[];
  /** Neighbours that produced a segment, in draw order. */
  neighborIds: string[];
};

function visible(point: XrayScreenPoint | null): point is XrayScreenPoint {
  if (!point) return false;
  return point.z === undefined || point.z <= 1;
}

/**
 * One segment from the selected node to every distinct one-hop neighbour.
 * Self loops and neighbours without a visible screen position are skipped.
 */
export function selectionXraySegments(input: SelectionXrayInput): SelectionXray {
  const selectedId = input.selectedId;
  if (!selectedId) return { segments: [], neighborIds: [] };
  const selected = input.screenFor(selectedId);
  if (!selected || !visible(selected)) return { segments: [], neighborIds: [] };
  const neighbors = new Set<string>();
  for (const edge of input.edges) {
    if (!edge.source || !edge.target) continue;
    if (edge.source === selectedId && edge.target !== selectedId) neighbors.add(edge.target);
    else if (edge.target === selectedId && edge.source !== selectedId) neighbors.add(edge.source);
  }
  for (const id of input.neighborIds ?? []) {
    if (id && id !== selectedId) neighbors.add(id);
  }
  const segments: XraySegment[] = [];
  const drawn: string[] = [];
  for (const id of neighbors) {
    const point = input.screenFor(id);
    if (!point || !visible(point)) continue;
    segments.push({ x1: selected.x, y1: selected.y, x2: point.x, y2: point.y });
    drawn.push(id);
  }
  return { segments, neighborIds: drawn };
}

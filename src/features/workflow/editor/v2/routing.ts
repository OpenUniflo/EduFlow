export type RoutePoint = { x: number; y: number };
export type NodeBounds = RoutePoint & { width: number; height: number };

/** Supply an outside corridor to React Flow's router for a backwards, opposing-port edge. */
export function automaticRouteCorridor(source: RoutePoint, target: RoutePoint, sourcePosition: string, targetPosition: string, bounds: NodeBounds[]) {
  const backwardsHorizontal = sourcePosition === "right" && targetPosition === "left" && source.x >= target.x || sourcePosition === "left" && targetPosition === "right" && source.x <= target.x;
  const backwardsVertical = sourcePosition === "bottom" && targetPosition === "top" && source.y >= target.y || sourcePosition === "top" && targetPosition === "bottom" && source.y <= target.y;
  if (bounds.length && backwardsHorizontal) return { centerY: Math.max(...bounds.map(box => box.y + box.height)) + 36 };
  if (bounds.length && backwardsVertical) return { centerX: Math.max(...bounds.map(box => box.x + box.width)) + 36 };
  return {};
}

/** Manual routing is a display preference. Invalid segments fall back to React Flow routing. */
export function routeEntersConnectedNode(points: RoutePoint[], bounds: NodeBounds[]): boolean {
  return bounds.some(box => points.slice(1).some((end, index) => {
    const start = points[index];
    let first = 0; let last = 1;
    for (const axis of ["x", "y"] as const) {
      const minimum = box[axis] + .01;
      const maximum = box[axis] + (axis === "x" ? box.width : box.height) - .01;
      const delta = end[axis] - start[axis];
      if (!delta) { if (start[axis] <= minimum || start[axis] >= maximum) return false; }
      else { const a = (minimum - start[axis]) / delta; const b = (maximum - start[axis]) / delta; first = Math.max(first, Math.min(a, b)); last = Math.min(last, Math.max(a, b)); }
      if (last < first) return false;
    }
    return last >= first;
  }));
}

/**
 * Current-route light band geometry.
 *
 * The route is the execution order itself: every ordered node id with a drawn
 * position is an anchor, whether it owns a card (course Knowledge, practice)
 * or is a cardless capability / intermediate node. Adjacent anchors are joined
 * directly; no KnowledgeEdge and no detour is invented.
 *
 * The band is a persistent faint track plus a few staggered bright windows.
 * Windows advance by one mean route step per second, so speed is uniform by
 * travelled distance rather than by route length.
 */

import { routeMetrics, type RouteMetrics } from "@/shared/scene/routePulse";

export type RouteBandPoint = { id: string; x: number; y: number; z: number };

export type RouteBandComet = {
  /** Clamped absolute distance where the visible tail starts. */
  start: number;
  /** Clamped absolute distance where the bright head ends. */
  end: number;
  /** Head / tail distance; the canvas gradient runs head → tail. */
  head: number;
  tail: number;
  /** Unclamped window centre (mod route length). */
  center: number;
  /** Index of the staggered window (0..count-1). */
  window: number;
};

export type RouteBandGradientStop = { offset: number; opacity: number };

/** Legacy slice window kept for the flat (non-tilted) route view. */
export type RouteBandWindow = {
  start: number;
  end: number;
  intensity: number;
  window: number;
};

export type RouteBandAnchor = { id: string; x: number; y: number; z: number };

/**
 * Route anchor sequence in execution order. Missing ids (not part of the
 * current scene projection) are skipped instead of breaking the chain.
 * A cardless node (capability / intermediate) is still included.
 */
export function buildRouteAnchorSequence(
  orderedNodeIds: readonly string[],
  nodes: readonly RouteBandAnchor[]
): RouteBandAnchor[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const anchors: RouteBandAnchor[] = [];
  orderedNodeIds.forEach((id) => {
    if (seen.has(id)) return;
    const node = byId.get(id);
    if (!node) return;
    seen.add(id);
    anchors.push({ id, x: node.x, y: node.y, z: node.z });
  });
  return anchors;
}

/** The metrics used by the band: one step = one anchor interval. */
export function routeBandMetrics(anchors: readonly RouteBandPoint[]): RouteMetrics {
  return routeMetrics(anchors);
}

/**
 * Bright windows evenly staggered along the route. `distance` is the absolute
 * travelled distance in world units (already advanced by stepDistance/sec).
 */
export function staggeredWindowCenters(distance: number, metrics: RouteMetrics, count = 3): number[] {
  if (metrics.total <= 0.0001) return [];
  const safeCount = Math.max(1, Math.min(3, Math.round(count)));
  const first = ((distance % metrics.total) + metrics.total) % metrics.total;
  return Array.from({ length: safeCount }, (_unused, index) => (first + index * metrics.total / safeCount) % metrics.total);
}

/**
 * One continuous comet per staggered window, in absolute world distance.
 * `windowWorld` is the full shader window; the visible tail spans
 * `windowWorld * 1.2` behind the head. The caller strokes a single path and a
 * head→tail gradient, so there are no hard slice boundaries.
 */
export function routeBandComets(
  distance: number,
  metrics: RouteMetrics,
  windowWorld: number,
  options: { count?: number } = {}
): RouteBandComet[] {
  if (metrics.total <= 0.0001 || windowWorld <= 0.00001) return [];
  const count = Math.max(1, Math.min(3, Math.round(options.count ?? 3)));
  const centers = staggeredWindowCenters(distance, metrics, count);
  const head = windowWorld * 0.5;
  const tail = windowWorld * 1.2;
  return centers.flatMap((center, window) => {
    const start = Math.max(0, center - tail);
    const end = Math.min(metrics.total, center + head);
    if (end - start < 0.01) return [];
    return [{ start, end, head: end, tail: start, center, window }];
  });
}

/**
 * Legacy per-slice split for the flat route view. The 3D course scene uses
 * `routeBandComets` + one gradient per window instead.
 */
export function routeBandWindows(
  distance: number,
  metrics: RouteMetrics,
  windowWorld: number,
  options: { count?: number; slices?: number } = {}
): RouteBandWindow[] {
  if (metrics.total <= 0.0001 || windowWorld <= 0.00001) return [];
  const count = Math.max(1, Math.min(3, Math.round(options.count ?? 3)));
  const slices = Math.max(2, Math.min(12, Math.round(options.slices ?? 6)));
  const centers = staggeredWindowCenters(distance, metrics, count);
  const head = windowWorld * 0.5;
  const tail = windowWorld * 1.2;
  const windows: RouteBandWindow[] = [];
  centers.forEach((center, window) => {
    const start = center - tail;
    const end = center + head;
    for (let slice = 0; slice < slices; slice += 1) {
      const from = start + (end - start) * slice / slices;
      const to = start + (end - start) * (slice + 1) / slices;
      const mid = (from + to) / 2;
      windows.push({
        start: from,
        end: to,
        intensity: windowIntensity(mid, center, windowWorld),
        window
      });
    }
  });
  return windows.filter((window) => window.end > 0 && window.start < metrics.total && window.intensity > 0.002);
}

/**
 * Gradient stops for a comet. Offset 0 is the bright head, 1 the transparent
 * tail. The core peaks at ~0.7; the halo is a much softer envelope of the same
 * light tone.
 */
export function cometGradientStops(layer: "core" | "halo" = "core"): RouteBandGradientStop[] {
  if (layer === "halo") {
    return [
      { offset: 0, opacity: 0.18 },
      { offset: 0.18, opacity: 0.15 },
      { offset: 0.55, opacity: 0.07 },
      { offset: 0.85, opacity: 0.02 },
      { offset: 1, opacity: 0 }
    ];
  }
  return [
    { offset: 0, opacity: 0.70 },
    { offset: 0.16, opacity: 0.62 },
    { offset: 0.55, opacity: 0.30 },
    { offset: 0.82, opacity: 0.09 },
    { offset: 1, opacity: 0 }
  ];
}

/** Same fading-tail profile as the existing pulse shader. */
export function windowIntensity(distance: number, center: number, windowWorld: number): number {
  const head = center + windowWorld * 0.5;
  const start = center - windowWorld * 1.2;
  if (distance < start || distance > head) return 0;
  if (distance > center) {
    const t = (head - distance) / Math.max(0.00001, head - center);
    return Math.min(1, Math.max(0, t / 0.35));
  }
  const t = (distance - start) / Math.max(0.00001, center - start);
  return Math.pow(Math.max(0, Math.min(1, t)), 1.8);
}

/** World position at an absolute route distance (clamped to the anchors). */
export function pointAtRouteDistance(
  anchors: readonly RouteBandPoint[],
  metrics: RouteMetrics,
  distance: number
): { x: number; y: number; z: number } | null {
  if (!anchors.length) return null;
  if (anchors.length === 1 || metrics.total <= 0.0001) return { x: anchors[0].x, y: anchors[0].y, z: anchors[0].z };
  const target = Math.max(0, Math.min(metrics.total, distance));
  let index = 0;
  while (index < metrics.cumulative.length - 2 && metrics.cumulative[index + 1] < target) index += 1;
  const span = Math.max(0.0001, metrics.cumulative[index + 1] - metrics.cumulative[index]);
  const t = Math.max(0, Math.min(1, (target - metrics.cumulative[index]) / span));
  const from = anchors[index];
  const to = anchors[Math.min(anchors.length - 1, index + 1)];
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t
  };
}

/**
 * Constant-speed route pulse math shared by the 3D course tree and the route
 * preview. The beam is a steady band; 1–2 brightness windows travel along it.
 * The window advances by one route step per second, independent of the total
 * route length (a long route does not make individual pulses faster).
 */

export type PulsePoint = { x: number; y: number; z?: number };

export type RouteMetrics = {
  /** Cumulative world distance at every sampled point. */
  cumulative: number[];
  total: number;
  /** Mean distance between consecutive step anchors. */
  stepDistance: number;
  /** Number of step anchors (not sub-divided render samples). */
  stepCount: number;
};

export function routeMetrics(points: readonly PulsePoint[], stepAnchors = points.length): RouteMetrics {
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const distance = Math.hypot(current.x - previous.x, current.y - previous.y, (current.z ?? 0) - (previous.z ?? 0));
    cumulative.push(cumulative[index - 1] + distance);
  }
  const total = cumulative[cumulative.length - 1] ?? 0;
  const stepCount = Math.max(1, stepAnchors - 1);
  return { cumulative, total, stepDistance: total / stepCount, stepCount: stepAnchors };
}

/** Advance one route step per second; independent of the total route length. */
export function advancePulse(distance: number, metrics: RouteMetrics, deltaMs: number) {
  if (metrics.total <= 0.0001) return 0;
  const next = distance + metrics.stepDistance * (Math.max(0, deltaMs) / 1000);
  return next % metrics.total;
}

/** Normalised distance (0..1) for a world-space distance. */
export function normalisedDistance(distance: number, metrics: RouteMetrics) {
  return metrics.total <= 0.0001 ? 0 : Math.max(0, Math.min(1, distance / metrics.total));
}

/**
 * A brightness window with a soft leading edge and a long fading tail.
 * `center` is normalised route distance, `length` the window length and
 * `tail` the multiplier applied behind the head. Returns 0..1.
 */
export function pulseWindow(distance: number, center: number, length: number, tail = 2.4) {
  if (length <= 0.00001) return 0;
  const head = center + length * 0.5;
  const start = center - length * 0.5 * tail;
  if (distance < start || distance > head) return 0;
  if (distance > center) {
    // Leading edge: short, bright, almost flat.
    const t = (head - distance) / Math.max(0.00001, head - center);
    return Math.min(1, Math.max(0, t / 0.35));
  }
  // Fading tail.
  const t = (distance - start) / Math.max(0.00001, center - start);
  return Math.pow(Math.max(0, Math.min(1, t)), 1.8);
}

/** Two windows half a route apart (or one short window for a short route). */
export function pulseCenters(distance: number, metrics: RouteMetrics) {
  const first = normalisedDistance(distance, metrics);
  if (metrics.total < 420) return [first];
  return [first, (first + 0.5) % 1];
}

/** World length of a screen-space window at the current camera scale. */
export function windowLengthForPixels(screenPixels: number, worldPerPixel: number, metrics: RouteMetrics) {
  return metrics.total <= 0.0001 ? 0 : (Math.max(1, screenPixels) * Math.max(0.000001, worldPerPixel)) / metrics.total;
}

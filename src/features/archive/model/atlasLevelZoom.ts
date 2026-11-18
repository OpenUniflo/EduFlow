export type AtlasMapLevel = 0 | 1 | 2;

/**
 * The Atlas level is a pure presentation projection of camera distance:
 * far = Domains, mid = topics, near = Knowledge. Clicking a level moves the
 * camera to the first distance where that layer dominates; it never relayouts.
 */
const LEVEL_RADIUS_FACTOR: Record<AtlasMapLevel, number> = {
  0: 2.35,
  1: 1.2,
  2: 0.72
};

export function atlasLevelCameraDistance(level: AtlasMapLevel, worldRadius: number, limits: { min: number; max: number }) {
  const radius = Math.max(1, worldRadius);
  const distance = radius * LEVEL_RADIUS_FACTOR[level];
  return Math.min(limits.max, Math.max(limits.min, distance));
}

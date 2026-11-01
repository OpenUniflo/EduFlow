/**
 * One camera convention for the Archive course plane and the learner course
 * tree. Both scenes feed the same OrbitControls parameters and call these
 * pure decisions on release, double click and toolbar zoom so a gesture means
 * exactly the same thing on either page.
 *
 * No three.js or React imports here: the caller applies the returned pose.
 */

export const SCENE_CAMERA = {
  fov: 40,
  rotateSpeed: 0.62,
  zoomSpeed: 0.8,
  panSpeed: 0.8,
  dampingFactor: 0.085,
  /**
   * Legacy envelope. Each scene now derives its own near / far distance from
   * its content (see `sceneCameraLimits`); these stay as the generic defaults
   * for a caller that has no content information.
   */
  minDistance: 180,
  maxDistance: 6000,
  /** Release below this angle snaps back to the front pose. */
  snapFrontAngle: 15,
  /** Give OrbitControls a beat to settle before snapping. */
  snapDelayMs: 180,
  dragThresholdPx: 5,
  /** Toolbar buttons use the same step in both scenes. */
  zoomInFactor: 0.82,
  zoomOutFactor: 1.22
} as const;

export type ScenePoint3 = { x: number; y: number; z: number };

/** True when a drag release should animate back to the front pose. */
export function shouldSnapToFront(angleDeg: number): boolean {
  return Number.isFinite(angleDeg) && angleDeg < SCENE_CAMERA.snapFrontAngle;
}

/** The drag was a real camera move, not a click. */
export function isCameraDrag(movedPixels: number): boolean {
  return movedPixels > SCENE_CAMERA.dragThresholdPx;
}

/** Right button or Shift + left drag is a pan; plain left drag orbits. */
export function isPanGesture(button: number, shiftKey: boolean): boolean {
  return button === 2 || (button === 0 && shiftKey);
}

/** Clamp a toolbar / wheel zoom distance to the shared camera envelope. */
export function zoomDistance(distance: number, factor: number, min: number = SCENE_CAMERA.minDistance, max: number = SCENE_CAMERA.maxDistance): number {
  const next = Math.max(0.0001, distance) * factor;
  return Math.max(min, Math.min(max, next));
}

/** Firefox reports line deltas; one line is roughly one 16px text row. */
export const WHEEL_LINE_HEIGHT_PX = 16;
/** Fallback viewport height when a page-mode wheel event has no canvas height. */
export const WHEEL_PAGE_FALLBACK_PX = 900;
/** Cap one event's normalized delta so a single gesture cannot cross the envelope. */
export const MAX_WHEEL_DELTA_PX = 240;

/**
 * Distance factor for one wheel event. Positive deltaY (wheel down,
 * two-finger swipe down) pulls the camera out, so the factor is > 1; negative
 * deltaY pushes in, so the factor is < 1. Equal magnitudes therefore produce
 * reciprocal factors and an equal push/pull returns to the original distance.
 *
 * Deltas are normalized to CSS pixels first: pixel as-is, line * 16, page *
 * viewport height, then clamped to MAX_WHEEL_DELTA_PX so a coarse mouse notch
 * or a trackpad momentum spike cannot skip a whole zoom segment.
 */
export function wheelZoomFactor(
  deltaY: number,
  deltaMode: number = 0,
  zoomSpeed: number = SCENE_CAMERA.zoomSpeed,
  viewportHeight: number = WHEEL_PAGE_FALLBACK_PX
): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 1;
  const height = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : WHEEL_PAGE_FALLBACK_PX;
  const perUnit = deltaMode === 1 ? WHEEL_LINE_HEIGHT_PX : deltaMode === 2 ? height : 1;
  const normalized = deltaY * perUnit;
  if (!Number.isFinite(normalized)) return 1;
  const capped = Math.max(-MAX_WHEEL_DELTA_PX, Math.min(MAX_WHEEL_DELTA_PX, normalized));
  const speed = Number.isFinite(zoomSpeed) ? Math.max(0, zoomSpeed) : SCENE_CAMERA.zoomSpeed;
  return Math.pow(0.95, -speed * capped * 0.01);
}

/** A double click on a hit focuses that card; a blank double click goes front. */
export function doubleClickAction(hitId: string | null): "focus" | "front" {
  return hitId ? "focus" : "front";
}

/**
 * New target/position that keeps the current distance and target, facing +Z.
 * The caller passes the scene's own content-derived envelope so a compact
 * person layout can still return to a ~40 unit front pose.
 */
export function frontPose(
  target: ScenePoint3,
  distance: number,
  min: number = SCENE_CAMERA.minDistance,
  max: number = SCENE_CAMERA.maxDistance
): { target: ScenePoint3; position: ScenePoint3 } {
  const safeDistance = Math.max(min, Math.min(max, distance));
  return {
    target: { ...target },
    position: { x: target.x, y: target.y, z: target.z + safeDistance }
  };
}

/** Translate both camera and orbit target by the same world vector. */
export function focusPose(target: ScenePoint3, camera: ScenePoint3, nextTarget: ScenePoint3): { target: ScenePoint3; position: ScenePoint3 } {
  return {
    target: { ...nextTarget },
    position: {
      x: camera.x + nextTarget.x - target.x,
      y: camera.y + nextTarget.y - target.y,
      z: camera.z + nextTarget.z - target.z
    }
  };
}

/* ------------------------------------------------------------------ content framing */

const DEG = Math.PI / 180;

export type SceneCameraLimitInput = {
  /** World radius of the content bounding sphere (fit-all framing). */
  contentRadius: number;
  /** Canvas height in CSS pixels. */
  viewportHeight: number;
  /**
   * Archive: typical world distance between two adjacent drawn nodes. The
   * near limit keeps their on-screen gap in the 150–250 px band.
   */
  adjacentSpacing?: number;
  /** Archive: target on-screen gap at the near limit (default 200). */
  nearSpacingPx?: number;
  /**
   * Course: one knowledge card's world height. The near limit makes it cover
   * about half the viewport.
   */
  cardHeight?: number;
  /** Course: card share of the viewport height at the near limit (default 0.5). */
  nearCardViewportRatio?: number;
  fovDeg?: number;
  /** Extra breathing room for the far limit (default 1.35). */
  fitPadding?: number;
  /** How far beyond fit-all the far limit sits (default 1.8). */
  farFactor?: number;
};

export type SceneCameraLimits = {
  minDistance: number;
  maxDistance: number;
  /** Distance at which the whole content bounding sphere fills the view. */
  fitDistance: number;
};

/** Distance at which a sphere of `radius` fills the vertical field of view. */
export function fitDistanceForRadius(contentRadius: number, fovDeg: number = SCENE_CAMERA.fov, padding = 1): number {
  const radius = Math.max(0.0001, contentRadius);
  return radius / Math.sin(Math.max(0.0001, fovDeg) * DEG / 2) * Math.max(0.01, padding);
}

/** Distance where a world height covers `ratio` of the viewport height. */
export function distanceForViewportRatio(worldHeight: number, ratio: number, fovDeg: number = SCENE_CAMERA.fov): number {
  const safeRatio = Math.max(0.0001, ratio);
  return Math.max(0.0001, worldHeight) / (2 * safeRatio * Math.tan(Math.max(0.0001, fovDeg) * DEG / 2));
}

/** Distance where `worldSpacing` projects to `screenPx` CSS pixels. */
export function distanceForScreenSpacing(worldSpacing: number, screenPx: number, viewportHeight: number, fovDeg: number = SCENE_CAMERA.fov): number {
  return Math.max(0.0001, worldSpacing) * Math.max(1, viewportHeight)
    / (2 * Math.max(0.0001, screenPx) * Math.tan(Math.max(0.0001, fovDeg) * DEG / 2));
}

/**
 * Near / far limits from scene content. A near limit is the tightest of the
 * supplied bases (node spacing for the Archive, card size for the course), so
 * the same function serves both pages without a shared magic constant.
 */
export function sceneCameraLimits(input: SceneCameraLimitInput): SceneCameraLimits {
  const fovDeg = input.fovDeg ?? SCENE_CAMERA.fov;
  const fitDistance = fitDistanceForRadius(input.contentRadius, fovDeg, input.fitPadding ?? 1.08);
  const nearBases: number[] = [];
  if (input.adjacentSpacing && input.adjacentSpacing > 0) {
    nearBases.push(distanceForScreenSpacing(
      input.adjacentSpacing,
      input.nearSpacingPx ?? 200,
      input.viewportHeight,
      fovDeg
    ));
  }
  if (input.cardHeight && input.cardHeight > 0) {
    nearBases.push(distanceForViewportRatio(input.cardHeight, input.nearCardViewportRatio ?? 0.5, fovDeg));
  }
  const fitFloor = fitDistance * 0.08;
  const desiredNear = nearBases.length ? Math.min(...nearBases) : fitFloor;
  // Never let the near limit invert the far limit on a tiny scene.
  const minDistance = Math.max(0.5, Math.min(desiredNear, fitDistance * 0.92));
  const maxDistance = Math.max(minDistance * 1.5, fitDistance * (input.farFactor ?? 1.8));
  return {
    minDistance: Number(minDistance.toFixed(3)),
    maxDistance: Number(maxDistance.toFixed(3)),
    fitDistance: Number(fitDistance.toFixed(3))
  };
}

/** Median nearest-neighbour distance for drawn node centres. */
export function medianNearestNeighbourDistance(points: readonly ScenePoint3[]): number {
  if (points.length < 2) return 0;
  const nearest: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    let best = Infinity;
    for (let other = 0; other < points.length; other += 1) {
      if (other === index) continue;
      const candidate = points[other];
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y, (candidate.z ?? 0) - (point.z ?? 0));
      if (distance > 0.0001 && distance < best) best = distance;
    }
    if (Number.isFinite(best)) nearest.push(best);
  }
  if (!nearest.length) return 0;
  nearest.sort((left, right) => left - right);
  const middle = Math.floor(nearest.length / 2);
  return nearest.length % 2 ? nearest[middle] : (nearest[middle - 1] + nearest[middle]) / 2;
}

/** World radius of a set of points around their bounding-box centre. */
export function contentRadius(points: readonly ScenePoint3[]): number {
  if (!points.length) return 1;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  points.forEach((point) => {
    minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); minZ = Math.min(minZ, point.z ?? 0);
    maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y); maxZ = Math.max(maxZ, point.z ?? 0);
  });
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
  return Math.max(1, ...points.map((point) => Math.hypot(point.x - center.x, point.y - center.y, (point.z ?? 0) - center.z)));
}

/** Zoom percentage relative to the fit-all distance (same formula on both pages). */
export function zoomPercent(fitDistance: number, distance: number): number {
  return Math.max(1, Math.round(fitDistance / Math.max(1, distance) * 100));
}

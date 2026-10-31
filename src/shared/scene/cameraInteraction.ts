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

/** A double click on a hit focuses that card; a blank double click goes front. */
export function doubleClickAction(hitId: string | null): "focus" | "front" {
  return hitId ? "focus" : "front";
}

/** New target/position that keeps the current distance and target, facing +Z. */
export function frontPose(target: ScenePoint3, distance: number): { target: ScenePoint3; position: ScenePoint3 } {
  const safeDistance = Math.max(SCENE_CAMERA.minDistance, Math.min(SCENE_CAMERA.maxDistance, distance));
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

export type DetailCameraPose = {
  position: [number, number, number];
  target: [number, number, number];
};

export type DetailCameraRestore = {
  pose: DetailCameraPose;
  cancelled: boolean;
};

/**
 * A detail panel may pan the scene to keep its selected card clear. Remember
 * the pre-panel camera only once; changing the selected card while the panel
 * stays open must not overwrite the position the learner should return to.
 */
export function beginDetailCameraRestore(current: DetailCameraRestore | null, pose: DetailCameraPose): DetailCameraRestore {
  return current ? { ...current } : { pose, cancelled: false };
}

export function cancelDetailCameraRestore(current: DetailCameraRestore | null): DetailCameraRestore | null {
  return current ? { ...current, cancelled: true } : null;
}

/** The camera is restored only when the reveal was not followed by manual movement. */
export function takeDetailCameraRestore(current: DetailCameraRestore | null): DetailCameraPose | null {
  return current && !current.cancelled ? current.pose : null;
}

/**
 * Pure viewport math for the course tree. The first frame fits the chapter
 * columns to the available WIDTH only; a tall course is panned vertically
 * instead of being zoomed down to unreadable cards. A readable scale floor
 * (0.85) is the only case where horizontal panning is allowed.
 */

export type CourseFitBounds = { x: number; y: number };

export type CourseFitInput = {
  viewportWidth: number;
  viewportHeight: number;
  bounds: CourseFitBounds;
  safeLeft?: number;
  safeRight?: number;
  safeTop?: number;
  safeBottom?: number;
  minScale?: number;
  maxScale?: number;
};

export type CourseFitResult = {
  /** Screen pixels per world unit at the initial fit. */
  pxPerWorld: number;
  /** Group translation that lands the content top at `safeTop`. */
  panX: number;
  panY: number;
  minPanX: number;
  maxPanX: number;
  minPanY: number;
  maxPanY: number;
  /** Width cannot fit at the readable floor; Shift/横向滚动 is required. */
  horizontalOverflow: boolean;
  /** Height needs vertical panning at this scale. */
  verticalOverflow: boolean;
};

export const COURSE_MIN_SCALE = 0.85;
export const COURSE_MAX_SCALE = 1.12;
export const COURSE_SAFE_LEFT = 28;
export const COURSE_SAFE_RIGHT = 28;
export const COURSE_SAFE_TOP = 120;
export const COURSE_SAFE_BOTTOM = 78;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Deterministic initial-fit and pan envelope for a front-facing course plane. */
export function computeCourseFit(input: CourseFitInput): CourseFitResult {
  const width = Math.max(1, input.viewportWidth);
  const height = Math.max(1, input.viewportHeight);
  const safeLeft = input.safeLeft ?? COURSE_SAFE_LEFT;
  const safeRight = input.safeRight ?? COURSE_SAFE_RIGHT;
  const safeTop = input.safeTop ?? COURSE_SAFE_TOP;
  const safeBottom = input.safeBottom ?? COURSE_SAFE_BOTTOM;
  const minScale = input.minScale ?? COURSE_MIN_SCALE;
  const maxScale = input.maxScale ?? COURSE_MAX_SCALE;
  const halfWidth = Math.max(1, input.bounds.x);
  const halfHeight = Math.max(1, input.bounds.y);
  const usableWidth = Math.max(160, width - safeLeft - safeRight);
  const usableHeight = Math.max(160, height - safeTop - safeBottom);
  const widthScale = usableWidth / (halfWidth * 2);
  const pxPerWorld = clamp(widthScale, minScale, maxScale);
  const contentWidth = halfWidth * 2 * pxPerWorld;
  const contentHeight = halfHeight * 2 * pxPerWorld;
  const horizontalOverflow = contentWidth > usableWidth + 0.5;
  const verticalOverflow = contentHeight > usableHeight + 0.5;
  // Screen left/right and top/bottom limits expressed as group translations.
  // Left alignment is positive X, right alignment negative; top alignment is
  // the most negative Y and bottom alignment positive.
  const leftPanX = (safeLeft - width / 2) / pxPerWorld + halfWidth;
  const rightPanX = (width / 2 - safeRight) / pxPerWorld - halfWidth;
  const topPanY = (height / 2 - safeTop) / pxPerWorld - halfHeight;
  const bottomPanY = (safeBottom - height / 2) / pxPerWorld + halfHeight;
  const minPanX = Math.min(leftPanX, rightPanX);
  const maxPanX = Math.max(leftPanX, rightPanX);
  const minPanY = Math.min(topPanY, bottomPanY);
  const maxPanY = Math.max(topPanY, bottomPanY);
  const panX = horizontalOverflow ? leftPanX : clamp(0, minPanX, maxPanX);
  const panY = verticalOverflow ? topPanY : clamp(0, minPanY, maxPanY);
  return {
    pxPerWorld,
    panX,
    panY,
    minPanX,
    maxPanX,
    minPanY,
    maxPanY,
    horizontalOverflow,
    verticalOverflow
  };
}

export type CoursePanEnvelope = {
  minPanX: number;
  maxPanX: number;
  minPanY: number;
  maxPanY: number;
  horizontalOverflow: boolean;
  verticalOverflow: boolean;
};

/** Pan limits for an arbitrary current scale (used by wheel panning and resize). */
export function computeCoursePan(input: {
  viewportWidth: number;
  viewportHeight: number;
  bounds: CourseFitBounds;
  pxPerWorld: number;
  safeLeft?: number;
  safeRight?: number;
  safeTop?: number;
  safeBottom?: number;
}): CoursePanEnvelope {
  const width = Math.max(1, input.viewportWidth);
  const height = Math.max(1, input.viewportHeight);
  const safeLeft = input.safeLeft ?? COURSE_SAFE_LEFT;
  const safeRight = input.safeRight ?? COURSE_SAFE_RIGHT;
  const safeTop = input.safeTop ?? COURSE_SAFE_TOP;
  const safeBottom = input.safeBottom ?? COURSE_SAFE_BOTTOM;
  const halfWidth = Math.max(1, input.bounds.x);
  const halfHeight = Math.max(1, input.bounds.y);
  const scale = Math.max(0.0001, input.pxPerWorld);
  const usableWidth = Math.max(160, width - safeLeft - safeRight);
  const usableHeight = Math.max(160, height - safeTop - safeBottom);
  return {
    minPanX: Math.min((safeLeft - width / 2) / scale + halfWidth, (width / 2 - safeRight) / scale - halfWidth),
    maxPanX: Math.max((safeLeft - width / 2) / scale + halfWidth, (width / 2 - safeRight) / scale - halfWidth),
    minPanY: Math.min((height / 2 - safeTop) / scale - halfHeight, (safeBottom - height / 2) / scale + halfHeight),
    maxPanY: Math.max((height / 2 - safeTop) / scale - halfHeight, (safeBottom - height / 2) / scale + halfHeight),
    horizontalOverflow: halfWidth * 2 * scale > usableWidth + 0.5,
    verticalOverflow: halfHeight * 2 * scale > usableHeight + 0.5
  };
}

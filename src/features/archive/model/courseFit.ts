/**
 * Course-plane camera scale. `readable` is the default: the card's world font
 * must not fall below the design system's smallest body token on screen.
 * `all` is the explicit "适配全图" action and fits every chapter.
 */
export type CourseFitMode = "readable" | "all";

export function coursePlaneScale(input: {
  mode: CourseFitMode;
  fitScale: number;
  minReadablePx: number;
  cardWorldFontPx: number;
}): number {
  const fit = Math.min(1.35, Math.max(0.00001, input.fitScale));
  if (input.mode === "all") return fit;
  const readable = Math.max(0.00001, input.minReadablePx / Math.max(1, input.cardWorldFontPx));
  return Math.min(1.35, Math.max(readable, Math.min(fit, 1)));
}

export type CoursePlaneRect = { x: number; y: number; width: number; height: number };

/**
 * Camera target for the course plane. In readable mode the current chapter is
 * pinned to the left edge (normal padding), so later chapters use the rest of
 * the width. A chapter that fits vertically is centred; a taller chapter is
 * top-aligned so its first nodes are complete. "all" keeps the plane centred.
 */
export function coursePlaneTarget(input: {
  mode: CourseFitMode;
  anchor?: CoursePlaneRect | null;
  centerX: number;
  centerY: number;
  viewportWidth: number;
  viewportHeight: number;
  insets: { left: number; right: number; top: number; bottom: number };
  pxPerWorld: number;
  edgePadding: number;
  availableHeight: number;
}): { x: number; y: number } {
  const px = Math.max(0.00001, input.pxPerWorld);
  const { left, right, top, bottom } = input.insets;
  const planeShiftX = (left - right) / 2 / px;
  const planeShiftY = (top - bottom) / 2 / px;
  if (input.mode === "all" || !input.anchor) {
    return { x: input.centerX - planeShiftX, y: input.centerY + planeShiftY };
  }
  const anchor = input.anchor;
  const x = anchor.x + (input.viewportWidth / 2 - left - input.edgePadding) / px;
  const chapterPixelHeight = anchor.height * px;
  const y = chapterPixelHeight <= input.availableHeight
    ? anchor.y - anchor.height / 2 + (top - bottom) / 2 / px
    : anchor.y - (input.viewportHeight / 2 - top - input.edgePadding) / px;
  return { x, y };
}

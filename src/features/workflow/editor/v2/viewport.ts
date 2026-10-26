export type CanvasViewport = { x: number; y: number; zoom: number };
export type CanvasBounds = { x: number; y: number; width: number; height: number };
export type ScreenBox = { left: number; top: number; right: number; bottom: number };

const fallbackPadding = 16;

/** True when the whole flow bounds (and the requested padding) fit in the visible canvas. */
export function viewportShowsBounds(
  viewport: CanvasViewport,
  bounds: CanvasBounds,
  stage: ScreenBox,
  padding = fallbackPadding,
): boolean {
  if (!Number.isFinite(viewport.zoom) || viewport.zoom <= 0 || bounds.width < 0 || bounds.height < 0) return false;
  const left = bounds.x * viewport.zoom + viewport.x;
  const top = bounds.y * viewport.zoom + viewport.y;
  const right = (bounds.x + bounds.width) * viewport.zoom + viewport.x;
  const bottom = (bounds.y + bounds.height) * viewport.zoom + viewport.y;
  return left >= stage.left + padding && top >= stage.top + padding
    && right <= stage.right - padding && bottom <= stage.bottom - padding;
}

export const overviewFitOptions = { padding: 0.18, minZoom: 0.15, maxZoom: 1 } as const;

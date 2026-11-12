export type PopoverAnchor = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type PopoverSize = { width: number; height: number };
export type PopoverViewport = { width: number; height: number };

/**
 * Place a popover under its trigger, left-aligned where it fits. The same
 * trigger-rect/clamp rule used by the conversation menu keeps it inside the
 * viewport: it flips above when the lower half cannot hold it, then clamps.
 */
export function anchoredPopoverPosition(
  anchor: PopoverAnchor,
  size: PopoverSize,
  viewport: PopoverViewport,
  options: { gap?: number; margin?: number } = {}
) {
  const gap = options.gap ?? 8;
  const margin = options.margin ?? 8;
  const width = Math.min(size.width, Math.max(0, viewport.width - margin * 2));
  const left = Math.max(margin, Math.min(anchor.left, viewport.width - width - margin));
  const below = anchor.bottom + gap;
  const above = anchor.top - gap - size.height;
  const top = below + size.height <= viewport.height - margin
    ? below
    : Math.max(margin, Math.min(above, viewport.height - size.height - margin));
  return { left, top };
}

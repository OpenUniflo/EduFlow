/** Geometry shared by the Works workflow thumbnail and its width test. */
export const THUMB_NODE_WIDTH = 36;
export const THUMB_LINK_WIDTH = 14;
export const THUMB_MORE_WIDTH = 42;
export const THUMB_INLINE_PADDING = 24;

/**
 * Maximum nodes drawn before folding the rest into +N. The +N pill is always
 * budgeted, so a card never overflows even when it has more nodes than fit.
 */
export function thumbnailNodeLimit(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 5;
  const usable = Math.max(0, width - THUMB_INLINE_PADDING);
  const fits = Math.floor((usable - THUMB_MORE_WIDTH) / (THUMB_NODE_WIDTH + THUMB_LINK_WIDTH));
  return Math.max(1, Math.min(12, fits));
}

/** Nodes that fit when no +N pill is needed. */
export function thumbnailFitsAll(count: number, width: number): boolean {
  if (!Number.isFinite(width) || width <= 0) return count <= 5;
  const usable = Math.max(0, width - THUMB_INLINE_PADDING);
  return count * THUMB_NODE_WIDTH + Math.max(0, count - 1) * THUMB_LINK_WIDTH <= usable;
}

export function thumbnailNodes<T>(nodes: readonly T[], width: number) {
  // A +N pill that would hide a single node takes the same room as showing it.
  if (thumbnailFitsAll(nodes.length, width)) return { visible: nodes.slice(), remaining: 0 };
  const limit = thumbnailNodeLimit(width);
  return { visible: nodes.slice(0, limit), remaining: Math.max(0, nodes.length - limit) };
}

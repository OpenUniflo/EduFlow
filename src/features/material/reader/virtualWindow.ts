export type WindowedRange = { start: number; end: number };

/** Inclusive start / exclusive end around one active index. */
export function windowedRange(activeIndex: number, total: number, radius: number): WindowedRange {
  if (total <= 0) return { start: 0, end: 0 };
  const safeRadius = Math.max(0, Math.floor(radius));
  const requested = Number.isFinite(activeIndex) ? Math.floor(activeIndex) : 0;
  const index = Math.min(Math.max(0, requested), total - 1);
  return {
    start: Math.max(0, index - safeRadius),
    end: Math.min(total, index + safeRadius + 1)
  };
}

export type OutlineVirtualRow = { height: number };

export type OutlineWindow = {
  start: number;
  end: number;
  top: number;
  totalHeight: number;
};

/**
 * Rows have different heights (group header vs segment), so the visible range
 * is found from their cumulative offsets rather than from a fixed row size.
 */
export function outlineWindow(
  rows: readonly OutlineVirtualRow[],
  scrollTop: number,
  viewportHeight: number,
  overscan = 160
): OutlineWindow {
  const totalHeight = rows.reduce((sum, row) => sum + Math.max(0, row.height), 0);
  if (!rows.length) return { start: 0, end: 0, top: 0, totalHeight };
  const safeTop = Math.max(0, Number.isFinite(scrollTop) ? scrollTop : 0);
  const safeViewport = Math.max(1, Number.isFinite(viewportHeight) ? viewportHeight : 1);
  const visibleTop = Math.max(0, safeTop - Math.max(0, overscan));
  const visibleBottom = safeTop + safeViewport + Math.max(0, overscan);
  let offset = 0;
  let start = 0;
  while (start < rows.length && offset + rows[start].height < visibleTop) {
    offset += rows[start].height;
    start += 1;
  }
  let end = start;
  let cursor = offset;
  while (end < rows.length && cursor <= visibleBottom) {
    cursor += rows[end].height;
    end += 1;
  }
  return { start, end, top: offset, totalHeight };
}

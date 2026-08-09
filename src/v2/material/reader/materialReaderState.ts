export type MaterialNavigationReason = "initial" | "external" | "outline" | "previous" | "next";

export type MaterialNavigationRequest = {
  token: number;
  segmentId: string;
  page: number;
  behavior: ScrollBehavior;
  reason: MaterialNavigationReason;
};

export type VisiblePageCandidate = {
  page: number;
  segmentId: string;
  top: number;
  bottom: number;
  intersectionRatio: number;
};

export function selectPageAtReadingAnchor(candidates: VisiblePageCandidate[], rootTop: number, rootHeight: number) {
  const anchor = rootTop + rootHeight * 0.42;
  return [...candidates].sort((left, right) => {
    const leftContains = left.top <= anchor && left.bottom >= anchor;
    const rightContains = right.top <= anchor && right.bottom >= anchor;
    if (leftContains !== rightContains) return leftContains ? -1 : 1;
    const leftDistance = Math.abs((left.top + left.bottom) / 2 - anchor);
    const rightDistance = Math.abs((right.top + right.bottom) / 2 - anchor);
    return leftDistance - rightDistance || right.intersectionRatio - left.intersectionRatio || left.page - right.page;
  })[0] ?? null;
}

export function shouldHandleExternalSegment(input: {
  requestedSegmentId: string | null;
  activeSegmentId: string;
  validSegmentIds: Set<string>;
  readerWrittenSegmentId: string | null;
}) {
  if (!input.requestedSegmentId || !input.validSegmentIds.has(input.requestedSegmentId)) return false;
  if (input.readerWrittenSegmentId === input.requestedSegmentId) return false;
  return input.requestedSegmentId !== input.activeSegmentId;
}

export function classifySegmentQueryChange(previous: string | null, next: string | null, readerWrittenSegmentId: string | null) {
  if (previous === next) return "unchanged" as const;
  if (next && next === readerWrittenSegmentId) return "reader" as const;
  return "external" as const;
}

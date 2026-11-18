import type { MaterialSegment } from "@/features/course/types";

export type MaterialOutlineGroup = {
  id: string;
  title: string;
  segments: MaterialSegment[];
};

export type MaterialOutlineRow =
  | { kind: "group"; group: MaterialOutlineGroup; expanded: boolean; height: number }
  | { kind: "segment"; group: MaterialOutlineGroup; segment: MaterialSegment; height: number };

export const OUTLINE_GROUP_HEIGHT = 36;
export const OUTLINE_SEGMENT_HEIGHT = 52;

function groupTitle(segment: MaterialSegment): string {
  return segment.section?.trim() || "全书";
}

/**
 * Groups a Material's ordered Segments by their authored section. A Material
 * without sections stays one group, so the reader still folds the long list.
 */
export function groupMaterialOutline(segments: readonly MaterialSegment[]): MaterialOutlineGroup[] {
  const groups = new Map<string, MaterialOutlineGroup>();
  for (const segment of segments) {
    const title = groupTitle(segment);
    const id = `outline-group:${title}`;
    const existing = groups.get(id);
    if (existing) existing.segments.push(segment);
    else groups.set(id, { id, title, segments: [segment] });
  }
  return [...groups.values()];
}

/** The active section is expanded on first paint; everything else stays folded. */
export function initialExpandedOutlineGroups(groups: readonly MaterialOutlineGroup[], activeSegmentId: string): Set<string> {
  const active = groups.find((group) => group.segments.some((segment) => segment.id === activeSegmentId));
  return new Set(active ? [active.id] : groups[0] ? [groups[0].id] : []);
}

export function buildOutlineRows(groups: readonly MaterialOutlineGroup[], expanded: ReadonlySet<string>): MaterialOutlineRow[] {
  return groups.flatMap((group): MaterialOutlineRow[] => {
    const open = expanded.has(group.id);
    return [
      { kind: "group", group, expanded: open, height: OUTLINE_GROUP_HEIGHT },
      ...(open ? group.segments.map((segment): MaterialOutlineRow => ({ kind: "segment", group, segment, height: OUTLINE_SEGMENT_HEIGHT })) : [])
    ];
  });
}

export function groupIdForSegment(groups: readonly MaterialOutlineGroup[], segmentId: string): string | undefined {
  return groups.find((group) => group.segments.some((segment) => segment.id === segmentId))?.id;
}

import { describe, expect, it } from "vitest";
import type { MaterialSegment } from "@/features/course/types";
import { buildOutlineRows, groupMaterialOutline, initialExpandedOutlineGroups } from "./materialOutlineModel";

function segment(id: string, section?: string): MaterialSegment {
  return { id, materialId: "m1", order: Number(id.replace(/\D/g, "")) || 1, ...(section ? { section } : {}) } as MaterialSegment;
}

const segments = [
  segment("s1", "第一章"),
  segment("s2", "第一章"),
  segment("s3", "第二章"),
  segment("s4")
];

describe("material outline grouping", () => {
  it("folds the ordered Segments by authored section and keeps an unsectioned Material in one group", () => {
    const groups = groupMaterialOutline(segments);
    expect(groups.map((group) => group.title)).toEqual(["第一章", "第二章", "全书"]);
    expect(groups[0].segments.map((item) => item.id)).toEqual(["s1", "s2"]);
  });

  it("expands only the section that contains the active Segment by default", () => {
    const groups = groupMaterialOutline(segments);
    expect([...initialExpandedOutlineGroups(groups, "s3")]).toEqual(["outline-group:第二章"]);
    expect([...initialExpandedOutlineGroups(groups, "missing")]).toEqual(["outline-group:第一章"]);
  });

  it("renders one row per collapsed section and the active section's Segment rows", () => {
    const groups = groupMaterialOutline(segments);
    const rows = buildOutlineRows(groups, initialExpandedOutlineGroups(groups, "s2"));
    expect(rows.map((row) => row.kind === "group" ? row.group.title : row.segment.id)).toEqual([
      "第一章", "s1", "s2", "第二章", "全书"
    ]);
    expect(rows[0].height).toBe(36);
    expect(rows[1].height).toBe(52);
  });
});

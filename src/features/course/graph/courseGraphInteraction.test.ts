import { describe, expect, it } from "vitest";
import { findChapterDropTarget, shouldReserveCourseDrawer, toChapterRelativePosition } from "./courseGraphInteraction";

describe("course graph interaction", () => {
  it("does not reserve Drawer width for a retained selection after close", () => {
    const selectedAnchor = { kind: "knowledge" as const, id: "A" };
    expect(shouldReserveCourseDrawer({ drawerVisible: true, selectedAnchor, materialsOpen: false })).toBe(true);
    expect(shouldReserveCourseDrawer({ drawerVisible: false, selectedAnchor, materialsOpen: false })).toBe(false);
  });

  it("resolves a cross-Chapter drop and stores target-relative coordinates", () => {
    const chapters = [
      { id: "chapter-a", x: 0, y: 0, width: 300, height: 300 },
      { id: "chapter-b", x: 400, y: 20, width: 320, height: 340 }
    ];
    const node = { id: "knowledge-a", x: 455, y: 140, width: 194, height: 108 };
    expect(findChapterDropTarget(node, chapters)).toBe("chapter-b");
    expect(toChapterRelativePosition(node, chapters[1])).toEqual({ x: 55, y: 120 });
  });
});

import { describe, expect, it } from "vitest";
import { PLANE_CARD_GAP, PLANE_CARD_HEIGHT, PLANE_CARD_WIDTH, PLANE_CHAPTER_GAP, buildPlaneChapterLayout, type PlaneChapterLayout } from "@/features/course/graph/elkCourseLayout";
import { buildDraftPlane, composeCoursePlane } from "./coursePlaneLayout";

function local(chapterId: string, rows: number, columns = 1): PlaneChapterLayout {
  const nodes: PlaneChapterLayout["nodes"] = [];
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      nodes.push({
        nodeId: `${chapterId}-${column}-${row}`,
        x: 28 + column * (PLANE_CARD_WIDTH + 34),
        y: 64 + row * (PLANE_CARD_HEIGHT + 34),
        width: PLANE_CARD_WIDTH,
        height: PLANE_CARD_HEIGHT
      });
    }
  }
  return {
    chapterId,
    width: 28 + columns * PLANE_CARD_WIDTH + (columns - 1) * 34 + 28,
    height: 64 + rows * PLANE_CARD_HEIGHT + (rows - 1) * 34 + 28,
    nodes
  };
}

function cardRects(plane: ReturnType<typeof composeCoursePlane>) {
  return Object.entries(plane.positions).map(([id, point]) => ({
    id,
    x: point.x - plane.cardWidth / 2,
    y: point.y - plane.cardHeight / 2,
    width: plane.cardWidth,
    height: plane.cardHeight
  }));
}

function overlaps(left: { x: number; y: number; width: number; height: number }, right: { x: number; y: number; width: number; height: number }) {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

describe("course plane card footprint", () => {
  it("keeps positions, chapter order and the exact card world size used by ELK", () => {
    const plane = composeCoursePlane(
      new Map([["ch1", local("ch1", 2)], ["ch2", local("ch2", 1)]]),
      [{ id: "ch1", title: "第一章", order: 1 }, { id: "ch2", title: "第二章", order: 2 }],
      "elk-course"
    );
    expect(plane.cardWidth).toBe(PLANE_CARD_WIDTH);
    expect(plane.cardHeight).toBe(PLANE_CARD_HEIGHT);
    expect(plane.chapters.map((chapter) => chapter.title)).toEqual(["第一章", "第二章"]);
    expect(plane.chapters[0].x).toBeLessThan(plane.chapters[1].x);
    expect(Object.keys(plane.positions)).toHaveLength(3);
  });

  it("produces zero overlap between same-plane card footprints", () => {
    const plane = composeCoursePlane(
      new Map([["ch1", local("ch1", 3, 2)], ["ch2", local("ch2", 4)], ["ch3", local("ch3", 1)]]),
      [
        { id: "ch1", title: "第一章", order: 1 },
        { id: "ch2", title: "第二章", order: 2 },
        { id: "ch3", title: "第三章", order: 3 }
      ],
      "elk-course"
    );
    const rects = cardRects(plane);
    for (let left = 0; left < rects.length; left += 1) {
      for (let right = left + 1; right < rects.length; right += 1) {
        expect(overlaps(rects[left], rects[right]), `${rects[left].id} overlaps ${rects[right].id}`).toBe(false);
      }
    }
  });

  it("keeps every card footprint inside the plane bounds and chapter boxes disjoint", () => {
    const plane = composeCoursePlane(
      new Map([["a", local("a", 5)], ["b", local("b", 3)], ["c", local("c", 2)]]),
      [{ id: "a", title: "A", order: 1 }, { id: "b", title: "B", order: 2 }, { id: "c", title: "C", order: 3 }],
      "elk-course"
    );
    const halfWidth = plane.width / 2;
    const halfHeight = plane.height / 2;
    cardRects(plane).forEach((rect) => {
      expect(rect.x).toBeGreaterThanOrEqual(-halfWidth - 0.001);
      expect(rect.x + rect.width).toBeLessThanOrEqual(halfWidth + 0.001);
      expect(rect.y).toBeGreaterThanOrEqual(-halfHeight - 0.001);
      expect(rect.y + rect.height).toBeLessThanOrEqual(halfHeight + 0.001);
    });
    for (let left = 0; left < plane.chapters.length; left += 1) {
      for (let right = left + 1; right < plane.chapters.length; right += 1) {
        const a = plane.chapters[left];
        const b = plane.chapters[right];
        const overlap = a.x < b.x + b.width && a.x + a.width > b.x && a.y - a.height < b.y && a.y > b.y - b.height;
        expect(overlap).toBe(false);
      }
    }
  });

  it("asks ELK for nodes exactly the size of the rendered card", async () => {
    const chapter = await buildPlaneChapterLayout({
      chapterId: "ch1",
      nodes: [{ id: "k1", lesson: 1 }, { id: "k2", lesson: 2 }],
      edges: [{ id: "e1", source: "k1", target: "k2", relation: "prerequisite" }]
    });
    expect(chapter.nodes).toHaveLength(2);
    chapter.nodes.forEach((node) => {
      expect(node.width).toBe(PLANE_CARD_WIDTH);
      expect(node.height).toBe(PLANE_CARD_HEIGHT);
    });
    // Compact plane pitch: card width + 32 / card height + 16, adjacent
    // chapter columns touch (gap 0). This is what lets the camera stay close
    // enough for readable 12px card names.
    expect(PLANE_CARD_GAP).toBe(16);
    expect(PLANE_CHAPTER_GAP).toBe(0);
    expect(chapter.width).toBe(PLANE_CARD_WIDTH + 20);
    expect(chapter.nodes[1].y - chapter.nodes[0].y).toBe(PLANE_CARD_HEIGHT + PLANE_CARD_GAP);
  });
});

describe("draft plane", () => {
  it("lays the brief's draft knowledge set out with the same card footprint", async () => {
    const plane = await buildDraftPlane({
      ids: ["k1", "k2", "k3"],
      edges: [
        { id: "e1", source: "k1", target: "k2", relation: "prerequisite" },
        { id: "e2", source: "k2", target: "k3", relation: "enables" }
      ],
      titles: new Map([["k1", "知识一"], ["k2", "知识二"], ["k3", "知识三"]])
    });
    expect(plane.source).toBe("elk-draft");
    expect(Object.keys(plane.positions).sort()).toEqual(["k1", "k2", "k3"]);
    expect(plane.chapters).toHaveLength(1);
    expect(plane.cardWidth).toBe(PLANE_CARD_WIDTH);
    expect(plane.cardHeight).toBe(PLANE_CARD_HEIGHT);
    expect(plane.width).toBeGreaterThan(0);
    expect(plane.height).toBeGreaterThan(0);
  });
});

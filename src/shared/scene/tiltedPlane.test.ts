import { describe, expect, it } from "vitest";
import {
  chooseExcentricNodes,
  chooseTiltedLabels,
  clampToPanBounds,
  findExcentricCluster,
  layoutExcentric,
  layoutExcentricOutside,
  layoutSelectionLabels,
  overlapRatio,
  panBoundsFor,
  panOffsetToBounds,
  pickScreenSpace,
  simplificationForAngle,
  simplificationForView,
  tiltAngleDegrees,
  type ExcentricNode,
  type TiltedLabelCandidate,
  type TiltedSelectionLabelCandidate
} from "./tiltedPlane";

const measure = (text: string) => text.length * 12;

describe("tiltAngleDegrees", () => {
  it("is 0 at the front, 90 edge-on and 180 from behind", () => {
    expect(tiltAngleDegrees({ x: 0, y: 0, z: 1 })).toBeCloseTo(0);
    expect(tiltAngleDegrees({ x: 1, y: 0, z: 0 })).toBeCloseTo(90);
    expect(tiltAngleDegrees({ x: 0, y: 0, z: -1 })).toBeCloseTo(180);
  });
});

describe("simplificationForAngle", () => {
  it("keeps the full card through 35 degrees", () => {
    const state = simplificationForAngle(30);
    expect(state.stage).toBe("full");
    expect(state.pill).toBe(0);
    expect(state.extra).toBe(1);
    expect(state.outsideName).toBe(0);
  });

  it("creates a name-only capsule between 35 and 55", () => {
    const early = simplificationForAngle(36);
    expect(early.stage).toBe("pill");
    expect(early.extra).toBeGreaterThan(0.9);
    expect(simplificationForAngle(41).extra).toBeLessThan(0.2);
    expect(early.cardName).toBe(1);
    expect(early.outsideName).toBe(0);
    const late = simplificationForAngle(50);
    expect(late.pill).toBeGreaterThan(0.95);
    expect(late.dot).toBe(0);
    expect(late.chapterTitle).toBe(0);
  });

  it("crossfades the capsule name into the outside name complementarily", () => {
    for (const angle of [55, 56, 57, 58, 59, 60]) {
      const state = simplificationForAngle(angle);
      expect(state.cardName + state.outsideName).toBeCloseTo(1, 5);
    }
  });

  it("leaves only a point and the outside name after 65", () => {
    const state = simplificationForAngle(75);
    expect(state.stage).toBe("dot");
    expect(state.dot).toBe(1);
    expect(state.cardName).toBe(0);
    expect(state.outsideName).toBe(1);
    expect(state.back).toBe(0);
    expect(simplificationForAngle(150).back).toBe(1);
  });

  it("is continuous at the stage boundaries", () => {
    const around35 = [34.9, 35, 35.1].map((angle) => simplificationForAngle(angle).pill);
    const around55 = [54.9, 55, 55.1].map((angle) => simplificationForAngle(angle).cardName);
    expect(Math.abs(around35[2] - around35[1])).toBeLessThan(0.01);
    expect(Math.abs(around55[2] - around55[1])).toBeLessThan(0.01);
  });
});

describe("simplificationForView", () => {
  it("uses screen width when the plane faces the camera", () => {
    expect(simplificationForView({ theta: 0, screenWidth: 150 }).stage).toBe("full");
    expect(simplificationForView({ theta: 0, screenWidth: 80 }).stage).toBe("pill");
    expect(simplificationForView({ theta: 0, screenWidth: 40 }).stage).toBe("dot");
    expect(simplificationForView({ theta: 0, screenWidth: 40 }).dot).toBe(1);
  });

  it("uses the angle when the plane is turned, even at full zoom", () => {
    expect(simplificationForView({ theta: 52, screenWidth: 150 }).stage).toBe("pill");
    expect(simplificationForView({ theta: 75, screenWidth: 150 }).stage).toBe("dot");
    expect(simplificationForView({ theta: 75, screenWidth: 150 }).dot).toBe(1);
  });

  it("carries a hysteresis gap when zooming across a boundary", () => {
    // A remembered dot survives up to 66px; a remembered pill needs a wider
    // card before it expands back to full.
    expect(simplificationForView({ theta: 0, screenWidth: 70, previousSizeStage: "dot" }).stage).toBe("pill");
    expect(simplificationForView({ theta: 0, screenWidth: 59, previousSizeStage: "dot" }).stage).toBe("dot");
    expect(simplificationForView({ theta: 0, screenWidth: 100, previousSizeStage: "pill" }).stage).toBe("pill");
    expect(simplificationForView({ theta: 0, screenWidth: 130, previousSizeStage: "full" }).stage).toBe("full");
  });

  it("is continuous across the size boundary", () => {
    const near = [116, 116.001, 116.002].map((width) => simplificationForView({ theta: 0, screenWidth: width, previousSizeStage: "full" }).pill);
    expect(Math.max(...near) - Math.min(...near)).toBeLessThan(0.02);
  });
});

function candidate(overrides: Partial<TiltedLabelCandidate> & Pick<TiltedLabelCandidate, "id" | "x" | "y">): TiltedLabelCandidate {
  return {
    distance: 1000,
    diameter: 20,
    visibility: 1,
    priority: 3,
    text: overrides.id,
    ...overrides
  };
}

const baseOptions = { width: 1440, height: 900, measure, maxLabels: 8 };

describe("chooseTiltedLabels", () => {
  it("applies hysteresis: an existing name survives below the entry threshold", () => {
    const nodes = [candidate({ id: "near", x: 200, y: 200, diameter: 12, distance: 800 }), candidate({ id: "new", x: 800, y: 500, diameter: 13 })];
    const withoutPrevious = chooseTiltedLabels(nodes, { ...baseOptions, previous: new Set() });
    expect(withoutPrevious.map((choice) => choice.id)).not.toContain("near");
    const withPrevious = chooseTiltedLabels(nodes, { ...baseOptions, previous: new Set(["near"]) });
    expect(withPrevious.map((choice) => choice.id)).toContain("near");
  });

  it("caps the set at eight and orders selection > current > route > rest", () => {
    const nodes = Array.from({ length: 12 }, (_, index) => candidate({
      id: `n${index}`,
      x: 100 + (index % 6) * 200,
      y: 200 + Math.floor(index / 6) * 200,
      priority: index === 0 ? 0 : index === 1 ? 1 : index === 2 ? 2 : 3,
      distance: 500 + index
    }));
    const chosen = chooseTiltedLabels(nodes, { ...baseOptions, previous: new Set(nodes.map((node) => node.id)) });
    expect(chosen).toHaveLength(8);
    expect(chosen[0].id).toBe("n0");
    expect(chosen[1].id).toBe("n1");
    expect(chosen[2].id).toBe("n2");
  });

  it("adds a hovered name without dropping the distance / fit names", () => {
    const grid = Array.from({ length: 8 }, (_, index) => candidate({
      id: `n${index}`,
      x: 200 + (index % 4) * 300,
      y: 250 + Math.floor(index / 4) * 400,
      distance: 800 + index
    }));
    const hovered = candidate({ id: "hovered", x: 700, y: 450, priority: 0, distance: 300 });
    const previous = new Set([...grid.map((node) => node.id), hovered.id]);
    const chosen = chooseTiltedLabels([...grid, hovered], { ...baseOptions, maxLabels: 9, previous });
    const ids = chosen.map((choice) => choice.id);
    expect(ids).toContain("hovered");
    grid.forEach((node) => expect(ids).toContain(node.id));
    expect(chosen).toHaveLength(9);
  });

  it("hides a name when every anchor collides instead of relocating it", () => {
    const nodes = [candidate({ id: "selected", x: 300, y: 300, priority: 0 }), candidate({ id: "other", x: 300, y: 300 })];
    const chosen = chooseTiltedLabels(nodes, { ...baseOptions, previous: new Set(["selected", "other"]), exclusions: [{ x: 0, y: 0, width: 1440, height: 900 }] });
    expect(chosen).toEqual([]);
  });

  it("is deterministic for equal priority and distance", () => {
    const nodes = [candidate({ id: "b", x: 400, y: 260 }), candidate({ id: "a", x: 600, y: 260 })];
    const first = chooseTiltedLabels(nodes, baseOptions).map((choice) => choice.id);
    const second = chooseTiltedLabels([...nodes].reverse(), baseOptions).map((choice) => choice.id);
    expect(first).toEqual(second);
  });

  it("varies the anchor instead of stacking labels", () => {
    const nodes = [candidate({ id: "a", x: 500, y: 400 }), candidate({ id: "b", x: 506, y: 400 }), candidate({ id: "c", x: 512, y: 400 })];
    const chosen = chooseTiltedLabels(nodes, { ...baseOptions, previous: new Set(nodes.map((node) => node.id)) });
    const anchors = chosen.map((choice) => choice.anchor);
    expect(new Set(anchors).size).toBeGreaterThan(1);
    for (let index = 0; index < chosen.length; index += 1) {
      for (let other = index + 1; other < chosen.length; other += 1) {
        expect(overlapRatio(chosen[index].rect, chosen[other].rect)).toBeLessThan(0.01);
      }
    }
  });

  it("dims farther automatic labels to about 60%", () => {
    const nodes = [
      candidate({ id: "a", x: 300, y: 300, distance: 500 }),
      candidate({ id: "b", x: 900, y: 300, distance: 1500 })
    ];
    const chosen = chooseTiltedLabels(nodes, { ...baseOptions, previous: new Set(["a", "b"]) });
    const far = chosen.find((choice) => choice.id === "b");
    expect(far?.alpha).toBeCloseTo(0.6, 1);
  });
});

describe("layoutSelectionLabels", () => {
  const column = [
    { id: "R08", text: "Evaluator", y: 340.5 },
    { id: "R11", text: "Plan Monitoring", y: 366 },
    { id: "R07", text: "Reflection", y: 391.4, selected: true },
    { id: "R06", text: "Replanning", y: 416.9 },
    { id: "R09", text: "Evaluator-Optimizer", y: 442.4 }
  ];
  const input: TiltedSelectionLabelCandidate[] = column.map((item, index) => ({
    id: item.id,
    x: 565.2,
    y: item.y,
    distance: 4440 - index * 6,
    diameter: item.selected ? 34 : 8,
    text: item.text,
    width: Math.max(24, item.text.length * 7.2 + 18),
    selected: item.selected
  }));
  // The selected node carries a 34px ring; the other nodes carry small points.
  const markers = input.map((item) => {
    const size = item.selected ? 34 : 16;
    return { id: item.id, x: item.x - size / 2, y: item.y - size / 2, width: size, height: size };
  });

  it("keeps one name per related node in a dense same-column cluster", () => {
    const chosen = layoutSelectionLabels(input, { width: 1440, height: 900, selectedId: "R07", markers });
    expect(chosen).toHaveLength(input.length);
    expect(chosen.map((choice) => choice.id).sort()).toEqual(input.map((item) => item.id).sort());
    for (let index = 0; index < chosen.length; index += 1) {
      for (let other = index + 1; other < chosen.length; other += 1) {
        expect(overlapRatio(chosen[index].rect, chosen[other].rect)).toBe(0);
      }
      for (const marker of markers) {
        expect(overlapRatio(chosen[index].rect, marker)).toBe(0);
      }
    }
  });

  it("moves names outward with a leader instead of dropping them when a HUD covers the anchor", () => {
    const chosen = layoutSelectionLabels(input, {
      width: 1440,
      height: 900,
      selectedId: "R07",
      markers,
      exclusions: [{ x: 0, y: 300, width: 760, height: 220 }]
    });
    expect(chosen).toHaveLength(input.length);
    expect(chosen.filter((choice) => choice.leader).length).toBeGreaterThan(0);
  });
});

describe("excentric labels", () => {
  const nodes: ExcentricNode[] = Array.from({ length: 7 }, (_, index) => ({
    id: `n${index}`,
    x: 500 + index * 4,
    y: 400 + (index % 3) * 12,
    distance: 1000 + index,
    visibility: 1,
    text: `知识 ${index}`
  }));

  it("requires at least three nodes within the pick radius and picks at most six", () => {
    expect(chooseExcentricNodes(nodes.slice(0, 2), { x: 500, y: 400 }, { radius: 50 })).toEqual([]);
    const chosen = chooseExcentricNodes(nodes, { x: 500, y: 400 }, { radius: 50 });
    expect(chosen).toHaveLength(6);
    expect(chosen.every((node) => Math.hypot(node.x - 500, node.y - 400) <= 50)).toBe(true);
  });

  it("uses the 22px pick radius by default", () => {
    const inside = [
      { ...nodes[0], x: 500, y: 400 },
      { ...nodes[1], x: 518, y: 400 },
      { ...nodes[2], x: 500, y: 418 }
    ];
    expect(chooseExcentricNodes(inside, { x: 500, y: 400 })).toHaveLength(3);
    const outside = inside.map((node) => ({ ...node, x: node.x + 40 }));
    expect(chooseExcentricNodes(outside, { x: 500, y: 400 })).toEqual([]);
  });

  it("sorts rows by screen y and keeps the column inside the viewport", () => {
    const layout = layoutExcentric(chooseExcentricNodes(nodes, { x: 500, y: 400 }, { radius: 50 }), { x: 500, y: 400 }, { width: 1440, height: 900 }, { measure });
    expect(layout).not.toBeNull();
    const ys = layout!.rows.map((row) => row.text);
    const reordered = [...layout!.rows].sort((left, right) => left.y - right.y).map((row) => row.text);
    expect(ys).toEqual(reordered);
    for (const row of layout!.rows) {
      expect(row.x).toBeGreaterThanOrEqual(0);
      expect(row.x + row.width).toBeLessThanOrEqual(1440);
      expect(row.y + row.height).toBeLessThanOrEqual(900);
    }
    expect(layout!.lines).toHaveLength(6);
  });

  it("flips the column to the left near the right edge", () => {
    const nearRight = nodes.map((node) => ({ ...node, x: 1380 }));
    const layout = layoutExcentric(chooseExcentricNodes(nearRight, { x: 1380, y: 400 }, { radius: 50 }), { x: 1380, y: 400 }, { width: 1440, height: 900 }, { measure });
    expect(layout!.x + layout!.width).toBeLessThanOrEqual(1440);
  });

  it("finds a dense cluster with a small snap when the camera is settling", () => {
    const cluster = findExcentricCluster([
      { ...nodes[0], x: 500, y: 400 },
      { ...nodes[1], x: 518, y: 400 },
      { ...nodes[2], x: 500, y: 423 }
    ], { x: 500, y: 400 }, { radius: 22, minNodes: 3, snap: 7 });
    expect(cluster).not.toBeNull();
    expect(cluster!.nodes.length).toBeGreaterThanOrEqual(3);
    expect(Math.hypot(cluster!.anchor.x - 500, cluster!.anchor.y - 400)).toBeLessThanOrEqual(7);
  });

  it("does not invent a cluster when only two nodes are inside the radius", () => {
    expect(findExcentricCluster([
      { ...nodes[0], x: 500, y: 400 },
      { ...nodes[1], x: 518, y: 400 },
      { ...nodes[2], x: 600, y: 400 }
    ], { x: 500, y: 400 }, { radius: 22, minNodes: 3, snap: 7 })).toBeNull();
  });

  it("places the excentric list outside the plane bounding box without crossing lines", () => {
    const plane = { x: 300, y: 150, width: 640, height: 520 };
    const chosen = chooseExcentricNodes(nodes, { x: 500, y: 400 }, { radius: 50 });
    const layout = layoutExcentricOutside(chosen, { x: 500, y: 400 }, { width: 1440, height: 900 }, plane, { measure });
    expect(layout).not.toBeNull();
    expect(layout!.x).toBeGreaterThanOrEqual(plane.x + plane.width);
    expect(layout!.lines).toHaveLength(chosen.length);
    const rowYs = layout!.rows.map((row) => row.y);
    expect(rowYs).toEqual([...rowYs].sort((left, right) => left - right));
    const nodeYs = [...chosen].sort((left, right) => left.y - right.y).map((node) => node.y);
    expect(nodeYs).toEqual([...nodeYs].sort((left, right) => left - right));
  });
});

describe("pickScreenSpace", () => {
  it("uses a 22px minimum radius independent of the drawn marker", () => {
    const candidates = [{ id: "tiny", x: 100, y: 100, distance: 500 }];
    expect(pickScreenSpace(candidates, { x: 118, y: 100 })).toBe("tiny");
    expect(pickScreenSpace(candidates, { x: 130, y: 100 })).toBeNull();
  });

  it("accepts a card body even when the pointer is far from the anchor", () => {
    const candidates = [{ id: "card", x: 100, y: 100, distance: 500, rect: { x: 40, y: 80, width: 160, height: 40 } }];
    expect(pickScreenSpace(candidates, { x: 190, y: 100 })).toBe("card");
  });

  it("resolves overlap to the nearest camera candidate", () => {
    const candidates = [
      { id: "far", x: 100, y: 100, distance: 1400 },
      { id: "near", x: 104, y: 100, distance: 600 }
    ];
    expect(pickScreenSpace(candidates, { x: 102, y: 100 })).toBe("near");
  });

  it("works for a point behind the plane (no depth rejection)", () => {
    const candidates = [{ id: "back", x: 500, y: 300, distance: 2000 }];
    expect(pickScreenSpace(candidates, { x: 500, y: 300 })).toBe("back");
  });

  it("keeps knowledge over capability and reflection at the same screen position", () => {
    const candidates = [
      { id: "reflection", x: 100, y: 100, distance: 600, priority: 2 },
      { id: "capability", x: 100, y: 100, distance: 900, priority: 1 },
      { id: "knowledge", x: 100, y: 100, distance: 1200, priority: 0 }
    ];
    expect(pickScreenSpace(candidates, { x: 100, y: 100 })).toBe("knowledge");
    expect(pickScreenSpace(candidates.filter((candidate) => candidate.id !== "knowledge"), { x: 100, y: 100 })).toBe("capability");
  });

  it("does not let a reflection win unless it is clearly closer to the pointer", () => {
    const overlap = [
      { id: "knowledge", x: 100, y: 100, distance: 1200, priority: 0 },
      // 4px closer, i.e. inside the same visible marker: Knowledge still wins.
      { id: "reflection", x: 104, y: 100, distance: 600, priority: 2 }
    ];
    expect(pickScreenSpace(overlap, { x: 100, y: 100 })).toBe("knowledge");
    const clearlyCloser = [
      { id: "knowledge", x: 112, y: 100, distance: 1200, priority: 0 },
      { id: "reflection", x: 100, y: 100, distance: 600, priority: 2 }
    ];
    expect(pickScreenSpace(clearlyCloser, { x: 100, y: 100 })).toBe("reflection");
  });

  it("never returns an invisible or undrawn node", () => {
    const candidates = [
      { id: "hidden", x: 100, y: 100, distance: 600, visible: false },
      { id: "visible", x: 110, y: 100, distance: 1200, visible: true }
    ];
    expect(pickScreenSpace(candidates, { x: 100, y: 100 })).toBe("visible");
    expect(pickScreenSpace([candidates[0]], { x: 100, y: 100 })).toBeNull();
  });

  it("lets a front card body win over a marker underneath it", () => {
    const candidates = [
      // The offset reflection is marginally nearer in camera distance but the
      // Knowledge card still owns the overlapping body.
      { id: "reflection", x: 100, y: 100, distance: 700, priority: 2, rect: { x: 90, y: 90, width: 60, height: 50 } },
      { id: "knowledge", x: 100, y: 100, distance: 800, priority: 0, rect: { x: 80, y: 80, width: 60, height: 40 } }
    ];
    expect(pickScreenSpace(candidates, { x: 100, y: 100 })).toBe("knowledge");
    // Only the reflection's peeking bottom is under the pointer.
    expect(pickScreenSpace(candidates, { x: 100, y: 125 })).toBe("reflection");
  });
});

describe("pan bounds", () => {
  const points = [
    { x: -400, y: -200, z: 0 },
    { x: 400, y: 220, z: -320 },
    { x: 0, y: 0, z: 120 }
  ];

  it("includes every layer with padding", () => {
    const bounds = panBoundsFor(points, 100)!;
    expect(bounds.minX).toBe(-500);
    expect(bounds.maxX).toBe(500);
    expect(bounds.minZ).toBe(-420);
    expect(bounds.maxZ).toBe(220);
  });

  it("clamps a target to the box and reports the required offset", () => {
    const bounds = panBoundsFor(points, 100)!;
    expect(clampToPanBounds({ x: 900, y: 0, z: 0 }, bounds)).toEqual({ x: 500, y: 0, z: 0 });
    expect(panOffsetToBounds({ x: 0, y: 0, z: 0 }, bounds)).toBeNull();
    expect(panOffsetToBounds({ x: 900, y: 0, z: 0 }, bounds)).toEqual({ x: -400, y: 0, z: 0 });
  });
});

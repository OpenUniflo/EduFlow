import { describe, expect, it } from "vitest";
import { selectionXraySegments, type XrayScreenPoint } from "./xray";

const screen = (points: Record<string, XrayScreenPoint>) => (id: string) => points[id] ?? null;

describe("selectionXraySegments", () => {
  it("connects from the selected node to a neighbour that is the edge target", () => {
    const result = selectionXraySegments({
      selectedId: "target",
      edges: [{ id: "e1", source: "source", target: "target" }],
      screenFor: screen({
        target: { x: 100, y: 100, z: 0 },
        source: { x: 40, y: 80, z: 0 }
      })
    });
    expect(result.segments).toEqual([{ x1: 100, y1: 100, x2: 40, y2: 80 }]);
    expect(result.neighborIds).toEqual(["source"]);
  });

  it("draws one line when capability support and graph edges repeat a pair", () => {
    const result = selectionXraySegments({
      selectedId: "selected",
      edges: [
        { id: "plain", source: "selected", target: "capability" },
        { id: "cap", source: "selected", target: "capability" },
        { id: "cap-reverse", source: "capability", target: "selected" }
      ],
      screenFor: screen({
        selected: { x: 200, y: 120, z: 0 },
        capability: { x: 260, y: 90, z: 0 }
      })
    });
    expect(result.segments).toHaveLength(1);
    expect(result.neighborIds).toEqual(["capability"]);
  });

  it("skips a neighbour outside the frustum and keeps the visible one", () => {
    const result = selectionXraySegments({
      selectedId: "selected",
      edges: [
        { id: "near", source: "selected", target: "near" },
        { id: "far", source: "selected", target: "far" }
      ],
      screenFor: screen({
        selected: { x: 0, y: 0, z: 0 },
        near: { x: 10, y: 10, z: 0.5 },
        far: { x: 30, y: 30, z: 1.2 }
      })
    });
    expect(result.neighborIds).toEqual(["near"]);
    expect(result.segments).toEqual([{ x1: 0, y1: 0, x2: 10, y2: 10 }]);
  });

  it("skips a self loop instead of drawing a zero-length line", () => {
    const result = selectionXraySegments({
      selectedId: "self",
      edges: [{ id: "loop", source: "self", target: "self" }],
      screenFor: screen({ self: { x: 5, y: 6, z: 0 } })
    });
    expect(result.segments).toEqual([]);
    expect(result.neighborIds).toEqual([]);
  });

  it("includes route neighbours without a factual edge and never draws the selected node twice", () => {
    const result = selectionXraySegments({
      selectedId: "selected",
      edges: [{ id: "hop", source: "before", target: "selected" }],
      neighborIds: ["after", "selected", "before"],
      screenFor: screen({
        selected: { x: 0, y: 0, z: 0 },
        before: { x: -10, y: 4, z: 0 },
        after: { x: 10, y: 4, z: 0 }
      })
    });
    expect(result.neighborIds).toEqual(["before", "after"]);
    expect(result.segments).toHaveLength(2);
  });

  it("returns no segments when the selected node is not drawn or has no visible neighbour", () => {
    expect(selectionXraySegments({
      selectedId: "selected",
      edges: [{ id: "e", source: "selected", target: "other" }],
      screenFor: screen({ other: { x: 1, y: 1, z: 0 } })
    }).segments).toEqual([]);
    expect(selectionXraySegments({
      selectedId: "selected",
      edges: [{ id: "e", source: "selected", target: "other" }],
      screenFor: screen({
        selected: { x: 0, y: 0, z: 1.4 },
        other: { x: 1, y: 1, z: 0 }
      })
    }).segments).toEqual([]);
    expect(selectionXraySegments({
      selectedId: "selected",
      edges: [{ id: "e", source: "selected", target: "other" }],
      screenFor: screen({ selected: { x: 0, y: 0, z: 0 }, other: { x: 1, y: 1, z: 2 } })
    }).segments).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { placeAtlasKnowledgeLabels, placeAtlasLabels, type AtlasKnowledgeLabelCandidate } from "./atlasLabels";

const viewport = { width: 1200, height: 800 };

function overlaps(left: { x: number; y: number; width: number; height: number }, right: { x: number; y: number; width: number; height: number }) {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

describe("screen-space label collision culling", () => {
  it("never emits overlapping labels and is deterministic", () => {
    const candidates = Array.from({ length: 80 }, (_, index) => ({
      key: `n${String(index).padStart(2, "0")}`,
      kind: "knowledge" as const,
      x: 100 + (index % 12) * 70,
      y: 120 + Math.floor(index / 12) * 34,
      width: 92,
      height: 22,
      priority: index % 7,
      alpha: 1
    }));
    const first = placeAtlasLabels(candidates, viewport);
    const second = placeAtlasLabels([...candidates].reverse(), viewport);
    expect(second).toEqual(first);
    for (let index = 0; index < first.length; index += 1) {
      for (let other = index + 1; other < first.length; other += 1) {
        expect(overlaps(first[index], first[other])).toBe(false);
      }
    }
    expect(first.length).toBeGreaterThan(5);
    expect(first.length).toBeLessThan(candidates.length);
  });

  it("keeps forced labels visible by nudging, and always within the viewport", () => {
    const candidates = [
      { key: "domain-1", kind: "domain" as const, x: 0, y: 40, width: 180, height: 34, priority: 100, force: true },
      { key: "domain-2", kind: "domain" as const, x: 0, y: 40, width: 180, height: 34, priority: 90, force: true },
      { key: "chapter", kind: "chapter" as const, x: 1150, y: 780, width: 180, height: 28, priority: 110, force: true }
    ];
    const placed = placeAtlasLabels(candidates, viewport);
    expect(placed.map((label) => label.key)).toEqual(expect.arrayContaining(["domain-1", "domain-2", "chapter"]));
    placed.forEach((label) => {
      expect(label.x).toBeGreaterThanOrEqual(0);
      expect(label.y).toBeGreaterThanOrEqual(0);
      expect(label.x + label.width).toBeLessThanOrEqual(viewport.width);
      expect(label.y + label.height).toBeLessThanOrEqual(viewport.height);
    });
    for (let index = 0; index < placed.length; index += 1) {
      for (let other = index + 1; other < placed.length; other += 1) {
        expect(overlaps(placed[index], placed[other])).toBe(false);
      }
    }
  });
});

describe("HUD exclusions and duplicate label suppression", () => {
  it("never places a label inside a HUD rectangle and clamps nudged labels to the canvas", () => {
    const candidates = [
      { key: "chapter:a", kind: "chapter" as const, text: "第 1 章 很长的章节标题", x: 900, y: 20, width: 220, height: 38, priority: 100, force: true, alpha: 1 },
      { key: "node:a", kind: "knowledge" as const, text: "Tool", x: 60, y: 120, width: 80, height: 22, priority: 80, alpha: 1 }
    ];
    const exclusions = [{ x: 0, y: 0, width: 400, height: 120 }, { x: 1000, y: 600, width: 200, height: 200 }];
    const placed = placeAtlasLabels(candidates, viewport, { exclusions });
    expect(placed.map((label) => label.key)).toContain("chapter:a");
    placed.forEach((label) => {
      expect(label.x).toBeGreaterThanOrEqual(0);
      expect(label.y).toBeGreaterThanOrEqual(0);
      expect(label.x + label.width).toBeLessThanOrEqual(viewport.width);
      expect(label.y + label.height).toBeLessThanOrEqual(viewport.height);
      exclusions.forEach((blocked) => {
        const overlap = label.x < blocked.x + blocked.width && label.x + label.width > blocked.x
          && label.y < blocked.y + blocked.height && label.y + label.height > blocked.y;
        expect(overlap).toBe(false);
      });
    });
  });

  it("keeps the knowledge label when a topic has the same name", () => {
    const placed = placeAtlasLabels([
      { key: "node:mlp", kind: "knowledge", text: "Multi-Layer Perceptron", x: 100, y: 100, width: 140, height: 22, priority: 2200, alpha: 1 },
      { key: "topic:mlp", kind: "topic", text: "Multi-Layer Perceptron", x: 100, y: 100, width: 160, height: 28, priority: 350, alpha: 1 }
    ], viewport);
    expect(placed.map((label) => label.key)).toEqual(["node:mlp"]);
  });
});

describe("knowledge labels stay anchored to their own node", () => {
  const knowledge = (overrides: Partial<AtlasKnowledgeLabelCandidate> & Pick<AtlasKnowledgeLabelCandidate, "nodeId" | "x" | "y">): AtlasKnowledgeLabelCandidate => ({
    key: `node:${overrides.nodeId}`,
    text: overrides.nodeId,
    diameter: 16,
    width: 100,
    height: 22,
    priority: 100,
    alpha: 1,
    ...overrides
  });

  it("uses one of the four anchors next to the node and never relocates it", () => {
    const placed = placeAtlasKnowledgeLabels([knowledge({ nodeId: "a", x: 400, y: 300 })], viewport);
    expect(placed).toHaveLength(1);
    expect(["above", "right", "below", "left"]).toContain(placed[0].anchor);
    expect(Math.abs(placed[0].x - 400)).toBeLessThan(120);
    expect(Math.abs(placed[0].y - 300)).toBeLessThan(120);
  });

  it("hides the name when every anchor collides", () => {
    const node = knowledge({ nodeId: "dense", x: 400, y: 300 });
    const obstacles = [
      { x: 300, y: 200, width: 200, height: 220 },
      { x: 420, y: 240, width: 220, height: 160 }
    ];
    expect(placeAtlasKnowledgeLabels([node], viewport, { obstacles })).toEqual([]);
  });

  it("registers at most one name per node and suppresses duplicate text", () => {
    const placed = placeAtlasKnowledgeLabels([
      knowledge({ nodeId: "a", x: 300, y: 300 }),
      knowledge({ nodeId: "a", x: 300, y: 300, priority: 50 }),
      knowledge({ nodeId: "b", text: "a", x: 800, y: 300 })
    ], viewport);
    expect(placed).toHaveLength(1);
    expect(placed[0].nodeId).toBe("a");
  });

  it("prefers the core / selected label over other names", () => {
    const placed = placeAtlasKnowledgeLabels([
      knowledge({ nodeId: "core", x: 400, y: 300, priority: 2000 }),
      knowledge({ nodeId: "other", x: 402, y: 300, priority: 10 })
    ], viewport);
    expect(placed[0].nodeId).toBe("core");
    expect(placed.length).toBeGreaterThanOrEqual(1);
  });
});

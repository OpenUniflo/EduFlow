import { describe, expect, it } from "vitest";
import { placeAtlasLabels } from "./atlasLabels";

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

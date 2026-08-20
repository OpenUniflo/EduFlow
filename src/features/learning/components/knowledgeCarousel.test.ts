import { describe, expect, it } from "vitest";
import { clampCarouselIndex, knowledgeCarouselCardClass } from "./knowledgeCarousel";

describe("Knowledge Carousel state", () => {
  it("clamps navigation for empty, single, and multiple collections", () => {
    expect(clampCarouselIndex(3, 0)).toBe(0);
    expect(clampCarouselIndex(-1, 1)).toBe(0);
    expect(clampCarouselIndex(9, 5)).toBe(4);
    expect(clampCarouselIndex(2, 5)).toBe(2);
  });

  it("expands only the active card", () => {
    expect([0, 1, 2].map((index) => knowledgeCarouselCardClass(index, 1))).toEqual([
      "learning-knowledge-card side",
      "learning-knowledge-card active",
      "learning-knowledge-card side"
    ]);
  });
});

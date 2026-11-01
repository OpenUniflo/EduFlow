import { describe, expect, it } from "vitest";
import { thumbnailFitsAll, thumbnailNodeLimit, thumbnailNodes } from "./worksThumbnail";

describe("Works workflow thumbnail width budget", () => {
  it("maps real card widths at 1280/1440/1920 to a non-clipping node count", () => {
    expect(thumbnailNodeLimit(280)).toBe(4);
    expect(thumbnailNodeLimit(330)).toBe(5);
    expect(thumbnailNodeLimit(456)).toBe(7);
  });

  it("never increases the shown count as the card narrows", () => {
    const widths = [240, 280, 320, 360, 420, 456, 520];
    const limits = widths.map(thumbnailNodeLimit);
    expect(limits).toEqual([...limits].sort((left, right) => left - right));
  });

  it("folds the rest into +N and keeps at least one node when very narrow", () => {
    const nodes = Array.from({ length: 9 }, (_, index) => index);
    expect(thumbnailNodes(nodes, 280)).toEqual({ visible: [0, 1, 2, 3], remaining: 5 });
    expect(thumbnailNodes(nodes, 456)).toEqual({ visible: [0, 1, 2, 3, 4, 5, 6], remaining: 2 });
    expect(thumbnailNodeLimit(80)).toBe(1);
    expect(thumbnailNodeLimit(0)).toBe(5);
  });

  it("shows every node when they fit without a +N pill", () => {
    const five = [0, 1, 2, 3, 4];
    expect(thumbnailFitsAll(5, 292)).toBe(true);
    expect(thumbnailNodes(five, 292)).toEqual({ visible: five, remaining: 0 });
    expect(thumbnailFitsAll(6, 292)).toBe(false);
  });
});

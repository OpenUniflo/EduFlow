import { describe, expect, it } from "vitest";
import { viewportShowsBounds } from "./viewport";

const stage = { left: 0, top: 0, right: 1440, bottom: 770 };

describe("viewportShowsBounds", () => {
  it("accepts a viewport with every node inside the padded canvas", () => {
    expect(viewportShowsBounds({ x: 80, y: 120, zoom: 1 }, { x: 80, y: 120, width: 1000, height: 300 }, stage)).toBe(true);
  });

  it("rejects the acceptance viewport whose right nodes are cut off", () => {
    expect(viewportShowsBounds({ x: 648, y: 183, zoom: 1 }, { x: 80, y: 120, width: 1752, height: 500 }, stage)).toBe(false);
  });

  it("rejects clipped top or bottom edges and invalid zoom", () => {
    expect(viewportShowsBounds({ x: 0, y: 0, zoom: 1 }, { x: 2, y: 2, width: 100, height: 100 }, stage)).toBe(false);
    expect(viewportShowsBounds({ x: 0, y: 0, zoom: 1 }, { x: 100, y: 100, width: 100, height: 1000 }, stage)).toBe(false);
    expect(viewportShowsBounds({ x: 0, y: 0, zoom: 0 }, { x: 100, y: 100, width: 1, height: 1 }, stage)).toBe(false);
  });
});

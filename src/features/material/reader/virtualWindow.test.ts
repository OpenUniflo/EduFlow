import { describe, expect, it } from "vitest";
import { outlineWindow, windowedRange } from "./virtualWindow";

describe("material reader virtual windows", () => {
  it("keeps a small range around the active page inside the Material", () => {
    expect(windowedRange(0, 307, 2)).toEqual({ start: 0, end: 3 });
    expect(windowedRange(153, 307, 2)).toEqual({ start: 151, end: 156 });
    expect(windowedRange(306, 307, 2)).toEqual({ start: 304, end: 307 });
    expect(windowedRange(0, 0, 2)).toEqual({ start: 0, end: 0 });
  });

  it("finds the visible outline rows from cumulative variable heights", () => {
    const rows = [
      { height: 36 }, { height: 52 }, { height: 52 }, { height: 52 }, { height: 36 }, { height: 52 }
    ];
    const first = outlineWindow(rows, 0, 100, 0);
    expect(first.start).toBe(0);
    expect(first.end).toBe(3);
    expect(first.top).toBe(0);
    expect(first.totalHeight).toBe(280);

    const middle = outlineWindow(rows, 120, 52, 0);
    expect(middle.start).toBe(2);
    expect(middle.top).toBe(88);
    expect(middle.end).toBe(4);
  });

  it("never returns an out-of-bounds range and clamps negative scroll", () => {
    const rows = [{ height: 36 }, { height: 52 }];
    expect(outlineWindow(rows, -50, 400, 0)).toEqual({ start: 0, end: 2, top: 0, totalHeight: 88 });
    expect(outlineWindow([], 10, 100, 0)).toEqual({ start: 0, end: 0, top: 0, totalHeight: 0 });
  });
});

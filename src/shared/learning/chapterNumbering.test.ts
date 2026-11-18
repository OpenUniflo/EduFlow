import { describe, expect, it } from "vitest";
import { chapterDisplayNumber, chapterDisplayNumbers, chapterNumberLabel } from "./chapterNumbering";

describe("chapter display numbering", () => {
  it("uses a dense one-based rank instead of the persisted order value", () => {
    const chapters = [
      { id: "r10", order: 1 },
      { id: "r20", order: 2 },
      { id: "r30", order: 7 },
    ];
    expect([...chapterDisplayNumbers(chapters).entries()]).toEqual([["r10", 1], ["r20", 2], ["r30", 3]]);
    expect(chapterDisplayNumber(chapters, "r10")).toBe(1);
  });

  it("sorts by order and then stable id, independent of input order", () => {
    const chapters = [
      { id: "b", order: 2 },
      { id: "a", order: 1 },
      { id: "c", order: 2 },
    ];
    expect([...chapterDisplayNumbers(chapters).entries()]).toEqual([["a", 1], ["b", 2], ["c", 3]]);
    expect(chapterDisplayNumber(chapters, "missing")).toBeUndefined();
  });

  it("keeps chapters without a numeric order at the end", () => {
    const chapters = [
      { id: "unknown" },
      { id: "known", order: 4 },
    ];
    expect(chapterDisplayNumber(chapters, "known")).toBe(1);
    expect(chapterDisplayNumber(chapters, "unknown")).toBe(2);
  });

  it("formats the shared chapter label", () => {
    expect(chapterNumberLabel(1)).toBe("第 1 章");
    expect(chapterNumberLabel(undefined)).toBe("");
  });
});

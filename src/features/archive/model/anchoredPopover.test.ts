import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { anchoredPopoverPosition } from "./anchoredPopover";

const viewport = { width: 1440, height: 900 };
const trigger = { left: 600, right: 690, top: 60, bottom: 94 };

describe("Archive popover anchoring", () => {
  it("opens under the trigger and left-aligned when it fits", () => {
    expect(anchoredPopoverPosition(trigger, { width: 348, height: 460 }, viewport)).toEqual({ left: 600, top: 102 });
  });

  it("flips above when the lower half cannot hold the panel", () => {
    const low = { ...trigger, top: 700, bottom: 734 };
    expect(anchoredPopoverPosition(low, { width: 348, height: 260 }, viewport)).toEqual({ left: 600, top: 432 });
  });

  it("clamps into the viewport instead of using hard-coded coordinates", () => {
    const right = { ...trigger, left: 1320, right: 1410 };
    expect(anchoredPopoverPosition(right, { width: 348, height: 460 }, viewport)).toEqual({ left: 1084, top: 102 });
    expect(anchoredPopoverPosition({ ...trigger, left: 2 }, { width: 348, height: 460 }, viewport).left).toBe(8);
  });
});

describe("Archive course popover integration", () => {
  it("uses measured trigger coordinates instead of fixed top/right values", () => {
    const chrome = readFileSync("src/features/archive/components/ArchiveChrome.tsx", "utf8");
    expect(chrome).toContain("style={{ left: position.left, top: position.top }}");
    const css = readFileSync("src/features/archive/pages/archive.css", "utf8");
    const start = css.indexOf(".ef-atlas-courses {");
    const rule = css.slice(start, css.indexOf("}", start) + 1);
    expect(rule).toContain("position: fixed");
    expect(rule).not.toContain("top: 84px");
    expect(rule).not.toContain("right: var(--sp-20)");
  });
});

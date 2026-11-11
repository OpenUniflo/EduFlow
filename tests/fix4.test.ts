import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("fix 4: one bottom layout", () => {
  it("declares shared left/right bottom zones and one legend class", () => {
    const frame = read("src/shared/styles/page-frame.css");
    expect(frame).toContain("--ef-bottom-left-zone");
    expect(frame).toContain("--ef-bottom-right-zone");
    expect(frame).toContain("--ef-bottom-right-zone-active");
    expect(frame).toContain(".ef-bottom-legend.ef-bottom-legend");
    expect(frame).toContain("max(var(--ef-bottom-right-zone), calc(var(--ef-floating-avoid-right, 0px) + var(--ef-assistant-safe-right)))");
  });

  it("puts both bottom legends in the shared lane", () => {
    expect(read("src/features/course/immersive/CourseImmersivePage.tsx")).toContain("ef-imm-status-legend ef-bottom-legend");
    expect(read("src/features/archive/pages/ArchivePage.tsx")).toContain("ef-atlas-legend ef-bottom-legend");
  });

  it("moves the course toolbar into the same lane instead of shifting it per page", () => {
    const css = read("src/features/course/immersive/immersive.css");
    expect(css).toContain("left: calc((100% - var(--ef-bottom-right-zone-active)) / 2)");
    expect(css).toContain("max-width: calc(100% - var(--ef-bottom-right-zone-active) - var(--sp-16))");
  });

  it("collapses secondary bottom copy instead of letting it overlap", () => {
    const page = read("src/features/course/immersive/CourseImmersivePage.tsx");
    expect(page).not.toContain("ef-imm-cap-hint");
    expect(page).not.toContain("标记不计入");
    expect(page).toContain("title={`拖动旋转可查看 ${capabilityCount} 个前置能力`}");
    expect(page).toContain("title=\"当前、目标、前置能力不计入状态合计\"");
  });
});

describe("fix 4: repeatable overlap detector", () => {
  it("checks six pages, three widths, open and closed panels in the bottom 160px", () => {
    const script = read("scripts/check-bottom-overlap.mjs");
    for (const page of ["home", "course", "archive", "material", "records", "works"]) {
      expect(script).toContain(`id: "${page}"`);
    }
    expect(script).toContain("const WIDTHS = [1280, 1440, 1728]");
    expect(script).toContain("innerHeight - 160");
    expect(script).toContain('for (const state of ["open", "closed"])');
    expect(script).toContain("overlaps");
    expect(script).toContain("primary");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

function rule(css: string, selector: string) {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`missing selector ${selector}`);
  return css.slice(start, css.indexOf("}", start) + 1);
}

describe("course tree stage uses the full content area", () => {
  const css = read("src/features/course/pages/coursePage.css");

  it("floats the shared header over the stage instead of taking a content band", () => {
    expect(rule(css, '.ef-course-page[data-view="tree"] {')).toContain("position: relative");
    const headerRegion = rule(css, '.ef-course-page[data-view="tree"] .ef-course-page-header-region {');
    expect(headerRegion).toContain("position: absolute");
    expect(headerRegion).toContain("top: 0");
    expect(headerRegion).toContain("pointer-events: none");
    expect(rule(css, '.ef-course-page[data-view="tree"] .ef-course-page-header {')).toContain("pointer-events: auto");
  });

  it("leaves no inner padding, margin, border or radius around the stage", () => {
    const body = rule(css, ".ef-course-page-body.is-tree {");
    expect(body).toMatch(/padding:\s*0;/);
    expect(body).not.toContain("var(--sp-12)");

    const stage = rule(css, ".ef-course-page-body.is-tree .ef-imm-page {");
    expect(stage).toContain("height: 100%");
    expect(stage).toContain("min-height: 0");
    expect(stage).toMatch(/margin:\s*0;/);
    expect(stage).toMatch(/border:\s*0;/);
    expect(stage).toMatch(/border-radius:\s*0;/);
  });
});

describe("course tree selection reveal uses measured overlays", () => {
  const source = read("src/features/course/immersive/TiltedCourseStage.tsx");
  const start = source.indexOf("function revealNode(");
  const reveal = source.slice(start, source.indexOf("function frontView()", start));

  it("derives the free area from overlay rectangles and the caller's inset", () => {
    expect(reveal).toContain("pageOverlayRects()");
    expect(reveal).toContain("propsRef.current.rightInset");
    expect(reveal).toContain("freeLeft");
    expect(reveal).toContain("freeTop");
    expect(reveal).toContain("freeRight");
    expect(reveal).toContain("freeBottom");
  });

  it("has no hardcoded panel width or top / bottom margins", () => {
    expect(reveal).not.toContain("detailOpen ? 388");
    expect(reveal).not.toContain("engine.height - 136");
    expect(reveal).not.toContain("const minY = 96");
  });

  it("reserves the shared header as a page overlay", () => {
    expect(source).toContain('".ef-course-page-header"');
  });
});

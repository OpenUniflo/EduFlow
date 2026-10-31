import { describe, expect, it } from "vitest";
import { measureKnowledgeLabelBox, measurePlaneLabelWidth, oneHopRelation } from "./labelBox";

const measure = (text: string) => text.length * 10;

describe("measured knowledge label boxes", () => {
  it("includes the dot, gap, padding and border instead of under-measuring short names", () => {
    const box = measureKnowledgeLabelBox("Workflow", { measure, dot: 6, dotGap: 4, paddingX: 9, border: 1 });
    // 8 * 10 text + 6 dot + 4 gap + 18 padding + 2 border
    expect(box.textWidth).toBe(80);
    expect(box.width).toBe(110);
    expect(box.truncated).toBe(false);
  });

  it("truncates only after 260px and keeps the full text available on the DOM title", () => {
    const short = measureKnowledgeLabelBox("A", { measure, maxWidth: 260 });
    expect(short.width).toBeLessThan(260);
    expect(short.truncated).toBe(false);
    const long = measureKnowledgeLabelBox("A very long knowledge name that will not fit", { measure, maxWidth: 260 });
    expect(long.width).toBe(260);
    expect(long.truncated).toBe(true);
  });

  it("uses the bold font for is-strong labels", () => {
    const fonts: string[] = [];
    measureKnowledgeLabelBox("Agent", { measure: (text, font) => { fonts.push(font); return text.length * 10; }, strong: true });
    expect(fonts[0]).toContain("600");
  });

  it("measures plane labels from real text rather than a per-letter estimate", () => {
    expect(measurePlaneLabelWidth("Workflow", measure)).toBe(98);
    expect(measurePlaneLabelWidth("A", measure)).toBe(28);
  });
});

describe("selection one-hop relation", () => {
  it("returns the selected node, its neighbours and incident edges only", () => {
    const relation = oneHopRelation("K2", [
      { id: "e1", source: "K1", target: "K2" },
      { id: "e2", source: "K2", target: "K3" },
      { id: "e3", source: "K4", target: "K5" }
    ]);
    expect([...relation.nodeIds].sort()).toEqual(["K1", "K2", "K3"]);
    expect([...relation.edgeIds].sort()).toEqual(["e1", "e2"]);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/learning/micro/runtime/MechanismInteraction.tsx", "utf8");

describe("Micro teaching flow viewport", () => {
  it("leaves wheel scrolling to the page instead of zooming the diagram", () => {
    expect(source).toContain("zoomOnScroll={false}");
    expect(source).toContain("preventScrolling={false}");
  });

  it("keeps explicit fit/step controls for deliberate zoom and execution", () => {
    expect(source).toContain("适应画布");
    expect(source).toContain("TimelineControls");
  });
});

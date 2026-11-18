import { describe, expect, it } from "vitest";
import { projectColorVar, projectToneFor, projectToneLegend } from "./projectColors";

describe("course-page project colours", () => {
  it("maps acquired Knowledge to green and every other Course Knowledge to blue", () => {
    expect(projectToneFor({ kind: "knowledge", category: "acquired" })).toBe("acquired");
    expect(projectToneFor({ kind: "knowledge", category: "learning" })).toBe("target");
    expect(projectToneFor({ kind: "knowledge", category: "pending" })).toBe("target");
  });

  it("maps a pending intermediate capability to gray and never to the target blue", () => {
    expect(projectToneFor({ kind: "capability", category: "pending" })).toBe("intermediate");
    expect(projectToneFor({ kind: "capability", category: "acquired" })).toBe("acquired");
  });

  it("keeps every colour behind a token", () => {
    expect(projectColorVar("acquired")).toBe("var(--course-acquired)");
    expect(projectColorVar("target")).toBe("var(--course-target)");
    expect(projectColorVar("intermediate")).toBe("var(--course-intermediate)");
    expect(projectToneLegend()).toHaveLength(3);
  });
});

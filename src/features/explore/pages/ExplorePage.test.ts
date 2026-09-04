import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Explore learner entry", () => {
  it("does not expose a generic Knowledge-state mutation and routes through real resources", () => {
    const source = readFileSync(join(process.cwd(), "src/features/explore/pages/ExplorePage.tsx"), "utf8");
    expect(source).not.toContain("startKnowledge");
    expect(source).not.toContain('>开始学习<');
    expect(source).toContain("learnerStateService.startMaterial");
    expect(source).toContain("learnerStateService.startAssignment");
    expect(source).toContain("<KnowledgeContextSelector");
    expect(source).toContain("<KnowledgeResourceActions");
  });
});

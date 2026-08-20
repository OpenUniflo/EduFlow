import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Explore learner entry", () => {
  it("starts Knowledge without coupling the primary action to Micro navigation", () => {
    const source = readFileSync(join(process.cwd(), "src/features/explore/pages/ExplorePage.tsx"), "utf8");
    const startAction = source.slice(source.indexOf("async function startKnowledge"), source.indexOf("async function openMicro"));
    expect(startAction).toContain("learnerStateService.startKnowledge(nodeId)");
    expect(startAction).not.toContain("navigate(");
    expect(source).toContain('disabled={!selectedResources.micro.available}');
  });
});

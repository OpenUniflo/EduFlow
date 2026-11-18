import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MicroStepList } from "@/features/learning/micro/MicroStepList";
import type { MicroLearningPath, MicroLearningRepository } from "@/features/learning/micro/microLearning";

const path: MicroLearningPath = {
  id: "path", knowledgeId: "knowledge", scope: "global", title: "Path", estimatedMinutes: 5, mode: "learn", required: true, status: "published",
  units: [
    { id: "unit-1", pathId: "path", title: "Unit one", position: 0, estimatedMinutes: 2, required: true, steps: [
      { id: "step-1", kind: "explanation", title: "Learned step", body: "Body" },
      { id: "step-2", kind: "interaction", title: "Learned interaction", body: "Body" }
    ] },
    { id: "unit-2", pathId: "path", title: "Unit two", position: 1, estimatedMinutes: 3, required: true, steps: [
      { id: "step-3", kind: "summary", title: "Learned summary", body: "Body" }
    ] }
  ]
};

const repository = {
  getUnitProgress(unitId: string) {
    return unitId === "unit-1" ? { status: "completed", completedStepIds: ["step-1", "step-2"] } : { status: "completed", completedStepIds: ["step-3"] };
  }
} as unknown as MicroLearningRepository;

describe("completed Micro step list", () => {
  it("lists every real step with a green learned state and a review action", () => {
    const html = renderToStaticMarkup(<MicroStepList path={path} repository={repository} onSelect={() => undefined} />);
    expect(html).toContain("Learned step");
    expect(html).toContain("Learned interaction");
    expect(html).toContain("Learned summary");
    expect(html).toContain("已学，点击回看");
    expect(html).toContain("已学，点击回看".length ? "ef-micro-step-row is-learned" : "");
    expect(html.match(/ef-micro-step-check/g)?.length).toBeGreaterThan(0);
    expect(html).toContain("3 步 · 已完成");
  });
});

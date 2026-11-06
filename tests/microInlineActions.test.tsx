import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MicroStepPanel } from "@/features/learning/micro/MicroLearningExperience";
import type { MicroLearningPath, MicroLearningRepository } from "@/features/learning/micro/microLearning";

const path: MicroLearningPath = {
  id: "path", knowledgeId: "knowledge", scope: "global", title: "Path", estimatedMinutes: 5, mode: "learn", required: true, status: "published",
  units: [{ id: "unit", pathId: "path", title: "Unit", position: 0, estimatedMinutes: 5, required: true, steps: [
    { id: "step", kind: "summary", title: "Summary", body: "Body text" }
  ] }]
};
const repository = {} as unknown as MicroLearningRepository;

describe("Inline Micro actions", () => {
  it("does not render a permanently disabled previous button when no previous step exists", () => {
    const html = renderToStaticMarkup(<MicroStepPanel path={path} unitId="unit" step={path.units[0].steps[0]} repository={repository} session={null} review={false} active busy={false} previous={null} onBack={() => undefined} onNext={() => undefined} onReturn={() => undefined} />);
    expect(html).toContain("为什么？");
    expect(html).toContain("继续");
    expect(html).not.toContain("上一步");
  });
});

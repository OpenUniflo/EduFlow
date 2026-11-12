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
    // No distinct explanation is available, so the why control is not shown.
    expect(html).not.toContain("为什么？");
    expect(html).toContain("继续");
    expect(html).not.toContain("上一步");
  });

  it("uses the same current-step position for the global and unit labels", () => {
    const progressPath: MicroLearningPath = {
      ...path,
      units: [
        { ...path.units[0], steps: [path.units[0].steps[0], { ...path.units[0].steps[0], id: "second", title: "Second" }] },
        { ...path.units[0], id: "unit-2", position: 1, title: "Unit 2", steps: [{ ...path.units[0].steps[0], id: "third", title: "Third" }] }
      ]
    };
    const html = renderToStaticMarkup(<MicroStepPanel path={progressPath} unitId="unit" step={progressPath.units[0].steps[1]} repository={repository} session={null} review={false} active busy={false} previous={null} onBack={() => undefined} onNext={() => undefined} onReturn={() => undefined} />);
    expect(html).toContain("第 2 / 3 步 · 第 1 / 2 单元 · 第 2 / 2 步");
  });

  it("shows a data-driven explanation once and never tells a signed-in learner to log in", () => {
    const explanationPath: MicroLearningPath = {
      ...path,
      units: [{ ...path.units[0], steps: [{ ...path.units[0].steps[0], retryFeedback: "Different explanation" }] }]
    };
    const html = renderToStaticMarkup(<MicroStepPanel path={explanationPath} unitId="unit" step={explanationPath.units[0].steps[0]} repository={repository} session={{ userId: "u" } as never} review={false} active busy={false} previous={null} onBack={() => undefined} onNext={() => undefined} onReturn={() => undefined} />);
    expect(html).toContain("为什么？");
    expect(html).not.toContain("登录后可继续");
  });
});

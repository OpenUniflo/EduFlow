import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CourseRouteView } from "./CourseRouteView";
import { buildWindingRoute, type WindingStepInput } from "./courseTreeLayout";

const steps: WindingStepInput[] = [
  { id: "A", title: "能力 A", chapterId: "c1", chapterTitle: "第一章", chapterNumber: 1, status: "current", stateLabel: "在学" }
];
const layout = buildWindingRoute(steps);

const render = (routeRecommended: boolean, routeVersionNumber?: number) => renderToStaticMarkup(
  <CourseRouteView
    layout={layout}
    steps={steps}
    usingActiveRoute
    routeRecommended={routeRecommended}
    routeVersionNumber={routeVersionNumber}
    reducedMotion
    onSelect={vi.fn()}
    onStart={vi.fn()}
    onAdjust={vi.fn()}
  />
);

describe("CourseRouteView route identity", () => {
  it("labels the system-created initial route as a recommendation without a version number", () => {
    const html = render(true, 1);
    expect(html).toContain("推荐路线");
    expect(html).not.toContain("我的路线");
    expect(html).not.toContain("V1");
  });

  it("keeps the learner-owned route wording after adoption", () => {
    const html = render(false, 2);
    expect(html).toContain("我的路线 · V2");
    expect(html).not.toContain("推荐路线");
  });
});

describe("route progress and current label", () => {
  const learnedCurrent: WindingStepInput[] = [
    { id: "A", title: "已学要点", chapterId: "c1", chapterTitle: "第一章", chapterNumber: 1, status: "done", stateLabel: "已学", learned: true },
    { id: "B", title: "当前要点", chapterId: "c1", chapterTitle: "第一章", chapterNumber: 1, status: "current", stateLabel: "当前", learned: true, minutes: 8, meta: "小练习" }
  ];
  it("counts a learned current step in chapter progress and labels it only as 当前", () => {
    const html = renderToStaticMarkup(<CourseRouteView
      layout={buildWindingRoute(learnedCurrent)}
      steps={learnedCurrent}
      usingActiveRoute
      reducedMotion
      onSelect={vi.fn()}
      onStart={vi.fn()}
    />);
    expect(html).toContain("已学 2 / 2");
    expect(html).toContain("当前 · 8 分钟 · 小练习");
    expect(html).not.toContain("已学 · 当前");
  });
});

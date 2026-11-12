import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PanelActions } from "@/features/home/PanelActions";
import { rightPanelFromParams, rightPanelParams } from "@/features/home/panelParams";
import type { RightPanel } from "@/features/home/rightPanel";
import { coursePlaneTarget } from "@/features/archive/model/courseFit";

const read = (path: string) => readFileSync(path, "utf8");

describe("one panel expand action", () => {
  it("renders one 放大 button and no separate page-entry button", () => {
    const html = renderToStaticMarkup(<MemoryRouter><PanelActions expand={{ kind: "page", href: "/records" }} /></MemoryRouter>);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain("放大");
    expect(html).not.toContain("进入");
  });

  it("navigates with returnTo so the conversation and panel can be restored", () => {
    const source = read("src/features/home/PanelActions.tsx");
    expect(source).toContain("navigate(expand.href, {");
    expect(source).toContain("courseEntryState(expand.courseEntry.source, returnTo)");
    expect(source).toContain("window.location.pathname");
  });

  it("has one expand action in every affected panel", () => {
    const panels = [
      "src/features/home/MaterialPanel.tsx",
      "src/features/home/HomeRoutePanel.tsx",
      "src/features/home/KnowledgePanel.tsx",
      "src/features/home/RecordsPanel.tsx",
      "src/features/home/CourseBriefPanel.tsx",
      "src/features/course/practice/PracticeObject.tsx"
    ];
    for (const path of panels) {
      const source = read(path);
      expect(source).toContain("<PanelActions expand=");
      expect(source).not.toContain("enterLabel=");
      expect(source).not.toContain("onEnter=");
    }
  });

  it("removes the material-specific overlay", () => {
    const source = read("src/features/home/MaterialPanel.tsx");
    expect(source).not.toContain("createPortal");
    expect(source).not.toContain("expanded");
    expect(source).not.toContain("ef-object-dialog");
    expect(source).toContain("/materials/");
    expect(source).toContain("?segment=");
  });

  it("declares a dedicated page for knowledge, records and brief", () => {
    expect(read("src/features/home/KnowledgePanel.tsx")).toContain("archiveHref");
    expect(read("src/features/home/RecordsPanel.tsx")).toContain('href: "/records"');
    expect(read("src/features/home/CourseBriefPanel.tsx")).toContain("/courses/create?briefId=");
    expect(read("src/features/home/MaterialPanel.tsx")).toContain("/materials/");
  });

  it("restores the right panel from the conversation address", () => {
    const page = read("src/features/learning/pages/LearningPage.tsx");
    expect(page).toContain("rightPanelFromParams(searchParams)");
    expect(page).toContain("rightPanelParams(searchParams, rightPanel)");
    expect(read("src/features/home/panelParams.ts")).toContain('next.set("object", "practice")');
  });

  it("opens the chapter page focused on that chapter", () => {
    expect(read("src/features/course/pages/CourseGraphPage.tsx")).toContain("focusChapterId={chapterId}");
    expect(read("src/features/course/pages/CourseLearnerRoutePage.tsx")).toContain("focusNodeId={focusNodeId}");
  });

  it("keeps the route and task dedicated pages", () => {
    const route = read("src/features/home/HomeRoutePanel.tsx");
    expect(route).toContain("/chapters/");
    expect(route).toContain("/courses/${encodeURIComponent(courseId)}");
    expect(route).not.toContain("立体视图");
    const practice = read("src/features/course/practice/PracticeObject.tsx");
    expect(practice).toContain("/assignments/");
    expect(practice).toContain("attemptId=");
    expect(practice).not.toContain("onOpenImmersive");
  });
});

describe("panel URL state", () => {
  const panels: RightPanel[] = [
    { kind: "my" },
    { kind: "route", courseId: "course", chapterId: "chapter", nodeId: "node" },
    { kind: "practice", courseId: "course", assignmentId: "task", title: "任务", attemptId: "attempt" },
    { kind: "material", courseId: "course", materialId: "material", segmentId: "segment" },
    { kind: "knowledge", nodeId: "node" },
    { kind: "records" },
    { kind: "brief", messageId: "message" }
  ];

  for (const panel of panels) {
    it(`round-trips ${panel.kind}`, () => {
      const params = rightPanelParams(new URLSearchParams("session=s1"), panel);
      const parsed = rightPanelFromParams(params);
      if (panel.kind === "practice") expect(parsed).toMatchObject({ kind: "practice", courseId: "course", assignmentId: "task", attemptId: "attempt" });
      else expect(parsed).toEqual(panel);
    });
  }

  it("removes stale object parameters when the panel closes", () => {
    const params = rightPanelParams(new URLSearchParams("session=s1&object=records&objectNodeId=old"), { kind: "none" });
    expect(params.get("object")).toBeNull();
    expect(params.get("objectNodeId")).toBeNull();
    expect(params.get("session")).toBe("s1");
  });
});

describe("course plane default target", () => {
  it("places the current chapter at the left edge with normal padding", () => {
    const target = coursePlaneTarget({
      mode: "readable",
      anchor: { x: -500, y: 500, width: 200, height: 100 },
      centerX: 0, centerY: 0, viewportWidth: 1280, viewportHeight: 900,
      insets: { left: 12, right: 12, top: 188, bottom: 96 },
      pxPerWorld: 0.75, edgePadding: 24, availableHeight: 568
    });
    const screenX = 640 + (-500 - target.x) * 0.75;
    expect(screenX).toBeCloseTo(36, 4);
  });

  it("centres a fitting chapter vertically and top-aligns a taller one", () => {
    const base = {
      mode: "readable" as const,
      anchor: { x: -500, y: 500, width: 200, height: 100 },
      centerX: 0, centerY: 0, viewportWidth: 1280, viewportHeight: 900,
      insets: { left: 12, right: 12, top: 188, bottom: 96 },
      pxPerWorld: 0.75, edgePadding: 24, availableHeight: 568
    };
    const centered = coursePlaneTarget(base);
    const centerScreenY = 450 - ((500 - 50) - centered.y) * 0.75;
    expect(centerScreenY).toBeCloseTo(496, 4);
    const tall = coursePlaneTarget({ ...base, anchor: { ...base.anchor, height: 1000 } });
    const topScreenY = 450 - (500 - tall.y) * 0.75;
    expect(topScreenY).toBeCloseTo(212, 4);
  });

  it("keeps the whole plane centred for fit-all", () => {
    const target = coursePlaneTarget({
      mode: "all", centerX: 10, centerY: 20, viewportWidth: 1280, viewportHeight: 900,
      insets: { left: 12, right: 12, top: 188, bottom: 96 },
      pxPerWorld: 0.75, edgePadding: 24, availableHeight: 568
    });
    expect(target.x).toBe(10);
    expect(target.y).toBeCloseTo(20 + (188 - 96) / 2 / 0.75, 4);
  });
});

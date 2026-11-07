// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseRouteView } from "./CourseRouteView";
import { buildWindingRoute, type WindingStepInput } from "./courseTreeLayout";

const inputs: WindingStepInput[] = [
  { id: "K1", title: "知识一", chapterId: "ch1", chapterTitle: "第一章", chapterNumber: 1, status: "done", stateLabel: "已学", kind: "micro" },
  { id: "K2", title: "知识二", chapterId: "ch1", chapterTitle: "第一章", chapterNumber: 1, status: "current", stateLabel: "在学", kind: "practice" },
  { id: "K3", title: "知识三", chapterId: "ch2", chapterTitle: "第二章", chapterNumber: 2, status: "locked", stateLabel: "待学", kind: "micro" }
];
const layout = buildWindingRoute(inputs, 500);

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false
  }));
  vi.stubGlobal("IntersectionObserver", class {
    observe() { return undefined; }
    unobserve() { return undefined; }
    disconnect() { return undefined; }
  });
  vi.stubGlobal("ResizeObserver", class {
    observe() { return undefined; }
    unobserve() { return undefined; }
    disconnect() { return undefined; }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("route selection is presentation-only", () => {
  let root: Root | null = null;
  it("never changes a node's coordinates when another node is selected", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<CourseRouteView
        layout={layout}
        steps={inputs}
        usingActiveRoute
        reducedMotion
        onSelect={() => undefined}
        onStart={() => undefined}
      />);
    });
    const steps = [...container.querySelectorAll<HTMLElement>(".ef-imm-route-step")];
    const before = steps.map((step) => `${step.style.left}|${step.style.top}`);
    expect(before).toEqual(layout.steps.map((step) => `${step.x}px|${step.y - 48}px`));
    await act(async () => { steps[0].click(); });
    const afterFirst = steps.map((step) => `${step.style.left}|${step.style.top}`);
    expect(afterFirst).toEqual(before);
    expect(container.querySelector(".ef-imm-route-action")?.getAttribute("data-route-action-index")).toBe("0");
    await act(async () => { steps[2].click(); });
    const afterSecond = steps.map((step) => `${step.style.left}|${step.style.top}`);
    expect(afterSecond).toEqual(before);
    expect(container.querySelector(".ef-imm-route-action")?.getAttribute("data-route-action-index")).toBe("2");
  });
});

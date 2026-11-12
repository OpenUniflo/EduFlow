import { describe, expect, it } from "vitest";
import { initialRightPanelState, panelBackLabel, panelKey, panelParamAction, previousRightPanel, reduceRightPanel, type RightPanel } from "./rightPanel";

const practice = { kind: "practice" as const, courseId: "course", assignmentId: "task", title: "Task" };
const states: RightPanel[] = [
  { kind: "none" },
  { kind: "my" },
  { kind: "route", courseId: "course" },
  practice,
  { kind: "knowledge", nodeId: "k1" },
  { kind: "material", courseId: "course", materialId: "m1" },
  { kind: "records" },
  { kind: "brief", messageId: "b1" },
  { kind: "micro", pathId: "path", knowledgeId: "k1" }
];

describe("right panel mutual exclusion", () => {
  for (const from of states) {
    it(`replaces ${from.kind} with every other panel`, () => {
      const state = initialRightPanelState(from);
      expect(reduceRightPanel(state, { type: "open-my" }).current).toEqual({ kind: "my" });
      expect(reduceRightPanel(state, { type: "open-route", courseId: "course" }).current).toEqual({ kind: "route", courseId: "course" });
      expect(reduceRightPanel(state, { type: "open-practice", panel: practice }).current).toEqual(practice);
      expect(reduceRightPanel(state, { type: "open-knowledge", nodeId: "k1" }).current).toEqual({ kind: "knowledge", nodeId: "k1" });
      expect(reduceRightPanel(state, { type: "open-material", courseId: "course", materialId: "m1", segmentId: "s1" }).current).toEqual({ kind: "material", courseId: "course", materialId: "m1", segmentId: "s1" });
      expect(reduceRightPanel(state, { type: "open-records" }).current).toEqual({ kind: "records" });
      expect(reduceRightPanel(state, { type: "open-brief", messageId: "b1" }).current).toEqual({ kind: "brief", messageId: "b1" });
      expect(reduceRightPanel(state, { type: "close" })).toEqual(initialRightPanelState());
    });
  }
});

describe("previous panel return", () => {
  it("returns from a Course route to the My panel that opened it", () => {
    const my = initialRightPanelState({ kind: "my" });
    const route = reduceRightPanel(my, { type: "open-route", courseId: "course", nodeId: "node" });
    expect(route.current).toMatchObject({ kind: "route", courseId: "course" });
    expect(previousRightPanel(route)).toEqual({ kind: "my" });
    expect(reduceRightPanel(route, { type: "back" })).toEqual(initialRightPanelState({ kind: "my" }));
  });

  it("returns from My to the practice panel that was open, not a new panel instance", () => {
    const task = initialRightPanelState(practice);
    const my = reduceRightPanel(task, { type: "open-my" });
    expect(previousRightPanel(my)).toEqual(practice);
    expect(reduceRightPanel(my, { type: "back" })).toEqual(initialRightPanelState(practice));
  });

  it("keeps the previous panel when the already-open panel is refreshed", () => {
    const task = initialRightPanelState(practice);
    const refreshed = reduceRightPanel(task, { type: "open-practice", panel: { ...practice, title: "Updated title" } });
    expect(refreshed.current).toEqual({ ...practice, title: "Updated title" });
    expect(previousRightPanel(refreshed)).toEqual({ kind: "none" });
  });

  it("does not overwrite the return target on a repeated My open", () => {
    const my = reduceRightPanel(initialRightPanelState(practice), { type: "open-my" });
    expect(reduceRightPanel(my, { type: "open-my" })).toEqual(my);
  });

  it("keeps a full previous-panel stack for nested objects", () => {
    const my = reduceRightPanel(initialRightPanelState(practice), { type: "open-my" });
    const route = reduceRightPanel(my, { type: "open-route", courseId: "course" });
    expect(previousRightPanel(route)).toEqual({ kind: "my" });
    const backToMy = reduceRightPanel(route, { type: "back" });
    expect(backToMy.current).toEqual({ kind: "my" });
    expect(previousRightPanel(backToMy)).toEqual(practice);
    expect(reduceRightPanel(backToMy, { type: "back" })).toEqual(initialRightPanelState(practice));
  });

  it("rewinds to My instead of stacking a second My after my -> route -> my", () => {
    const my = initialRightPanelState({ kind: "my" });
    const route = reduceRightPanel(my, { type: "open-route", courseId: "course" });
    expect(reduceRightPanel(route, { type: "open-my" })).toEqual(initialRightPanelState({ kind: "my" }));
  });

  it("rewinds to My after practice -> my -> route -> my, keeping only practice behind it", () => {
    const task = initialRightPanelState(practice);
    const my = reduceRightPanel(task, { type: "open-my" });
    const route = reduceRightPanel(my, { type: "open-route", courseId: "course" });
    expect(reduceRightPanel(route, { type: "open-my" })).toEqual({
      current: { kind: "my" },
      history: [practice]
    });
  });

  it("never keeps two layers with the same panel identity", () => {
    const path: RightPanel[] = [
      { kind: "my" },
      { kind: "route", courseId: "course" },
      { kind: "my" },
      { kind: "route", courseId: "course" },
      { kind: "my" }
    ];
    const state = path.reduce((current, panel) => reduceRightPanel(current, { type: "open-panel", panel }), initialRightPanelState(practice));
    const keys = [...state.history, state.current].map((panel) => panelKey(panel));
    expect(state).toEqual({ current: { kind: "my" }, history: [practice] });
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("closing clears the return target", () => {
    const my = reduceRightPanel(initialRightPanelState(practice), { type: "open-my" });
    expect(reduceRightPanel(my, { type: "close" })).toEqual(initialRightPanelState());
  });

  it("uses one return-label vocabulary for every previous panel", () => {
    expect(panelBackLabel({ kind: "my" })).toBe("返回我的");
    expect(panelBackLabel(practice)).toBe("返回动手任务");
    expect(panelBackLabel({ kind: "route", courseId: "course" })).toBe("返回路线");
    expect(panelBackLabel({ kind: "none" })).toBe("返回");
  });
});

describe("URL panel param transitions", () => {
  it("does not close a task/route panel when panel=1 is removed internally", () => {
    expect(panelParamAction(true, false, "practice")).toBeNull();
    expect(panelParamAction(true, false, "route")).toBeNull();
    expect(panelParamAction(true, false, "my")).toEqual({ type: "close" });
  });
  it("opens My only on a real false -> true transition", () => {
    expect(panelParamAction(false, true, "practice")).toEqual({ type: "open-my" });
    expect(panelParamAction(true, true, "practice")).toBeNull();
  });
});

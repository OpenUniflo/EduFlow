import { describe, expect, it } from "vitest";
import { panelParamAction, reduceRightPanel, type RightPanel } from "./rightPanel";

const practice = { kind: "practice" as const, courseId: "course", assignmentId: "task", title: "Task" };
const states: RightPanel[] = [{ kind: "none" }, { kind: "my" }, { kind: "route", courseId: "course" }, practice];

describe("right panel mutual exclusion", () => {
  for (const from of states) {
    it(`replaces ${from.kind} with every other panel`, () => {
      expect(reduceRightPanel(from, { type: "open-my" })).toEqual({ kind: "my" });
      expect(reduceRightPanel(from, { type: "open-route", courseId: "course" })).toEqual({ kind: "route", courseId: "course" });
      expect(reduceRightPanel(from, { type: "open-practice", panel: practice })).toEqual(practice);
      expect(reduceRightPanel(from, { type: "close" })).toEqual({ kind: "none" });
    });
  }
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

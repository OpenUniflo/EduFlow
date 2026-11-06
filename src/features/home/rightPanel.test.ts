import { describe, expect, it } from "vitest";
import type { MicroLearningPath } from "@/features/learning/micro/microLearning";
import { panelParamAction, reduceRightPanel, type RightPanel } from "./rightPanel";

const micro = { kind: "micro" as const, knowledgeId: "A02", pathId: "p-a02", path: { id: "p-a02" } as MicroLearningPath };
const practice = { kind: "practice" as const, courseId: "course", assignmentId: "task", title: "Task" };
const states: RightPanel[] = [{ kind: "none" }, { kind: "my" }, { kind: "route" }, micro, practice];

describe("right panel mutual exclusion", () => {
  for (const from of states) {
    it(`replaces ${from.kind} with every other panel`, () => {
      expect(reduceRightPanel(from, { type: "open-my" })).toEqual({ kind: "my" });
      expect(reduceRightPanel(from, { type: "open-route" })).toEqual({ kind: "route" });
      expect(reduceRightPanel(from, { type: "open-micro", panel: micro })).toEqual(micro);
      expect(reduceRightPanel(from, { type: "open-practice", panel: practice })).toEqual(practice);
      expect(reduceRightPanel(from, { type: "close" })).toEqual({ kind: "none" });
    });
  }
});

describe("URL panel param transitions", () => {
  it("does not close a task/route/micro panel when panel=1 is removed internally", () => {
    expect(panelParamAction(true, false, "practice")).toBeNull();
    expect(panelParamAction(true, false, "route")).toBeNull();
    expect(panelParamAction(true, false, "micro")).toBeNull();
    expect(panelParamAction(true, false, "my")).toEqual({ type: "close" });
  });
  it("opens My only on a real false -> true transition", () => {
    expect(panelParamAction(false, true, "practice")).toEqual({ type: "open-my" });
    expect(panelParamAction(true, true, "practice")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { resolveCourseRouteAction } from "./courseLearnerProjection";

describe("resolveCourseRouteAction", () => {
  const micro = { pathId: "micro:node" };
  const practice = { assignmentId: "assignment:node" };

  it("opens the open practice when the Micro is learned and the practice is next", () => {
    expect(resolveCourseRouteAction({
      nodeId: "node", micro, practice,
      currentStep: { nodeId: "node", kind: "practice" },
      microLearned: true, practiceDone: false
    })).toEqual({ kind: "practice", assignmentId: "assignment:node" });
  });

  it("keeps the Micro when it is the first-segment current step", () => {
    expect(resolveCourseRouteAction({
      nodeId: "node", micro, practice,
      currentStep: { nodeId: "node", kind: "micro" },
      microLearned: false, practiceDone: false
    })).toEqual({ kind: "micro", pathId: "micro:node" });
  });

  it("does not reopen a learned Micro for an unselected node with an open practice", () => {
    expect(resolveCourseRouteAction({ nodeId: "node", micro, practice, microLearned: true, practiceDone: false }))
      .toEqual({ kind: "practice", assignmentId: "assignment:node" });
  });

  it("falls back to the learned Micro only when no practice is open", () => {
    expect(resolveCourseRouteAction({ nodeId: "node", micro, microLearned: true, practiceDone: false }))
      .toEqual({ kind: "micro", pathId: "micro:node" });
  });
});

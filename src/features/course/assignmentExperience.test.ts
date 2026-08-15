import { describe, expect, it } from "vitest";
import { evaluateTraceSelection } from "./assignmentExperience";

describe("Trace Assignment Experience", () => {
  const experience = {
    type: "trace" as const,
    faultyStepId: "timeout",
    traceSteps: [{ id:"planner", label:"Planner created tasks" }, { id:"timeout", label:"Worker timed out" }]
  };

  it("rejects a non-faulty step", () => {
    expect(evaluateTraceSelection(experience, "planner")).toBe(false);
  });

  it("accepts only the configured faulty step", () => {
    expect(evaluateTraceSelection(experience, "timeout")).toBe(true);
  });
});

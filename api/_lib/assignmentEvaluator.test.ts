import { describe, expect, it } from "vitest";
import { evaluateAssignmentResponse, parseAssignmentResponse } from "./assignmentEvaluator";

const traceAssignment = { mode: "instruction", experience: { type: "trace", faultyStepId: "broken" } };

describe("Assignment evaluator", () => {
  it("parses only concrete learner responses", () => {
    expect(parseAssignmentResponse({ kind: "trace", selectedStepId: "broken" })).toEqual({ kind: "trace", selectedStepId: "broken" });
    expect(parseAssignmentResponse({ kind: "answer", text: "  evidence  " })).toEqual({ kind: "answer", text: "evidence" });
    expect(parseAssignmentResponse({ kind: "trace", selectedStepId: "" })).toBeNull();
    expect(parseAssignmentResponse({ deterministicAccepted: true })).toBeNull();
  });
  it("derives pass and fail from the published trace rule", () => {
    expect(evaluateAssignmentResponse(traceAssignment, { kind: "trace", selectedStepId: "broken" }).outcome).toBe("passed");
    expect(evaluateAssignmentResponse(traceAssignment, { kind: "trace", selectedStepId: "later" }).outcome).toBe("failed");
  });
  it("records open responses as pending manual review", () => {
    expect(evaluateAssignmentResponse({ mode: "instruction", experience: { type: "answer" } }, { kind: "answer", text: "evidence" })).toMatchObject({ outcome: "pending", evaluatorKind: "manual" });
  });
});

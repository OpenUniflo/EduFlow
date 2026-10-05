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

const file = '10000000-0000-4000-8000-000000000001';
it.each(['answer','code'])('accepts real text, file-only and mixed %s work without treating a filename as work', kind => {
  const text = kind==='answer'?{text:'my actual work'}:{code:'my actual work'};
  expect(parseAssignmentResponse({kind,...text})).not.toBeNull();
  expect(parseAssignmentResponse({kind,attachmentSourceIds:[file]})).toMatchObject({kind,attachmentSourceIds:[file]});
  expect(parseAssignmentResponse({kind,...text,attachmentSourceIds:[file]})).toMatchObject({kind,...text,attachmentSourceIds:[file]});
  expect(parseAssignmentResponse({kind,text:'',code:'',fileName:'result.csv'})).toBeNull();
  expect(parseAssignmentResponse({kind,...text,attachmentSourceIds:[file,file]})).toBeNull();
  expect(parseAssignmentResponse({kind,...text,attachmentSourceIds:['not-a-source']})).toBeNull();
  expect(evaluateAssignmentResponse({experience:{type:kind}},parseAssignmentResponse({kind,attachmentSourceIds:[file]})!).outcome).toBe('pending');
});

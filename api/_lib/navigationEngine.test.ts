import { describe, expect, it } from "vitest";
import { computeNavigationPlan } from "./navigationEngine";
import type { NavigationEngineInput } from "../../src/shared/learning/navigation";

const base: NavigationEngineInput = {
  courseId: "course",
  targetNodeIds: ["b"],
  nodes: [{ id: "a", title: "A", lessonOrder: 0, coverageOrder: 0 }, { id: "b", title: "B", lessonOrder: 1, coverageOrder: 0 }],
  prerequisiteEdges: [{ source: "a", target: "b" }], knowledgeStatuses: {},
  microPaths: [{ id: "micro-a", nodeId: "a", order: 0, required: true }], completedMicroPathIds: [],
  assignments: [{ id: "practice-a", nodeId: "a", order: 0, required: true }], assignmentOutcomes: {}, materials: []
};

describe("deterministic Navigation Engine", () => {
  it("is stable for identical state", () => expect(computeNavigationPlan(base)).toEqual(computeNavigationPlan(base)));
  it("skips mastered Knowledge and advances the factual frontier", () => {
    const plan = computeNavigationPlan({ ...base, knowledgeStatuses: { a: "mastered" } });
    expect(plan.skippedNodeIds).toEqual(["a"]);
    expect(plan.nextAction).toMatchObject({ kind: "next", nodeId: "b" });
  });
  it("changes fail into remediation and pass into the next route action", () => {
    const learned = { ...base, knowledgeStatuses: { a: "learned" as const }, completedMicroPathIds: ["micro-a"] };
    expect(computeNavigationPlan({ ...learned, assignmentOutcomes: { "practice-a": "failed" } }).nextAction).toMatchObject({ kind: "remediation", resourceId: "micro-a" });
    const passed = computeNavigationPlan({ ...learned, knowledgeStatuses: { a: "mastered" }, assignmentOutcomes: { "practice-a": "passed" } });
    expect(passed.nextAction).toMatchObject({ nodeId: "b", kind: "next" });
  });
  it("prioritizes a real failed Practice when a Knowledge has several Assignments", () => {
    const plan = computeNavigationPlan({ ...base, knowledgeStatuses: { a: "practicing" }, assignments: [{ id: "another", nodeId: "a", order: 1, required: true }, ...base.assignments], assignmentOutcomes: { "practice-a": "failed" } });
    expect(plan.nextAction).toMatchObject({ kind: "remediation", nodeId: "a" });
  });
  it("prioritizes remediation over another underway Knowledge", () => {
    const input = { ...base, knowledgeStatuses: { a: "practicing" as const, b: "practicing" as const }, assignments: [...base.assignments, { id: "practice-b", nodeId: "b", order: 1, required: true }], assignmentOutcomes: { "practice-b": "failed" as const } };
    expect(computeNavigationPlan(input).nextAction).toMatchObject({ kind: "remediation", nodeId: "b" });
  });
  it("gives two learner states different reasonable actions", () => {
    expect(computeNavigationPlan(base).nextAction.resourceId).toBe("micro-a");
    expect(computeNavigationPlan({ ...base, knowledgeStatuses: { a: "learned" }, completedMicroPathIds: ["micro-a"] }).nextAction.resourceId).toBe("practice-a");
  });
  it("does not declare a prerequisite-blocked target complete",()=>{
    const plan=computeNavigationPlan({...base,targetNodeIds:["b"],nodes:[base.nodes[1]],prerequisiteEdges:base.prerequisiteEdges});
    expect(plan.nextAction).toMatchObject({kind:"remediation",reasonCode:"prerequisite_mastery_required"});
  });
  it("prefers required assets before optional assets regardless of display order",()=>{
    const plan=computeNavigationPlan({...base,microPaths:[{id:"optional",nodeId:"a",order:0,required:false},{id:"required",nodeId:"a",order:2,required:true}]});
    expect(plan.nextAction.resourceId).toBe("required");
  });
});

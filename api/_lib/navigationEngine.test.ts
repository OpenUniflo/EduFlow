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
  it.each(["learned", "practicing"] as const)("continues after %s despite failed or pending Practice", (status) => {
    for (const outcome of ["failed", "pending", "passed"] as const) {
      const plan = computeNavigationPlan({ ...base, knowledgeStatuses: { a: status }, completedMicroPathIds: ["micro-a"], assignmentOutcomes: { "practice-a": outcome } });
      expect(plan.nextAction).toMatchObject({ kind: "next", nodeId: "b" });
      expect(plan.path[0].state).toBe("learned");
      expect(plan.skippedNodeIds).not.toContain("a");
    }
  });
  it("resumes incomplete required Micro before optional Practice", () => {
    expect(computeNavigationPlan({ ...base, knowledgeStatuses: { a: "practicing" }, assignmentOutcomes: { "practice-a": "failed" } }).nextAction).toMatchObject({ resourceId: "micro-a", reasonCode: "resume_required_micro" });
  });
  it("ignores external prerequisites without fabricating facts", () => {
    const input = { ...base, nodes: [base.nodes[1]] };
    expect(computeNavigationPlan(input).path).toMatchObject([{ nodeId: "b", state: "eligible", blockedBy: [] }]);
    expect(input.prerequisiteEdges).toEqual(base.prerequisiteEdges);
  });
  it("ends the teaching route without claiming mastery", () => {
    const plan = computeNavigationPlan({ ...base, knowledgeStatuses: { a: "learned", b: "practicing" }, completedMicroPathIds: ["micro-a"] });
    expect(plan.nextAction).toMatchObject({ resourceKind: "course", reasonCode: "course_route_complete" });
    expect(plan.nextAction.nodeId).toBeUndefined();
    expect(plan.policyVersion).toBe("course-rule-v2");
  });
  it("does not force optional Micro after the Knowledge is learned", () => {
    expect(computeNavigationPlan({ ...base, knowledgeStatuses: { a: "learned" }, microPaths: [{ id: "optional", nodeId: "a", order: 0 }] }).nextAction.nodeId).toBe("b");
  });
  it("selects the next incomplete required path when several exist", () => {
    const plan = computeNavigationPlan({ ...base, knowledgeStatuses: { a: "learned" }, completedMicroPathIds: ["micro-a"], microPaths: [...base.microPaths, { id: "micro-a2", nodeId: "a", order: 1, required: true }] });
    expect(plan.nextAction.resourceId).toBe("micro-a2");
  });
  it("prefers required assets before optional assets regardless of display order",()=>{
    const plan=computeNavigationPlan({...base,microPaths:[{id:"optional",nodeId:"a",order:0,required:false},{id:"required",nodeId:"a",order:2,required:true}]});
    expect(plan.nextAction.resourceId).toBe("required");
  });
});

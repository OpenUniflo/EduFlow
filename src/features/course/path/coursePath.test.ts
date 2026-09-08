import { computeNavigationPlan } from "../../../../api/_lib/navigationEngine";
import { evaluatePrerequisiteReachability } from "../runtime/courseUnlockPolicy";
import type { UserKnowledgeRecord } from "@/features/profile/types";
import { describe, expect, it } from "vitest";
import { buildCoursePath } from "./coursePath";
import type { CourseGraphData } from "../runtime/courseRuntime";

const graph = { knowledgeNodes: [
  { id:"a", title:"A", primaryCoverage:{lessonOrder:1,order:0} },
  { id:"b", title:"B", primaryCoverage:{lessonOrder:2,order:0} },
  { id:"c", title:"C", primaryCoverage:{lessonOrder:3,order:0} }
], knowledgeEdges:[{id:"a-b",source:"a",target:"b",relation:"prerequisite"},{id:"b-c",source:"b",target:"c",relation:"prerequisite"}] } as unknown as CourseGraphData;

describe("Course Path", () => {
  it("uses curriculum order while factual prerequisites explain blocking", () => {
    expect(buildCoursePath(graph, []).map((item) => [item.node.id,item.state,item.blockedBy])).toEqual([["a","available",[]],["b","blocked",["A"]],["c","blocked",["B"]]]);
  });
  it("shares durable knowledge state and advances availability after mastery", () => {
    expect(buildCoursePath(graph, [{nodeId:"a",status:"mastered"},{nodeId:"b",status:"learning"}] as any).map((item) => item.state)).toEqual(["completed","underway","blocked"]);
  });
  it.each(["learning", "practicing"])("maps %s to underway", (status) => {
    expect(buildCoursePath(graph, [{ nodeId: "a", status }] as any)[0].state).toBe("underway");
  });
  it("keeps learned distinct from mastery after a completed learning activity", () => {
    expect(buildCoursePath(graph, [{ nodeId: "a", status: "learned" }] as any)[0].state).toBe("learned");
  });
  it("uses the same prerequisite reachability as the runtime graph", () => {
    expect(buildCoursePath(graph, [{ nodeId: "a", status: "learning" }] as any)[1].state).toBe("blocked");
    expect(buildCoursePath(graph, [{ nodeId: "a", status: "mastered" }] as any)[1].state).toBe("available");
  });
});

// Exercise consumers together: presentation labels may differ, eligibility must not.
it.each(["explore", "learning", "learned", "practicing", "mastered"] as const)("Graph/Path/Navigation prerequisite parity for %s", (status) => {
  const satisfied = ["learned", "practicing", "mastered"].includes(status);
  const records = [{ nodeId: "a", status }] as UserKnowledgeRecord[];
  const path = buildCoursePath(graph, records);
  const plan = computeNavigationPlan({ courseId: "course", targetNodeIds: [], nodes: graph.knowledgeNodes.map((node)=>({id:node.id,title:node.title,lessonOrder:node.primaryCoverage.lessonOrder,coverageOrder:node.primaryCoverage.order})), prerequisiteEdges: graph.knowledgeEdges, knowledgeStatuses: { a: status }, microPaths: [], completedMicroPathIds: [], assignments: [], assignmentOutcomes: {}, materials: [] });
  expect(evaluatePrerequisiteReachability(undefined,[status])).toBe(satisfied ? "available" : "locked");
  expect(path[1].state).toBe(satisfied ? "available" : "blocked");
  expect(plan.path[1].state).toBe(satisfied ? "eligible" : "blocked");
});
it("does not gate a Course Path on an external prerequisite", () => {
  const external = { ...graph, knowledgeEdges: [{ ...graph.knowledgeEdges[0], id:"external-a",source:"external",target:"a" }] };
  expect(buildCoursePath(external, [])[0]).toMatchObject({state:"available",blockedBy:[]});
});

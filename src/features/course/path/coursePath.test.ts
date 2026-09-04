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

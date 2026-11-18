import { describe, expect, it } from "vitest";
import { buildCapabilityModel, planCourseRoute } from "../../src/shared/learning/routePlanning";
import { syntheticNodeId, syntheticRouteCourses } from "../fixtures/capabilityRouteEntries";

const routeOf = (input: Parameters<typeof planCourseRoute>[0], constraints?: Parameters<typeof planCourseRoute>[1]) => {
  const plan = planCourseRoute(input, constraints);
  if (!plan.valid) throw new Error(JSON.stringify(plan.conflicts));
  return plan.route;
};

describe.each(syntheticRouteCourses)("synthetic route entries: $id", (course) => {
  const id = (suffix: string) => syntheticNodeId(course, suffix);

  it("admits a target with no hard prerequisite as a direct route member", () => {
    const model = buildCapabilityModel(course.input);
    expect(model.orderedNodeIds).toContain(id("ENTRY"));
    expect(model.connectedCourseKnowledgeIds).toContain(id("ENTRY"));
    expect(routeOf(course.input).selectedNodeIds).toContain(id("ENTRY"));
  });

  it("admits an extra-course factual root as a gray start and routes through it", () => {
    const model = buildCapabilityModel(course.input);
    const route = routeOf(course.input);
    expect(model.orderedNodeIds).toContain(id("ROOT"));
    expect(model.bridgeKnowledgeIds).toContain(id("ROOT"));
    expect(model.supportEdges.map((edge) => edge.id)).toContain(`${id("ROOT")}>${id("MIDDLE")}`);
    expect(route.selectedNodeIds).toEqual(expect.arrayContaining([id("ROOT"), id("MIDDLE"), id("CHAIN")]));
    expect(route.bridgeKnowledgeIds).toContain(id("ROOT"));
  });

  it("keeps an acquired capability as a start and reaches its target through hard prerequisites", () => {
    const model = buildCapabilityModel(course.input);
    const route = routeOf(course.input);
    expect(model.currentKnowledgeIds).toContain(id("ACQUIRED"));
    expect(route.currentKnowledgeIds).toContain(id("ACQUIRED"));
    expect(route.selectedNodeIds).toEqual(expect.arrayContaining([id("SUPPORTED"), id("ACQUIRED_TARGET")]));
  });

  it("does not let a soft prerequisite block a target", () => {
    const model = buildCapabilityModel(course.input);
    const route = routeOf(course.input);
    expect(model.connectedCourseKnowledgeIds).toContain(id("SOFT_ONLY"));
    expect(route.selectedNodeIds).toContain(id("SOFT_ONLY"));
    expect(route.selectedNodeIds).not.toContain(id("SOFT_SOURCE"));
  });

  it("still reports an excluded hard prerequisite with the concrete node", () => {
    const plan = planCourseRoute(course.input, { includeNodeIds: [], excludeNodeIds: [id("ROOT")] });
    expect(plan).toMatchObject({
      valid: false,
      conflicts: expect.arrayContaining([
        expect.objectContaining({ kind: "excluded_hard_prerequisite", nodeId: id("ROOT"), rootNodeId: id("CHAIN") }),
      ]),
      route: null,
    });
    if (!plan.valid) expect(plan.conflicts.some((conflict) => conflict.rootNodeId === id("SOFT_ONLY"))).toBe(false);
  });

  it("still reports an unavailable hard prerequisite without inventing a path", () => {
    const input = { ...course.input, nodeIds: course.input.nodeIds.filter((nodeId) => nodeId !== id("ROOT")) };
    const model = buildCapabilityModel(input);
    expect(model.orderedNodeIds).not.toContain(id("ROOT"));
    expect(model.orderedNodeIds).not.toContain(id("MIDDLE"));
    expect(planCourseRoute(input)).toMatchObject({
      valid: false,
      conflicts: expect.arrayContaining([
        expect.objectContaining({ kind: "unavailable_hard_prerequisite", nodeId: id("ROOT"), rootNodeId: id("CHAIN") }),
      ]),
      route: null,
    });
  });

  it("only uses supplied factual edges and never fabricates members", () => {
    const model = buildCapabilityModel(course.input);
    const facts = new Set([...course.input.prerequisiteEdges, ...(course.input.enablesEdges ?? [])].map((edge) => edge.id));
    expect(model.orderedNodeIds.every((nodeId) => course.input.nodeIds.includes(nodeId))).toBe(true);
    expect(model.supportEdges.every((edge) => facts.has(edge.id))).toBe(true);
  });
});

it("the three synthetic Course graphs are structurally equivalent", () => {
  const summaries = syntheticRouteCourses.map((course) => {
    const model = buildCapabilityModel(course.input);
    const route = routeOf(course.input);
    return {
      nodes: model.orderedNodeIds.length,
      edges: model.supportEdges.length,
      bridges: model.bridgeKnowledgeIds.length,
      routeNodes: route.selectedNodeIds.length,
      routeBridges: route.bridgeKnowledgeIds.length,
      conflicts: planCourseRoute(course.input).valid ? 0 : 1,
    };
  });
  expect(new Set(summaries.map((summary) => JSON.stringify(summary))).size).toBe(1);
});

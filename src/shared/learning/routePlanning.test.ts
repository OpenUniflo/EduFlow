import { describe, expect, it } from 'vitest';
import { buildCapabilityModel, planCourseRoute, routeStructure, PrerequisiteCycleError, type RoutePlanningInput, type RouteConstraints } from './routePlanning';
const input = (hard: string[], soft: string[] = [], targets = ['T'], current: string[] = []): RoutePlanningInput => ({
  nodeIds: [...new Set([...hard, ...soft].flatMap(pair => pair.split('>')).concat(targets, current))],
  prerequisiteEdges: [...hard.map(id => ({ id, strength: 'hard' as const })), ...soft.map(id => ({ id, strength: 'soft' as const }))].map(edge => ({ ...edge, source: edge.id.split('>')[0], target: edge.id.split('>')[1] })),
  currentNodeIds: current,
  courseOrder: targets.map((nodeId, lessonOrder) => ({ nodeId, lessonOrder, coverageOrder: 0 })),
});
const constraints = (includeNodeIds: string[] = [], excludeNodeIds: string[] = []): RouteConstraints => ({ includeNodeIds, excludeNodeIds });
function route(data: RoutePlanningInput, intent = constraints()) {
  const result = planCourseRoute(data, intent);
  if (!result.valid) throw new Error(JSON.stringify(result.conflicts));
  return result.route;
}
describe('V2 necessary route and distinct candidate space', () => {
  it('requires every hard branch, leaves optional soft branch in model only', () => {
    const data = input(['A>T', 'B>T', 'C>S'], ['S>T']);
    expect(buildCapabilityModel(data).orderedNodeIds).toEqual(['A', 'B', 'C', 'S', 'T']);
    expect(route(data).orderedNodeIds).toEqual(['A', 'B', 'T']);
    expect(route(data, constraints(['S'])).orderedNodeIds).toEqual(['A', 'B', 'C', 'S', 'T']);
    expect(route(data, constraints(['S'])).prerequisiteEdges.find(edge => edge.id === 'S>T')?.strength).toBe('soft');
  });
  it('retains soft when its source is a target or needed by another hard branch', () => {
    expect(route(input([], ['S>T'], ['T', 'S'])).orderedNodeIds).toEqual(['S', 'T']);
    expect(route(input(['S>X'], ['S>T'], ['T', 'X'])).selectedNodeIds).toEqual(['S', 'T', 'X']);
  });
  it('includes no-hard roots and the currently satisfied hard frontier', () => {
    const data = input(['A>B', 'B>T'], [], ['T'], ['A']);
    expect(buildCapabilityModel(data).actionableNodeIds).toEqual(['A', 'B']);
    expect(buildCapabilityModel({ ...data, currentNodeIds: [] }).actionableNodeIds).toEqual(['A']);
    expect(route(data).orderedNodeIds).toEqual(['A', 'B', 'T']);
  });
  it('does not confuse one hard predecessor with AND learnability', () => {
    const data = { ...input(['A>T', 'M>T']), nodeIds: ['A', 'T'] };
    expect(buildCapabilityModel(data).disconnectedCourseKnowledgeIds).toEqual(['T']);
    expect(buildCapabilityModel(data).orderedNodeIds).toContain('T');
    expect(planCourseRoute(data)).toMatchObject({ valid: false, conflicts: [{ kind: 'unavailable_hard_prerequisite', nodeId: 'M', rootNodeId: 'T' }] });
  });
  it('cuts unreachable soft intermediates rather than leaving disconnected upstream candidates', () => {
    const data = { ...input(['M>B'], ['A>B', 'B>T']), nodeIds: ['A', 'B', 'T'] };
    expect(buildCapabilityModel(data).orderedNodeIds).toEqual(['T']);
    expect(route(data).orderedNodeIds).toEqual(['T']);
  });
  it('keeps unavailable targets as terminals without inventing facts or outside identities', () => {
    const data = { ...input(['M>B'], ['A>B', 'B>T'], ['T', 'B']), nodeIds: ['A', 'B', 'T'] };
    const model = buildCapabilityModel(data);
    expect(model.orderedNodeIds).toEqual(['A', 'B', 'T']);
    expect(model.disconnectedCourseKnowledgeIds).toEqual(['B']);
    expect(model.orderedNodeIds).not.toContain('M');
  });
  it('omits unrelated acquired nodes and stops closure at an acquired boundary', () => {
    const data = input(['A>B', 'B>T'], [], ['T'], ['B', 'X']);
    expect(buildCapabilityModel(data).orderedNodeIds).not.toContain('X');
    expect(route(data).orderedNodeIds).toEqual(['B', 'T']);
    expect(route({ ...data, currentNodeIds: ['T'] }).orderedNodeIds).toEqual(['T']);
    expect(route(data, constraints(['B'])).orderedNodeIds).toEqual(['B', 'T']);
  });
});
describe('V2 Include / Exclude constraints', () => {
  it('can exclude soft and ordinary unused intermediate capabilities', () => {
    expect(route(input(['A>S'], ['S>T']), constraints([], ['S'])).orderedNodeIds).toEqual(['T']);
  });
  it('excluded acquired hard support is never used', () => {
    const result = planCourseRoute(input(['A>T'], [], ['T'], ['A']), constraints([], ['A']));
    expect(result).toMatchObject({ valid: false, conflicts: [{ kind: 'excluded_hard_prerequisite', nodeId: 'A', rootNodeId: 'T', rootKind: 'target', constraint: 'exclude' }] });
  });
  it('identifies each affected target for a shared excluded hard ancestor', () => {
    const result = planCourseRoute(input(['A>B', 'B>T', 'B>X'], [], ['T', 'X']), constraints([], ['A']));
    expect(result.conflicts.map(c => [c.rootNodeId, c.nodeId])).toEqual([['T', 'A'], ['X', 'A']]);
  });
  it('excluding a target drops the promise while retaining it in the model', () => {
    const data = input([], [], ['T', 'X']);
    expect(route(data, constraints([], ['T'])).effectiveTargetNodeIds).toEqual(['X']);
    expect(buildCapabilityModel(data).courseKnowledgeIds).toEqual(['T', 'X']);
    const empty = route(data, constraints([], ['T', 'X']));
    expect(empty).toEqual({ orderedNodeIds: [], selectedNodeIds: [], prerequisiteEdges: [], effectiveTargetNodeIds: [], currentKnowledgeIds: [], bridgeKnowledgeIds: [] });
  });
  it('an excluded target can still be an indispensable prerequisite for a retained target', () => {
    expect(planCourseRoute(input(['T>X'], [], ['T', 'X']), constraints([], ['T']))).toMatchObject({ valid: false, conflicts: [{ rootNodeId: 'X', nodeId: 'T' }] });
  });
  it('honors explicit Include after all targets are excluded', () => {
    expect(route(input(['A>S'], ['S>T']), constraints(['S'], ['T'])).orderedNodeIds).toEqual(['A', 'S']);
  });
  it('rejects overlap, including acquired nodes', () => {
    expect(planCourseRoute(input([], [], ['T'], ['T']), constraints(['T'], ['T']))).toMatchObject({ valid: false, conflicts: [{ kind: 'include_exclude', nodeId: 'T' }] });
  });
  it('rejects includes outside candidate space even if they are visible', () => {
    expect(planCourseRoute(input([], [], ['T'], ['X']), constraints(['X']))).toMatchObject({ valid: false, conflicts: [{ kind: 'include_outside_model', rootNodeId: 'X' }] });
  });
  it('explains Include hard closure failure with the include root', () => {
    expect(planCourseRoute(input(['A>B', 'B>S'], ['S>T']), constraints(['S'], ['A']))).toMatchObject({ valid: false, conflicts: [{ kind: 'excluded_hard_prerequisite', rootKind: 'include', rootNodeId: 'S', nodeId: 'A' }] });
  });
});
describe('V2 determinism, fingerprint and graph integrity', () => {
  it('orders a multi-target subgraph by downstream curriculum priority and stable IDs', () => {
    const data = input(['A>B', 'B>Z', 'A>C', 'C>X'], [], ['X', 'Z']);
    expect(route(data).orderedNodeIds).toEqual(['A', 'C', 'X', 'B', 'Z']);
  });
  it('never mutates inputs and is invariant to every input array permutation', () => {
    const data = input(['A>T', 'B>T', 'C>S'], ['S>T'], ['T', 'X'], ['A']);
    const original = structuredClone(data); const intent = constraints(['S'], ['X']);
    const reversed = { nodeIds: [...data.nodeIds].reverse(), prerequisiteEdges: [...data.prerequisiteEdges].reverse(), courseOrder: [...data.courseOrder].reverse(), currentNodeIds: [...data.currentNodeIds].reverse() };
    expect(planCourseRoute(reversed, intent)).toEqual(planCourseRoute(data, intent));
    expect(buildCapabilityModel(reversed)).toEqual(buildCapabilityModel(data));
    expect(routeStructure(reversed, intent)).toEqual(routeStructure(data, intent));
    expect(data).toEqual(original); expect(intent).toEqual(constraints(['S'], ['X']));
  });
  it('structural fingerprint input ignores state even when selected closure changes', () => {
    const data = input(['A>B', 'B>T']); const after = { ...data, currentNodeIds: ['B'] };
    expect(route(data).selectedNodeIds).not.toEqual(route(after).selectedNodeIds);
    expect(routeStructure(data, constraints())).toEqual(routeStructure(after, constraints()));
    expect(routeStructure({ ...data, prerequisiteEdges: data.prerequisiteEdges.map(e => ({ ...e, strength: 'soft' as const })) }, constraints())).not.toEqual(routeStructure(data, constraints()));
  });
  it.each([['A>B', 'B>A'], ['A>A'], ['X>Y', 'Y>X']])('rejects all supplied cycles, including outside targets', (...pairs) => {
    const data = input(pairs);
    expect(() => buildCapabilityModel(data)).toThrow(PrerequisiteCycleError);
    expect(planCourseRoute(data)).toEqual({ valid: false, route: null, conflicts: [{ kind: 'prerequisite_cycle', constraint: 'knowledge_graph' }] });
  });
  it('does not enumerate paths in a branching graph or recurse on long chains', () => {
    const hard = Array.from({ length: 5000 }, (_, i) => `N${i}>N${i + 1}`);
    expect(route(input(hard, [], ['N5000'])).orderedNodeIds).toHaveLength(5001);
  });
});

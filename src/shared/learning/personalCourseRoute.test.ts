import { describe, expect, it } from 'vitest';
import { buildCapabilityModel as buildPersonalCourseRoute, PrerequisiteCycleError, type RoutePlanningInput as PersonalCourseRouteInput } from './routePlanning';
import { satisfiesTeachingPrerequisite } from './teachingPrerequisites';
const input = (pairs: string[], course: string[], current = ['A']): PersonalCourseRouteInput => ({
  nodeIds: [...new Set([...pairs.flatMap(pair => pair.split('>')), ...course, ...current])],
  prerequisiteEdges: pairs.map(pair => { const [source, target] = pair.split('>'); return { id: pair, source, target, strength: 'hard' }; }),
  currentNodeIds: current,
  courseOrder: course.map((nodeId, index) => ({ nodeId, lessonOrder: index, coverageOrder: 0 })),
});
describe('V2 candidate model regressions from V1', () => {
  it('includes the entire connected space without changing curriculum', () => {
    const data = input(['A>B', 'B>C', 'C>Z'], ['Z']);
    const original = structuredClone(data);
    const route = buildPersonalCourseRoute(data);
    expect(route.orderedNodeIds).toEqual(['A', 'B', 'C', 'Z']);
    expect(route.bridgeKnowledgeIds).toEqual(['A', 'B', 'C']);
    expect(route.currentKnowledgeIds).toEqual(['A']);
    expect(data).toEqual(original);
  });
  it('retains both AND branches and all Course targets', () => {
    const route = buildPersonalCourseRoute(input(['A>B', 'A>C', 'B>D', 'C>D', 'C>Y'], ['D', 'Y']));
    expect(route.orderedNodeIds).toEqual(['A', 'B', 'C', 'D', 'Y']);
    expect(route.prerequisiteEdges).toHaveLength(5);
  });
  it('disconnected current state admits actionable roots with real internal edges', () => {
    const route = buildPersonalCourseRoute(input(['A>B', 'X>Y', 'Q>X'], ['X', 'Y']));
    expect(route.orderedNodeIds).toEqual(['Q', 'X', 'Y']);
    expect(route.prerequisiteEdges.map(edge => edge.id)).toEqual(['Q>X', 'X>Y']);
    expect(route.bridgeKnowledgeIds).toEqual(['Q']);
  });
  it('retains disconnected Course targets beside connected targets', () => {
    const route = buildPersonalCourseRoute(input(['A>B', 'B>X'], ['X', 'Y']));
    expect(route.orderedNodeIds).toEqual(['A', 'B', 'X', 'Y']);
    expect(route.disconnectedCourseKnowledgeIds).toEqual([]);
  });
  it('keeps satisfied bridges and overlapping current/course roles', () => {
    const route = buildPersonalCourseRoute(input(['A>B', 'B>Z'], ['Z'], ['A', 'B', 'Z']));
    expect(route.currentKnowledgeIds).toEqual(['A', 'B', 'Z']);
    expect(route.courseKnowledgeIds).toEqual(['Z']);
  });
  it('uses the earliest downstream curriculum anchor with deterministic ready ordering', () => {
    expect(buildPersonalCourseRoute(input(['A>B', 'B>Z', 'A>C', 'C>X'], ['X', 'Z'])).orderedNodeIds).toEqual(['A', 'C', 'X', 'B', 'Z']);
  });
  it('is unchanged by reversed graph, state, and coverage input arrays', () => {
    const data = input(['A>B', 'A>C', 'B>D', 'C>D'], ['D', 'X'], ['A', 'C']);
    expect(buildPersonalCourseRoute({ nodeIds: [...data.nodeIds].reverse(), prerequisiteEdges: [...data.prerequisiteEdges].reverse(), currentNodeIds: [...data.currentNodeIds].reverse(), courseOrder: [...data.courseOrder].reverse() })).toEqual(buildPersonalCourseRoute(data));
  });
  it.each([['A>B', 'B>A'], ['A>A'], ['X>Y', 'Y>X']])('rejects prerequisite cycles explicitly: %s', (...pairs) => {
    expect(() => buildPersonalCourseRoute(input(pairs, ['Z']))).toThrow(PrerequisiteCycleError);
  });
  it('keeps users independent and responds to cross-Course state updates', () => {
    const data = input(['A>B', 'B>Z'], ['Z']);
    const before = buildPersonalCourseRoute({ ...data, currentNodeIds: [] });
    expect(before.orderedNodeIds).toEqual(['A', 'B', 'Z']);
    expect(buildPersonalCourseRoute(data).orderedNodeIds).toEqual(['A', 'B', 'Z']);
    expect(buildPersonalCourseRoute({ ...data, currentNodeIds: [] })).toEqual(before);
  });
  it.each(['learned', 'practicing', 'mastered'])('uses shared readiness for %s', status => expect(satisfiesTeachingPrerequisite(status)).toBe(true));
  it.each(['learning', 'explore', undefined])('does not treat %s as current capability', status => expect(satisfiesTeachingPrerequisite(status)).toBe(false));
  it('does not include invisible or inactive identities supplied only by an edge', () => {
    const data = input(['A>B', 'B>Z'], ['Z']);
    expect(buildPersonalCourseRoute({ ...data, nodeIds: ['A', 'Z'] }).orderedNodeIds).toEqual(['Z']);
  });
});

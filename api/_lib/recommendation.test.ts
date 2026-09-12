import { describe, expect, it } from 'vitest';
import { FixedPolicy, RulePolicy, generateCandidates, modelPolicy, recommend, resolveRecommendationPolicy } from './recommendation';
import { computeNavigationPlan } from './navigationEngine';
import { estimateCriterionState } from '../../src/shared/learning/criterionState';
import type { NavigationEngineInput } from '../../src/shared/learning/navigation';
const input = (): NavigationEngineInput => ({ courseId: 'course', targetNodeIds: ['a', 'b', 'c'],
  nodes: ['a', 'b', 'c'].map((id, index) => ({ id, title: id, lessonOrder: index, coverageOrder: 0 })),
  prerequisiteEdges: [{ source: 'a', target: 'c' }], knowledgeStatuses: {},
  microPaths: ['a', 'b', 'c'].map(id => ({ id: `path-${id}`, nodeId: id, order: 0, required: true })),
  completedMicroPathIds: [], assignments: [], assignmentOutcomes: {}, materials: [],
});
const mapping = new Map([['path-b', ['criterion-b']], ['path-c', ['criterion-c']]]);
const insufficient = (id: string) => estimateCriterionState({ criterionId: id, version: 1 }, [{ criterionId: id, version: 1, id: 'fact', sequence: 1, outcome: 'incorrect', sourceKind: 'actual-observation', sourceId: 'attempt' }]);
describe('recommendation boundary', () => {
  it('keeps Fixed on the course-rule-v4 frontier and permits real state to reorder the same legal set', () => {
    const baseline = computeNavigationPlan(input());
    const candidates = generateCandidates(input(), mapping);
    expect(candidates.map(c => c.resourceId)).toEqual(['path-a', 'path-b']);
    const context = { baseline, states: [insufficient('criterion-b')] };
    expect(FixedPolicy.recommend(context, candidates).selectedAction?.resourceId).toBe('path-a');
    expect(RulePolicy.recommend(context, candidates)).toMatchObject({ selectedAction: { resourceId: 'path-b' }, reasonCode: 'criterion_insufficient' });
  });
  it('does not allow weak state to override prerequisite, completed or missing assets', () => {
    const result = recommend(input(), [insufficient('criterion-c')], mapping, 'rule_v1');
    expect(result.selection.selectedAction?.resourceId).toBe('path-a');
    const completed = input(); completed.completedMicroPathIds = ['path-b'];
    expect(generateCandidates(completed, mapping).map(c => c.resourceId)).toEqual(['path-a']);
    completed.microPaths = completed.microPaths.filter(p => p.nodeId !== 'a');
    expect(generateCandidates(completed, mapping)).toEqual([]);
  });
  it('falls back for unknown/unmapped state and rejects unsupported policy configuration', () => {
    const state = estimateCriterionState({ criterionId: 'criterion-b', version: 1 }, []);
    expect(recommend(input(), [state], mapping, 'rule_v1').selection.selectedAction?.resourceId).toBe('path-a');
    expect(recommend(input(), [insufficient('missing')], mapping, 'rule_v1').selection.selectedAction?.resourceId).toBe('path-a');
    expect(resolveRecommendationPolicy(undefined)).toBe(FixedPolicy);
    expect(resolveRecommendationPolicy('rule_v1')).toBe(RulePolicy);
    expect(() => resolveRecommendationPolicy('model')).toThrow('Unsupported');
    expect(modelPolicy).toEqual({ key: 'model', status: 'unsupported' });
  });
  it('is deterministic under asset input reordering', () => {
    const original = input(); const reordered = { ...original, nodes: [...original.nodes].reverse(), microPaths: [...original.microPaths].reverse() };
    expect(generateCandidates(reordered, mapping)).toEqual(generateCandidates(original, mapping));
  });
  it('never reintroduces a filtered historical baseline action', () => {
    const historical = input(); historical.nodes = historical.nodes.filter(n => n.id !== 'b');
    historical.targetNodeIds = ['c']; historical.knowledgeStatuses = { a: 'mastered', c: 'learned' };
    historical.prerequisiteEdges.push({ source: 'c', target: 'a' });
    // A concrete malformed historical state can produce a baseline resume but not legal candidates.
    historical.nodes.push({ id: 'prereq', title: 'Prereq', lessonOrder: 5, coverageOrder: 0 });
    historical.prerequisiteEdges.push({ source: 'prereq', target: 'c' });
    const result = recommend(historical, [], mapping, 'fixed');
    expect(result.selection.selectedAction).toBeNull();
    expect(result.baseline.nextAction.resourceKind).toBe('course');
  });
});

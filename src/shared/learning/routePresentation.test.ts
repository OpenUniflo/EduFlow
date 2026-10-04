import { describe, expect, it } from 'vitest';
import { routeRelations } from './routePresentation';
import { planCourseRoute, type SelectedRoute, type CapabilityRelation } from './routePlanning';
const prerequisites = [{ id: 'ab', source: 'A', target: 'B', strength: 'hard' as const }, { id: 'cb', source: 'C', target: 'B', strength: 'hard' as const }, { id: 'bd', source: 'B', target: 'D', strength: 'soft' as const }];
const route: SelectedRoute = { orderedNodeIds: ['A','C','B','D'], selectedNodeIds: ['A','B','C','D'], prerequisiteEdges: prerequisites, currentKnowledgeIds: [], bridgeKnowledgeIds: ['C'], effectiveTargetNodeIds: ['D'] };
describe('factual personal route presentation', () => {
  it('preserves the DAG, including bridge/cross-chapter facts, without adjacent-order edges', () => {
    const edges = routeRelations(route, []);
    expect(edges.map(edge => [edge.source, edge.target])).toEqual([['A','B'],['B','D'],['C','B']]);
    expect(edges.some(edge => edge.source === 'A' && edge.target === 'C')).toBe(false);
    expect(routeRelations({ ...route, orderedNodeIds: ['C','A','B','D'] }, [])).toEqual(edges);
  });
  it('adds only factual in-scope enables and never merges them into prerequisites', () => {
    const support: CapabilityRelation[] = [{ id: 'ad', source: 'A', target: 'D', relation: 'enables', strength: 0.8 }, { id: 'xd', source: 'X', target: 'D', relation: 'enables', strength: 0.5 }, { id: 'extra', source: 'A', target: 'D', relation: 'prerequisite', strength: 'hard' }];
    expect(routeRelations(route, support).map(edge => edge.id)).toEqual(['ab','ad','bd','cb']);
    expect(routeRelations(route, support).find(edge => edge.id === 'ad')).toMatchObject({ relation: 'enables', strength: 0.8 });
    expect(route.prerequisiteEdges).toEqual(prerequisites);
  });
  it('enables never pulls a source into the necessary route', () => {
    const plan = planCourseRoute({ nodeIds: ['A','B'], currentNodeIds: ['A'], prerequisiteEdges: [], enablesEdges: [{ id: 'ab', source: 'A', target: 'B', relation: 'enables', strength: 1 }], courseOrder: [{ nodeId: 'B', lessonOrder: 0, coverageOrder: 0 }] });
    expect(plan.valid && plan.route.selectedNodeIds).toEqual(['B']);
    expect(plan.valid && routeRelations(plan.route, [])).toEqual([]);
  });
});

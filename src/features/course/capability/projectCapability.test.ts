import { describe, expect, it } from 'vitest';
import { buildProjectCapabilityModel, projectCapabilityAtlas } from './projectCapability';
import { routeOnlyKnowledgeGraph, routeOnlyRuntime } from '../runtime/courseFoundation.fixture';
import type { KnowledgeGraph, KnowledgeEdge } from '@/features/knowledge/types';
import { atlasStructureKey } from '@/features/knowledge/atlasCamera';
const target = 'route-knowledge';
const node = (id: string) => ({ ...routeOnlyKnowledgeGraph.nodes[0], id });
const graph = (edges: KnowledgeEdge[]): KnowledgeGraph => ({ nodes: [node('current'), node('bridge'), node(target)], edges, revisions: [] });
const edge = (source: string, destination: string): KnowledgeEdge => ({ id: `${source}>${destination}`, source, target: destination, relation: 'prerequisite', strength: 'soft', reason: 'Test' });
const governance = { domains: [], assignments: [], candidates: [], proposals: [], revision: 1 };
describe('Project capability feature adapter', () => {
  it.each(['enables', 'related'] as const)('never computes membership from %s', relation => {
    const input = graph([{ ...edge('current', target), relation, strength: .8 }]);
    expect(buildProjectCapabilityModel(input, routeOnlyRuntime, [{ nodeId: 'current', status: 'mastered' }]).orderedNodeIds).toEqual([target]);
  });
  it('ignores inactive current and Course nodes', () => {
    const input = graph([edge('current', target)]);
    input.nodes[0].status = 'superseded';
    expect(buildProjectCapabilityModel(input, routeOnlyRuntime, [{ nodeId: 'current', status: 'mastered' }]).orderedNodeIds).toEqual([target]);
    input.nodes[2].status = 'deprecated';
    expect(buildProjectCapabilityModel(input, routeOnlyRuntime, []).orderedNodeIds).toEqual([]);
  });
  it('uses earliest actual lesson/coverage order independently of input order and primary role', () => {
    const runtime = { ...routeOnlyRuntime, lessons: [{ ...routeOnlyRuntime.lessons[0], id: 'late', order: 9 }, ...routeOnlyRuntime.lessons], curriculumCoverages: [
      { ...routeOnlyRuntime.curriculumCoverages[0], id: 'late', lessonId: 'late', order: 0 },
      { ...routeOnlyRuntime.curriculumCoverages[0], id: 'early', role: 'reinforce' as const, order: 1 },
      { ...routeOnlyRuntime.curriculumCoverages[0], id: 'other', nodeId: 'bridge', order: 2 },
    ] };
    expect(buildProjectCapabilityModel(graph([]), runtime, []).orderedNodeIds).toEqual([target, 'bridge']);
  });
  it('keeps status/role changes out of scene structural identity', () => {
    const input = graph([edge('current', 'bridge'), edge('bridge', target)]);
    const initial = [{ nodeId: 'current', status: 'mastered' as const }];
    const updated = [...initial, { nodeId: 'bridge', status: 'mastered' as const }];
    const before = projectCapabilityAtlas(input, buildProjectCapabilityModel(input, routeOnlyRuntime, initial), governance, initial);
    const after = projectCapabilityAtlas(input, buildProjectCapabilityModel(input, routeOnlyRuntime, updated), governance, updated);
    expect(atlasStructureKey(before.nodes, before.edges, 'project')).toBe(atlasStructureKey(after.nodes, after.edges, 'project'));
    expect(after.nodes.find(node => node.id === 'bridge')?.capabilityRoles).toEqual({ current: true, course: false, bridge: true });
    expect(before.nodes.map(node => node.color)).toEqual(after.nodes.map(node => node.color));
    expect(before.nodes.map(node => node.visualImportance)).toEqual(after.nodes.map(node => node.visualImportance));
  });
});

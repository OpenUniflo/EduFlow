import { describe, expect, it } from 'vitest';
import { projectStructuralGraph, projectRouteOverlay } from './projectRoutePresentation';
import { buildProjectCapabilityModel, projectCapabilityAtlas } from './projectCapability';
import { routeOnlyKnowledgeGraph, routeOnlyRuntime } from '../runtime/courseFoundation.fixture';
import type { KnowledgeGraph, KnowledgeEdge } from '@/features/knowledge/types';
import type { SelectedRoute } from '@/shared/learning/routePlanning';
import { atlasStructureKey } from '@/features/knowledge/atlasCamera';

const target = 'route-knowledge';
const prerequisite = (source: string, target: string): KnowledgeEdge => ({ id: `${source}>${target}`, source, target, relation: 'prerequisite', strength: 'hard', reason: 'Factual test relation' });
const input: KnowledgeGraph = {
  nodes: ['root', 'bridge', target, 'other', 'inactive'].map(id => ({ ...routeOnlyKnowledgeGraph.nodes[0], id, status: id === 'inactive' ? 'deprecated' : 'active' })),
  edges: [prerequisite('root', 'bridge'), prerequisite('bridge', target), prerequisite('inactive', target),
    { ...prerequisite('root', target), relation: 'enables', strength: .8 },
    { ...prerequisite('bridge', 'root'), relation: 'enables', strength: .8 },
    { ...prerequisite('other', target), relation: 'related', strength: .8 }], revisions: [],
};
const route = (ids: string[], edges: SelectedRoute['prerequisiteEdges'] = []): SelectedRoute => ({ selectedNodeIds: ids, orderedNodeIds: [...ids].reverse(), prerequisiteEdges: edges, effectiveTargetNodeIds: [target], currentKnowledgeIds: [], bridgeKnowledgeIds: [] });
const governance = { domains: [], assignments: [], candidates: [], proposals: [], revision: 1 };

describe('Project stable structure and route overlays', () => {
  it('walks factual incoming closure through enables cycles, excluding inactive and related nodes', () => {
    const graph = projectStructuralGraph(input, [target, 'missing']);
    expect(graph.nodes.map(node => node.id)).toEqual(['bridge', 'root', target]);
    expect(graph.edges.map(edge => edge.id)).toEqual(['bridge>root', `bridge>${target}`, 'root>bridge', `root>${target}`]);
    expect(graph.edges.every(edge => input.edges.includes(edge))).toBe(true);
    expect(projectStructuralGraph({ ...input, nodes: [...input.nodes].reverse(), edges: [...input.edges].reverse() }, [target])).toEqual(graph);
  });

  it('preserves force identity after acquiring the target prunes candidate ancestors', () => {
    const supportedInput = { ...input, edges: input.edges.filter(edge => edge.source !== 'inactive') };
    const structural = projectStructuralGraph(supportedInput, [target]);
    const initial = [{ nodeId: 'root', status: 'learned' as const }];
    const beforeModel = buildProjectCapabilityModel(supportedInput, routeOnlyRuntime, initial);
    const state = [...initial, { nodeId: target, status: 'learned' as const }];
    const afterModel = buildProjectCapabilityModel(supportedInput, routeOnlyRuntime, state);
    expect(beforeModel.orderedNodeIds).not.toEqual(afterModel.orderedNodeIds);
    const before = projectCapabilityAtlas(input, beforeModel, governance, initial, structural);
    const after = projectCapabilityAtlas(input, afterModel, governance, state, structural);
    expect(atlasStructureKey(before.nodes, before.edges, 'project')).toBe(atlasStructureKey(after.nodes, after.edges, 'project'));
    expect(after.nodes.find(node => node.id === target)?.color).toBe('#3b82f6');
  });

  it('diffs real prerequisite and enables IDs without deriving edges from reading order', () => {
    const graph = projectStructuralGraph(input, [target]);
    const before = route(['root', 'bridge'], [{ id: 'root>bridge', source: 'root', target: 'bridge', strength: 'hard' }]);
    const after = route(['bridge', target], [{ id: `bridge>${target}`, source: 'bridge', target, strength: 'hard' }]);
    const overlay = projectRouteOverlay(graph, before, after);
    expect(overlay.nodes).toEqual([{ id: 'bridge', state: 'kept' }, { id: 'root', state: 'removed' }, { id: target, state: 'added' }]);
    expect(overlay.edges).toEqual([{ id: 'bridge>root', state: 'removed' }, { id: `bridge>${target}`, state: 'added' }, { id: 'root>bridge', state: 'removed' }]);
    const same = projectRouteOverlay(graph, after, after);
    expect(same.edges).toEqual([{ id: `bridge>${target}`, state: 'kept' }]);
    expect(projectRouteOverlay(graph, route(['root', target]), null).edges).toEqual([{ id: `root>${target}`, state: 'current' }]);
  });

  it('rejects removed or rewired snapshot edges while preserving isolated route membership', () => {
    const graph = projectStructuralGraph(input, [target]);
    const stale = route(['root', target], [
      { id: 'deleted', source: 'root', target, strength: 'hard' },
      { id: 'root>bridge', source: 'root', target, strength: 'hard' },
    ]);
    expect(projectRouteOverlay(graph, stale, null).edges.map(edge => edge.id)).toEqual([`root>${target}`]);
    expect(projectRouteOverlay(graph, route([target]), route([]))).toEqual({ preview: true, nodes: [{ id: target, state: 'removed' }], edges: [] });
    expect(projectRouteOverlay(graph, null, route([target]))).toEqual({ preview: true, nodes: [{ id: target, state: 'added' }], edges: [] });
    expect(projectRouteOverlay(graph, null, null)).toEqual({ preview: false, nodes: [], edges: [] });
  });
  it('new snapshot overlays use exact chosen Edge membership and preserve Action-only topology',()=>{
    const graph=projectStructuralGraph(input,[target]);
    const baseline={...route(['root',target]),executionSteps:[{edgeId:`root>${target}`,actionId:'micro',sourceNodeId:'root',targetNodeId:target,order:0}]};
    const preview={...baseline,executionSteps:[{...baseline.executionSteps[0],actionId:'practice'}]};
    const original=structuredClone(graph);
    expect(projectRouteOverlay(graph,baseline,preview).edges).toEqual([{id:`root>${target}`,state:'kept'}]);
    expect(graph).toEqual(original);
    expect(projectRouteOverlay(graph,{...baseline,executionSteps:[]},null).edges).toEqual([]);
  });

});

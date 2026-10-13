import { describe, expect, it } from 'vitest';
import { computeDownstreamSubgraph } from './atlasDownstream';
const edges = ['U>A', 'A>B', 'A>C', 'B>D', 'C>D', 'D>T'].map(id => ({ id, source: id.split('>')[0], target: id.split('>')[1] }));
describe('visible directed downstream presentation', () => {
  it('includes all branches and their edges, never upstream', () => {
    const result = computeDownstreamSubgraph('A', edges);
    expect([...result.nodeIds].sort()).toEqual(['A', 'B', 'C', 'D', 'T']);
    expect([...result.edgeIds].sort()).toEqual(['A>B', 'A>C', 'B>D', 'C>D', 'D>T']);
  });
  it('replaces the previous selection and has no fake edge at a terminal', () => {
    computeDownstreamSubgraph('A', edges);
    expect([...computeDownstreamSubgraph('C', edges).edgeIds]).toEqual(['C>D', 'D>T']);
    expect(computeDownstreamSubgraph('T', edges)).toEqual({ nodeIds: new Set(['T']), edgeIds: new Set() });
  });
  it('does not stop at an intermediate target, mutate inputs or depend on input ordering', () => {
    const original = structuredClone(edges);
    expect(computeDownstreamSubgraph('A', edges)).toEqual(computeDownstreamSubgraph('A', [...edges].reverse()));
    expect(edges).toEqual(original);
  });
  it('handles a cycle and a large chain without recursion or path enumeration', () => {
    expect(computeDownstreamSubgraph('A', [...edges, { id: 'D>A', source: 'D', target: 'A' }]).edgeIds.size).toBe(6);
    const chain = Array.from({ length: 10000 }, (_, i) => ({ id: String(i), source: String(i), target: String(i + 1) }));
    expect(computeDownstreamSubgraph('0', chain).nodeIds.size).toBe(10001);
  });
});

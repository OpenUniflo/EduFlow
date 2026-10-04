import { describe, expect, it } from 'vitest';
import { layoutCourseRoute } from '../graph/elkCourseLayout';
const ids = ['A','C','B','D'];
const edges = [{ id: 'ab', source: 'A', target: 'B' }, { id: 'cb', source: 'C', target: 'B' }, { id: 'bd', source: 'B', target: 'D' }];
describe('course route ELK layout', () => {
  it('lays out a factual DAG without overlapping footprints or invented edges', async () => {
    const result = await layoutCourseRoute('dag', ids, edges);
    expect(result.edges?.map(edge => edge.id)).toEqual(['ab','bd','cb']);
    const nodes = result.children!;
    for (const a of nodes) for (const b of nodes) if (a.id !== b.id) {
      expect(a.x! + a.width! <= b.x! || b.x! + b.width! <= a.x! || a.y! + a.height! <= b.y! || b.y! + b.height! <= a.y!).toBe(true);
    }
    expect(nodes.find(node => node.id === 'B')!.y).toBeGreaterThan(nodes.find(node => node.id === 'A')!.y!);
    expect(result.edges?.every(edge => edge.sections?.length)).toBe(true);
  });
  it('keeps prerequisite order when a real enables edge points back', async () => {
    const result = await layoutCourseRoute('enable-cycle', ['A', 'B'], [{ id: 'hard', source: 'A', target: 'B' }, { id: 'support', source: 'B', target: 'A' }]);
    expect(result.children!.find(node => node.id === 'B')!.y).toBeGreaterThan(result.children!.find(node => node.id === 'A')!.y!);
    expect(result.edges!.find(edge => edge.id === 'support')).toMatchObject({ sources: ['B'], targets: ['A'] });
  });
  it('reuses structural positions independently of state and isolates course identity', async () => {
    const first = layoutCourseRoute('stable', ids, edges);
    expect(layoutCourseRoute('stable', [...ids], [...edges].reverse())).toBe(first);
    expect(layoutCourseRoute('other-course', ids, edges)).not.toBe(first);
    await first;
  });
});

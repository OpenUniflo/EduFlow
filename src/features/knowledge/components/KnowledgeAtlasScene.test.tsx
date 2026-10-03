import { beforeEach, expect, it, vi } from 'vitest';
// Exercise the real component's memo/effect lifecycle with a recording graph engine.
// GPU appearance/motion is verified separately in the hosted browser.
const host = vi.hoisted(() => ({ slots: [] as any[], index: 0, effects: [] as (() => void)[] }));
vi.mock('react', () => {
  const memo = (fn: () => any, deps: any[]) => {
    const i = host.index++; const old = host.slots[i];
    if (!old || deps.some((d, j) => d !== old.deps[j])) host.slots[i] = { value: fn(), deps };
    return host.slots[i].value;
  };
  return {
    forwardRef: (fn: any) => fn,
    useState(initial: any) { const i = host.index++; if (!(i in host.slots)) host.slots[i] = typeof initial === 'function' ? initial() : initial; return [host.slots[i], (value: any) => { host.slots[i] = typeof value === 'function' ? value(host.slots[i]) : value; }]; },
    useRef(initial: any) { const i = host.index++; return host.slots[i] ??= { current: initial }; },
    useMemo: memo, useCallback: (fn: any, deps: any[]) => memo(() => fn, deps), useImperativeHandle() {},
    useEffect(fn: any, deps: any[]) { const i = host.index++; const old = host.slots[i]; if (!old || deps.some((d, j) => d !== old.deps[j])) { host.effects.push(() => { old?.cleanup?.(); host.slots[i].cleanup = fn(); }); host.slots[i] = { deps }; } },
  };
});
vi.mock('react-force-graph-3d', () => ({ default: () => null }));
import { KnowledgeAtlasScene, type KnowledgeAtlasSceneProps } from './KnowledgeAtlasScene';
const graph = { d3Force: vi.fn(), d3ReheatSimulation: vi.fn(), controls: () => ({}), pauseAnimation: vi.fn(), resumeAnimation: vi.fn(), cameraPosition: vi.fn() };
const nodes = ['A', 'B', 'C', 'D'].map((id, i) => ({ id, title: id, color: ['#3b82f6', '#94a3b8', '#22c55e', '#94a3b8'][i], status: 'explore', isCore: true, visualImportance: 0 })) as KnowledgeAtlasSceneProps['nodes'];
const edges = ['A>B', 'B>C', 'B>D'].map(id => ({ id, source: id[0], target: id[2], relation: 'prerequisite', strength: 'hard' })) as KnowledgeAtlasSceneProps['edges'];
let selected: string | null = null;
function render(variant: KnowledgeAtlasSceneProps['variant'] = 'project', extra: Partial<KnowledgeAtlasSceneProps> = {}) {
  host.index = 0;
  const element = (KnowledgeAtlasScene as any)({ nodes: nodes.map(n => ({ ...n })), edges: edges.map(e => ({ ...e })), variant, ...extra, selectedId: selected, onNodeClick: (n: { id: string }) => { selected = n.id; }, onBackgroundClick: () => { selected = null; } });
  const props = element.props.children[0].props;
  props.ref(graph); host.effects.splice(0).forEach(effect => effect());
  return props;
}
beforeEach(() => {
  host.slots = []; host.effects = []; selected = null; vi.clearAllMocks();
  vi.stubGlobal('window', { setTimeout: vi.fn(), clearTimeout: vi.fn() });
  vi.stubGlobal('requestAnimationFrame', vi.fn()); vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
it('blue, gray and green clicks replace directed pulses; background and leaves clear them', () => {
  let props = render(); const structure = props.graphData; const linkFactory = props.linkThreeObject;
  expect(props.linkDirectionalParticles).toBe(0);
  expect(edges.map(edge => props.linkThreeObject(edge).visible ? 1 : 0)).toEqual([0, 0, 0]);
  props.onNodeClick(nodes[0]); props = render();
  expect(edges.map(edge => props.linkThreeObject(edge).visible ? 1 : 0)).toEqual([1, 1, 1]);
  props.onNodeClick(nodes[1]); props = render();
  expect(edges.map(edge => props.linkThreeObject(edge).visible ? 1 : 0)).toEqual([0, 1, 1]);
  props.onNodeHover(nodes[1]); props = render();
  expect(props.linkWidth(edges[0])).toBe(0.08);
  expect(props.linkColor(edges[0])).toBe('rgba(92,112,145,0.018)');
  expect(props.linkWidth(edges[1])).toBe(0.2);
  expect(props.linkColor(edges[1])).toBe("rgba(245,158,11,0.12)");
  props.onNodeClick(nodes[2]); props = render();
  expect(edges.map(edge => props.linkThreeObject(edge).visible ? 1 : 0)).toEqual([0, 0, 0]);
  props.onBackgroundClick(); props = render();
  expect(selected).toBeNull(); expect(edges.map(edge => props.linkThreeObject(edge).visible ? 1 : 0)).toEqual([0, 0, 0]);
  expect(props.linkThreeObject).toBe(linkFactory);
  expect(props.graphData).toBe(structure);
  expect(props.graphData.nodes).toBe(structure.nodes); expect(props.graphData.links).toBe(structure.links);
  expect(graph.d3ReheatSimulation).toHaveBeenCalledTimes(1);
  expect(graph.cameraPosition).toHaveBeenCalledTimes(1);
});
it('does not add pulses to the existing Global and Personal variants', () => {
  selected = 'A';
  expect(render('global').linkThreeObject).toBeUndefined();
  expect(render('personal').linkThreeObject).toBeUndefined();
});

it('action alternatives and execution states never rebuild topology, move frozen nodes or reset camera', () => {
  const clicked = vi.fn();
  let props = render('project', { onEdgeClick: clicked });
  const topology = props.graphData;
  topology.nodes.forEach((node: any, i: number) => { node.x = i * 20; node.y = i * 10; node.z = -i; });
  props.onEngineStop();
  const positions = topology.nodes.map((node: any) => [node.x, node.y, node.z, node.fx, node.fy, node.fz]);
  props.onLinkClick(edges[0]);
  expect(clicked).toHaveBeenCalledWith(edges[0]);
  for (const status of ['candidate', 'selected', 'in_progress', 'completed', 'unavailable'] as const) {
    props = render('project', { actionBranches: [{ id: 'practice', edgeId: edges[0].id, title: 'Practice', status }, { id: 'micro', edgeId: edges[0].id, title: 'Micro', status: 'candidate' }] });
    expect(props.graphData).toBe(topology);
    expect(topology.links).toHaveLength(3);
    expect(topology.nodes.map((node: any) => [node.x, node.y, node.z, node.fx, node.fy, node.fz])).toEqual(positions);
  }
  expect(graph.d3ReheatSimulation).toHaveBeenCalledTimes(1);
  expect(graph.cameraPosition).toHaveBeenCalledTimes(1);
});

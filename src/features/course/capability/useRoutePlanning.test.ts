import { beforeEach, expect, it, vi } from 'vitest';
// A synchronous hook host lets deferred API responses settle in controlled order,
// without coupling this request lifecycle test to a browser renderer.
const host = vi.hoisted(() => ({ slots: [] as any[], index: 0, effects: [] as (() => void)[] }));
vi.mock('react', () => ({
  useState(initial: any) { const i = host.index++; if (!(i in host.slots)) host.slots[i] = typeof initial === 'function' ? initial() : initial; return [host.slots[i], (value: any) => { host.slots[i] = typeof value === 'function' ? value(host.slots[i]) : value; }]; },
  useRef(initial: any) { const i = host.index++; return host.slots[i] ??= { current: initial }; },
  useCallback(fn: any, deps: any[]) { const i = host.index++; const old = host.slots[i]; if (!old || deps.some((d, j) => d !== old.deps[j])) host.slots[i] = { fn, deps }; return host.slots[i].fn; },
  useEffect(fn: any, deps: any[]) { const i = host.index++; const old = host.slots[i]; if (!old || deps.some((d, j) => d !== old.deps[j])) { host.effects.push(() => { old?.cleanup?.(); host.slots[i].cleanup = fn(); }); host.slots[i] = { deps }; } },
}));
vi.mock('@/shared/api/apiClient', () => ({ apiRequest: vi.fn(), ApiRequestError: class extends Error {} }));
import { apiRequest } from '@/shared/api/apiClient';
import { useRoutePlanning } from './useRoutePlanning';
const response = { activeVersion: { id: 'v1', snapshot: {}, constraints: { includeNodeIds: [], excludeNodeIds: [] } } };
function render(key = 'one') { host.index = 0; const control = useRoutePlanning('course', true, key); host.effects.splice(0).forEach(effect => effect()); return control; }
async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
beforeEach(() => { host.slots = []; host.effects = []; vi.mocked(apiRequest).mockReset(); });
it('background refresh cannot unlock a pending preview or publish a preview from an old knowledge revision', async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce(response);
  render(); await flush(); render().begin();
  let resolvePreview!: (value: unknown) => void;
  vi.mocked(apiRequest).mockImplementationOnce(() => new Promise(resolve => { resolvePreview = resolve; }));
  const pending = render().replan();
  vi.mocked(apiRequest).mockResolvedValueOnce(response);
  render('two'); await flush();
  const during = render('two'); expect(during.busy).toBe(true);
  during.mark('new'); expect(render('two').draft.includeNodeIds).toEqual([]);
  resolvePreview({ baseVersionId: 'v1', plan: { valid: true, route: {}, conflicts: [] } });
  await pending;
  expect(render('two').preview).toBeNull(); expect(render('two').busy).toBe(false);
});
it('cancelled editing cannot receive the pending preview', async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce(response);
  render(); await flush(); render().begin();
  let resolvePreview!: (value: unknown) => void;
  vi.mocked(apiRequest).mockImplementationOnce(() => new Promise(resolve => { resolvePreview = resolve; }));
  const pending = render().replan(); render().cancel();
  resolvePreview({ baseVersionId: 'v1', plan: { valid: true, route: {}, conflicts: [] } }); await pending;
  expect(render().preview).toBeNull(); expect(render().editing).toBe(false);
});

it('Action-only edits create a Preview and Adopt sends its exact Edge/Action references',async()=>{
  const step={edgeId:'ab',actionId:'old',sourceNodeId:'A',targetNodeId:'B',order:0};
  const initial={activeVersion:{id:'v1',snapshot:{executionSteps:[step]},constraints:{includeNodeIds:[],excludeNodeIds:[]}}};
  vi.mocked(apiRequest).mockResolvedValueOnce(initial);render();await flush();render().begin();
  render().chooseAction('ab','new');expect(render().preview).toBeNull();expect(render().view?.activeVersion?.id).toBe('v1');
  const execution={steps:[{...step,actionId:'new'}],options:[],issues:[],complete:true};
  vi.mocked(apiRequest).mockResolvedValueOnce({baseVersionId:'v1',plan:{valid:true,route:{},conflicts:[],execution}});
  await render().replan();
  expect(JSON.parse(vi.mocked(apiRequest).mock.calls[1][1]!.body as string)).toMatchObject({action:'preview',actionChoices:[{edgeId:'ab',actionId:'new'}]});
  expect(render().view?.activeVersion?.id).toBe('v1');
  vi.mocked(apiRequest).mockResolvedValueOnce({}).mockResolvedValueOnce({...initial,activeVersion:{...initial.activeVersion,id:'v2'}});
  await render().adopt();
  expect(JSON.parse(vi.mocked(apiRequest).mock.calls[2][1]!.body as string)).toMatchObject({action:'adopt',baseVersionId:'v1',actionChoices:[{edgeId:'ab',actionId:'new'}],selectedEdgeIds:['ab']});
  expect(render().view?.activeVersion?.id).toBe('v2');expect(render().preview).toBeNull();
});

it('clearing or reverting node edits keeps the replan scope intent through Preview and Adopt',async()=>{
 const step={edgeId:'ab',actionId:'old',sourceNodeId:'A',targetNodeId:'B',order:0};
 vi.mocked(apiRequest).mockResolvedValueOnce({activeVersion:{id:'v1',snapshot:{executionSteps:[step]},constraints:{includeNodeIds:[],excludeNodeIds:[]}}});render();await flush();render().begin();render().mark('A');render().mark('A');render().clear();
 vi.mocked(apiRequest).mockResolvedValueOnce({baseVersionId:'v1',plan:{valid:true,route:{},conflicts:[],execution:{steps:[],options:[],issues:[],complete:true}}});await render().replan();
 expect(JSON.parse(vi.mocked(apiRequest).mock.calls[1][1]!.body as string).scopeMode).toBe('replan');
 vi.mocked(apiRequest).mockResolvedValueOnce({}).mockResolvedValueOnce(response);await render().adopt();
 expect(JSON.parse(vi.mocked(apiRequest).mock.calls[2][1]!.body as string)).toMatchObject({scopeMode:'replan',selectedEdgeIds:[],actionChoices:[]});
});

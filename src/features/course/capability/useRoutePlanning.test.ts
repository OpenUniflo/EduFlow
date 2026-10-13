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
const requests=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('@/shared/api/apiClient', () => ({ apiRequest: (path:string,...args:unknown[])=>path.includes('view=catalog')?Promise.resolve({options:[]}):requests.api(path,...args), ApiRequestError: class extends Error {} }));
const apiRequest=requests.api;
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
  render().chooseAction('ab','old');render().chooseAction('ab','new');expect(render().preview).toBeNull();expect(render().view?.activeVersion?.id).toBe('v1');
  const execution={steps:[{...step,actionId:'new'}],options:[],issues:[],complete:true};
  vi.mocked(apiRequest).mockResolvedValueOnce({baseVersionId:'v1',previewState:'a'.repeat(64),plan:{valid:true,route:{},conflicts:[],execution}});
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
 vi.mocked(apiRequest).mockResolvedValueOnce({baseVersionId:'v1',previewState:'a'.repeat(64),plan:{valid:true,route:{},conflicts:[],execution:{steps:[],options:[],issues:[],complete:true}}});await render().replan();
 expect(JSON.parse(vi.mocked(apiRequest).mock.calls[1][1]!.body as string).scopeMode).toBe('replan');
 vi.mocked(apiRequest).mockResolvedValueOnce({}).mockResolvedValueOnce(response);await render().adopt();
 expect(JSON.parse(vi.mocked(apiRequest).mock.calls[2][1]!.body as string)).toMatchObject({scopeMode:'replan',selectedEdgeIds:[],actionChoices:[]});
});

it('all dirty dismissal paths preserve drafts until explicit discard; clean changes do not prompt',async()=>{
 vi.mocked(apiRequest).mockResolvedValueOnce(response);render();await flush();render().begin();
 const exit=vi.fn(),stay=vi.fn();render().mark('A');expect(render().dirty).toBe(true);
 render().requestDismiss(exit,stay);expect(exit).not.toHaveBeenCalled();expect(render().dismissPending).toBe(true);
 render().keepEditing();expect(stay).toHaveBeenCalled();expect(render().draft.includeNodeIds).toEqual(['A']);
 render().reload();expect(render().dismissPending).toBe(true);expect(apiRequest).toHaveBeenCalledTimes(1);render().keepEditing();
 render().showHistory();expect(apiRequest).toHaveBeenCalledTimes(1);render().keepEditing();
 render().requestDismiss(exit);render().discardDraft();expect(exit).toHaveBeenCalledOnce();expect(render().editing).toBe(false);
});
it('capability changes invalidate a complete Preview and prevent Adopt until recalculation',async()=>{
 vi.mocked(apiRequest).mockResolvedValueOnce(response);render();await flush();render().begin();
 vi.mocked(apiRequest).mockResolvedValueOnce({baseVersionId:'v1',previewState:'a'.repeat(64),plan:{valid:true,route:{},execution:{steps:[],options:[],issues:[],complete:true}}});await render().replan();
 vi.mocked(apiRequest).mockResolvedValueOnce(response);render('new-state');await flush();expect(render('new-state').stale).toBe(true);
 const count=vi.mocked(apiRequest).mock.calls.length;await render('new-state').adopt();expect(apiRequest).toHaveBeenCalledTimes(count);
});

it('multi-select preserves local order, toggles, moves and returns clean after undo',async()=>{
 const step={edgeId:'ab',actionId:'a',sourceNodeId:'A',targetNodeId:'B',order:0};
 requests.api.mockResolvedValueOnce({activeVersion:{id:'v1',snapshot:{executionSteps:[step]},constraints:{includeNodeIds:[],excludeNodeIds:[]}}});
 render();await flush();render().begin();render().chooseAction('ab','b');render().chooseAction('cd','x');render().moveAction('ab','b',-1);
 expect(render().actionChoices).toEqual([{edgeId:'ab',actionId:'b'},{scope:'edge',edgeId:'ab',actionId:'a'},{edgeId:'cd',actionId:'x'}]);
 expect(render().dirty).toBe(true);render().chooseAction('ab','b');render().chooseAction('cd','x');expect(render().dirty).toBe(false);
 render().chooseAction('ab','a');expect(render().dirty).toBe(true);
});
it('normalizes Edge membership when the adopted snapshot contains multiple same-Edge Steps',async()=>{
 const steps=['a','b'].map((actionId,order)=>({edgeId:'ab',actionId,sourceNodeId:'A',targetNodeId:'B',order}));
 requests.api.mockResolvedValueOnce({activeVersion:{id:'v1',snapshot:{executionSteps:steps},constraints:{includeNodeIds:[],excludeNodeIds:[]}}});render();await flush();render().begin();
 expect(render().selectedEdgeIds).toEqual(['ab']);expect(render().actionChoices.map(choice=>choice.actionId)).toEqual(['a','b']);
});

it('clearing the final Action stays empty through Preview and cannot Adopt',async()=>{
 const step={edgeId:'ab',actionId:'a',sourceNodeId:'A',targetNodeId:'B',order:0};
 requests.api.mockResolvedValueOnce({activeVersion:{id:'v1',snapshot:{executionSteps:[step]},constraints:{includeNodeIds:[],excludeNodeIds:[]}}});render();await flush();render().begin();render().chooseAction('ab','a');
 requests.api.mockResolvedValueOnce({baseVersionId:'v1',previewState:'a'.repeat(64),plan:{valid:true,route:{},execution:{steps:[],options:[],complete:false,issues:[{kind:'action_required',edgeId:'ab',reason:'至少一个行动'}]}}});await render().replan();
 expect(JSON.parse(requests.api.mock.calls[1][1]!.body as string).actionChoices).toEqual([]);expect(render().actionChoices).toEqual([]);
 const count=requests.api.mock.calls.length;await render().adopt();expect(requests.api).toHaveBeenCalledTimes(count);
});

it('entering adjustment reconciles inherited model-external choices without writing the formal route',async()=>{
 const {buildCapabilityModel}=await import('@/shared/learning/routePlanning');
 const model=buildCapabilityModel({nodeIds:['A','T','old'],currentNodeIds:['A'],courseOrder:[{nodeId:'T',lessonOrder:0,coverageOrder:0}],prerequisiteEdges:[{id:'ab',source:'A',target:'T',strength:'hard'}]});
 const steps=[{scope:'node',nodeId:'old',actionId:'old-node',order:0},{edgeId:'old-edge',sourceNodeId:'old',targetNodeId:'T',actionId:'old-action',order:1},{edgeId:'ab',sourceNodeId:'A',targetNodeId:'T',actionId:'kept',order:2}];
 const initial={model,activeVersion:{id:'v1',constraints:{includeNodeIds:['old'],excludeNodeIds:[]},snapshot:{selectedNodeIds:['old','A','T'],executionSteps:steps}}};
 const saved=structuredClone(initial);requests.api.mockResolvedValueOnce(initial);render();await flush();render().begin();
 expect(render().draft.includeNodeIds).toEqual(['A','T']);expect(render().actionChoices).toEqual([{scope:'edge',edgeId:'ab',actionId:'kept'}]);expect(render().selectedEdgeIds).toEqual(['ab']);expect(render().modelChanges?.nodeIds).toEqual([]);expect(render().dirty).toBe(true);
 expect(initial).toEqual(saved);expect(render().view?.activeVersion?.id).toBe('v1');expect(requests.api).toHaveBeenCalledTimes(1);
 requests.api.mockResolvedValueOnce({baseVersionId:'v1',previewState:'a'.repeat(64),plan:{valid:true,route:{},conflicts:[],execution:{steps:[steps[2]],issues:[],options:[],complete:true}}});await render().replan();
 expect(JSON.parse(requests.api.mock.calls[1][1]!.body as string)).toMatchObject({action:'preview',scopeMode:'replan',includeNodeIds:['A','T'],selectedEdgeIds:['ab'],actionChoices:[{edgeId:'ab',actionId:'kept'}]});
 expect(render().preview?.valid).toBe(true);
 expect(render().modelChanges).toMatchObject({nodeIds:[],edgeIds:[]});
 requests.api.mockResolvedValueOnce({}).mockResolvedValueOnce({...initial,activeVersion:{...initial.activeVersion,id:'v2'}});
 await render().adopt();
 expect(JSON.parse(requests.api.mock.calls[2][1]!.body as string)).toMatchObject({action:'adopt',includeNodeIds:['A','T'],selectedEdgeIds:['ab'],actionChoices:[{edgeId:'ab',actionId:'kept'}]});
 expect(initial).toEqual(saved);
});
it('historical replanning never turns model-external historical membership into a new Include',async()=>{
 const {buildCapabilityModel}=await import('@/shared/learning/routePlanning');
 const model=buildCapabilityModel({nodeIds:['T','old'],currentNodeIds:['T'],courseOrder:[{nodeId:'T',lessonOrder:0,coverageOrder:0}],prerequisiteEdges:[]});
 const initial={model,activeVersion:{id:'v1',constraints:{includeNodeIds:[],excludeNodeIds:[]},snapshot:{selectedNodeIds:['T'],executionSteps:[]}}};
 requests.api.mockResolvedValueOnce(initial);render();await flush();
 render().replanHistorical({constraints:{includeNodeIds:[],excludeNodeIds:[]},snapshot:{selectedNodeIds:['old','T'],executionSteps:[]}} as any);
 expect(render().draft.includeNodeIds).toEqual(['T']);expect(render().view?.activeVersion?.snapshot.selectedNodeIds).toEqual(['T']);
});

it('automatic membership-only draft cleanup is reviewable and cannot silently dismiss without adoption',async()=>{
 const {buildCapabilityModel}=await import('@/shared/learning/routePlanning');
 const model=buildCapabilityModel({nodeIds:['T','old'],currentNodeIds:['T'],prerequisiteEdges:[],courseOrder:[{nodeId:'T',lessonOrder:0,coverageOrder:0}]});
 const initial={model,activeVersion:{id:'v1',constraints:{includeNodeIds:[],excludeNodeIds:[]},snapshot:{selectedNodeIds:['T','old'],executionSteps:[]}}};
 requests.api.mockResolvedValueOnce(initial);render();await flush();render().begin();expect(render().dirty).toBe(true);
 expect(render().modelChanges?.nodeIds).toEqual([]);render().cancel();expect(render().dismissPending).toBe(true);expect(render().editing).toBe(true);
 expect(initial.activeVersion.snapshot.selectedNodeIds).toEqual(['T','old']);expect(requests.api).toHaveBeenCalledTimes(1);
});

it('undo cannot restore an inherited model-external Include after automatic reconciliation',async()=>{
 const {buildCapabilityModel}=await import('@/shared/learning/routePlanning');
 const model=buildCapabilityModel({nodeIds:['T','old'],currentNodeIds:['T'],prerequisiteEdges:[],courseOrder:[{nodeId:'T',lessonOrder:0,coverageOrder:0}]});
 const initial={model,activeVersion:{id:'v1',constraints:{includeNodeIds:['old'],excludeNodeIds:[]},snapshot:{selectedNodeIds:['T','old'],executionSteps:[]}}};
 requests.api.mockResolvedValueOnce(initial);render();await flush();render().begin();render().undoNode('old');
 expect(render().draft.includeNodeIds).toEqual(['T']);expect(render().modelChanges?.nodeIds).toEqual([]);
 expect(initial.activeVersion.constraints.includeNodeIds).toEqual(['old']);
});

it('Preview impact reconciles inherited choices before its request, without adopting or mutating history',async()=>{
 const {buildCapabilityModel,planCourseRoute}=await import('@/shared/learning/routePlanning');
 const input={nodeIds:['A','T','old'],currentNodeIds:['A'],prerequisiteEdges:[{id:'ab',source:'A',target:'T',strength:'hard' as const}],courseOrder:[{nodeId:'T',lessonOrder:0,coverageOrder:0}]};
 const model=buildCapabilityModel(input);
 const step={edgeId:'ab',sourceNodeId:'A',targetNodeId:'T',actionId:'kept',order:0};
 const initial={model,activeVersion:{id:'v1',constraints:{includeNodeIds:['old'],excludeNodeIds:[]},snapshot:{selectedNodeIds:['old','A','T'],executionSteps:[{scope:'node',nodeId:'old',actionId:'removed',order:0},step]}}};
 const saved=structuredClone(initial);requests.api.mockResolvedValueOnce(initial);render();await flush();
 requests.api.mockImplementationOnce(async(_path,request)=>{
   const intent=JSON.parse(request.body);const plan=planCourseRoute(input,intent);
   expect(plan.valid).toBe(true);expect(intent.actionChoices).toEqual([{scope:'edge',edgeId:'ab',actionId:'kept'}]);
   return {baseVersionId:'v1',previewState:'a'.repeat(64),plan:{...plan,execution:{steps:[step],options:[],issues:[],complete:true}}};
 });
 await render().previewImpact();
 expect(render().preview?.valid).toBe(true);expect(render().modelChanges?.nodeIds).toEqual([]);expect(render().dirty).toBe(true);
 expect(initial).toEqual(saved);expect(requests.api).toHaveBeenCalledTimes(2);
});

it('historical replanning also removes explicit model-external Includes and scopes while retaining legal Excludes',async()=>{
 const {buildCapabilityModel}=await import('@/shared/learning/routePlanning');
 const model=buildCapabilityModel({nodeIds:['T','U','old'],currentNodeIds:['T','U'],prerequisiteEdges:[],courseOrder:[{nodeId:'T',lessonOrder:0,coverageOrder:0},{nodeId:'U',lessonOrder:0,coverageOrder:1}]});
 const initial={model,activeVersion:{id:'v1',constraints:{includeNodeIds:[],excludeNodeIds:[]},snapshot:{selectedNodeIds:['T'],executionSteps:[]}}};
 requests.api.mockResolvedValueOnce(initial);render();await flush();
 const history={constraints:{includeNodeIds:['old'],excludeNodeIds:['U']},snapshot:{selectedNodeIds:['old','T'],executionSteps:[{scope:'node',nodeId:'old',actionId:'removed'}]}};
 const saved=structuredClone(history);render().replanHistorical(history as any);
 expect(render().draft).toEqual({includeNodeIds:['T'],excludeNodeIds:['U']});expect(render().actionChoices).toEqual([]);expect(render().modelChanges?.nodeIds).toEqual([]);expect(history).toEqual(saved);
});

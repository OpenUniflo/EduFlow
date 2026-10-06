import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), course: vi.fn(), input: vi.fn(), active: vi.fn(), read: vi.fn(), persist: vi.fn(), current: vi.fn(),options:vi.fn(),runs:vi.fn() }));
vi.mock('../_lib/supabase.js', () => ({ createUserSupabase: mocks.auth }));
vi.mock('../_lib/courseMembership.js', () => ({ requirePublishedCourse: mocks.course }));
vi.mock('../_lib/routeExecution.js',()=>({readRouteActionOptions:mocks.options,readOwnedRouteRuns:mocks.runs}));
vi.mock('../_lib/routePlanning.js', () => ({ readRouteInput: mocks.input, readActiveVersion: mocks.active, readVersion: mocks.read, persistRoute: mocks.persist, currentRoute: mocks.current, mapRouteVersion: (r: unknown) => r }));
import handler from './route-plan';
const base = '11111111-1111-4111-8111-111111111111';
const old = '22222222-2222-4222-8222-222222222222';
const data = { input: { nodeIds: ['A', 'T', 'S', 'X'], currentNodeIds: [], courseOrder: [{ nodeId: 'T', lessonOrder: 0, coverageOrder: 0 }], prerequisiteEdges: [{ id: 'A>T', source: 'A', target: 'T', strength: 'hard' }, { id: 'S>T', source: 'S', target: 'T', strength: 'soft' }] }, nodes: [], states: [] };
const historicalSnapshot = () => ({valid:true,selectedNodeIds:['A','T'],orderedNodeIds:['A','T'],prerequisiteEdges:[{id:'A>T',source:'A',target:'T',strength:'hard'}],currentKnowledgeIds:['A'],effectiveTargetNodeIds:['T'],bridgeKnowledgeIds:['A'],executionSteps:[{edgeId:'A>T',actionId:old,sourceNodeId:'A',targetNodeId:'T',order:0}]});
async function invoke(body?: Record<string, unknown>) {
  if(body?.action==='adopt' && body.previewState===undefined && body.baseVersionId){
    const {baseVersionId:_base,action:_action,...intent}=body;
    const preview=await invoke({action:'preview',...intent});body={...body,previewState:preview.result?.previewState??'a'.repeat(64),actionChoices:body.actionChoices??preview.result?.plan?.execution?.steps?.map(({edgeId,actionId}:any)=>({edgeId,actionId}))??[],selectedEdgeIds:body.selectedEdgeIds??preview.result?.plan?.execution?.steps?.map((step:any)=>step.edgeId)??[]};
  }
  let status = 0; let result: any;
  const res = { status(code: number) { status = code; return res; }, json(value: unknown) { result = value; }, setHeader() {} };
  await handler({ method: body ? 'POST' : 'GET', body, query: { courseId: 'course' }, headers: {} } as unknown as VercelRequest, res as unknown as VercelResponse);
  return { status, result };
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.runs.mockResolvedValue([]); mocks.auth.mockResolvedValue({ client: 'authenticated-client', user: { id: 'learner' } }); mocks.course.mockResolvedValue({});
  mocks.input.mockResolvedValue(structuredClone(data)); mocks.active.mockResolvedValue({ id: base });
  mocks.persist.mockResolvedValue({ id: 'new' }); mocks.read.mockResolvedValue({ constraints: { includeNodeIds: ['S'], excludeNodeIds: [] } });
  mocks.options.mockResolvedValue([{edgeId:'A>T',actionId:base,title:'Micro',type:'micro_learning',estimatedMinutes:8,weight:8,planningAvailable:true,availableNow:false,reasons:['source not acquired']},{edgeId:'A>T',actionId:old,title:'Practice',type:'practice_task',estimatedMinutes:20,weight:20,planningAvailable:true,availableNow:false,reasons:[]}]);
});
describe('authoritative V2 route intent API', () => {
  it('cannot adopt custom intent as the default initial version, including concurrent null bases', async () => {
    mocks.active.mockResolvedValue(null);
    const request = { action: 'adopt', baseVersionId: null, includeNodeIds: ['S'], excludeNodeIds: [] };
    const results = await Promise.all([invoke(request), invoke(request)]);
    expect(results.map(r => r.status)).toEqual([400, 400]);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it('preview does not initialize or write and includes hard closure only', async () => {
    const r = await invoke({ action: 'preview', includeNodeIds: [], excludeNodeIds: [] });
    expect(r.status).toBe(200); expect(r.result.plan.route.selectedNodeIds).toEqual(['A', 'T']);
    expect(mocks.persist).not.toHaveBeenCalled(); expect(mocks.current).not.toHaveBeenCalled();
    expect(mocks.input).toHaveBeenCalledWith('authenticated-client', 'learner', 'course');
  });
  it.each(['selectedNodeIds', 'orderedNodeIds', 'bridgeNodeIds', 'userId'])('rejects forged %s instead of trusting it', async field => {
    expect((await invoke({ action: 'adopt', baseVersionId: base, includeNodeIds: [], excludeNodeIds: [], [field]: ['X'] })).status).toBe(400);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it('rejects model-external Include', async () => {
    const r = await invoke({ action: 'adopt', baseVersionId: base, includeNodeIds: ['X'], excludeNodeIds: [] });
    expect(r.status).toBe(422); expect(r.result.error.details.conflicts[0]).toMatchObject({ kind: 'include_outside_model', rootNodeId: 'X' });
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it('returns the excluded hard support and affected target', async () => {
    const r = await invoke({ action: 'adopt', baseVersionId: base, includeNodeIds: [], excludeNodeIds: ['A'] });
    expect(r.status).toBe(422); expect(r.result.error.details.conflicts[0]).toMatchObject({ rootNodeId: 'T', nodeId: 'A', kind: 'excluded_hard_prerequisite' });
  });
  it('stale intent never overwrites the active version', async () => {
    expect((await invoke({ action: 'adopt', baseVersionId: old, includeNodeIds: [], excludeNodeIds: [] })).status).toBe(409);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it('changed capability state rejects prior Preview and requires explicit recalculation', async () => {
    const preview=await invoke({ action: 'preview', includeNodeIds: [], excludeNodeIds: [] });
    mocks.input.mockResolvedValue({ ...data, input: { ...data.input, currentNodeIds: ['T'] } });
    expect((await invoke({ action: 'adopt', baseVersionId: base, previewState:preview.result.previewState,includeNodeIds: [], excludeNodeIds: [],actionChoices:[],selectedEdgeIds:[] })).status).toBe(409);
    expect(mocks.persist).not.toHaveBeenCalled();
    expect((await invoke({ action: 'adopt', baseVersionId: base, includeNodeIds: [], excludeNodeIds: [],actionChoices:[],selectedEdgeIds:[] })).status).toBe(200);
    expect(mocks.persist.mock.calls[0][4].selectedNodeIds).toEqual(['T']);
  });
  it('restores historical constraints through current planning and a new write', async () => {
    mocks.input.mockResolvedValue({ ...data, input: { ...data.input, currentNodeIds: ['A', 'S'] } });
    expect((await invoke({ action: 'restore', baseVersionId: base, versionId: old })).status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith('authenticated-client', 'learner', 'course', old);
    expect(mocks.persist.mock.calls[0].slice(5,8)).toEqual([base, 'restore', old]);
    expect(mocks.persist.mock.calls[0][4].selectedNodeIds).toEqual(['A', 'S', 'T']);
  });
  it('restores an explicitly included unacquired factual ancestor without rewriting history', async () => {
    const historical = { constraints: { includeNodeIds: ['S'], excludeNodeIds: [] } };
    mocks.read.mockResolvedValue(historical);
    const r = await invoke({ action: 'restore', baseVersionId: base, versionId: old });
    expect(r.status).toBe(200);
    expect(mocks.persist.mock.calls[0][4].selectedNodeIds).toEqual(['A', 'S', 'T']);
    expect(mocks.persist.mock.calls[0].slice(5,8)).toEqual([base, 'restore', old]);
    expect(mocks.persist.mock.calls[0][9]).toBeUndefined();
    expect(historical.constraints).toEqual({ includeNodeIds: ['S'], excludeNodeIds: [] });
  });

  it('previews changed Action without changing nodes or persisting a version',async()=>{
    mocks.input.mockResolvedValue({...data,input:{...data.input,currentNodeIds:['A']}});
    const response=await invoke({action:'preview',includeNodeIds:[],excludeNodeIds:[],actionChoices:[{edgeId:'A>T',actionId:old}]});
    expect(response.status).toBe(200);expect(response.result.plan.route.selectedNodeIds).toEqual(['A','T']);
    expect(response.result.plan.execution.steps).toEqual([{edgeId:'A>T',actionId:old,sourceNodeId:'A',targetNodeId:'T',order:0}]);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it('adopts future references when an earlier factual Step can form their source',async()=>{
    mocks.input.mockResolvedValue({...data,input:{...data.input,nodeIds:['ROOT','A','T'],currentNodeIds:['ROOT'],prerequisiteEdges:[{id:'ROOT>A',source:'ROOT',target:'A',strength:'hard'},{id:'A>T',source:'A',target:'T',strength:'hard'}]}});
    mocks.options.mockResolvedValue([{edgeId:'ROOT>A',actionId:base,title:'Root Micro',type:'micro_learning',estimatedMinutes:8,weight:8,planningAvailable:true,availableNow:true,reasons:[]},{edgeId:'A>T',actionId:old,title:'Future Practice',type:'practice_task',estimatedMinutes:20,weight:20,planningAvailable:true,availableNow:false,reasons:['source not acquired']}]);
    expect((await invoke({action:'adopt',baseVersionId:base,includeNodeIds:[],excludeNodeIds:[],actionChoices:[{edgeId:'ROOT>A',actionId:base},{edgeId:'A>T',actionId:old}]})).status).toBe(200);
    expect(mocks.persist.mock.calls[0][9]).toEqual([{edgeId:'ROOT>A',actionId:base,sourceNodeId:'ROOT',targetNodeId:'A',order:0},{edgeId:'A>T',actionId:old,sourceNodeId:'A',targetNodeId:'T',order:1}]);
  });
  it('does not silently fill incomplete or invalid adopted choices',async()=>{
    for(const actionChoices of [[],[{edgeId:'A>T',actionId:'33333333-3333-4333-8333-333333333333'}]]) {
      expect((await invoke({action:'adopt',baseVersionId:base,includeNodeIds:[],excludeNodeIds:[],actionChoices})).status).toBe(422);
    }
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it('restores historical Action references rather than reranking them',async()=>{
    mocks.input.mockResolvedValue({...data,input:{...data.input,currentNodeIds:['A']}});
    mocks.read.mockResolvedValue({constraints:{includeNodeIds:[],excludeNodeIds:[]},snapshot:historicalSnapshot()});
    expect((await invoke({action:'restore',baseVersionId:base,versionId:old})).status).toBe(200);
    expect(mocks.persist.mock.calls[0][9][0].actionId).toBe(old);
  });

  it('restores the historical execution scope after UKS grows without shrinking it or mutating history',async()=>{
    const snapshot=historicalSnapshot();const before=structuredClone(snapshot);
    mocks.input.mockResolvedValue({...data,input:{...data.input,currentNodeIds:['A','T']}});
    mocks.read.mockResolvedValue({constraints:{includeNodeIds:[],excludeNodeIds:[]},snapshot});
    expect((await invoke({action:'restore',baseVersionId:base,versionId:old})).status).toBe(200);
    expect(mocks.persist.mock.calls[0][4].selectedNodeIds).toEqual(['A','T']);
    expect(mocks.persist.mock.calls[0][9]).toEqual(before.executionSteps);
    expect(mocks.persist.mock.calls[0].slice(5,8)).toEqual([base,'restore',old]);
    expect(snapshot).toEqual(before);
  });

  it.each(['node','relation','action','order'])('rejects invalid historical %s without replacing decisions or writing a version',async(kind)=>{
    const snapshot=historicalSnapshot();
    mocks.input.mockResolvedValue({...data,input:{...data.input,currentNodeIds:['A','T'],
      ...(kind==='node'?{nodeIds:['T','S','X']}:{ }),
      ...(kind==='relation'?{prerequisiteEdges:[]}:{ })}});
    if(kind==='action')mocks.options.mockResolvedValue([{edgeId:'A>T',actionId:base,title:'Other',type:'micro_learning',estimatedMinutes:8,weight:8,planningAvailable:true,availableNow:true,reasons:[]}]);
    if(kind==='order')snapshot.executionSteps[0].order=1;
    const before=structuredClone(snapshot);
    mocks.read.mockResolvedValue({constraints:{includeNodeIds:[],excludeNodeIds:[]},snapshot});
    expect((await invoke({action:'restore',baseVersionId:base,versionId:old})).status).toBe(422);
    expect(mocks.persist).not.toHaveBeenCalled();expect(snapshot).toEqual(before);
  });

  it('Action-only Preview and Adopt keep formal scope after target capability is acquired',async()=>{
    const snapshot={valid:true,selectedNodeIds:['A','T'],orderedNodeIds:['A','T'],prerequisiteEdges:[{id:'A>T',source:'A',target:'T',strength:'hard'}],currentKnowledgeIds:['A'],effectiveTargetNodeIds:['T'],bridgeKnowledgeIds:['A'],executionSteps:[{edgeId:'A>T',actionId:base,sourceNodeId:'A',targetNodeId:'T',order:0}]};
    mocks.active.mockResolvedValue({id:base,constraints:{includeNodeIds:[],excludeNodeIds:[]},snapshot});
    mocks.input.mockResolvedValue({...data,input:{...data.input,currentNodeIds:['A','T']}});
    const intent={includeNodeIds:[],excludeNodeIds:[],selectedEdgeIds:['A>T'],actionChoices:[{edgeId:'A>T',actionId:old}]};
    const result=await invoke({action:'preview',...intent});
    expect(result.status).toBe(200);expect(result.result.plan.route.selectedNodeIds).toEqual(['A','T']);expect(result.result.plan.execution.steps[0].actionId).toBe(old);
    expect(mocks.persist).not.toHaveBeenCalled();
    expect((await invoke({action:'adopt',baseVersionId:base,...intent})).status).toBe(200);
    expect(mocks.persist.mock.calls[0][9][0].actionId).toBe(old);expect(mocks.persist.mock.calls[0][4].selectedNodeIds).toEqual(['A','T']);
    expect(snapshot.executionSteps[0].actionId).toBe(base);
  });

});

it('explicit node replan keeps Preview and Adopt scope consistent after clearing constraints and UKS growth',async()=>{
  mocks.active.mockResolvedValue({id:base,constraints:{includeNodeIds:[],excludeNodeIds:[]},snapshot:{valid:true,selectedNodeIds:['A','T'],orderedNodeIds:['A','T'],prerequisiteEdges:[{id:'A>T',source:'A',target:'T',strength:'hard'}],executionSteps:[{edgeId:'A>T',actionId:base,sourceNodeId:'A',targetNodeId:'T',order:0}]}});
  mocks.input.mockResolvedValue({...data,input:{...data.input,currentNodeIds:['A','T']}});
  const intent={includeNodeIds:[],excludeNodeIds:[],scopeMode:'replan',actionChoices:[]};
  const preview=await invoke({action:'preview',...intent});expect(preview.status).toBe(200);expect(preview.result.plan.route.selectedNodeIds).toEqual(['T']);expect(preview.result.plan.execution.steps).toEqual([]);
  const adopted=await invoke({action:'adopt',baseVersionId:base,...intent,selectedEdgeIds:[]});expect(adopted.status).toBe(200);expect(mocks.persist.mock.calls[0][4].selectedNodeIds).toEqual(preview.result.plan.route.selectedNodeIds);expect(mocks.persist.mock.calls[0][9]).toEqual([]);
});

it.each(['knowledge','graph','action','version'])('rejects stale %s input without writing a version',async(kind)=>{
 const intent={includeNodeIds:[],excludeNodeIds:[],actionChoices:[{edgeId:'A>T',actionId:base}],selectedEdgeIds:['A>T']};
 mocks.input.mockResolvedValue({...data,input:{...data.input,currentNodeIds:['A']},states:[{node_id:'A',status:'learned'}]});
 const preview=await invoke({action:'preview',...intent});expect(preview.status).toBe(200);
 if(kind==='knowledge')mocks.input.mockResolvedValue({...data,input:{...data.input,currentNodeIds:['A']},states:[{node_id:'A',status:'mastered'}]});
 if(kind==='graph')mocks.input.mockResolvedValue({...data,input:{...data.input,currentNodeIds:['A'],prerequisiteEdges:[{id:'A>T',source:'A',target:'T',strength:'soft'}]}});
 if(kind==='action')mocks.options.mockResolvedValue([{edgeId:'A>T',actionId:base,title:'Micro',type:'micro_learning',estimatedMinutes:8,weight:8,planningAvailable:false,availableNow:false,reasons:['archived']}]);
 if(kind==='version')mocks.active.mockResolvedValue({id:old});
 const result=await invoke({action:'adopt',baseVersionId:base,previewState:preview.result.previewState,...intent});expect(result.status).toBe(409);expect(mocks.persist).not.toHaveBeenCalled();
});
it('adoption requires a real Preview token',async()=>{
 expect((await invoke({action:'adopt',baseVersionId:base,previewState:'forged',includeNodeIds:[],excludeNodeIds:[]})).status).toBe(400);expect(mocks.persist).not.toHaveBeenCalled();
});

it('rejects restoring the currently active version without writing history',async()=>{
 mocks.read.mockResolvedValue({id:base,constraints:{includeNodeIds:[],excludeNodeIds:[]},snapshot:historicalSnapshot()});
 const result=await invoke({action:'restore',baseVersionId:base,versionId:base});
 expect(result.status).toBe(409);expect(result.result.error.code).toBe('route_version_current');expect(mocks.persist).not.toHaveBeenCalled();
});

it('new live hard prerequisite is mandatory but its Action still requires explicit selection',async()=>{
 const snapshot={...historicalSnapshot(),selectedNodeIds:['A','S','T'],orderedNodeIds:['A','S','T']};
 mocks.active.mockResolvedValue({id:base,constraints:{includeNodeIds:[],excludeNodeIds:[]},snapshot});
 mocks.input.mockResolvedValue({...data,input:{...data.input,currentNodeIds:['A','S'],prerequisiteEdges:[data.input.prerequisiteEdges[0],{id:'S>T',source:'S',target:'T',strength:'hard'}]}});
 const options=[{edgeId:'A>T',actionId:old,title:'A action',type:'micro_learning',estimatedMinutes:8,weight:8,planningAvailable:true,availableNow:true,reasons:[]},{edgeId:'S>T',actionId:base,title:'S action',type:'micro_learning',estimatedMinutes:8,weight:8,planningAvailable:true,availableNow:true,reasons:[]}];mocks.options.mockResolvedValue(options);
 const result=await invoke({action:'preview',scopeMode:'current',includeNodeIds:[],excludeNodeIds:[],selectedEdgeIds:['A>T'],actionChoices:[{edgeId:'A>T',actionId:old}]});
 expect(result.status).toBe(200);expect(result.result.plan.execution.complete).toBe(false);expect(result.result.plan.execution.issues).toContainEqual(expect.objectContaining({kind:'action_required',edgeId:'S>T'}));expect(result.result.plan.execution.steps.map((step:any)=>step.edgeId)).toEqual(['A>T']);expect(snapshot.prerequisiteEdges).toHaveLength(1);
});

it('adopts ordered multiple Actions on one Edge exactly once',async()=>{
 mocks.input.mockResolvedValue({...data,input:{...data.input,currentNodeIds:['A']}});
 const result=await invoke({action:'adopt',baseVersionId:base,includeNodeIds:[],excludeNodeIds:[],actionChoices:[{edgeId:'A>T',actionId:old},{edgeId:'A>T',actionId:base}],selectedEdgeIds:['A>T']});
 expect(result.status).toBe(200);expect(mocks.persist).toHaveBeenCalledTimes(1);
 expect(mocks.persist.mock.calls[0][9].map((step:any)=>[step.edgeId,step.actionId,step.order])).toEqual([['A>T',old,0],['A>T',base,1]]);
});
it('rejects duplicate selections and removal of an active Action before adoption',async()=>{
 mocks.input.mockResolvedValue({...data,input:{...data.input,currentNodeIds:['A']}});
 const intent={action:'adopt',baseVersionId:base,includeNodeIds:[],excludeNodeIds:[],selectedEdgeIds:['A>T']};
 expect((await invoke({...intent,actionChoices:[{edgeId:'A>T',actionId:base},{edgeId:'A>T',actionId:base}]})).status).toBe(422);
 mocks.runs.mockResolvedValue([{user_id:'learner',course_id:'course',edge_id:'A>T',action_id:old,status:'in_progress'}]);
 expect((await invoke({...intent,actionChoices:[{edgeId:'A>T',actionId:base}]})).result.error.code).toBe('route_active_run_conflict');
 expect(mocks.persist).not.toHaveBeenCalled();
});

import { beforeEach, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), input: vi.fn(), active: vi.fn(), micro: vi.fn() }));
vi.mock('../_lib/supabase.js', () => ({ createUserSupabase: mocks.auth, createServerSupabase: vi.fn() }));
vi.mock('../_lib/courseMembership.js', () => ({ requirePublishedCourse: vi.fn() }));
vi.mock('../_lib/routePlanning.js', () => ({ readRouteInput: mocks.input, readActiveVersion: mocks.active, defaultConstraints: { includeNodeIds: [], excludeNodeIds: [] } }));
vi.mock('../_lib/edgeActionRuns.js', () => ({ availableMicroPaths: mocks.micro, requireActionExecution: vi.fn() }));
import handler from './edge-actions';

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
beforeEach(() => {
  vi.resetAllMocks();
  tables = {
    knowledge_edge_actions: ['retained', 'unrelated', 'invented'].map(edge_id => ({ id: `${edge_id}-action`, edge_id, status: 'active', type: 'micro_learning',required_capability_ids:[],resource_requirements:[],estimated_minutes:5,difficulty:1 })),
  };
  const client = { from(table: string) {
    let rows = tables[table] ?? [];
    const query = {
      select: () => query, order: () => query,
      eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[key])); return query; },
      range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
    }; return query;
  } };
  mocks.auth.mockResolvedValue({ client, user: { id: 'learner' } });
  mocks.input.mockResolvedValue({ input: {
    nodeIds: ['source', 'target', 'other'], currentNodeIds: ['source', 'target'],
    courseOrder: [{ nodeId: 'target', lessonOrder: 1, coverageOrder: 1 }],
    prerequisiteEdges: [
      { id: 'retained', source: 'source', target: 'target', strength: 'soft' },
      { id: 'unrelated', source: 'source', target: 'other', strength: 'soft' },
    ],
  } });
  mocks.active.mockResolvedValue({ snapshot: {valid:true,selectedNodeIds:['source','target'],currentKnowledgeIds:['source','target'],prerequisiteEdges:[{id:'retained',source:'source',target:'target',strength:'soft'}],executionSteps:[{edgeId:'retained',actionId:'retained-action',sourceNodeId:'source',targetNodeId:'target',order:0}]}, constraints: { includeNodeIds: ['source'], excludeNodeIds: [] } });
  mocks.micro.mockResolvedValue([]);
});

it('GET exposes every legal frontier Micro and checks its own requirements/resources',async()=>{
  const route=await mocks.input(); route.input.currentNodeIds=['source','other'];
  route.input.prerequisiteEdges=[{id:'retained',source:'source',target:'target',strength:'hard'},{id:'unrelated',source:'other',target:'target',strength:'hard'}];
  const steps=route.input.prerequisiteEdges.map((edge:{id:string;source:string;target:string},order:number)=>({edgeId:edge.id,actionId:`${edge.id}-action`,sourceNodeId:edge.source,targetNodeId:edge.target,order}));
  mocks.active.mockResolvedValue({id:'v',snapshot:{valid:true,selectedNodeIds:['source','other','target'],prerequisiteEdges:route.input.prerequisiteEdges,executionSteps:steps},constraints:{includeNodeIds:[],excludeNodeIds:[]}});
  mocks.input.mockResolvedValue(route);
  tables.course_action_bindings=steps.map((step:{actionId:string})=>({course_id:'course',action_id:step.actionId,available:true,micro_path_id:'bound',resources:[]}));
  mocks.micro.mockResolvedValue([{id:'bound',knowledge_id:'target'}]);
  const read=async()=>{
    let body:{availableActionIds:string[]}|undefined;
    const response={status(){return response;},json(value:typeof body){body=value;},setHeader(){}};
    await handler({method:'GET',query:{courseId:'course'},headers:{}} as unknown as VercelRequest,response as unknown as VercelResponse);
    return body!;
  };
  expect((await read()).availableActionIds).toEqual(['retained-action','unrelated-action']);
  tables.knowledge_edge_actions[0].required_capability_ids=['missing'];
  expect((await read()).availableActionIds).toEqual(['unrelated-action']);
  tables.knowledge_edge_actions[1].resource_requirements=['missing-resource'];
  expect((await read()).availableActionIds).toEqual([]);
});

it('returns an explicitly retained acquired route edge without history, but excludes unrelated and invented connections', async () => {
  let status = 0; let body: { actions: { id: string }[]; availableActionIds: string[] } | undefined;
  const response = { status(code: number) { status = code; return response; }, json(value: typeof body) { body = value; }, setHeader() {} };
  await handler({ method: 'GET', query: { courseId: 'course' }, headers: {} } as unknown as VercelRequest, response as unknown as VercelResponse);
  expect(status).toBe(200);
  expect(body?.actions.map(action => action.id)).toEqual(['retained-action']);
  expect(body?.availableActionIds).toEqual([]);
});

it('advertises a bound Micro on a formal acquired Bridge edge without completed history', async () => {
  tables.course_action_bindings = [{ course_id: 'course', action_id: 'retained-action', available: true, micro_path_id: 'bound' }];
  mocks.micro.mockResolvedValue([{ id: 'bound', knowledge_id: 'target' }]);
  let body: { availableMicroActionIds: string[] } | undefined;
  const response = { status() { return response; }, json(value: typeof body) { body = value; }, setHeader() {} };
  await handler({ method: 'GET', query: { courseId: 'course' }, headers: {} } as unknown as VercelRequest, response as unknown as VercelResponse);
  expect(body?.availableMicroActionIds).toEqual(['retained-action']);
});

it('reads current model and retained formal alternatives without reviving pruned ancestors', async () => {
  const route = await mocks.input();
  route.input.nodeIds.push('outside');
  route.input.prerequisiteEdges.find((edge: {id:string;target:string}) => edge.id === 'unrelated').target = 'outside';
  route.input.prerequisiteEdges.push({ id: 'context', source: 'other', target: 'source', strength: 'soft' });
  mocks.input.mockResolvedValue(route);
  tables.knowledge_edge_actions.push({ id: 'context-action', edge_id: 'context', status: 'active', type: 'micro_learning' });
  let body: { actions: { id: string }[]; availableActionIds: string[] } | undefined;
  const response = { status() { return response; }, json(value: typeof body) { body = value; }, setHeader() {} };
  await handler({ method: 'GET', query: { courseId: 'course' }, headers: {} } as unknown as VercelRequest, response as unknown as VercelResponse);
  expect(body?.actions.map(action => action.id)).toEqual(['retained-action']);
  expect(body?.availableActionIds).toEqual([]);
});

it('retains formal/historical Node catalog after UKS prunes current model and exposes separate repeat eligibility',async()=>{
 const data=await mocks.input();data.input.prerequisiteEdges=[{id:'retained',source:'source',target:'target',strength:'hard'}];mocks.input.mockResolvedValue(data);
 tables.knowledge_edge_actions.push({id:'node-action',node_id:'source',edge_id:null,status:'active',type:'micro_learning',required_capability_ids:[],resource_requirements:[],estimated_minutes:5,difficulty:1});
 tables.edge_action_runs=[{id:'done',user_id:'learner',course_id:'course',action_id:'node-action',node_id:'source',edge_id:null,status:'completed'}];
 const version=await mocks.active();version.snapshot.executionSteps.unshift({scope:'node',nodeId:'source',actionId:'node-action',order:0});mocks.active.mockResolvedValue(version);
 let body:{actions:{id:string}[];repeatableActionIds:string[];availableActionIds:string[]}|undefined;
 const response={status(){return response;},json(value:typeof body){body=value;},setHeader(){}};
 await handler({method:'GET',query:{courseId:'course'},headers:{}} as unknown as VercelRequest,response as unknown as VercelResponse);
 expect(body?.actions.map(action=>action.id)).toContain('node-action');expect(body?.repeatableActionIds).toContain('node-action');expect(body?.availableActionIds).not.toContain('node-action');
});

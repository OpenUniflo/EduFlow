import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
const mocks = vi.hoisted(() => ({ user: vi.fn(), server: vi.fn(), actionRun: vi.fn() }));
vi.mock('../_lib/supabase.js', () => ({ createUserSupabase: mocks.user, createServerSupabase: mocks.server }));
vi.mock('../_lib/edgeActionRuns.js', () => ({ requireAssignmentActionRun: mocks.actionRun }));
vi.mock('../_lib/routePlanning.js',()=>({readActiveVersion:vi.fn(async()=>({id:'version'}))}));
import handler from './learning';
type Row = Record<string, unknown>;
let tables: Record<string,Row[]>; let writes: string[];
function query(table:string) {
  let rows = tables[table] ?? []; let single = false;
  const q = {
    select: () => q,
    eq: (key:string,value:unknown) => { rows=rows.filter(row => row[key]===value); return q; },
    in: (key:string,values:unknown[]) => { rows=rows.filter(row => values.includes(row[key])); return q; },
    limit: () => q,
    order: () => q,
    maybeSingle: () => { single=true; return q; },
    single: () => { single=true; return q; },
    upsert: (value:Row) => { writes.push(table); tables[table]=[value]; rows=[value]; return q; },
    then: (resolve:(r:unknown)=>unknown) => Promise.resolve(resolve({ data:single ? rows[0]??null : rows, error:null })),
  };return q;
}
async function call(action:string,extra:Row={}) {
  let status=200;let body:unknown;
  const response={status:(value:number)=>{status=value;return response;},json:(value:unknown)=>{body=value;return response;},setHeader:()=>response} as unknown as VercelResponse;
  await handler({method:'POST',headers:{},body:{action,courseId:'course',assignmentId:'task',...extra}} as VercelRequest,response);
  return {status,body};
}
describe('Assignment API guard before all mutations', () => {
  beforeEach(() => {
    writes=[]; tables={courses:[{id:'course',lifecycle:'published'}],course_assignments:[{id:'task',course_id:'course'}],assignment_coverages:[{course_id:'course',assignment_id:'task',node_id:'node'}],curriculum_coverages:[{course_id:'course',node_id:'node'}],user_knowledge_states:[{user_id:'learner',node_id:'node',status:'learned'}]};
    mocks.user.mockResolvedValue({user:{id:'learner'},client:{from:query}});
    mocks.server.mockReturnValue({from:query,rpc:vi.fn(()=>{writes.push('rpc');throw Error('Unexpected submission');})});
  });
  it.each(['not_started','started','needs_revision'])('allows ready %s', async status => {
    tables.user_assignment_states=[{user_id:'learner',course_id:'course',assignment_id:'task',status}];
    expect((await call('start-assignment')).status).toBe(200);
  });
  it.each(['submitted','accepted','completed'])('rejects %s restart without writes', async status => {
    tables.user_assignment_states=[{user_id:'learner',course_id:'course',assignment_id:'task',status}];
    expect((await call('start-assignment')).status).toBe(409);expect(writes).toEqual([]);
  });
  it.each(['start-assignment','submit-assignment'])('blocks unlearned %s without membership, state, attempt or result writes', async action => {
    tables.user_knowledge_states=[];
    expect((await call(action)).status).toBe(403);expect(writes).toEqual([]);
  });
  it('blocks hard dependencies', async () => {
    tables.assignment_dependencies=[{course_id:'course',source_assignment_id:'prior',target_assignment_id:'task',strength:'hard'}];
    expect((await call('start-assignment')).status).toBe(403);expect(writes).toEqual([]);
  });
  it('rejects a direct submit without started state', async () => {
    expect((await call('submit-assignment',{idempotencyKey:'new-attempt',response:{kind:'answer',text:'Response'}})).status).toBe(409);expect(writes).toEqual([]);
  });
  it.each(['unpublished','foreign assignment','foreign coverage'])('rejects %s without writes',async invalid => {
    if(invalid==='unpublished')tables.courses[0].lifecycle='draft';
    if(invalid==='foreign assignment')tables.course_assignments[0].course_id='other';
    if(invalid==='foreign coverage')tables.curriculum_coverages=[];
    expect((await call('start-assignment')).status).toBeGreaterThanOrEqual(400);expect(writes).toEqual([]);
  });
  it('returns an exact saved conversation submission before checking an archived attachment without ActionRun',async()=>{
    tables.learning_attempts=[{id:'attempt',user_id:'learner',course_id:'course',assignment_id:'task',action_run_id:null,idempotency_key:'saved-key',response:{kind:'answer',text:'Response',attachmentSourceIds:['10000000-0000-4000-8000-000000000002'],submissionMode:'conversation'}}];
    tables.performance_results=[{id:'result',attempt_id:'attempt',version:1,outcome:'pending',feedback:{message:'Saved manual result'}}];
    const body={conversation:true,idempotencyKey:'saved-key',response:{kind:'answer',text:'Response',attachmentSourceIds:['10000000-0000-4000-8000-000000000002']}};
    expect(await call('submit-assignment',body)).toMatchObject({status:200,body:{duplicate:true,attemptId:'attempt',outcome:'pending'}});
    expect(writes).toEqual([]);
    expect((await call('submit-assignment',{...body,conversation:false})).status).toBe(200);
  });
  it('returns a saved Action response despite later execution changes without another write', async () => {
    tables.learning_attempts = [{ id: 'attempt', user_id: 'learner', course_id: 'course', assignment_id: 'task', action_run_id: 'run', idempotency_key: 'saved-key', response: { kind: 'answer', text: 'Response' } }];
    tables.performance_results = [{ id: 'result', attempt_id: 'attempt', outcome: 'pending', feedback: { message: 'Saved review' } }];
    mocks.actionRun.mockRejectedValue(new Error('Action archived'));
    const result = await call('submit-assignment', { actionRunId: 'run', idempotencyKey: 'saved-key', response: { kind: 'answer', text: 'Response' } });
    expect(result).toMatchObject({ status: 200, body: { duplicate: true, attemptId: 'attempt', resultId: 'result' } });
    expect(writes).toEqual([]);
    expect((await call('submit-assignment', { actionRunId: 'other', idempotencyKey: 'saved-key', response: { kind: 'answer', text: 'Response' } })).status).toBe(409);
  });
  it('starts a verified Action target without practicing writes or resetting accepted aggregate', async () => {
    tables.user_knowledge_states = [];
    tables.knowledge_nodes = [{ id: 'node', status: 'active' }];
    tables.user_assignment_states = [{ user_id: 'learner', course_id: 'course', assignment_id: 'task', status: 'accepted' }];
    mocks.actionRun.mockResolvedValue({ id: 'run', status: 'in_progress', execution_snapshot: { targetId: 'node' } });
    const rpc = vi.fn(async () => ({ data: { id: 'run', status: 'in_progress' }, error: null }));
    mocks.server.mockReturnValue({ from: query, rpc });
    expect((await call('start-assignment', { actionRunId: 'run' })).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('transition_route_action_v3', { p_user_id: 'learner', p_run_id: 'run', p_operation: 'start',p_expected_version_id:'version' });
    expect(writes).not.toContain('user_knowledge_states');
    expect(writes).not.toContain('user_assignment_states');
    expect(tables.user_assignment_states[0].status).toBe('accepted');
  });
  it('uses verified execution reachability for additional Assignment coverage without writing UKS',async()=>{
    tables.assignment_coverages.push({course_id:'course',assignment_id:'task',node_id:'B'});
    tables.knowledge_nodes=[{id:'node',status:'active'},{id:'B',status:'active'}];tables.user_knowledge_states=[];
    mocks.actionRun.mockResolvedValue({id:'run',status:'in_progress',execution_snapshot:{targetId:'node'},executionReachableNodeIds:['B']});
    mocks.server.mockReturnValue({from:query,rpc:vi.fn(async()=>({data:{id:'run'},error:null}))});
    expect((await call('start-assignment',{actionRunId:'run'})).status).toBe(200);
    expect(tables.user_knowledge_states).toEqual([]);expect(writes).not.toContain('user_knowledge_states');
  });
  it('does not waive other covered Knowledge readiness for an Action target', async () => {
    tables.assignment_coverages.push({ course_id: 'course', assignment_id: 'task', node_id: 'other' });
    tables.knowledge_nodes = [{ id: 'node', status: 'active' }, { id: 'other', status: 'active' }];
    tables.user_knowledge_states = [];
    mocks.actionRun.mockResolvedValue({ id: 'run', status: 'in_progress', execution_snapshot: { targetId: 'node' } });
    expect((await call('start-assignment', { actionRunId: 'run' })).status).toBe(403);
    expect(writes).toEqual([]);
  });
});

it.each(['failed','pending','passed'])('a completed %s ActionRun does not report acceptance from execution alone',async()=>{
  tables={courses:[{id:'course',lifecycle:'published'}],course_assignments:[{id:'task',course_id:'course'}],assignment_coverages:[],assignment_dependencies:[]};
  mocks.user.mockResolvedValue({user:{id:'learner'},client:{from:query}});mocks.server.mockReturnValue({from:query});
  mocks.actionRun.mockResolvedValue({id:'run',status:'completed',execution_snapshot:{targetId:'node'}});
  expect(await call('start-assignment',{actionRunId:'run'})).toMatchObject({status:200,body:{status:'completed'}});
});
it('explicitly repeats the latest standalone attempt without a fake Run or capability write',async()=>{
  writes=[];tables={courses:[{id:'course',lifecycle:'published'}],course_assignments:[{id:'task',course_id:'course'}],assignment_coverages:[{course_id:'course',assignment_id:'task',node_id:'node'}],curriculum_coverages:[{course_id:'course',node_id:'node'}],user_knowledge_states:[{user_id:'learner',node_id:'node',status:'learned'}],user_assignment_states:[{user_id:'learner',course_id:'course',assignment_id:'task',status:'accepted'}],learning_attempts:[{id:'old',user_id:'learner',course_id:'course',assignment_id:'task',action_run_id:null}]};
  mocks.user.mockResolvedValue({user:{id:'learner'},client:{from:query}});mocks.server.mockReturnValue({from:query});
  expect(await call('start-assignment',{repeatAttemptId:'old'})).toMatchObject({status:200,body:{status:'started'}});
  expect(writes).toEqual(['user_course_states','user_assignment_states']);expect(tables.learning_attempts[0].id).toBe('old');
  expect((await call('start-assignment',{repeatAttemptId:'foreign'})).status).toBe(409);
});

it('opening Material records activity membership without writing formal capability',async()=>{
 writes=[];tables={courses:[{id:'course',lifecycle:'published'}],knowledge_nodes:[{id:'node',status:'active'}],curriculum_coverages:[{course_id:'course',node_id:'node'}],materials:[{id:'material',course_id:'course'}],material_knowledge_coverages:[{course_id:'course',material_id:'material',node_id:'node'}]};
 mocks.user.mockResolvedValue({user:{id:'learner'},client:{from:query}});mocks.server.mockReturnValue({from:query});
 expect((await call('start-material',{materialId:'material',nodeId:'node'})).status).toBe(200);expect(writes).toEqual(['user_course_states']);
});

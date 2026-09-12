import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
const mocks = vi.hoisted(() => ({ user: vi.fn(), server: vi.fn() }));
vi.mock('../_lib/supabase.js', () => ({ createUserSupabase: mocks.user, createServerSupabase: mocks.server }));
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
    mocks.server.mockReturnValue({rpc:vi.fn(()=>{writes.push('rpc');throw Error('Unexpected submission');})});
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
});

import { beforeEach, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
const mocks=vi.hoisted(()=>({auth:vi.fn(),server:vi.fn(),rpc:vi.fn()}));
vi.mock('../_lib/supabase.js',()=>({createUserSupabase:mocks.auth,createServerSupabase:mocks.server}));
import learner from '../learner';

type Row=Record<string,unknown>;
const uuid=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sourceA=uuid(1),sourceB=uuid(2),runA=uuid(10),runB=uuid(11),unitA=uuid(20),unitB=uuid(21),proposalA=uuid(30),proposalB=uuid(31);
let tables:Record<string,Row[]>;
let reads:{table:string;columns:string}[];
// The authenticated mock contains only RLS-visible rows, and applies selected columns and filters.
function client() {return {from(table:string){
 let rows=[...(tables[table]??[])];let columns='*';let limit=Infinity;const orders:{key:string;ascending:boolean}[]=[];
 function result(){let sorted=[...rows];sorted.sort((a,b)=>{for(const order of orders){const x=String(a[order.key]),y=String(b[order.key]);if(x!==y)return(x<y?-1:1)*(order.ascending?1:-1);}return 0;});sorted=sorted.slice(0,limit);return sorted.map(row=>columns==='*'?row:Object.fromEntries(columns.split(',').map(key=>[key,row[key]])));}
 const query={
  select(value:string){columns=value;reads.push({table,columns});return query;},
  order(key:string,options?:{ascending?:boolean}){orders.push({key,ascending:options?.ascending??true});return query;},
  eq(key:string,value:unknown){rows=rows.filter(row=>row[key]===value);return query;},
  in(key:string,values:unknown[]){rows=rows.filter(row=>values.includes(row[key]));return query;},
  contains(key:string,values:unknown[]){rows=rows.filter(row=>values.every(value=>(row[key] as unknown[]).includes(value)));return query;},
  overlaps(key:string,values:unknown[]){rows=rows.filter(row=>values.some(value=>(row[key] as unknown[]).includes(value)));return query;},
  limit(value:number){limit=value;return query;},
  or(filter:string){const match=/^created_at.lt.(.+),and\(created_at.eq.(.+),id.lt.(.+)\)$/.exec(filter);if(!match)throw new Error('Unexpected cursor filter');rows=rows.filter(row=>String(row.created_at)<match[1]||(row.created_at===match[2]&&String(row.id)<match[3]));return query;},
  range(from:number,to:number){return Promise.resolve({data:result().slice(from,to+1),error:null});},
  maybeSingle(){return Promise.resolve({data:result()[0]??null,error:null});},
  then(resolve:(value:{data:Row[];error:null})=>unknown){return Promise.resolve({data:result(),error:null}).then(resolve);},
 };return query;
}};}
beforeEach(()=>{
 vi.resetAllMocks();reads=[];
 const base={created_at:'2026-10-04T12:00:00.000Z',archived_at:null,parse_status:'ready',parse_error:null,provenance:{kind:'user-upload'},parsed_lines:[{line:1,text:'private original'}],storage_path:'private/path'};
 tables={
  user_evidence_sources:[{...base,id:sourceA,title:'A'},{...base,id:sourceB,title:'B'}],
  capability_diagnosis_runs:[{id:runA,source_ids:[sourceA,sourceB],status:'completed',created_at:base.created_at,error:null,diagnostics:{private:true}},{id:runB,source_ids:[sourceB],status:'completed',created_at:base.created_at,error:null}],
  evidence_units:[{id:unitA,run_id:runA,source_id:sourceA,source_line:1,quote:'A evidence'},{id:unitB,run_id:runA,source_id:sourceB,source_line:1,quote:'B evidence'}],
  capability_state_proposals:[{id:proposalA,run_id:runA,unit_ids:[unitA],node_id:'ability',confirmation_state:'confirmed'},{id:proposalB,run_id:runA,unit_ids:[unitB],node_id:'other',confirmation_state:'pending'}],
 };
 mocks.auth.mockResolvedValue({client:client(),user:{id:'learner'}});mocks.server.mockReturnValue({rpc:mocks.rpc});mocks.rpc.mockResolvedValue({data:[{status:'confirmed'}],error:null});
});
async function request(method:string,query:Record<string,string|undefined>={},body?:unknown){let status=0;let payload:unknown;const response={status(code:number){status=code;return response;},json(value:unknown){payload=value;},setHeader(){}};await learner({method,query:{resource:'evidence',...query},body,headers:{}} as unknown as VercelRequest,response as unknown as VercelResponse);return {status,body:payload as Record<string,unknown>};}
it('keeps the old multiplexed GET compatible while the library returns only summaries',async()=>{
 const legacy=await request('GET');expect(legacy.status).toBe(200);expect(legacy.body).toHaveProperty('units');expect((legacy.body.sources as Row[])[0]).toHaveProperty('parsed_lines');
 reads=[];const summary=await request('GET',{view:'library'});expect(summary.status).toBe(200);expect(Object.keys(summary.body)).toEqual(['sources']);
 expect((summary.body.sources as Row[])[0]).toMatchObject({id:sourceA,diagnosisCount:1,capabilityCount:1,confirmedCount:1});
 expect(JSON.stringify(summary.body)).not.toMatch(/private original|parsed_lines|storage_path|diagnostics|A evidence/);
 expect(reads.every(read=>read.columns!=='*'&&!read.columns.includes('parsed_lines'))).toBe(true);
});
it('counts unique capabilities, not repeated proposals, and only counts confirmed judgments',async()=>{
 tables.capability_state_proposals.push({id:uuid(32),unit_ids:[unitA],node_id:'ability',confirmation_state:'rejected'});
 const result=await request('GET',{view:'library'});expect((result.body.sources as Row[])[0]).toMatchObject({capabilityCount:1,confirmedCount:1});
});
it('loads source detail from its actual contributed units, not all proposals in a shared run',async()=>{
 const result=await request('GET',{view:'source',sourceId:sourceA});expect(result.status).toBe(200);expect((result.body.source as Row).parsed_lines).toBeDefined();expect((result.body.proposals as Row[]).map(row=>row.id)).toEqual([proposalA]);expect((result.body.runs as Row[]).map(row=>row.id)).toEqual([runA]);
});
it.each([{view:'source',sourceId:uuid(99)},{view:'run',runId:uuid(99)}])('returns owner-scoped 404 before dependent reads for $view',async query=>{
 const result=await request('GET',query);expect(result.status).toBe(404);expect(reads).toHaveLength(1);expect(mocks.server).not.toHaveBeenCalled();
});
it('returns only the requested run and its proposals',async()=>{
 tables.capability_state_proposals.push({id:uuid(33),run_id:runB,unit_ids:[unitB],node_id:'third',confirmation_state:'pending'});
 const result=await request('GET',{view:'run',runId:runB});expect(result.status).toBe(200);expect((result.body.proposals as Row[]).map(row=>row.id)).toEqual([uuid(33)]);expect(result.body.units).toEqual([]);expect((result.body.sources as Row[]).map(row=>row.id)).toEqual([sourceB]);
});
it('paginates tied timestamps with stable identities and does not repeat the cursor row',async()=>{
 const first=await request('GET',{view:'history',limit:'1'});expect((first.body.runs as Row[]).map(row=>row.id)).toEqual([runB]);expect(JSON.stringify(first.body)).not.toContain('diagnostics');
 const second=await request('GET',{view:'history',limit:'1',cursor:first.body.nextCursor as string});expect((second.body.runs as Row[]).map(row=>row.id)).toEqual([runA]);expect(second.body.nextCursor).toBeNull();
});
it.each([{view:'wrong'},{view:'history',limit:'51'},{view:'history',cursor:'broken'},{view:'source',sourceId:'invalid'},{view:'library',extra:'x'}])('rejects invalid view parameters without falling back to full data: %j',async query=>{expect((await request('GET',query)).status).toBe(400);expect(reads).toHaveLength(0);});
it.each(['confirm','reject'])('rejects mixed-run and hidden IDs before the %s RPC',async action=>{
 tables.capability_state_proposals[1].run_id=runB;
 expect((await request('POST',{}, {action,runId:runA,proposalIds:[proposalA,proposalB]})).status).toBe(409);
 expect((await request('POST',{}, {action,runId:runA,proposalIds:[proposalA,uuid(99)]})).status).toBe(409);
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it('rejects duplicates without invoking the confirmation RPC',async()=>{expect((await request('POST',{}, {action:'confirm',runId:runA,proposalIds:[proposalA,proposalA]})).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();});
it('allows a same-run retry to reach the existing idempotent RPC and retains the old POST contract',async()=>{
 const body={action:'confirm',runId:runA,proposalIds:[proposalA]};expect((await request('POST',{},body)).status).toBe(200);expect((await request('POST',{},body)).status).toBe(200);
 expect((await request('POST',{}, {action:'confirm',proposalIds:[proposalA]})).status).toBe(200);expect(mocks.rpc).toHaveBeenCalledTimes(3);expect(mocks.rpc).toHaveBeenLastCalledWith('confirm_capability_proposals',{p_user_id:'learner',p_ids:[proposalA],p_decision:'confirm'});
});

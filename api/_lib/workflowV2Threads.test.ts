import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest,VercelResponse } from '@vercel/node';
const deps=vi.hoisted(()=>({client:undefined as unknown as SupabaseClient,compiler:vi.fn(),rpc:vi.fn()}));
vi.mock('./supabase.js',()=>({createServerSupabase:()=>deps.client}));
vi.mock('./workflowV2Protocol.js',async original=>({...await original<typeof import('./workflowV2Protocol.js')>(),workflowCompiler:deps.compiler}));
import {handleWorkflowV2} from './workflowV2';
const id='11111111-1111-4111-8111-111111111111';const runId='22222222-2222-4222-8222-222222222222';
const thread={thread_id:id,workflow_id:'workflow',owner_user_id:'owner',revision:2,status:'waiting',current_run_id:runId,checkpoint_id:'checkpoint',state:{answer:0},state_version:3,interrupts:[{id:'interrupt',nodeId:'node',title:'Confirm',schema:{type:'object'}}],snapshot:{registry_snapshot:{internalConnection:'not-for-browser'},environment_ref:'local'},launch_context:{courseId:'private-domain-context'}};
function setup(prior=false){
 const reads:{table:string;filters:Record<string,unknown>}[]=[];
 deps.client={from(table:string){const filters:Record<string,unknown>={};reads.push({table,filters});const query={select(){return query;},eq(key:string,value:unknown){filters[key]=value;return query;},gt(){return query;},async maybeSingle(){
  if(filters.owner_user_id!=='owner')return {data:null,error:null};
  const data=table==='workflow_execution_threads'?thread:table==='workflow_v2_definitions'?{current_revision:4}:table==='workflow_revisions'?{definition:{revision:2},editor_snapshot:{}}:table==='workflow_idempotency'&&prior?{run_id:runId,revision:2}:table==='workflow_live_runs'&&prior?{status:'queued',last_seq:1}:null;
  return {data,error:null};}};return query;},rpc:deps.rpc} as unknown as SupabaseClient;
 const response={status:vi.fn().mockReturnThis(),json:vi.fn()} as unknown as VercelResponse;
 return {response,reads,output:()=>vi.mocked(response.json).mock.calls[0]?.[0]};
}
function request(method='GET',body?:unknown){return {method,query:{resource:'threads',id,...(body?{op:'resume'}:{})},body,headers:{}} as unknown as VercelRequest;}
beforeEach(()=>{deps.compiler.mockReset().mockResolvedValue({valid:true});deps.rpc.mockReset().mockResolvedValue({data:{runId,revision:2,status:'queued'},error:null});});
it('projects a Thread without registry, provider metadata or product launch context',async()=>{
 const state=setup();await handleWorkflowV2(request(),state.response,'owner');
 expect(state.output()).toMatchObject({threadId:id,checkpointId:'checkpoint',state:{answer:0},interrupts:thread.interrupts});
 for(const field of ['snapshot','launch_context','owner_user_id','registrySnapshot','provider_messages'])expect(state.output()).not.toHaveProperty(field);
 expect(JSON.stringify(state.output())).not.toContain('not-for-browser');
});
it('returns Not Found for another owner before validating or mutating anything',async()=>{
 const state=setup();await expect(handleWorkflowV2(request('POST',{checkpointId:'checkpoint',responses:{interrupt:{}}}),state.response,'someone-else')).rejects.toMatchObject({status:404,code:'NOT_FOUND'});
 expect(deps.compiler).not.toHaveBeenCalled();expect(deps.rpc).not.toHaveBeenCalled();
 expect(state.reads.every(read=>read.filters.owner_user_id==='someone-else')).toBe(true);
});
it('validates the persisted frozen revision and derives owner from the session',async()=>{
 const state=setup();await handleWorkflowV2(request('POST',{checkpointId:'checkpoint',responses:{interrupt:{answer:false}}}),state.response,'owner');
 expect(deps.compiler).toHaveBeenCalledWith('/v1/resume-validate',expect.objectContaining({ownerId:'owner',thread,definition:{revision:2},responses:{interrupt:{answer:false}}}));
 expect(deps.rpc).toHaveBeenCalledWith('workflow_v2_resume',expect.objectContaining({p_owner:'owner',p_thread:id,p_checkpoint:'checkpoint'}));
});
it('recovers the accepted receipt after a lost reply without revalidating changed state',async()=>{
 const state=setup(true);await handleWorkflowV2(request('POST',{checkpointId:'checkpoint',responses:{interrupt:{answer:0}}}),state.response,'owner');
 expect(state.output()).toMatchObject({runId,status:'queued',historyExpired:false});
 expect(deps.compiler).not.toHaveBeenCalled();expect(deps.rpc).not.toHaveBeenCalled();
});
it('rejects browser supplied ownership and execution context',async()=>{
 const state=setup();await expect(handleWorkflowV2(request('POST',{checkpointId:'checkpoint',responses:{},ownerId:'other'}),state.response,'owner')).rejects.toMatchObject({status:400});
 expect(deps.rpc).not.toHaveBeenCalled();
});

it('rejects credential-shaped response fields before hashing, persistence or provider validation',async()=>{
 const state=setup();await expect(handleWorkflowV2(request('POST',{checkpointId:'checkpoint',responses:{interrupt:{password:'not-a-real-credential'}}}),state.response,'owner')).rejects.toMatchObject({status:400,code:'SECRET_IN_RUN_INPUT'});
 expect(deps.rpc).not.toHaveBeenCalled();expect(deps.compiler).not.toHaveBeenCalled();
});

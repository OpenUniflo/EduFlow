/** Run against the exact READY Preview; credentials are runtime-only, never output. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createClient,type SupabaseClient } from '@supabase/supabase-js';
import {validateCourseIntegrity} from '../../src/features/course/runtime/courseRuntime.js';
import {InMemoryKnowledgeRepository} from '../../src/features/knowledge/repository/InMemoryKnowledgeRepository.js';
import {userKnowledgeAccess} from '../../src/features/knowledge/repository/KnowledgeRepository.js';
import scenario from './fixtures/enterprise-project-v1.json' with {type:'json'};
const url=process.env.VITE_SUPABASE_URL!,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
assert.equal(new URL(url).hostname,'uyljtdbvlivxniililay.supabase.co');
const preview=process.env.ACCEPTANCE_PREVIEW_URL!;assert.match(new URL(preview).hostname,/^edu-flow-.*\.vercel\.app$/);
const courseId=scenario.courseId;
const clients:SupabaseClient[]=[];const captures:Array<Record<string,any>>=[];
for(const [actor,email,password] of [['A',process.env.ACCEPTANCE_A_EMAIL,process.env.ACCEPTANCE_A_PASSWORD],['B',process.env.ACCEPTANCE_B_EMAIL,process.env.ACCEPTANCE_B_PASSWORD]]){
 assert.ok(email&&password);const client:SupabaseClient=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const login=await client.auth.signInWithPassword({email,password});assert.ifError(login.error);assert.ok(login.data.session);clients.push(client);
 const request=async(body?:unknown)=>{const started=Date.now();const r=await fetch(`${preview}/api/learner?resource=route-plan&courseId=${courseId}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${login.data.session!.access_token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return {data,elapsedMs:Date.now()-started};};
 const history=async()=>{const r=await client.from('personal_course_route_versions').select('*').eq('course_id',courseId).order('version_number');assert.ifError(r.error);return r.data;};
 const fetchRuntime=async(path:string)=>{const r=await fetch(`${preview}${path}`,{headers:{Authorization:`Bearer ${login.data.session!.access_token}`}});assert.equal(r.status,200,path);return r.json();};
 const [{course:runtime},{graph}]=await Promise.all([fetchRuntime(`/api/courses?id=${courseId}`),fetchRuntime('/api/knowledge')]);assert.equal(validateCourseIntegrity(runtime,new InMemoryKnowledgeRepository(graph),userKnowledgeAccess(login.data.user.id)),true);
 const before=await history();const initial=await request();
 const includes=actor==='A'?['criteria','critical','risk','corrective']:['corrective'];
 const intent={includeNodeIds:includes.map(key=>scenario.nodes.find(n=>n.key===key)!.id),excludeNodeIds:[],scopeMode:'replan'};
 const pv=await request({action:'preview',...intent});assert.equal(pv.data.plan.valid,true,JSON.stringify(pv.data));assert.equal(pv.data.plan.execution.complete,true,JSON.stringify(pv.data.plan.execution.issues));assert.deepEqual(await history(),before,'Preview never writes versions');
 const steps=pv.data.plan.execution.steps;
 let current=initial.data;
 if(process.env.ACCEPTANCE_ADOPT==='true'){
  current=(await request({action:'adopt',baseVersionId:initial.data.activeVersion.id,...intent,selectedEdgeIds:steps.map((s:{edgeId:string})=>s.edgeId),actionChoices:steps.map(({edgeId,actionId}:{edgeId:string;actionId:string})=>({edgeId,actionId}))})).data;
  const after=await history();assert.deepEqual(after!.slice(0,before!.length),before);assert.equal(after!.length,before!.length+1);assert.deepEqual(current.activeVersion.snapshot.executionSteps,steps);
 }
 const state=await client.from('user_knowledge_states').select('node_id,status,evidence').eq('user_id',login.data.user.id).like('node_id','supply-%').order('node_id');assert.ifError(state.error);
 const actions=await client.from('knowledge_edge_actions').select('id,edge_id,type,status').like('edge_id','%supply-%').eq('status','active');assert.ifError(actions.error);assert.equal(actions.data!.length,52);
 const bindings=await client.from('course_action_bindings').select('action_id,micro_path_id,assignment_id,available').eq('course_id',courseId);assert.ifError(bindings.error);for(const a of actions.data!){const b:{available:boolean;micro_path_id:string|null;assignment_id:string|null}|undefined=bindings.data!.find(binding=>binding.action_id===a.id);assert.ok(b?.available);assert.ok(a.type==='micro_learning'?b.micro_path_id:b.assignment_id);}
 captures.push({actor,userId:login.data.user.id,currentVersion:current.activeVersion,previewRoute:pv.data.plan,currentRoute:current.plan,previewElapsedMs:pv.elapsedMs,UKS:state.data,activeActions:actions.data!.length,Micro:actions.data!.filter(a=>a.type==='micro_learning').length,Practice:actions.data!.filter(a=>a.type==='practice_task').length,steps:steps.length,historyPreserved:true,courseIntegrity:true,previewCreatedVersions:0});
}
assert.notDeepEqual(captures[0].UKS,captures[1].UKS);assert.notDeepEqual(captures[0].previewRoute.route.selectedNodeIds,captures[1].previewRoute.route.selectedNodeIds);
for(let i=0;i<clients.length;i++){const other=await clients[i].from('personal_course_route_versions').select('id').eq('user_id',captures[1-i].userId);assert.ifError(other.error);assert.deepEqual(other.data,[],'Other user history hidden');const otherStates=await clients[i].from('user_knowledge_states').select('node_id').eq('user_id',captures[1-i].userId);assert.ifError(otherStates.error);assert.deepEqual(otherStates.data,[],'Other user UKS hidden');}
writeFileSync('docs/acceptance/SELECTED_ROUTE_V3_HOSTED.json',JSON.stringify({preview,capturedAt:new Date().toISOString(),courseId,captures,RLScrossUserHidden:true},null,2)+'\n');
console.log(captures.map(c=>({actor:c.actor,version:c.currentVersion.versionNumber,steps:c.steps,UKS:c.UKS!.length,actions:c.activeActions,previewElapsedMs:c.previewElapsedMs})));

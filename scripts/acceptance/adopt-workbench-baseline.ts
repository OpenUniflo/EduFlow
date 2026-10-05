/** Explicit fixture adoption through the same Preview/Action selection/Adopt API as the UI. */
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {acceptanceResetAccounts} from './reset-conversation-evidence.js';
const courseId='enterprise-vietnam-supply-collaboration';
const preview=process.env.ACCEPTANCE_PREVIEW_URL!;
assert.match(new URL(preview).hostname,/^edu-flow-.*\.vercel\.app$/);
assert.equal(new URL(process.env.VITE_SUPABASE_URL!).hostname,'uyljtdbvlivxniililay.supabase.co');
const captures=[];
for(const [index,actor] of ['A','B'].entries()){
 const account=acceptanceResetAccounts[index];assert.equal(process.env[`ACCEPTANCE_${actor}_EMAIL`],account.email);
 const client=createClient(process.env.VITE_SUPABASE_URL!,process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const login=await client.auth.signInWithPassword({email:account.email,password:process.env[`ACCEPTANCE_${actor}_PASSWORD`]!});assert.ifError(login.error);assert.equal(login.data.user?.id,account.id);
 const headers={Authorization:`Bearer ${login.data.session!.access_token}`,'Content-Type':'application/json'};
 async function request(body?:unknown){const response=await fetch(`${preview}/api/learner?resource=route-plan&courseId=${courseId}`,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;}
 async function history(){const result=await client.from('personal_course_route_versions').select('*').eq('course_id',courseId).order('version_number');assert.ifError(result.error);return result.data!;}
 const before=await history(),current=await request();
 const fixture=JSON.parse(readFileSync('scripts/acceptance/fixtures/enterprise-project-v1.json','utf8'));
 const intent=actor==='A'?{includeNodeIds:fixture.nodes.map((node:{id:string})=>node.id),excludeNodeIds:[],scopeMode:'replan'}:{includeNodeIds:['supply-corrective-action-verification'],excludeNodeIds:[],scopeMode:'replan'};
 const proposed=await request({action:'preview',...intent});assert.ok(proposed.plan.valid);assert.ok(proposed.plan.execution.complete,JSON.stringify(proposed.plan.execution.issues));
 const options=proposed.plan.execution.options;
 const actions=options.filter((o:any)=>o.type==='practice_task'&&o.availableNow&&o.planningAvailable);
 assert.ok(actions.length,'Baseline needs an immediately available existing Practice');
 const practice=actions[0];
 const choices=proposed.plan.execution.steps.map((s:any)=>({edgeId:s.edgeId,actionId:s.edgeId===practice.edgeId?practice.actionId:s.actionId}));
 const selection={selectedEdgeIds:choices.map((c:any)=>c.edgeId),actionChoices:choices};
 const selected=await request({action:'preview',...intent,...selection});assert.ok(selected.plan.execution.complete);
 assert.deepEqual(await history(),before,'Preview and selection must not create versions');
 const existing=current.activeVersion.snapshot.executionSteps;
 const adopted=actor==='A'&&existing?.length>0?current:await request({action:'adopt',baseVersionId:current.activeVersion.id,...intent,...selection});
 const after=await history();assert.deepEqual(after.slice(0,before.length),before,'Immutable prior history preserved');assert.equal(after.length,before.length+(adopted===current?0:1));
 assert.ok(adopted.activeVersion.snapshot.executionSteps.length>0);
 captures.push({actor,account,previousVersion:current.activeVersion.id,version:adopted.activeVersion,selectedPractice:practice,previewCreatesVersions:false,oldHistoryUnchanged:true});
 console.log(JSON.stringify({actor,version:adopted.activeVersion.versionNumber,nodes:adopted.activeVersion.snapshot.selectedNodeIds.length,steps:adopted.activeVersion.snapshot.executionSteps.length,practice:practice.title}));
 await client.auth.signOut();
}
mkdirSync('.acceptance/conversation-workbench',{recursive:true});writeFileSync('.acceptance/conversation-workbench/acceptance-ab-adoption.json',JSON.stringify({preview,capturedAt:new Date().toISOString(),captures},null,2));

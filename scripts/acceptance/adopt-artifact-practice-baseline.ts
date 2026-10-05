/** Reviewed fixture adoption uses product Preview/Adopt, never SQL snapshots. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {acceptanceResetAccounts} from './reset-conversation-evidence.js';
import type {RoutePlanView,ExecutionRoutePlan,RouteVersion} from '../../src/shared/learning/routeVersion.js';
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
 async function request<T>(body?:unknown):Promise<T>{const response=await fetch(`${preview}/api/learner?resource=route-plan&courseId=${courseId}`,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;}
 async function history(){const result=await client.from('personal_course_route_versions').select('*').eq('course_id',courseId).order('version_number');assert.ifError(result.error);return result.data!;}
 const before=await history(),current=await request<RoutePlanView>();assert.ok(current.activeVersion);
 const version=current.activeVersion;
 const intent={...version.constraints,scopeMode:'current',selectedEdgeIds:version.snapshot.executionSteps?.map(step=>step.edgeId)??[]};
 const proposed=await request<{plan:ExecutionRoutePlan}>({action:'preview',...intent});assert.ok(proposed.plan.valid&&proposed.plan.execution);
 const execution=proposed.plan.execution;
 const desired=execution.options.find(option=>option.type==='practice_task'&&option.planningAvailable&&option.availableNow&&(actor==='A'?option.assignmentId?.endsWith('exposure-record'):option.assignmentId?.endsWith('impact-record')));
 assert.ok(desired,`${actor} needs its immediately executable Gold artifact task`);
 const choices=intent.selectedEdgeIds.map(edgeId=>{const option=edgeId===desired.edgeId?desired:execution.options.find(option=>option.edgeId===edgeId&&option.type==='micro_learning'&&option.planningAvailable);assert.ok(option,`No legal executor on ${edgeId}`);return {edgeId,actionId:option.actionId};});
 const selected=await request<{plan:ExecutionRoutePlan;previewState:string}>({action:'preview',...intent,actionChoices:choices});assert.ok(selected.plan.valid&&selected.plan.execution?.complete,JSON.stringify(selected.plan.execution?.issues));
 assert.deepEqual(await history(),before,'Preview must preserve historical versions');
 const adopted=await request<{activeVersion:RouteVersion}>({action:'adopt',baseVersionId:version.id,previewState:selected.previewState,...intent,actionChoices:choices});
 const after=await history();assert.equal(after.length,before.length+1);assert.deepEqual(after.slice(0,before.length),before);
 captures.push({actor,previousVersion:version.id,version:adopted.activeVersion,selectedPractice:{assignmentId:desired.assignmentId,title:desired.title},previewCreatesVersions:false,oldHistoryUnchanged:true});
 console.log(JSON.stringify({actor,version:adopted.activeVersion.versionNumber,steps:adopted.activeVersion.snapshot.executionSteps?.length,practice:desired.title}));
 await client.auth.signOut();
}
mkdirSync('.acceptance/practice-planner-history',{recursive:true});writeFileSync('.acceptance/practice-planner-history/ab-adoption.json',JSON.stringify({preview,captures},null,2));

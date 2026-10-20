import {mkdirSync as ensureWorkflowArtifacts} from "node:fs";
ensureWorkflowArtifacts("artifacts/workflow/acceptance/evidence",{recursive:true});
ensureWorkflowArtifacts("artifacts/workflow/acceptance/reports",{recursive:true});
// Explicitly opt into bounded real-model validation. Preserve the ledger; never replay a partial run blindly.
import {createClient} from '@supabase/supabase-js';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
if(!process.argv.includes('--allow-real-models'))throw Error('Pass --allow-real-models for the documented model budget');
process.loadEnvFile('.env.local');
const target=new URL(process.env.SUPABASE_URL);
if(!['127.0.0.1','localhost'].includes(target.hostname)||target.port!=='54321')throw Error('Local only');
const c=createClient(target.href,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
const login=await c.auth.signInWithPassword({email:process.env.LOCAL_STUDENT_EMAIL,password:process.env.LOCAL_STUDENT_PASSWORD});
if(login.error)throw Error('Local login failed');
const manifest=JSON.parse(readFileSync('artifacts/workflow/acceptance/evidence/workflow-agent-scenarios-20261020.json'));
const path='artifacts/workflow/acceptance/evidence/workflow-agent-scenarios-validation-20261020.json';
const report=existsSync(path)?JSON.parse(readFileSync(path)):{scope:'Local actual model integration; API validation, not independent human acceptance',startedAt:new Date().toISOString(),modelRequestBudget:12,reservedRequests:0,operations:[],checks:[]};
if(report.passed){console.log(JSON.stringify({alreadyVerified:true,checks:report.checks.length,modelStepStarts:report.observedModelSteps,newModelCalls:0}));process.exit(0);}
if(report.operations.length)throw Error('Partial validation ledger exists; inspect original Runs and remaining budget before any new model operation');
const save=()=>writeFileSync(path,JSON.stringify(report,null,2)+'\n');
async function api(q,m='GET',body,key){const r=await fetch('http://127.0.0.1:5173/api/workflows?'+q,{method:m,headers:{Authorization:'Bearer '+login.data.session.access_token,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const d=await r.json();if(!r.ok)throw Error('API '+r.status+' '+JSON.stringify(d));return d;}
const p5=body=>api('resource=p5','POST',body);
async function poll(id){for(let j=0;j<480;j++){const r=await api('resource=runs&id='+id);if(['success','failed','cancelled','waiting'].includes(r.status))return r;await new Promise(r=>setTimeout(r,500));}throw Error('Run still active; ledger preserved, do not duplicate');}
async function operation(label,budget,dispatch){let row=report.operations.find(x=>x.label===label);if(!row){if(report.reservedRequests+budget>report.modelRequestBudget)throw Error('Model budget exhausted');row={label,key:randomUUID(),budget};report.operations.push(row);report.reservedRequests+=budget;save();}if(!row.receipt){row.receipt=await dispatch(row.key);save();}row.run=await poll(row.receipt.runId);row.steps=(await api('resource=steps&runId='+row.run.runId+'&limit=200')).items;save();if(['failed','cancelled'].includes(row.run.status))throw Error(label+' '+JSON.stringify(row.run.error));return row.run;}
function check(name,passed,details){const value={name,passed,...details};report.checks=report.checks.filter(x=>x.name!==name);report.checks.push(value);save();console.log(JSON.stringify({name,passed}));if(!passed)throw Error('Failed: '+name);}
async function start(key,label,budget,input){const f=manifest.examples.find(x=>x.key===key);return operation(label,budget,k=>api('resource=runs','POST',{workflowId:f.workflowId,revision:f.revision,environmentRef:'local',input:input??f.suggestedInput},k));}
async function respond(run,label,responses){let row=report.operations.find(x=>x.label===label);if(row?.receipt)return operation(label,0,()=>row.receipt);const t=await api('resource=threads&id='+run.threadId);const payload={checkpointId:t.checkpointId,currentRunId:t.currentRunId,responses};return operation(label,0,()=>api('resource=threads&id='+t.threadId+'&op=resume','POST',payload));}
try{
 let a=await start('order-service','A-tool-loop',5);
 check('A real model called the order tool and reached review',a.status==='waiting'&&a.finalState.draft.length>0&&report.operations.find(x=>x.label==='A-tool-loop').steps.some(x=>x.nodeId==='tools'&&x.status==='completed'),{runId:a.runId,threadId:a.threadId});
 let t=await api('resource=threads&id='+a.threadId);
 a=await respond(a,'A-approved',Object.fromEntries(t.interrupts.map(x=>[x.id,{approved:true}])));
 check('A approval generated real MCP echo acknowledgement',a.status==='success'&&a.output.approved&&JSON.stringify(a.output.receipt).includes('订单客服建议已人工确认'),{runId:a.runId,output:a.output});
 let b=await start('parallel-review','B-three-agents',3);
 t=await api('resource=threads&id='+b.threadId);
 check('B three independent child waits',b.status==='waiting'&&t.interrupts.length===3&&t.interrupts.every(x=>x.graphPath?.[0]==='reviewer'),{runId:b.runId,interrupts:t.interrupts.map(x=>({id:x.id,taskId:x.taskId,graphPath:x.graphPath,namespace:x.namespace}))});
 const first=t.interrupts[0];
 b=await respond(b,'B-first-approved',{[first.id]:{accepted:true,comment:'先批准这一项，其他等待保留'}});
 t=await api('resource=threads&id='+b.threadId);
 check('B partial response preserves other two waits',b.status==='waiting'&&t.interrupts.length===2,{runId:b.runId,remainingWaits:t.interrupts.length});
 b=await respond(b,'B-rest-batch',Object.fromEntries(t.interrupts.map((x,index)=>[x.id,{accepted:index===0,comment:index===0?'采用':'暂不采用，请后续调整'}])));
 check('B aggregate preserves three distinct decisions',b.status==='success'&&b.output.results.length===3&&new Set(b.output.results.map(x=>x.dimension)).size===3&&b.output.results.filter(x=>x.accepted).length===2,{runId:b.runId,output:b.output});
 const projectKey=report.projectKey??('validation_'+randomUUID().slice(0,8));report.projectKey=projectKey;save();
 let r=await start('project-followup','C-first-round',1,{projectKey,update:'活动报名工具已完成需求访谈，还未开始编码。'});
 t=await api('resource=threads&id='+r.threadId);
 check('C first round has no old project memory',r.status==='waiting'&&r.finalState.previous===null,{runId:r.runId});
 r=await respond(r,'C-save-confirmed',Object.fromEntries(t.interrupts.map(x=>[x.id,{approved:true,finalNote:'需求访谈已完成，尚未编码；下一步确认报名字段。'}])));
 check('C confirmed note saved with version',r.status==='success'&&r.output.savedVersion===1&&r.output.record.rounds===1,{runId:r.runId,threadId:r.threadId,output:r.output});
 t=await api('resource=threads&id='+r.threadId);
 const beforeVersion=r.output.savedVersion,firstThread=r.threadId;
 r=await operation('C-same-thread-next',1,key=>p5({action:'next',threadId:t.threadId,checkpointId:t.checkpointId,input:{projectKey,update:'报名字段已确认，仍未编码；请结合上轮记录给出下一步建议。'},idempotencyKey:key}));
 check('C next round reuses thread and reads confirmed memory',r.status==='waiting'&&r.threadId===firstThread&&r.finalState.previous?.confirmedNote.includes('尚未编码'),{runId:r.runId,threadId:r.threadId,previous:r.finalState.previous});
 t=await api('resource=threads&id='+r.threadId);
 r=await respond(r,'C-decline-save',Object.fromEntries(t.interrupts.map(x=>[x.id,{approved:false,finalNote:''}])));
 check('C declined round leaves Store untouched',r.status==='success'&&r.output.status==='未批准，长期记忆未修改',{runId:r.runId,output:r.output});
 let fresh=await start('project-followup','C-new-thread',1,{projectKey,update:'新会话，请读取本项目已确认历史。'});
 check('C new thread reads prior confirmed note, not rejected draft',fresh.status==='waiting'&&fresh.threadId!==firstThread&&fresh.finalState.memoryVersion===beforeVersion&&fresh.finalState.previous.rounds===1,{runId:fresh.runId,threadId:fresh.threadId,previous:fresh.finalState.previous});
 t=await api('resource=threads&id='+fresh.threadId);
 fresh=await respond(fresh,'C-finish-read-check',Object.fromEntries(t.interrupts.map(x=>[x.id,{approved:false,finalNote:''}])));
 check('All validation threads ended',fresh.status==='success',{runId:fresh.runId});
 const models=report.operations.flatMap(x=>x.steps.filter(s=>['agent','analyst','assistant'].includes(s.nodeId)).map(s=>({runId:x.run.runId,stepId:s.stepId,taskId:s.taskId,status:s.status,usage:s.usage})));
 report.modelStepStarts=models;report.observedModelSteps=models.length;report.finishedAt=new Date().toISOString();report.passed=report.checks.every(x=>x.passed)&&models.length<=12;save();
 console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,modelStepStarts:models.length,reservedRequests:report.reservedRequests,projectKey}));
}catch(error){report.failure=error.message;save();console.log(JSON.stringify({passed:false,failure:error.message}));process.exitCode=1;}

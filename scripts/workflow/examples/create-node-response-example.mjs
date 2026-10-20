import {mkdirSync as ensureWorkflowArtifacts} from "node:fs";
ensureWorkflowArtifacts("artifacts/workflow/acceptance/evidence",{recursive:true});
ensureWorkflowArtifacts("artifacts/workflow/acceptance/reports",{recursive:true});
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
process.loadEnvFile('.env.local');
if(new URL(process.env.SUPABASE_URL).hostname!=='127.0.0.1')throw Error('Local examples only');
const auth=createClient(process.env.SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
const login=await auth.auth.signInWithPassword({email:process.env.LOCAL_STUDENT_EMAIL,password:process.env.LOCAL_STUDENT_PASSWORD});
if(login.error)throw Error('Local login failed');
const headers={Authorization:`Bearer ${login.data.session.access_token}`,'Content-Type':'application/json'};
async function api(query,method='GET',body){const response=await fetch('http://127.0.0.1:5173/api/workflows?'+query,{method,headers:{...headers,...(method==='POST'?{'Idempotency-Key':randomUUID()}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Error(`Workflow API ${response.status}: ${JSON.stringify(data)}`);return data;}
const obj=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const state=(field)=>({source:'state',pointer:'/'+field,onMissing:{mode:'error'}});
const definition={schemaVersion:'2.0',workflowId:'',revision:0,name:'差旅报销金额核算',description:'填写本次住宿费用，与已配置的交通费 200 元汇总，生成报销总额。此示例真实执行本地计算，不调用模型或外部服务。',inputSchema:obj({}),outputSchema:obj({'住宿费用（元）':{type:'number'},'交通费用（元）':{type:'number'},'报销合计（元）':{type:'number'}}),state:{schema:obj({accommodation:{type:'number',minimum:0},transport:{type:'number',minimum:0},total:{type:'number',minimum:0}}),initial:{accommodation:0,transport:200,total:0},inputBindings:{},reducers:{}},entryNodeId:'start',nodes:[{id:'start',label:'开始',type:'core.start',typeVersion:1,config:{},inputs:{},writes:{}},{id:'total',label:'汇总差旅费用',type:'core.transform',typeVersion:1,config:{operationRef:'core.add',operationVersion:1,authoring:{interrupt:{title:'请补充本次住宿费用',schema:obj({accommodation:{type:'number',title:'住宿费用（元）',description:'用于与交通费 200 元合计；如果没有住宿费用可填 0。',minimum:0,maximum:100000}}),resumeWrites:{accommodation:'accommodation'}}}},inputs:{left:state('accommodation'),right:state('transport')},writes:{total:'/value'}},{id:'end',label:'生成费用汇总',type:'core.end',typeVersion:1,config:{},inputs:{},writes:{}}],transitions:[{id:'start-total',from:'start',outlet:'next',to:'total'},{id:'total-end',from:'total',outlet:'next',to:'end'}],outputBindings:{'住宿费用（元）':state('accommodation'),'交通费用（元）':state('transport'),'报销合计（元）':state('total')},policy:{timeoutMs:120000,nodeTimeoutMs:30000,maxNodeExecutions:50,maxToolCalls:10,maxInputBytes:65536,maxStateBytes:1048576,maxEventBytes:65536,maxOutputTokens:2048,maxAttempts:1,authoring:{checkpoint:'superstep',waitTimeoutMs:86400000,recursionLimit:50}},requiredCapabilities:[]};
const editor={schemaVersion:1,workflowId:'',definitionRevision:0,editorRevision:0,nodes:{start:{x:60,y:100},total:{x:350,y:100},end:{x:750,y:100}},edges:{}};
const created=await api('resource=definitions','POST',{definition,editor});
async function run(){return api('resource=runs','POST',{workflowId:created.workflowId,revision:created.revision,input:{},environmentRef:'local'});}
async function poll(id,statuses){for(let i=0;i<50;i++){const record=await api('resource=runs&id='+id);if(statuses.includes(record.status))return record;await new Promise(resolve=>setTimeout(resolve,300));}throw Error('Run did not reach expected status');}
const first=await run();const firstWaiting=await poll(first.runId,['waiting','failed']);if(firstWaiting.status!=='waiting')throw Error('Example failed');
const thread=await api('resource=threads&id='+firstWaiting.threadId);
const response=await api('resource=threads&id='+thread.threadId+'&op=resume','POST',{checkpointId:thread.checkpointId,responses:{[thread.interrupts[0].id]:{accommodation:300}}});
const completed=await poll(response.runId,['success','failed']);if(completed.output?.['报销合计（元）']!==500)throw Error('Expense sum incorrect');
const next=await run();const waiting=await poll(next.runId,['waiting','failed']);
const report={scope:'Meaningful real local expense calculation; no model or remote tool',created,completedRunId:completed.runId,completedOutput:completed.output,waitingRunId:waiting.runId,waitingThreadId:waiting.threadId,url:'http://127.0.0.1:5173/workflows/'+created.workflowId};
writeFileSync('artifacts/workflow/acceptance/evidence/workflow-node-response-example.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

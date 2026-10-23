import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createEditorV2,createWorkflowV2,createNodeV2 } from "../../../src/features/workflow/domain/v2/factory";
const url=process.env.SUPABASE_URL!;
if(new URL(url).hostname!=="127.0.0.1"||new URL(url).port!=="54321")throw Error("Local Supabase only");
const admin=createClient(url,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false}});
const email="canvas-integration@eduflow.local",password="CanvasIntegration-local-2026!";
const users=await admin.auth.admin.listUsers({perPage:1000});assert.ifError(users.error);
if(!users.data.users.some(user=>user.email===email)){const result=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(result.error);}
const auth=await admin.auth.signInWithPassword({email,password});assert.ifError(auth.error);const token=auth.data.session!.access_token;
const base="http://127.0.0.1:5173/api/workflows";
async function request(resource:string,method="GET",body?:unknown,query:Record<string,string>={}){const response=await fetch(base+"?"+new URLSearchParams({resource,...query}),{method,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",...(method==="POST"&&resource==="runs"?{"Idempotency-Key":crypto.randomUUID()}: {})},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.json();assert.ok(response.ok,`${resource} ${response.status}: ${JSON.stringify(value)}`);return value;}
assert.equal((await fetch(base+"?resource=definitions")).status,401);
const environments=await request("environments");assert.ok(environments.items.length);const environmentRef=environments.items[0].environmentRef;
const configuration=await request("configuration");const savedConfig=await request("configuration","PUT",{baseRevision:configuration.revision,variables:[{key:"FACTOR",value:5,overrides:{}}]});assert.equal(savedConfig.revision,configuration.revision+1);
const refreshedEnvironments=await request("environments");assert.equal(refreshedEnvironments.items.find((item:any)=>item.environmentRef===environmentRef)?.variables.FACTOR,5,"Catalog must expose effective ordinary variables for node field selection");
const definition=createWorkflowV2("自动检查 · 环境与节点测试");definition.inputSchema={type:"object",properties:{left:{type:"number"}},required:["left"],additionalProperties:false};definition.state={schema:{type:"object",properties:{answer:{type:"number"}},required:["answer"],additionalProperties:false},initial:{answer:0},inputBindings:{},reducers:{}};
const calc=createNodeV2("core.transform","calc");calc.label="求和";calc.config={operationRef:"core.add",operationVersion:1};calc.inputs={left:{source:"input",pointer:"/left",onMissing:{mode:"error"}},right:{source:"environment",pointer:"/FACTOR",onMissing:{mode:"error"}}};calc.writes={answer:"/value"};definition.nodes.splice(1,0,calc);definition.transitions=[{id:"in",from:"start",outlet:"next",to:"calc"},{id:"out",from:"calc",outlet:"next",to:"end"}];definition.outputSchema={type:"object",properties:{answer:{type:"number"}},required:["answer"],additionalProperties:false};definition.outputBindings={answer:{source:"state",pointer:"/answer",onMissing:{mode:"error"}}};
const saved=await request("definitions","POST",{definition,editor:createEditorV2(definition)});definition.workflowId=saved.workflowId;definition.revision=saved.revision;
const test=await request("node-tests","POST",{workflowId:saved.workflowId,baseRevision:1,definition,nodeId:"calc",input:{left:2},state:{answer:0},environmentRef,confirmExternalEffect:false});assert.deepEqual(test.output,{value:7});assert.deepEqual(test.stateBefore,{answer:0});assert.deepEqual(test.stateAfter,{answer:7});assert.equal((await request("runs","GET",undefined,{workflowId:saved.workflowId})).items.length,0);
const receipt=await request("runs","POST",{workflowId:saved.workflowId,revision:1,input:{left:2},environmentRef});
let run;for(let attempt=0;attempt<25;attempt++){run=await request("runs","GET",undefined,{id:receipt.runId});if(["success","failed","cancelled"].includes(run.status))break;await new Promise(resolve=>setTimeout(resolve,400));}
assert.equal(run.status,"success");assert.deepEqual(run.output,{answer:7});
const events=await request("events","GET",undefined,{runId:receipt.runId});const changed=events.events.find((event:any)=>event.type==="state.updated");assert.deepEqual(changed.payload.changes,[{field:"answer",before:0,after:7}]);
await request("definitions","DELETE",{baseRevision:1},{id:saved.workflowId});
const tools=(await request("tools","GET",undefined,{environmentRef})).items;
const readOnlyTool=tools.find((tool:any)=>tool.ref==="order_lookup"&&tool.adapter==="http"&&tool.sideEffect==="read");assert.ok(readOnlyTool,"Local controlled HTTP fixture is required");
const toolDefinition=structuredClone(definition);toolDefinition.workflowId="";toolDefinition.revision=0;toolDefinition.name="自动检查 · 注册 HTTP 工具";toolDefinition.inputSchema={type:"object",properties:{},additionalProperties:false};toolDefinition.state.schema={type:"object",properties:{answer:{}},additionalProperties:false};toolDefinition.state.initial={};toolDefinition.outputSchema={type:"object",properties:{answer:{}},required:["answer"],additionalProperties:false};
const toolNode=toolDefinition.nodes.find(node=>node.id==="calc")!;toolNode.type="core.tool";toolNode.typeVersion=2;toolNode.config={toolRef:readOnlyTool.ref,contractDigest:readOnlyTool.contractDigest};toolNode.inputs={orderId:{source:"literal",value:"A1001"}};toolNode.writes={answer:"/result"};
const toolSaved=await request("definitions","POST",{definition:toolDefinition,editor:createEditorV2(toolDefinition)});toolDefinition.workflowId=toolSaved.workflowId;toolDefinition.revision=toolSaved.revision;
const toolTest=await request("node-tests","POST",{workflowId:toolSaved.workflowId,baseRevision:1,definition:toolDefinition,nodeId:"calc",input:{},state:{},environmentRef,confirmExternalEffect:true});assert.ok(JSON.stringify(toolTest.output).includes("A1001"));assert.equal((await request("runs","GET",undefined,{workflowId:toolSaved.workflowId})).items.length,0);
await request("definitions","DELETE",{baseRevision:1},{id:toolSaved.workflowId});
console.log(JSON.stringify({unauthenticated:401,nodeTest:test.output,formalOutput:run.output,changes:changed.payload.changes,httpTool:toolTest.output,runId:receipt.runId,workflowId:saved.workflowId}));

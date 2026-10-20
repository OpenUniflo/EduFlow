import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
process.loadEnvFile(resolve(".env.local"));
if (new URL(process.env.SUPABASE_URL).hostname !== "127.0.0.1") throw new Error("Local only");
const auth = createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const session = await auth.auth.signInWithPassword({ email: process.env.LOCAL_STUDENT_EMAIL, password: process.env.LOCAL_STUDENT_PASSWORD });
if (session.error) throw new Error("Local acceptance login failed");
const token = session.data.session.access_token;
async function request(resource, method = "GET", body, key) {
  const response = await fetch(`http://127.0.0.1:5173/api/workflows?${resource}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(`API ${response.status}: ${JSON.stringify(result)}`);
  return result;
}
const policy = { timeoutMs:120000,nodeTimeoutMs:30000,maxNodeExecutions:50,maxToolCalls:10,maxInputBytes:65536,maxStateBytes:1048576,maxEventBytes:65536,maxOutputTokens:2048,maxAttempts:1 };
const definition = { schemaVersion:"2.0",workflowId:"",revision:0,name:"Local smoke arithmetic",description:"Real LangGraph arithmetic smoke", inputSchema:{type:"object",properties:{},additionalProperties:false}, outputSchema:{type:"object",properties:{answer:{type:"number"}},required:["answer"],additionalProperties:false}, state:{schema:{type:"object",properties:{answer:{type:"number"}},required:["answer"],additionalProperties:false},initial:{answer:0},inputBindings:{},reducers:{}},entryNodeId:"start",nodes:[{id:"start",label:"Start",type:"core.start",typeVersion:1,config:{},inputs:{},writes:{}},{id:"add",label:"Add",type:"core.transform",typeVersion:1,config:{operationRef:"core.add",operationVersion:1},inputs:{left:{source:"literal",value:17},right:{source:"literal",value:25}},writes:{answer:"/value"}},{id:"end",label:"End",type:"core.end",typeVersion:1,config:{},inputs:{},writes:{}}],transitions:[{id:"start-add",from:"start",outlet:"next",to:"add"},{id:"add-end",from:"add",outlet:"next",to:"end"}], outputBindings:{answer:{source:"state",pointer:"/answer",onMissing:{mode:"error"}}},policy,requiredCapabilities:[] };
const editor = {schemaVersion:1,workflowId:"",editorRevision:0,definitionRevision:0,nodes:{start:{x:80,y:100},add:{x:300,y:100},end:{x:550,y:100}},edges:{}};
const created = await request("resource=definitions", "POST", {definition,editor});
const validation = await request("resource=validate", "POST", {workflowId:created.workflowId,revision:created.revision,environmentRef:"local"});
if (!validation.valid) throw new Error(`Compilation invalid: ${JSON.stringify(validation.diagnostics)}`);
const accepted = await request("resource=runs", "POST", {workflowId:created.workflowId,revision:created.revision,environmentRef:"local",input:{}}, randomUUID());
let record;
for (let index=0;index<30;index++) { await new Promise(resolve=>setTimeout(resolve,1000)); record=await request(`resource=runs&id=${accepted.runId}`); if (["success","failed","cancelled"].includes(record.status)) break; }
const events = await request(`resource=events&runId=${accepted.runId}`);
const steps = await request(`resource=steps&runId=${accepted.runId}`);
mkdirSync(".acceptance/workflow-v2-m1",{recursive:true});
writeFileSync(".acceptance/workflow-v2-m1/root-smoke.json",JSON.stringify({created,validation,record,events,steps},null,2));
console.log(JSON.stringify({workflowId:created.workflowId,runId:accepted.runId,status:record.status,output:record.output,events:events.events.length,steps:steps.items.length}));
if(record.status!=="success"||record.output.answer!==42) throw new Error("Real arithmetic run did not produce 42");

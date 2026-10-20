import {mkdirSync as ensureWorkflowArtifacts} from "node:fs";
ensureWorkflowArtifacts("artifacts/workflow/acceptance/evidence",{recursive:true});
ensureWorkflowArtifacts("artifacts/workflow/acceptance/reports",{recursive:true});
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { createEditorV2, createWorkflowV2 } from "../../../src/features/workflow/domain/v2/factory";
const url = process.env.SUPABASE_URL!;
if(new URL(url).hostname!=="127.0.0.1"||new URL(url).port!=="54321")throw Error("Local Supabase only");
const admin=createClient(url,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false}});
const authClient=createClient(url,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false}});
const auth=await authClient.auth.signInWithPassword({email:"canvas-integration@eduflow.local",password:"CanvasIntegration-local-2026!"});assert.ifError(auth.error);
const owner=auth.data.user!.id,token=auth.data.session!.access_token;
const base="http://127.0.0.1:5173/api/workflows";
const ids=new Set<string>(), checks:string[]=[];
async function request(method:string,query:Record<string,string>,body?:unknown,status=200){const response=await fetch(base+"?"+new URLSearchParams({resource:"definitions",...query}),{method,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value;}
async function library(query:Record<string,string>={}){return request("GET",{op:"library",search:"library-check-1018",...query});}
try {
 assert.equal((await fetch(base+"?resource=definitions&op=library")).status,401);checks.push("unauthenticated requests rejected");
 const definition=createWorkflowV2("library-check-1018 replay");definition.description="description-only-search-1018 100%";
 const creationId=crypto.randomUUID();ids.add(creationId);const body={definition,editor:createEditorV2(definition),creationId};
 const both=await Promise.all([request("POST",{},body,201),request("POST",{},body,201)]);assert.equal(both[0].workflowId,both[1].workflowId);
 await request("POST",{},{...body,definition:{...definition,name:"changed"}},409);checks.push("concurrent creation/retry has one identity; changed payload rejected");
 for(let i=0;i<12;i++){const def=createWorkflowV2(`library-check-1018 ${String(i).padStart(2,"0")}`);const result=await request("POST",{},{definition:def,editor:createEditorV2(def)},201);ids.add(result.workflowId);}
 const page1=await library({sort:"name",page:"1",pageSize:"12"});const page2=await library({sort:"name",page:"2",pageSize:"12"});assert.equal(page1.total,13);assert.equal(page1.items.length,12);assert.equal(page2.items.length,1);assert.equal(new Set([...page1.items,...page2.items].map(i=>i.workflowId)).size,13);
 assert.equal((await library({search:"description-only-search-1018"})).total,1);assert.equal((await library({search:"100%"})).total,1);assert.equal((await library({scope:"personal"})).total,13);checks.push("server pagination, stable order, total count, literal description search and scope");
 const impact=await request("GET",{id:creationId,op:"delete-impact"});assert.equal(impact.revisions,1);assert.equal(impact.runs,0);
 await request("PATCH",{id:creationId,op:"rename"},{baseRevision:1,name:"  library-check-1018 renamed  "});const renamed=await request("GET",{id:creationId});assert.equal(renamed.definition.name,"library-check-1018 renamed");assert.equal(renamed.definition.revision,2);
 await request("PATCH",{id:creationId,op:"rename"},{baseRevision:1,name:"stale"},409);await request("PATCH",{id:creationId,op:"rename"},{baseRevision:2,name:" "},400);checks.push("rename persists a revision, trims names and rejects stale/empty requests");
 const copyId=crypto.randomUUID();ids.add(copyId);const copyBody={sourceWorkflowId:creationId,sourceRevision:2,name:"library-check-1018 copy",creationId:copyId};const copy=await request("POST",{op:"copy"},copyBody,201);await request("POST",{op:"copy"},copyBody,201);const copied=await request("GET",{id:copy.workflowId});assert.equal(copied.definition.name,"library-check-1018 copy");assert.deepEqual(copied.editor.nodes,renamed.editor.nodes);assert.equal(copied.provenance.copiedFromWorkflowId,creationId);checks.push("copy preserves saved definition/layout and independent identity");
 const templateResponse=await fetch(base+"?resource=templates",{headers:{Authorization:`Bearer ${token}`}});assert.ok(templateResponse.ok);const template=(await templateResponse.json()).items[0];assert.ok(template);
 const sharedBefore=await admin.from("workflow_templates").select("definition").eq("id",template.workflowId).single();assert.ifError(sharedBefore.error);
 const freshId=crypto.randomUUID();ids.add(freshId);const templateBody={templateId:template.workflowId,name:"library-check-1018 template",fresh:true,creationId:freshId};await request("POST",{op:"template"},templateBody,201);await request("POST",{op:"template"},templateBody,201);
 const fromTemplate=await request("GET",{id:freshId});assert.equal(fromTemplate.definition.name,templateBody.name);assert.equal(fromTemplate.provenance.sourceTemplateId,template.workflowId);assert.equal((await library({scope:"course"})).total,1);checks.push("fresh template creation/retry, private draft and source filter");
 const runId=crypto.randomUUID();const inserted=await admin.from("workflow_live_runs").insert({run_id:runId,owner_user_id:owner,workflow_id:creationId,revision:2,status:"running",definition_hash:"test",semantic_hash:"test",compile_fingerprint:"test",environment_ref:"test",environment_revision:"test",input:{},registry_snapshot:{}});assert.ifError(inserted.error);
 await request("DELETE",{id:creationId,op:"delete"},{baseRevision:2},409);checks.push("running workflow deletion rejected atomically");
 assert.ifError((await admin.from("workflow_live_runs").update({status:"cancelled"}).eq("run_id",runId)).error);
 await request("DELETE",{id:creationId,op:"delete"},{baseRevision:1},409);await request("DELETE",{id:creationId,op:"delete"},{baseRevision:2});ids.delete(creationId);
 for(const table of ["workflow_v2_definitions","workflow_revisions","workflow_editor_documents","workflow_live_runs"]){const remaining=await admin.from(table).select("workflow_id").eq("owner_user_id",owner).eq("workflow_id",creationId);assert.ifError(remaining.error);assert.equal(remaining.data?.length,0);}
 await request("GET",{id:creationId},undefined,404);checks.push("permanent delete removes owned revisions, editor and terminal run; stale delete rejected");
 const otherClient=createClient(url,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false}});const other=await otherClient.auth.signInWithPassword({email:"canvas-review@eduflow.local",password:"CanvasReview-local-2026!"});assert.ifError(other.error);const otherResponse=await fetch(base+"?"+new URLSearchParams({resource:"definitions",op:"delete",id:copy.workflowId}),{method:"DELETE",headers:{Authorization:`Bearer ${other.data.session!.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({baseRevision:1})});assert.equal(otherResponse.status,404);checks.push("cross-owner deletion denied");
 for(const id of [...ids]){const document=await request("GET",{id});await request("DELETE",{id,op:"delete"},{baseRevision:document.definition.revision});ids.delete(id);}
 const clamped=await library({page:"99999"});assert.equal(clamped.page,1);assert.equal(clamped.total,0);assert.equal(clamped.items.length,0);
 const sharedAfter=await admin.from("workflow_templates").select("definition").eq("id",template.workflowId).single();assert.deepEqual(sharedAfter.data,sharedBefore.data);checks.push("last-page clamp and shared template preserved; all generated fixtures removed");
 await writeFile("artifacts/workflow/acceptance/reports/WORKFLOW_LIBRARY_API_CHECKS.json",JSON.stringify({checkedAt:new Date().toISOString(),environment:"Local Supabase / main application",checks},null,2)+"\n");console.log(JSON.stringify({checks,remainingFixtures:ids.size}));
} finally {
 for(const id of ids){const current=await admin.from("workflow_v2_definitions").select("current_revision").eq("owner_user_id",owner).eq("workflow_id",id).maybeSingle();if(current.data) await admin.rpc("workflow_v2_delete",{p_owner:owner,p_workflow:id,p_base:current.data.current_revision});}
}

/** Feature Preview acceptance. Credentials supplied privately; never print auth payloads. */
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
const preview=process.env.ACCEPTANCE_PREVIEW_URL!;const url=process.env.ACCEPTANCE_SUPABASE_URL!;const key=process.env.ACCEPTANCE_PUBLISHABLE_KEY!;
assert.match(new URL(preview).hostname,/^edu-flow-.*\.vercel\.app$/);assert.equal(new URL(url).hostname,'uyljtdbvlivxniililay.supabase.co');
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const mode=process.argv[2];const actor=mode==='index'?'ADMIN':process.env.ACCEPTANCE_ACTOR??'A';
const auth=await client.auth.signInWithPassword({email:process.env[`ACCEPTANCE_${actor}_EMAIL`]!,password:process.env[`ACCEPTANCE_${actor}_PASSWORD`]!});
assert.ifError(auth.error);const token=auth.data.session!.access_token;
async function request(path:string,body?:unknown) {
 const response=await fetch(preview+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const value=await response.json();if(!response.ok)throw new Error(`Preview ${path}: HTTP ${response.status} ${JSON.stringify(value)}`);return value;
}
if(mode==='index') {
 let after:string|undefined;let total=0;
 do{const result=await request('/api/evidence',{action:'index',...(after?{after}:{})});total+=result.added;after=result.next??undefined;console.log(JSON.stringify({added:result.added,total,next:after??null,model:result.model,dimensions:result.dimensions}));}while(after);
}else if(mode==='gold') {
 const sourceText=process.env.ACCEPTANCE_SOURCE_TEXT!;assert.ok(sourceText);
 const sourceTitle=process.env.ACCEPTANCE_SOURCE_TITLE??'能力证据验收资料.txt';
 const before=await request('/api/progress');
 const uploaded=await request('/api/evidence',{action:'upload',title:sourceTitle,contentType:'text/plain',size:Buffer.byteLength(sourceText)});
 const file=await client.storage.from(uploaded.bucket).uploadToSignedUrl(uploaded.path,uploaded.token,new Blob([sourceText],{type:'text/plain'}));assert.ifError(file.error);
 await request('/api/evidence',{action:'parse',sourceId:uploaded.source.id});
 const result=await request('/api/evidence',{action:'diagnose',sourceIds:[uploaded.source.id]});
 const data=await request('/api/evidence');const after=await request('/api/progress');assert.deepEqual(after.userKnowledge,before.userKnowledge,'AI proposal must not write formal state');
 const report={preview,sourceId:uploaded.source.id,runId:result.runId,sourceText,units:data.units.filter((u:{run_id:string})=>u.run_id===result.runId),proposals:data.proposals.filter((p:{run_id:string})=>p.run_id===result.runId),run:data.runs.find((r:{id:string})=>r.id===result.runId),formalStateUnchanged:true};
 mkdirSync('.acceptance/capability-evidence-action-loop',{recursive:true});writeFileSync(`.acceptance/capability-evidence-action-loop/gold-${result.runId}.json`,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({runId:result.runId,sourceId:uploaded.source.id,units:report.units.length,proposals:report.proposals.map((p:{node_id:string;sufficiency:string;proposed_status:string})=>({node:p.node_id,sufficiency:p.sufficiency,status:p.proposed_status})),formalStateUnchanged:true}));
}else throw new Error('Use index | gold');

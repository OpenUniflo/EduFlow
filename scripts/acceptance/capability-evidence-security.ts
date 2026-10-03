/** Ordinary-user Hosted HTTP/Storage checks. Writes only dedicated acceptance users' sources. */
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {writeFileSync} from 'node:fs';
const url=process.env.ACCEPTANCE_SUPABASE_URL!,key=process.env.ACCEPTANCE_PUBLISHABLE_KEY!,preview=process.env.ACCEPTANCE_PREVIEW_URL!;
assert.equal(new URL(url).hostname,'uyljtdbvlivxniililay.supabase.co');assert.match(new URL(preview).hostname,/^edu-flow-.*\.vercel\.app$/);
const clients=[];const tokens:string[]=[];const users:string[]=[];const assertions:string[]=[];
const check=(name:string,value:unknown)=>{assert.ok(value,name);assertions.push(name);};
for(const actor of ['A','B']){
 assert.match(process.env[`ACCEPTANCE_${actor}_EMAIL`]!,/^evidence-loop-/);
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const auth=await client.auth.signInWithPassword({email:process.env[`ACCEPTANCE_${actor}_EMAIL`]!,password:process.env[`ACCEPTANCE_${actor}_PASSWORD`]!});assert.ifError(auth.error);clients.push(client);tokens.push(auth.data.session!.access_token);users.push(auth.data.user!.id);
}
const stateBefore=await clients[0].from('user_knowledge_states').select('*').order('node_id');assert.ifError(stateBefore.error);
async function api(actor:number,body?:unknown){const r=await fetch(preview+'/api/evidence',{method:body?'POST':'GET',headers:{Authorization:`Bearer ${tokens[actor]}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
const text='证据隔离测试：只验证上传、来源与权限，不主张任何能力。';
const declared={action:'upload',title:'隔离测试资料.txt',contentType:'text/plain',size:Buffer.byteLength(text)};
check('forged source owner rejected',(await api(0,{...declared,user_id:users[1]})).status===400);
const upload=await api(0,declared);check('ordinary A creates upload',upload.status===201);const sourceId=upload.data.source.id;
assert.ifError((await clients[0].storage.from(upload.data.bucket).uploadToSignedUrl(upload.data.path,upload.data.token,new Blob([text],{type:'text/plain'}))).error);
check('parse actual uploaded bytes',(await api(0,{action:'parse',sourceId})).status===200);
const a=await api(0),b=await api(1);check('A sees own source',a.data.sources.some((s:{id:string})=>s.id===sourceId));check('B cannot see A source',!b.data.sources.some((s:{id:string})=>s.id===sourceId));
check('B cannot read original file',Boolean((await clients[1].storage.from('user-evidence').download(upload.data.path)).error));
check('B cannot request signed link',(await api(1,{action:'download',sourceId})).status===404);
check('B cannot parse A source',(await api(1,{action:'parse',sourceId})).status===404);
check('B cannot archive A source',(await api(1,{action:'archive',sourceId})).status===404);
check('B cannot diagnose A source',(await api(1,{action:'diagnose',sourceIds:[sourceId]})).status===404);
check('A can request private signed original',(await api(0,{action:'download',sourceId})).status===200);
check('learner cannot update global embedding index',(await api(0,{action:'index'})).status===403);
check('forged confirm owner rejected',(await api(0,{action:'confirm',proposalIds:[sourceId],user_id:users[1]})).status===400);
check('unknown proposal rejected',(await api(0,{action:'confirm',proposalIds:[sourceId]})).status===404);
for(const table of ['user_evidence_sources','evidence_units','capability_diagnosis_runs','capability_state_proposals','user_knowledge_states'])check(`direct ${table} write rejected`,Boolean((await clients[0].from(table).insert({user_id:users[1]})).error));
check('source can be archived',(await api(0,{action:'archive',sourceId})).status===200);
check('archive preserves original',(await api(0,{action:'download',sourceId})).status===200);
check('archived source cannot diagnose',(await api(0,{action:'diagnose',sourceIds:[sourceId]})).status===404);
const stateAfter=await clients[0].from('user_knowledge_states').select('*').order('node_id');assert.ifError(stateAfter.error);
check('no official state change from uploading or parsing',JSON.stringify(stateAfter.data)===JSON.stringify(stateBefore.data));
const report={status:'PASS',preview,sourceId,assertions,count:assertions.length,scope:'ordinary user JWT and real private Storage upload; not AI or Hosted confirmation acceptance'};
writeFileSync('.acceptance/capability-evidence-action-loop/hosted-upload-isolation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,count:report.count,sourceId}));

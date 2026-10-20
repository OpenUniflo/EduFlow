mkdirSync("artifacts/workflow/acceptance/evidence",{recursive:true});
mkdirSync("artifacts/workflow/acceptance/reports",{recursive:true});
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {workspaceWorkflowExamples} from '../../../src/demo/workflow/workspaceWorkflowTemplates';

process.loadEnvFile('.env.local');
const url=new URL(process.env.SUPABASE_URL!);
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54321','Local Supabase only');
const batch=process.argv.find(arg=>arg.startsWith('--batch='))?.slice(8);
assert.ok(batch&&/^[a-z0-9-]{1,70}$/.test(batch),'Supply --batch=<development-release-id>');
const apply=process.argv.includes('--apply');
const admin=createClient(url.href,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false}});
const auth=createClient(url.href,process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});
const login=await auth.auth.signInWithPassword({email:process.env.LOCAL_STUDENT_EMAIL!,password:process.env.LOCAL_STUDENT_PASSWORD!});assert.ifError(login.error);
const owner=login.data.user!.id;
const headers={Authorization:`Bearer ${login.data.session!.access_token}`,'Content-Type':'application/json'};
async function api(resource:string,query:Record<string,string>={},method='GET',body?:unknown){
  const response=await fetch('http://127.0.0.1:5173/api/workflows?'+new URLSearchParams({resource,...query}),{method,headers,signal:AbortSignal.timeout(30000),...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json();if(!response.ok)throw Error(`${resource} HTTP ${response.status}: ${value.error?.code}`);return value;
}
function sql(query:string){return execFileSync('docker',['exec','-i','supabase_db_EduFlow','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{input:query,encoding:'utf8'}).trim();}
const literal=(value:string)=>`'${value.split("'").join("''")}'`;
const path=`artifacts/workflow/acceptance/evidence/workflow-refresh-${batch}.json`;
mkdirSync('artifacts/workflow/acceptance/evidence',{recursive:true});
async function ownedRows<T>(table:string,columns:string,order:string):Promise<T[]> {
  const items:T[]=[];
  for(let offset=0;;offset+=1000){
    const page=await admin.from(table).select(columns).eq('owner_user_id',owner).order(order).range(offset,offset+999);assert.ifError(page.error);
    items.push(...page.data as unknown as T[]);if(page.data!.length<1000)return items;
  }
}
const heads={data:await ownedRows<{workflow_id:string;current_revision:number}>('workflow_v2_definitions','workflow_id,current_revision','workflow_id')};
const threads={data:await ownedRows<{thread_id:string}>('workflow_execution_threads','thread_id','thread_id')};
const runs={data:await ownedRows<{run_id:string}>('workflow_live_runs','run_id','run_id')};
if(!apply){console.log(JSON.stringify({mode:'dry-run',batch,owner,workflows:heads.data.length,threads:threads.data.length,runs:runs.data.length}));process.exit(0);}
type Manifest={batch:string;owner:string;url:string;targets:{workflow_id:string;current_revision:number}[];threadIds:string[];runIds:string[];examples:{creationId:string;templateId:string;name:string}[];deleted:string[];protectedBefore?:string;protectedAfter?:string;complete?:boolean;completedAt?:string};
const manifest:Manifest=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{batch,owner,url:url.origin,targets:heads.data!,threadIds:threads.data!.map(t=>t.thread_id),runIds:runs.data!.map(r=>r.run_id),examples:workspaceWorkflowExamples().map(doc=>({creationId:randomUUID(),templateId:doc.definition.workflowId,name:doc.definition.name})),deleted:[]};
assert.equal(manifest.owner,owner);assert.equal(manifest.url,url.origin);assert.equal(manifest.batch,batch);
const save=()=>writeFileSync(path,JSON.stringify(manifest,null,2)+'\n');
// A recorded batch is a fixed manifest, never "delete everything again" on a rerun.
if(manifest.complete){for(const item of manifest.examples)await api('definitions',{id:item.creationId});console.log(JSON.stringify({batch,alreadyComplete:true,examples:manifest.examples}));process.exit(0);}
save();
const quotedIds=(ids:string[])=>ids.length?ids.map(literal).join(','):"''";
function protectedDigest(){
  const tables=JSON.parse(sql("select coalesce(json_agg(tablename order by tablename),'[]') from pg_tables where schemaname='public' and tablename not like 'workflow_%';")) as string[];
  const pairs=tables.map(name=>({schema:'public',name,filter:'true'}));
  for(const name of ['workflow_v2_definitions','workflow_revisions','workflow_editor_documents','workflow_live_runs','workflow_execution_threads','workflow_idempotency','workflow_run_tombstones'])pairs.push({schema:'public',name,filter:`owner_user_id<>${literal(owner)}::uuid`});
  for(const name of ['workflow_run_steps','workflow_run_events','workflow_run_jobs'])pairs.push({schema:'public',name,filter:`run_id::text not in (${quotedIds(manifest.runIds)})`});
  pairs.push({schema:'public',name:'workflow_templates',filter:"id not in ('workspace-expense','workspace-question','workspace-order-preview')"},{schema:'public',name:'workflow_workspace_configuration',filter:'true'});
  for(const name of ['checkpoints','checkpoint_blobs','checkpoint_writes'])pairs.push({schema:'workflow_checkpoints',name,filter:`thread_id not in (${quotedIds(manifest.threadIds)})`});
  const values=pairs.map(({schema,name,filter})=>sql(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) from "${schema}"."${name.split('"').join('""')}" t where ${filter};`));
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}
const environments=await api('environments');const environment=environments.items.find((item:{providers:unknown[];capabilities:string[]})=>item.providers.length&&item.capabilities.includes('interrupt'));
assert.ok(environment,'An authorized environment with model and interrupt support is required');
const provider=environment.providers.find((item:{modelRefs:string[]})=>item.modelRefs.length);assert.ok(provider);
const examples=workspaceWorkflowExamples(provider.ref,provider.modelRefs[0]);
manifest.protectedBefore??=protectedDigest();save();
for(const target of manifest.targets){
  if(manifest.deleted.includes(target.workflow_id))continue;
  const stillPresent=await admin.from('workflow_v2_definitions').select('current_revision').eq('owner_user_id',owner).eq('workflow_id',target.workflow_id).maybeSingle();assert.ifError(stillPresent.error);
  if(!stillPresent.data){manifest.deleted.push(target.workflow_id);save();continue;}
  const active=await admin.from('workflow_execution_threads').select('thread_id').eq('owner_user_id',owner).eq('workflow_id',target.workflow_id).in('status',['active','waiting']);assert.ifError(active.error);
  for(const thread of active.data!)await api('threads',{id:thread.thread_id,op:'cancel'},'POST',{});
  const impact=await api('definitions',{id:target.workflow_id,op:'delete-impact'});assert.equal(impact.activeRuns,0);
  await api('definitions',{id:target.workflow_id,op:'delete'},'DELETE',{baseRevision:stillPresent.data.current_revision});
  manifest.deleted.push(target.workflow_id);save();
}
// SQL reads verify private/checkpoint data without exposing it or adding a reset API.
for(const name of ['checkpoints','checkpoint_blobs','checkpoint_writes'])assert.equal(sql(`select count(*) from workflow_checkpoints.${name} where thread_id in (${quotedIds(manifest.threadIds)});`),'0');
assert.equal(sql(`select count(*) from public.workflow_execution_threads where owner_user_id=${literal(owner)}::uuid;`),'0');
const synced=await admin.from('workflow_templates').upsert(examples.map(doc=>({id:doc.definition.workflowId,name:doc.definition.name,description:doc.definition.description,definition:doc.definition})));assert.ifError(synced.error);
for(const [index,doc] of examples.entries())await api('definitions',{},'POST',{...doc,creationId:manifest.examples[index].creationId});
manifest.protectedAfter=protectedDigest();assert.equal(manifest.protectedAfter,manifest.protectedBefore,'Unrelated records must be unchanged');
manifest.complete=true;manifest.completedAt=new Date().toISOString();save();
console.log(JSON.stringify({batch,deleted:manifest.deleted.length,protectedUnchanged:true,examples:manifest.examples.map(item=>({...item,url:'http://127.0.0.1:5173/workflows/'+item.creationId}))}));

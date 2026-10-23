// Local-only fixture: publish the two model connections used by acceptance from .env.local.
// Usage: pnpm exec tsx scripts/workflow/local/seed-model-connections.ts [--apply]
// Default is a dry run that only prints the plan (read-only API calls). --apply publishes a new
// immutable version for each fixed ref and runs the connection test. No key value is ever printed.
process.loadEnvFile('.env.local');
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';

const supabaseUrl=new URL(process.env.SUPABASE_URL!);
assert.equal(supabaseUrl.hostname,'127.0.0.1','Local Supabase only');
assert.equal(supabaseUrl.port,'54321','Local Supabase only');
const apiUrl=new URL('http://127.0.0.1:5173');
assert.ok(['127.0.0.1','localhost'].includes(apiUrl.hostname)&&apiUrl.port==='5173','Local API only');
const apply=process.argv.includes('--apply');
for(const argument of process.argv.slice(2))assert.ok(argument==='--apply',`Unknown argument: ${argument}`);

const baseUrl=(process.env.LLM_BASE_URL??'').trim().replace(/\/+$/,'');
const model=(process.env.LLM_MODEL??'').trim();
const apiKey=process.env.LLM_API_KEY??'';
const providerLabel=(process.env.LLM_PROVIDER??'deepseek').trim()||'deepseek';
assert.ok(baseUrl.length>0,'LLM_BASE_URL is required in .env.local');
assert.ok(model.length>0,'LLM_MODEL is required in .env.local');
assert.ok(apiKey.length>0,'LLM_API_KEY is required in .env.local');
assert.ok(/^[\w.:/-]{1,200}$/.test(model),'LLM_MODEL must be a valid model reference');
const parsedBaseUrl=new URL(baseUrl);
assert.ok(['http:','https:'].includes(parsedBaseUrl.protocol),'LLM_BASE_URL must be HTTP(S)');

const auth=createClient(supabaseUrl.href,process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});
const login=await auth.auth.signInWithPassword({email:process.env.LOCAL_STUDENT_EMAIL!,password:process.env.LOCAL_STUDENT_PASSWORD!});
assert.ifError(login.error);
const headers={Authorization:`Bearer ${login.data.session!.access_token}`,'Content-Type':'application/json'};
async function api<T>(resource:string,query:Record<string,string>={},method='GET',body?:unknown):Promise<T>{
  const response=await fetch(new URL('/api/workflows?'+new URLSearchParams({resource,...query}),apiUrl),{method,headers,signal:AbortSignal.timeout(60000),...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json() as {error?:{code?:string}};
  if(!response.ok)throw Error(`${resource} HTTP ${response.status}${value.error?.code?` ${value.error.code}`:''}`);
  return value as T;
}

type PublicEnvironment={environmentRef:string;name?:string;providers:{ref:string;modelRefs:string[]}[];capabilities:string[]};
type ConnectionRow={ref:string;version:number;disabled:boolean;content:Record<string,unknown>};
const catalog=await api<{items:PublicEnvironment[]}>('environments');
const environment=catalog.items.find(item=>item.providers.length>0&&item.capabilities.includes('llm'));
assert.ok(environment,'An authorized local environment with model support is required. Start pnpm workflow:local first.');
const extensions=await api<{connections:ConnectionRow[]}>('extensions',{environmentRef:environment.environmentRef});
const nextVersion=(ref:string)=>Math.max(0,...extensions.connections.filter(item=>item.ref===ref).map(item=>Number(item.version)))+1;

interface PlannedConnection{ref:string;version:number;type:'openai-compatible'|'deepseek';name:string;baseUrl:string;modelRefs:string[];credentialProvided:boolean}
const planned:PlannedConnection[]=[
  {ref:'local-env-openai',version:nextVersion('local-env-openai'),type:'openai-compatible',name:`${providerLabel} · OpenAI 兼容`,baseUrl,modelRefs:[model],credentialProvided:true},
  {ref:'local-env-deepseek',version:nextVersion('local-env-deepseek'),type:'deepseek',name:`${providerLabel} · DeepSeek`,baseUrl:'https://api.deepseek.com',modelRefs:[model],credentialProvided:true},
];
const snapshot={mode:apply?'apply':'dry-run',environmentRef:environment.environmentRef,connections:planned.map(({ref,version,type,name,baseUrl,modelRefs,credentialProvided})=>({ref,version,type,name,baseUrl,modelRefs,credentialProvided}))};
if(!apply){console.log(JSON.stringify({...snapshot,note:'dry run only; pass --apply to publish and test'},null,2));process.exit(0);}

interface TestSummary{ref:string;version:number;ok:boolean;elapsedMs?:number;models?:string[];modelCount?:number;toolCount?:number;status?:number;errorCode?:string}
function summarize(ref:string,version:number,value:unknown):TestSummary{
  const item=(value??{}) as {ok?:boolean;elapsedMs?:number;models?:unknown;tools?:unknown;status?:number;error?:{code?:string}};
  const summary:TestSummary={ref,version,ok:item.ok===true};
  if(typeof item.elapsedMs==='number')summary.elapsedMs=item.elapsedMs;
  if(Array.isArray(item.models)){summary.models=item.models.filter(modelRef=>typeof modelRef==='string').slice(0,20);summary.modelCount=item.models.length;}
  if(Array.isArray(item.tools))summary.toolCount=item.tools.length;
  if(typeof item.status==='number')summary.status=item.status;
  if(item.error?.code)summary.errorCode=item.error.code;
  return summary;
}
const tests:TestSummary[]=[];
for(const connection of planned){
  const content=connection.type==='openai-compatible'
    ?{type:connection.type,name:connection.name,baseUrl:connection.baseUrl,modelRefs:connection.modelRefs,description:'Local acceptance model connection (seeded from .env.local)'}
    :{type:connection.type,name:connection.name,baseUrl:connection.baseUrl,modelRefs:connection.modelRefs,description:'Local acceptance DeepSeek connection (seeded from .env.local)'};
  await api('extensions',{},'POST',{environmentRef:environment.environmentRef,action:'publish',kind:'connection',ref:connection.ref,version:connection.version,content,credential:apiKey});
  const result=await api<unknown>('extensions',{},'POST',{environmentRef:environment.environmentRef,action:'test',kind:'connection',ref:connection.ref,version:connection.version});
  tests.push(summarize(connection.ref,connection.version,result));
}
console.log(JSON.stringify({...snapshot,tests,credentialsPrinted:false},null,2));
const failed=tests.filter(item=>!item.ok);
if(failed.length){console.error(`Connection tests failed: ${failed.map(item=>item.ref).join(', ')}`);process.exitCode=1;}

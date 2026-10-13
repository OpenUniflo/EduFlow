/** Local ordinary-role isolation and transactional confirmation checks. Never uses existing users. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const url=process.env.SUPABASE_URL!;
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):/.test(url),'This destructive fixture cleanup is local-only');
const server=createClient(url,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const users:string[]=[];const sources:string[]=[];const runs:string[]=[];const unitIds:string[]=[];const proposalIds:string[]=[];let assertions=0;
const ok=(value:unknown,message:string)=>{assert.ok(value,message);assertions++;};
async function insert(table:string,value:Record<string,unknown>){const result=await server.from(table).insert(value).select().single();assert.ifError(result.error);return result.data;}
try {
 const clients=[];
 for(let i=0;i<2;i++){
  const email=`evidence-local-${randomUUID()}@eduflow.test`,password=randomUUID()+randomUUID();
  const created=await server.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(created.error);users.push(created.data.user!.id);
  const client=createClient(url,process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const auth=await client.auth.signInWithPassword({email,password});assert.ifError(auth.error);clients.push(client);
 }
 const [a,b]=users;const [clientA,clientB]=clients;
 const nodes=await server.from('knowledge_nodes').select('id,current_revision_id').eq('status','active').eq('scope','global').limit(1);assert.ifError(nodes.error);const node=nodes.data![0];
 const sid=randomUUID();sources.push(sid);
 await insert('user_evidence_sources',{id:sid,user_id:a,title:'local evidence fixture',storage_path:`${a}/${sid}`,content_type:'text/plain',byte_size:4,parse_status:'ready',parsed_lines:[{line:1,text:'fact'}]});
 const upload=await server.storage.from('user-evidence').upload(`${a}/${sid}`,'fact',{contentType:'text/plain'});assert.ifError(upload.error);
 const run=await insert('capability_diagnosis_runs',{user_id:a,source_ids:[sid],status:'completed',model:'test-only',prompt_version:'test-only'});runs.push(run.id);
 const unit=await insert('evidence_units',{user_id:a,source_id:sid,run_id:run.id,source_line:1,quote:'fact',observation:'test only',capability:'test only',extraction_version:'test-only'});unitIds.push(unit.id);
 const makeProposal=async()=>{const proposal=await insert('capability_state_proposals',{user_id:a,run_id:run.id,unit_ids:[unit.id],node_id:node.id,revision_id:node.current_revision_id,proposed_status:'learned',sufficiency:'supported',confidence:0.9,reason:'transaction test fixture; not AI evaluation'});proposalIds.push(proposal.id);return proposal;};
 const proposal=await makeProposal();
 ok((await clientB.from('user_evidence_sources').select('*').eq('id',sid)).data?.length===0,'B cannot read A source');
 ok((await clientB.from('evidence_units').select('*').eq('id',unit.id)).data?.length===0,'B cannot read A units');
 ok((await clientB.from('capability_diagnosis_runs').select('*').eq('id',run.id)).data?.length===0,'B cannot read A diagnosis');
 ok((await clientB.from('capability_state_proposals').select('*').eq('id',proposal.id)).data?.length===0,'B cannot read A proposal');
 ok(Boolean((await clientB.storage.from('user-evidence').download(`${a}/${sid}`)).error),'B cannot read A file');
 ok(Boolean((await clientA.storage.from('user-evidence').createSignedUrl(`${a}/${sid}`,60)).data?.signedUrl),'A can sign own file');
 for(const table of ['user_evidence_sources','evidence_units','capability_diagnosis_runs','capability_state_proposals'])ok(Boolean((await clientA.from(table).insert({user_id:b})).error),`client cannot forge ${table} owner`);
 ok(Boolean((await clientA.from('user_knowledge_states').upsert({user_id:a,node_id:node.id,status:'mastered'})).error),'client cannot write official state');
 ok(Boolean((await clientA.rpc('confirm_capability_proposals',{p_user_id:b,p_ids:[proposal.id],p_decision:'confirm'})).error),'client cannot invoke privileged confirmation');
 ok(Boolean((await server.rpc('confirm_capability_proposals',{p_user_id:b,p_ids:[proposal.id],p_decision:'confirm'})).error),'server-confirm rejects wrong owner');
 ok((await clientA.from('user_knowledge_states').select('*')).data?.length===0,'proposal does not write official state');
 const args={p_user_id:a,p_ids:[proposal.id],p_decision:'confirm'};
 const concurrent=await Promise.all([server.rpc('confirm_capability_proposals',args),server.rpc('confirm_capability_proposals',args)]);concurrent.forEach(r=>assert.ifError(r.error));
 ok((await clientA.from('knowledge_evidence').select('*').eq('source_entity_id',proposal.id)).data?.length===1,'concurrent confirmation emits one evidence');
 const state=await clientA.from('user_knowledge_states').select('*').eq('node_id',node.id).single();assert.ifError(state.error);ok(state.data.status==='learned','explicit confirmation writes learned, not mastered');
 ok((await clientB.from('user_knowledge_states').select('*')).data?.length===0,'B state untouched');
 ok((await clientA.from('personal_course_route_versions').select('*')).data?.length===0,'confirmation creates no route versions');
 const archived=await makeProposal();await server.from('user_evidence_sources').update({archived_at:new Date().toISOString()}).eq('id',sid);
 ok(Boolean((await server.rpc('confirm_capability_proposals',{p_user_id:a,p_ids:[archived.id],p_decision:'confirm'})).error),'archive blocks new confirmations');
 ok((await clientA.from('knowledge_evidence').select('*').eq('source_entity_id',proposal.id)).data?.length===1,'archive preserves past evidence');
 console.log(JSON.stringify({status:'PASS',assertions,scope:'local ordinary JWT, storage and privileged transaction; not Hosted/AI acceptance'}));
} finally {
 await server.from('capability_state_proposals').delete().in('id',proposalIds);
 await server.from('knowledge_evidence').delete().in('user_id',users);
 await server.from('user_knowledge_states').delete().in('user_id',users);
 await server.from('evidence_units').delete().in('id',unitIds);
 await server.from('capability_diagnosis_runs').delete().in('id',runs);
 for(const id of sources)await server.storage.from('user-evidence').remove([`${users[0]}/${id}`]);
 await server.from('user_evidence_sources').delete().in('id',sources);
 for(const id of users){const deleted=await server.auth.admin.deleteUser(id);assert.ifError(deleted.error);}
}

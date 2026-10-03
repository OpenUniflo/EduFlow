/** Confirm real Hosted Gold proposals through ordinary-user API, never seed verdicts. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const preview=process.env.ACCEPTANCE_PREVIEW_URL!;
assert.match(new URL(preview).hostname,/^edu-flow-.*\.vercel\.app$/);
const gold=process.argv.slice(2).map(path=>JSON.parse(readFileSync(path,'utf8')));
assert.ok(gold.length);
const clients=await Promise.all(['A','B'].map(async actor=>{
 const client=createClient(process.env.ACCEPTANCE_SUPABASE_URL!,process.env.ACCEPTANCE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const auth=await client.auth.signInWithPassword({email:process.env[`ACCEPTANCE_${actor}_EMAIL`]!,password:process.env[`ACCEPTANCE_${actor}_PASSWORD`]!});assert.ifError(auth.error);
 return {client,token:auth.data.session!.access_token,userId:auth.data.user!.id};
}));
async function call(actor:number,path:string,body?:unknown,expected=200){const response=await fetch(preview+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${clients[actor].token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));return data;}
async function rows(actor:number,table:string){const result=await clients[actor].client.from(table).select('*');assert.ifError(result.error);return result.data!;}
const routePath='/api/learner?resource=route-plan&courseId=enterprise-vietnam-supply-collaboration';
const beforeRoute=await call(0,routePath); // Explicit initial read may create the initial route, before the baseline.
const beforeVersions=await rows(0,'personal_course_route_versions');
const beforeStates=await rows(0,'user_knowledge_states');
const beforeEvidence=await rows(0,'knowledge_evidence');
const beforeBStates=await rows(1,'user_knowledge_states');
const live=await call(0,'/api/evidence');
const runIds=new Set(gold.map(g=>g.runId));
const proposals=live.proposals.filter((p:{run_id:string;sufficiency:string;proposed_status:string;confirmation_state:string})=>runIds.has(p.run_id)&&p.sufficiency==='supported'&&p.proposed_status==='learned'&&p.confirmation_state==='pending');
assert.ok(proposals.length>=2,'Require actual supported pending Gold proposals');
const graphEdges=(await rows(0,'knowledge_edges')).filter(e=>e.lifecycle_status==='active'&&['prerequisite','enables'].includes(e.relation));
const targetIds=new Set((await rows(0,'curriculum_coverages')).filter(c=>c.course_id==='enterprise-vietnam-supply-collaboration').map(c=>c.node_id));
function reachesTarget(id:string){const queue=[id],seen=new Set<string>();while(queue.length){const next=queue.shift()!;if(targetIds.has(next))return true;if(seen.has(next))continue;seen.add(next);for(const edge of graphEdges)if(edge.source_node_id===next)queue.push(edge.target_node_id);}return false;}
const related=proposals.filter((p:{node_id:string})=>reachesTarget(p.node_id));
const unrelated=proposals.filter((p:{node_id:string})=>!reachesTarget(p.node_id));
assert.ok(related.length&&unrelated.length,'Require related and unrelated real Gold proposals before any confirmation');
for(const p of proposals)assert.ok(!beforeStates.some(s=>s.node_id===p.node_id&&['learned','practicing','mastered'].includes(s.status)),'Gold candidates must not already have acquired formal state');
for(const table of ['capability_state_proposals','evidence_units','capability_diagnosis_runs','user_evidence_sources'])assert.ok((await rows(1,table)).every(row=>row.user_id===clients[1].userId),'B must not read A data');
await call(1,'/api/evidence',{action:'confirm',proposalIds:[proposals[0].id]},404);
await Promise.all([0,1].map(()=>call(0,'/api/evidence',{action:'confirm',proposalIds:[proposals[0].id]})));
await call(0,'/api/evidence',{action:'confirm',proposalIds:proposals.map((p:{id:string})=>p.id)});
const once=await rows(0,'knowledge_evidence');
await call(0,'/api/evidence',{action:'confirm',proposalIds:proposals.map((p:{id:string})=>p.id)});
const afterEvidence=await rows(0,'knowledge_evidence');
const afterStates=await rows(0,'user_knowledge_states');
assert.equal(once.length,beforeEvidence.length+proposals.length);
assert.equal(afterEvidence.length,once.length);
for(const proposal of proposals){assert.equal(afterEvidence.filter(e=>e.source_entity_id===proposal.id).length,1);assert.equal(afterStates.find(s=>s.node_id===proposal.node_id)?.status,'learned');}
const afterRoute=await call(0,routePath);const afterVersions=await rows(0,'personal_course_route_versions');assert.equal(afterVersions.length,beforeVersions.length,'State updates must not create route versions');
assert.ok(related.some((p:{node_id:string})=>!beforeRoute.model.orderedNodeIds.includes(p.node_id)&&afterRoute.model.orderedNodeIds.includes(p.node_id)),'A newly confirmed related node must enter the projection');
assert.ok(unrelated.length,'Require real unrelated supported evidence too');
assert.ok(unrelated.every((p:{node_id:string})=>!afterRoute.model.orderedNodeIds.includes(p.node_id)),'Unrelated learning stays outside project');
assert.deepEqual(await rows(1,'user_knowledge_states'),beforeBStates,'A confirmation must not change B state');
for(const proposal of proposals){const evidence=afterEvidence.find(e=>e.source_entity_id===proposal.id)!;assert.equal(evidence.context.revisionId,proposal.revision_id);assert.equal(evidence.context.diagnosisId,proposal.run_id);assert.deepEqual(evidence.context.unitIds,proposal.unit_ids);assert.equal(evidence.node_id,proposal.node_id);}
const report={preview,runIds:[...runIds],confirmed:proposals.map((p:{id:string;node_id:string})=>({id:p.id,node:p.node_id})),beforeStates,afterStates,beforeRoute,afterRoute,formalEvidenceAdded:afterEvidence.length-beforeEvidence.length,routeVersionsBefore:beforeVersions.length,routeVersionsAfter:afterVersions.length,ordinaryUserIsolation:true,otherUserStateUnchanged:true,lineageVerified:true,relatedNodes:related.map((p:{node_id:string})=>p.node_id),unrelatedNodes:unrelated.map((p:{node_id:string})=>p.node_id),concurrentAndRepeatedConfirmIdempotent:true};
writeFileSync('.acceptance/capability-evidence-action-loop/hosted-confirmation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({confirmed:report.confirmed,formalEvidenceAdded:report.formalEvidenceAdded,routeVersions:report.routeVersionsAfter,status:'PASS'}));

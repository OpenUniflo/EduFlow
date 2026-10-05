/** Read-only verification of the captured A/B fixture and untouched outside scope. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {captureSql,query,payload,acceptanceResetAccounts} from './reset-conversation-evidence.js';
const file=process.env.ACCEPTANCE_RESET_MANIFEST??'.acceptance/conversation-workbench/acceptance-ab-baseline.json';
const baseline=JSON.parse(readFileSync(file,'utf8'));
assert.deepEqual(baseline.accounts,acceptanceResetAccounts);
const current=payload(query(captureSql()));
const canonical=(rows:unknown[])=>rows.map(row=>JSON.stringify(row)).sort();
for(const table of Object.keys(baseline.tables)){
 if(table==='assistant_sessions'){
  const retained=new Set(current.tables[table].map((row:{id:string})=>row.id));
  for(const row of baseline.tables[table])assert.ok(retained.has(row.id),'Reset removed a retained baseline session');
 }else assert.deepEqual(canonical(current.tables[table]),canonical(baseline.tables[table]),`${table} diverged from baseline`);
}
assert.equal(current.outsideHash,baseline.outsideHash,'Outside scope changed');
const accounts=acceptanceResetAccounts.map(account=>{
 const head=current.tables.personal_course_routes.find((row:any)=>row.user_id===account.id);
 const version=current.tables.personal_course_route_versions.find((row:any)=>row.id===head.active_version_id);
 assert.ok(version.snapshot.executionSteps.length>0,`${account.email} has no executable steps`);
 return {email:account.email,routeVersion:version.version_number,selectedNodes:version.snapshot.selectedNodeIds.length,executionSteps:version.snapshot.executionSteps.length,UKS:current.tables.user_knowledge_states.filter((row:any)=>row.user_id===account.id).map((row:any)=>({nodeId:row.node_id,status:row.status})),Evidence:current.tables.user_evidence_sources.filter((row:any)=>row.user_id===account.id).length,Diagnosis:current.tables.capability_diagnosis_runs.filter((row:any)=>row.user_id===account.id).length,ActionRun:current.tables.edge_action_runs.filter((row:any)=>row.user_id===account.id).length};
});
const report={pass:true,manifest:file,outsideHash:current.outsideHash,retainedSessionIds:current.tables.assistant_sessions.map((row:{id:string})=>row.id).sort(),accounts};
writeFileSync(file+`.verify-${process.env.ACCEPTANCE_RESET_PASS??'current'}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));

/** Acceptance-only scoped reset. Capture once before fresh runs; never reset global fixtures. */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const courseId='enterprise-vietnam-supply-collaboration';
export const acceptanceResetAccounts=[{id:'cadd9270-4cd8-4577-9121-16fd9d085b8b',email:'project-capability-a@eduflow.test'},{id:'06bd781a-0459-4be1-873c-8eb7a0f0c231',email:'project-capability-b@eduflow.test'}];
const accounts=acceptanceResetAccounts;
const file=process.env.ACCEPTANCE_RESET_MANIFEST??'.acceptance/conversation-workbench/acceptance-ab-baseline.json';
const quote=(value:unknown)=>`'${String(value).replace(/'/g,"''")}'`;
const users=accounts.map(account=>quote(account.id)+'::uuid').join(',');
const owner=`user_id in (${users})`;
const courseScope=`${owner} and course_id=${quote(courseId)}`;
const courseKey=createHash('sha256').update(courseId).digest('hex').slice(0,16);
const progressScope=`${owner} and path_id in(select id from micro_learning_paths where course_id=${quote(courseId)} union select micro_path_id from course_action_bindings where course_id=${quote(courseId)} and micro_path_id is not null)`;
const restored=['user_course_states','user_assignment_states','user_micro_path_progress','user_micro_unit_progress','personal_course_routes','user_knowledge_states'] as const;
const scoped=['edge_action_runs','learning_attempts','performance_results','personal_course_route_versions','learning_events','micro_step_attempts'] as const;
export function query(sql:string) {
 const dir=mkdtempSync(join(tmpdir(),'eduflow-acceptance-'));
 try {const path=join(dir,'query.sql');writeFileSync(path,sql);const raw=execFileSync('pnpm',['exec','supabase','db','query','--linked','--file',path,'--output','json'],{encoding:'utf8',maxBuffer:16*1024*1024});return JSON.parse(raw);}finally{rmSync(dir,{recursive:true,force:true});}
}
export function payload(result:unknown):Record<string,any> {
 const rows=Array.isArray(result)?result:(result as {rows?:unknown[]}).rows;
 assert.ok(rows?.length,'Database did not return a result');return (rows[0] as {snapshot:Record<string,any>}).snapshot;
}
const protectedLearnerTables=['user_course_states','user_assignment_states','user_micro_path_progress','user_micro_unit_progress','personal_course_routes','personal_course_route_versions','user_knowledge_states','edge_action_runs','learning_attempts','performance_results','learning_events','micro_step_attempts','user_evidence_sources','capability_diagnosis_runs','capability_state_proposals','evidence_units','knowledge_evidence','assistant_sessions'] as const;
function protectedHash() {return protectedLearnerTables.map(table=>`(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'') from ${table} t where not (${owner}))`).concat([`(select coalesce(jsonb_agg(to_jsonb(m) order by m.id)::text,'') from assistant_messages m join assistant_sessions s on s.id=m.session_id where not(s.${owner}))`]).join(',');}
function outsideHash() {return `md5(concat(
 ${protectedHash()},
 (select coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'') from knowledge_nodes t),
 (select coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'') from knowledge_edges t),
 (select coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'') from knowledge_edge_actions t),
 (select coalesce(jsonb_agg(to_jsonb(t) order by user_id,node_id)::text,'') from user_knowledge_states t where not (${owner}) or node_id not in (with recursive nodes(id) as (select node_id from curriculum_coverages where course_id=${quote(courseId)} union select e.source_node_id from knowledge_edges e join nodes n on e.target_node_id=n.id where e.lifecycle_status='active' and e.relation in ('prerequisite','enables')) select id from nodes)),
 (select coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'') from edge_action_runs t where not (${courseScope})),
 (select coalesce(jsonb_agg(to_jsonb(t) order by user_id,course_id)::text,'') from personal_course_routes t where not (${courseScope}))))`;}
export function captureSql() {
 const entries=[...restored,...scoped].map(table=>`${quote(table)},(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from ${table} t where ${table==='user_knowledge_states'?`${owner} and node_id in (select id from nodes)`:table.startsWith('user_micro_')?progressScope:courseScope})`);
 for(const table of ['user_evidence_sources','capability_diagnosis_runs','capability_state_proposals','knowledge_evidence','assistant_sessions'])entries.push(`${quote(table)},(select coalesce(jsonb_agg(jsonb_build_object('id',id)),'[]') from ${table} where ${owner})`);
 return `with recursive nodes(id) as (select node_id from curriculum_coverages where course_id=${quote(courseId)} union select e.source_node_id from knowledge_edges e join nodes n on e.target_node_id=n.id where e.lifecycle_status='active' and e.relation in ('prerequisite','enables'))
 select jsonb_build_object('schemaVersion',1,'capturedAt',now(),'courseId',${quote(courseId)},'accounts',${quote(JSON.stringify(accounts))}::jsonb,'nodeIds',(select jsonb_agg(id order by id) from nodes),'outsideHash',${outsideHash()},'tables',jsonb_build_object(${entries.join(',')})) as snapshot;`;
}
export function resetSql(baseline:Record<string,any>) {
 assert.equal(baseline.schemaVersion,1);assert.equal(baseline.courseId,courseId);assert.deepEqual(baseline.accounts,accounts);assert.ok(Array.isArray(baseline.nodeIds)&&baseline.nodeIds.length);
 const resetSourceIds=baseline.resetSourceIds??[];assert.ok(Array.isArray(resetSourceIds));for(const id of resetSourceIds)assert.match(id,/^[a-f0-9-]{36}$/);
 const ids=(table:string)=>`array[${baseline.tables[table].map((row:{id:string})=>quote(row.id)+'::uuid').join(',')}]::uuid[]`;
 const nodeList=baseline.nodeIds.map(quote).join(',');
 const scopedSessionMessage=`coalesce(m.context_snapshot->>'courseId'=${quote(courseId)} or (m.context_snapshot->>'courseId' is null and m.structured_content->>'type'='workspace_event' and m.structured_content->>'schemaVersion'='1' and ((m.structured_content->>'event'='attachment' and exists(select 1 from reset_sources r where r.user_id=s.user_id and r.id::text=m.structured_content->>'referenceId')) or (m.structured_content->>'event' in ('diagnosis','confirmation') and exists(select 1 from reset_runs r where r.user_id=s.user_id and r.id::text=m.structured_content->>'referenceId')))),false)`;
 const restore=[...restored,'edge_action_runs' as const].map(table=>{
  const scope=table==='user_knowledge_states'?`${owner} and node_id in (${nodeList})`:table.startsWith('user_micro_')?progressScope:courseScope;
  const rows=baseline.tables[table] as Record<string,unknown>[];
  const keys=table==='personal_course_routes'||table==='edge_action_runs'?['id']:table==='user_knowledge_states'?['user_id','node_id']:table==='user_micro_path_progress'?['user_id','path_id']:table==='user_micro_unit_progress'?['user_id','unit_id']:table==='user_assignment_states'?['user_id','course_id','assignment_id']:['user_id','course_id'];
  for(const row of rows){assert.ok(accounts.some(account=>account.id===row.user_id),'Manifest owner out of scope');if('course_id' in row)assert.equal(row.course_id,courseId);if(table==='user_knowledge_states')assert.ok(baseline.nodeIds.includes(row.node_id));for(const column of Object.keys(row))assert.match(column,/^[a-z_]+$/);}
  const columns=rows.length?Object.keys(rows[0]):keys;
  const temp=`baseline_${table}`;
  const microGuard=table.startsWith('user_micro_')?`do $$begin if exists(select 1 from ${temp} where not (${progressScope})) then raise exception 'Micro progress outside course reset scope';end if;${table==='user_micro_unit_progress'?`if exists(select 1 from ${temp} saved where not exists(select 1 from micro_units u where u.id=saved.unit_id and u.path_id=saved.path_id)) then raise exception 'Micro unit/path mismatch';end if;`:''}end$$;`:'';
  const updates=columns.filter(column=>!keys.includes(column)).map(column=>`${column}=excluded.${column}`).join(',');
  return `create temp table ${temp} on commit drop as select * from jsonb_populate_recordset(null::${table},${quote(JSON.stringify(rows))}::jsonb);
    ${microGuard}
    delete from ${table} existing where ${scope} and not exists(select 1 from ${temp} saved where ${keys.map(key=>`saved.${key}=existing.${key}`).join(' and ')});
    ${rows.length?`insert into ${table} select * from ${temp} on conflict (${keys.join(',')}) do update set ${updates};`:''}`;
 });
 return `begin;
 select pg_advisory_xact_lock(hashtextextended('acceptance:conversation-evidence',0));
 create temp table reset_guard on commit drop as select ${outsideHash()} as original_hash;
 create temp table reset_sources on commit drop as select * from user_evidence_sources where ${owner} and not(id=any(${ids('user_evidence_sources')})) and (provenance->>'courseId'=${quote(courseId)} or id in(select evidence_source_id from edge_action_runs where ${courseScope}) or id=any(array[${resetSourceIds.map((id:string)=>quote(id)+'::uuid').join(',')}]::uuid[]));
 create temp table reset_runs on commit drop as select * from capability_diagnosis_runs where ${owner} and not(id=any(${ids('capability_diagnosis_runs')})) and source_ids && array(select id from reset_sources);
 do $$begin if exists(select 1 from micro_step_attempts where ${owner} and course_id is distinct from ${quote(courseId)} and path_id in(select micro_path_id from course_action_bindings where course_id=${quote(courseId)}) and occurred_at>=${quote(baseline.capturedAt??'1970-01-01T00:00:00Z')}::timestamptz) then raise exception 'Shared Micro has new unrelated course activity';end if;
 if exists(select 1 from reset_runs r,unnest(r.source_ids) sid where sid not in(select id from reset_sources)) then raise exception 'Mixed-source diagnosis outside reset scope';end if;
 if exists(select 1 from capability_state_proposals where run_id in(select id from reset_runs) and confirmation_state='confirmed' and node_id not in (${nodeList})) then raise exception 'Confirmed capability outside course reset baseline';end if;
 if exists(select 1 from knowledge_evidence e where ${owner} and e.node_id in (${nodeList}) and not(e.id=any(${ids('knowledge_evidence')})) and coalesce(e.context->>'courseId','')<>${quote(courseId)} and e.id not in(select knowledge_evidence_id from capability_state_proposals where run_id in(select id from reset_runs))) then raise exception 'Shared capability has new non-test lineage';end if;end$$;
 create temp table reset_evidence on commit drop as select knowledge_evidence_id as id from capability_state_proposals where run_id in(select id from reset_runs) and knowledge_evidence_id is not null;
 delete from capability_state_proposals where ${owner} and run_id in(select id from reset_runs);
 delete from evidence_units where ${owner} and run_id in(select id from reset_runs);
 delete from capability_diagnosis_runs where id in(select id from reset_runs);
 delete from knowledge_evidence where ${owner} and not(id=any(${ids('knowledge_evidence')})) and (context->>'courseId'=${quote(courseId)} or context->>'diagnosisId' in(select id::text from reset_runs) or id in(select id from reset_evidence));
 delete from learning_events where ${courseScope} and not(id=any(${ids('learning_events')}));
 update edge_action_runs set assignment_attempt_id=null,status='cancelled',completed_at=null where ${courseScope} and assignment_attempt_id is not null and not(assignment_attempt_id=any(${ids('learning_attempts')}));
 delete from performance_results where ${courseScope} and not(id=any(${ids('performance_results')}));
 delete from micro_step_attempts where ${courseScope} and not(id=any(${ids('micro_step_attempts')}));
 delete from learning_attempts where ${courseScope} and not(id=any(${ids('learning_attempts')}));
 delete from edge_action_runs where ${courseScope} and not(id=any(${ids('edge_action_runs')}));
 create temp table reset_sessions on commit drop as select s.id from assistant_sessions s where s.user_id in(${users}) and (s.title like ${quote('workspace:%:'+courseKey+':%')} or exists(select 1 from assistant_messages m where m.session_id=s.id and ${scopedSessionMessage})) and not exists(select 1 from assistant_messages m where m.session_id=s.id and not (${scopedSessionMessage}));
 delete from assistant_messages where session_id in(select id from reset_sessions) and session_id=any(${ids('assistant_sessions')}) and created_at>=${quote(baseline.capturedAt??'1970-01-01T00:00:00Z')}::timestamptz;
 delete from assistant_sessions where id in(select id from reset_sessions) and not(id=any(${ids('assistant_sessions')}));
 delete from user_evidence_sources where id in(select id from reset_sources);
 update personal_course_routes set active_version_id=null where ${courseScope};
 delete from personal_course_route_versions where ${courseScope} and not(id=any(${ids('personal_course_route_versions')}));
 ${restore.join('\n')}
 do $$begin if ${outsideHash()}<>(select original_hash from reset_guard) then raise exception 'Unrelated data or Global graph changed';end if;end$$;
 select jsonb_build_object('schemaVersion',1,'storagePaths',(select coalesce(jsonb_agg(storage_path),'[]') from reset_sources),'outsideHash',${outsideHash()}) as snapshot;
 commit;`;
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1]??'')).href){
const mode=process.argv[2];
if(mode==='capture') {
 assert.ok(!process.argv.includes('--overwrite'),'Use a new manifest path, never overwrite a captured baseline');
 let exists=false;try{readFileSync(file);exists=true;}catch{/* Fresh baseline. */}assert.ok(!exists,'Baseline already exists; preserve it.');
 const baseline=payload(query(captureSql()));mkdirSync(join(file,'..'),{recursive:true});writeFileSync(file,JSON.stringify(baseline,null,2)+'\n');console.log(JSON.stringify({mode,file,courseId,nodeCount:baseline.nodeIds.length,accounts:accounts.map(account=>account.email),counts:Object.fromEntries(Object.entries(baseline.tables).map(([key,rows])=>[key,(rows as unknown[]).length]))}));
}else if(mode==='plan'||mode==='reset') {
 const baseline=JSON.parse(readFileSync(file,'utf8'));const sql=resetSql(baseline);
 if(mode==='plan'){console.log(sql);}else {
  assert.equal(process.env.ACCEPTANCE_RESET_COURSE,courseId,'Set exact ACCEPTANCE_RESET_COURSE to prevent accidental reset');
  assert.equal(readFileSync('supabase/.temp/project-ref','utf8').trim(),'uyljtdbvlivxniililay','Wrong linked project');
  assert.equal(new URL(process.env.SUPABASE_URL!).hostname,'uyljtdbvlivxniililay.supabase.co');
  const result=payload(query(sql));const cleanupFile=file+'.storage-cleanup.json';let earlier:string[]=[];try{earlier=JSON.parse(readFileSync(cleanupFile,'utf8'));}catch{/* No pending cleanup. */}
  result.storagePaths=[...new Set([...earlier,...result.storagePaths])];assert.ok(result.storagePaths.every((path:string)=>accounts.some(account=>path.startsWith(account.id+'/'))),'Storage cleanup outside authorized owners');writeFileSync(cleanupFile,JSON.stringify(result.storagePaths));
  if(result.storagePaths.length){assert.equal(new URL(process.env.SUPABASE_URL!).hostname,'uyljtdbvlivxniililay.supabase.co');const server=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false}});const referenced=await server.from('user_evidence_sources').select('id').in('storage_path',result.storagePaths);assert.ifError(referenced.error);assert.equal(referenced.data?.length,0,'Pending cleanup still references an active source');const removed=await server.storage.from('user-evidence').remove(result.storagePaths);assert.ifError(removed.error);writeFileSync(cleanupFile,'[]');}
  console.log(JSON.stringify({mode,file,outsideHash:result.outsideHash,storageObjectsRemoved:result.storagePaths.length}));
 }
}else throw new Error('Use capture | plan | reset');

}

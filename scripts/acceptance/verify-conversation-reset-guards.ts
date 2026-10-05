/** Hosted rollback-only reset guard probe; never commits its labelled temporary records. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resetSql} from './reset-conversation-evidence.js';
const output='.acceptance/conversation-evidence';mkdirSync(output,{recursive:true});
assert.equal(readFileSync('supabase/.temp/project-ref','utf8').trim(),'uyljtdbvlivxniililay');
const baseline=JSON.parse(readFileSync(`${output}/baseline.json`,'utf8'));
const actor=baseline.accounts[0].id,source=randomUUID(),run=randomUUID();
const quote=(value:unknown)=>`'${String(value).replace(/'/g,"''")}'`;
const oldSource=baseline.tables.user_evidence_sources[0].id;
const setup=`begin;
insert into user_evidence_sources(id,user_id,title,storage_path,content_type,byte_size,provenance) values(${quote(source)},${quote(actor)},'Acceptance rollback-only reset guard',${quote(actor+'/'+source)},'text/plain',1,jsonb_build_object('kind','acceptance-rollback-guard','courseId',${quote(baseline.courseId)}));
insert into capability_diagnosis_runs(id,user_id,source_ids,model,prompt_version) values(${quote(run)},${quote(actor)},array[${quote(source)}::uuid,${quote(oldSource)}::uuid],'acceptance-rollback-guard','acceptance-only');
`;
const path=`${output}/mixed-reset-guard.sql`;writeFileSync(path,setup+resetSql(baseline).replace(/^begin;\n/,''));
let rejected=false;try{execFileSync('pnpm',['exec','supabase','db','query','--linked','--file',path,'--output','json'],{encoding:'utf8',stdio:'pipe'});}catch(error){const failure=error as {stderr?:Buffer;stdout?:Buffer};const diagnostic=String(failure.stderr??'')+String(failure.stdout??'');writeFileSync(`${output}/mixed-reset-guard.log`,diagnostic);rejected=diagnostic.includes('Mixed-source diagnosis outside reset scope');}
assert.ok(rejected,'Mixed sources did not reject reset at the expected safety boundary');
const verify=`select jsonb_build_object('guardRows',(select count(*) from user_evidence_sources where id=${quote(source)})+(select count(*) from capability_diagnosis_runs where id=${quote(run)}),'originalRoutes',(select count(*) from personal_course_route_versions where id=any(array[${baseline.tables.personal_course_route_versions.map((row:{id:string})=>quote(row.id)+'::uuid').join(',')}]))) as snapshot;`;
writeFileSync(`${output}/mixed-reset-verify.sql`,verify);
const check=JSON.parse(execFileSync('pnpm',['exec','supabase','db','query','--linked','--file',`${output}/mixed-reset-verify.sql`,'--output','json'],{encoding:'utf8',stdio:'pipe'}));
const snapshot=(check.rows??check)[0].snapshot;assert.equal(snapshot.guardRows,0);assert.equal(snapshot.originalRoutes,baseline.tables.personal_course_route_versions.length);writeFileSync(`${output}/mixed-reset-guard.json`,JSON.stringify({pass:true,...snapshot}));console.log(JSON.stringify({pass:true,...snapshot}));

// Exercise the real generated DELETE against Hosted rows, then roll back every change.
const sessions={courseOnly:randomUUID(),mixed:randomUUID(),unrelated:randomUUID(),empty:randomUUID()};
const baselineSession=baseline.tables.assistant_sessions[0].id;
const sessionSetup=`begin;
insert into assistant_sessions(id,user_id,title) values
 (${quote(sessions.courseOnly)},${quote(actor)},'Acceptance course-only Global'),
 (${quote(sessions.mixed)},${quote(actor)},'Acceptance mixed Global'),
 (${quote(sessions.unrelated)},${quote(actor)},'Acceptance unrelated Global'),
 (${quote(sessions.empty)},${quote(actor)},'workspace:capability-update:d70b476b1f51e54a:acceptance-rollback');
insert into assistant_messages(session_id,role,content,context_snapshot) values
 (${quote(sessions.courseOnly)},'user','Acceptance rollback-only',jsonb_build_object('courseId',${quote(baseline.courseId)})),
 (${quote(sessions.mixed)},'user','Acceptance rollback-only',jsonb_build_object('courseId',${quote(baseline.courseId)})),
 (${quote(sessions.mixed)},'assistant','Acceptance rollback-only','{}'::jsonb),
 (${quote(sessions.unrelated)},'user','Acceptance rollback-only','{}'::jsonb),
 (${quote(baselineSession)},'user','Acceptance rollback-only',jsonb_build_object('courseId',${quote(baseline.courseId)}));
`;
const sessionAssertions=`do $$begin
 if exists(select 1 from assistant_sessions where id in(${quote(sessions.courseOnly)},${quote(sessions.empty)})) then raise exception 'Course test session survived reset';end if;
 if (select count(*) from assistant_sessions where id in(${quote(sessions.mixed)},${quote(sessions.unrelated)},${quote(baselineSession)}))<>3 then raise exception 'Reset removed protected session';end if;
 if (select count(*) from assistant_messages where session_id=${quote(sessions.mixed)})<>2 then raise exception 'Mixed history changed';end if;
end$$;
rollback;`;
const sessionPath=`${output}/session-reset-guard.sql`;
writeFileSync(sessionPath,sessionSetup+resetSql(baseline).replace(/^begin;\n/,'').replace(/commit;$/,()=>sessionAssertions));
execFileSync('pnpm',['exec','supabase','db','query','--linked','--file',sessionPath,'--output','json'],{encoding:'utf8',stdio:'pipe'});
const rollbackQuery=`select count(*)::int as probe_rows from assistant_sessions where id in(${Object.values(sessions).map(quote).join(',')});`;
const rollbackResult=JSON.parse(execFileSync('pnpm',['exec','supabase','db','query','--linked',rollbackQuery,'--output','json'],{encoding:'utf8',stdio:'pipe'}));
assert.equal((rollbackResult.rows??rollbackResult)[0].probe_rows,0);
writeFileSync(`${output}/session-reset-guard.json`,JSON.stringify({pass:true,courseOnlyDeleted:true,emptyCourseWorkspaceDeleted:true,mixedHistoryPreserved:true,unrelatedPreserved:true,baselinePreserved:true,probeRowsAfterRollback:0}));
console.log('Hosted session reset scope and rollback PASS');

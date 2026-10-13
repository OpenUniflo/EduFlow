/** Local-only transactional contract test. All learner states below are labelled fixtures. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { currentRoute } from '../api/_lib/routePlanning.js';
import { learningDataHash } from '../api/_lib/learningData.js';

const url = process.env.SUPABASE_URL!;
assert.match(url, /^http:\/\/(localhost|127\.0\.0\.1):/);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const server = createClient(url, process.env.SUPABASE_SECRET_KEY!, options);
const users: string[] = [], actions: string[] = [];
const microPaths: string[] = [];
const courseId = 'agentic-ai-golden', assignmentId = 'golden-knowledge-assignment-P01', targetId = 'P01';
let checks = 0;
function check(value: unknown, description: string) { assert.ok(value, description); checks++; }
async function rpc(name: string, args: object) { const result = await server.rpc(name, args); assert.ifError(result.error); return result.data; }
try {
  const clients = [];
  for (let i = 0; i < 2; i++) {
    const email = `acceptance-action-v2-${randomUUID()}@eduflow.test`, password = randomUUID() + randomUUID();
    const created = await server.auth.admin.createUser({ email, password, email_confirm: true }); assert.ifError(created.error);
    users.push(created.data.user!.id);
    const client = createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, options);
    assert.ifError((await client.auth.signInWithPassword({ email, password })).error); clients.push(client);
  }
  const [learner, reviewer] = users;
  assert.ifError((await server.from('user_course_states').insert({ user_id: learner, course_id: courseId })).error);
  assert.ifError((await server.from('profiles').upsert({ id: reviewer, role: 'admin', display_name: 'Acceptance local reviewer' })).error);
  const edgeResult = await server.from('knowledge_edges').select('*').eq('target_node_id', targetId).eq('relation', 'prerequisite').eq('lifecycle_status', 'active').order('id');
  assert.ifError(edgeResult.error); assert.ok(edgeResult.data!.length >= 2);
  const edges = edgeResult.data!;
  const templates: { action: { id: string; updated_at: string }; binding: { updated_at: string } }[] = [];
  for (const edge of [edges[0], edges[0], edges[1]]) {
    const result = await server.from('knowledge_edge_actions').insert({ edge_id: edge.id, type: 'practice_task', title: 'Acceptance local Assignment executor', description: 'Local transaction fixture only', estimated_minutes: 5, difficulty: 1, expected_evidence: 'Existing Assignment PerformanceResult' }).select().single();
    assert.ifError(result.error); actions.push(result.data.id);
    const binding = await server.from('course_action_bindings').insert({ course_id: courseId, action_id: result.data.id, assignment_id: assignmentId }).select().single(); assert.ifError(binding.error);
    templates.push({ action: result.data, binding: binding.data });
  }
  const args = (i: number, expected: string | null = null) => ({ p_user_id: learner, p_course_id: courseId, p_action_id: templates[i].action.id, p_selection_key: randomUUID(), p_action_version: templates[i].action.updated_at, p_binding_version: templates[i].binding.updated_at, p_expected_active_run_id: expected });
  check((await server.rpc('select_edge_action_v2', args(0))).error, 'Unacquired source blocks selection');
  assert.ifError((await server.from('user_knowledge_states').insert([...new Set(edges.map(edge => edge.source_node_id))].map(node_id => ({ user_id: learner, node_id, status: 'learned' })))).error);
  const selection = args(0);
  check((await clients[0].rpc('select_edge_action_v2', selection)).error, 'Learner cannot call privileged selection');
  const parallel = await Promise.all([rpc('select_edge_action_v2', selection), rpc('select_edge_action_v2', selection)]);
  check(parallel[0].id === parallel[1].id, 'Concurrent same-key selection is idempotent');
  let run = await rpc('transition_edge_action_run_v2', { p_user_id: learner, p_run_id: parallel[0].id, p_operation: 'start' });
  check((await server.rpc('select_edge_action_v2', args(1))).error, 'Switch requires explicit active-run confirmation');
  check((await server.rpc('select_edge_action_v2', args(1, randomUUID()))).error, 'Stale confirmation cannot cancel current run');
  const next = await rpc('select_edge_action_v2', args(1, run.id));
  check((await server.from('edge_action_runs').select('status').eq('id', run.id).single()).data?.status === 'cancelled', 'Confirmed switch preserves cancelled history');
  run = await rpc('transition_edge_action_run_v2', { p_user_id: learner, p_run_id: next.id, p_operation: 'start' });
  check(!(await clients[1].from('edge_action_runs').select('id').eq('id', run.id)).data?.length, 'RLS isolates ActionRun owner');
  check((await server.from('user_knowledge_states').select('node_id').eq('user_id', learner).eq('node_id', targetId)).data?.length === 0, 'Start grants no target capability');
  const submit = (runId: string, key: string, outcome = 'passed') => ({ p_user_id: learner, p_run_id: runId, p_idempotency_key: key, p_response: { kind: 'answer', text: 'Labelled local transaction fixture' }, p_outcome: outcome, p_score: outcome === 'passed' ? 1 : null, p_feedback: { code: 'local_fixture', message: 'Local transactional test, not hosted evidence' }, p_evaluator_kind: outcome === 'pending' ? 'manual' : 'rule' });
  const firstKey = randomUUID();
  const first = (await rpc('record_action_assignment_attempt', submit(run.id, firstKey)))[0];
  check((await server.from('learning_attempts').select('action_run_id').eq('id', first.attempt_id).single()).data?.action_run_id === run.id, 'Attempt records exact ActionRun');
  check((await server.from('edge_action_runs').select('status').eq('id', run.id).single()).data?.status === 'completed', 'Passed Assignment completes its ActionRun');
  check((await server.from('user_knowledge_states').select('node_id').eq('user_id', learner).eq('node_id', targetId)).data?.length === 0, 'Result alone does not grant target capability');
  const repeated = await rpc('select_edge_action_v2', args(1));
  check(repeated.id !== run.id, 'Completed action creates a distinct repeated run');
  run = await rpc('transition_edge_action_run_v2', { p_user_id: learner, p_run_id: repeated.id, p_operation: 'start' });
  check((await server.rpc('record_action_assignment_attempt', submit(run.id, firstKey))).error, 'Another run cannot reuse or steal historical attempt');
  const failedKey = randomUUID();
  await rpc('record_action_assignment_attempt', submit(run.id, failedKey, 'failed'));
  const pendingKey = randomUUID();
  const pending = (await rpc('record_action_assignment_attempt', submit(run.id, pendingKey, 'pending')))[0];
  check((await server.from('user_assignment_states').select('status').eq('user_id', learner).eq('course_id', courseId).eq('assignment_id', assignmentId).single()).data?.status === 'accepted', 'Repeat preserves accepted aggregate');
  check((await server.rpc('record_action_assignment_attempt', submit(run.id, randomUUID(), 'pending'))).error, 'Pending review blocks a different new submission');
  check((await rpc('record_action_assignment_attempt', submit(run.id, pendingKey, 'pending')))[0].duplicate, 'Saved pending submission retry is idempotent');
  await rpc('record_action_assignment_attempt', submit(run.id, failedKey, 'failed'));
  check((await server.from('edge_action_runs').select('assignment_attempt_id').eq('id', run.id).single()).data?.assignment_attempt_id === pending.attempt_id, 'Old failed retry cannot move the current attempt pointer backwards');
  check((await server.rpc('record_action_assignment_attempt', submit(run.id, randomUUID(), 'pending'))).error, 'Old failed retry cannot bypass pending review');
  const reviewArgs = { p_learner_user_id: learner, p_course_id: courseId, p_assignment_id: assignmentId, p_reviewer_user_id: reviewer, p_attempt_id: pending.attempt_id };
  check((await server.rpc('record_manual_assignment_review', { ...reviewArgs, p_learner_user_id: reviewer })).error, 'Exact review validates attempt owner');
  await rpc('record_manual_assignment_review', reviewArgs);
  check((await server.from('edge_action_runs').select('status').eq('id', run.id).single()).data?.status === 'completed', 'Exact pending review completes repeated run despite accepted aggregate');
  // The conversation entrypoint uses the actual server role, including auth-schema isolation.
  const beforeConversation=JSON.stringify((await server.from('user_knowledge_states').select('*').eq('user_id',learner).order('node_id')).data);
  const conversationSelection=await rpc('select_edge_action_v2',args(1));
  await rpc('transition_edge_action_run_v2',{p_user_id:learner,p_run_id:conversationSelection.id,p_operation:'start'});
  const conversationArgs={...submit(conversationSelection.id,randomUUID()),p_response:{kind:'answer',text:'Labelled local conversation response',submissionMode:'conversation'}};
  const conversationResult=(await rpc('record_conversation_action_assignment_attempt',conversationArgs))[0];
  check(conversationResult.attempt_id!==pending.attempt_id,'Conversation keeps prior immutable attempts');
  check((await rpc('record_conversation_action_assignment_attempt',conversationArgs))[0].duplicate,'Conversation Action retry has one exact Attempt');
  check((await server.from('learning_attempts').select('action_run_id').eq('id',conversationResult.attempt_id).single()).data?.action_run_id===conversationSelection.id,'Conversation records launched ActionRun');
  check((await server.from('edge_action_runs').select('status').eq('id',conversationSelection.id).single()).data?.status==='completed','Conversation result completes its execution only');
  check(JSON.stringify((await server.from('user_knowledge_states').select('*').eq('user_id',learner).order('node_id')).data)===beforeConversation,'Conversation completion preserves all capability state');
  check((await clients[0].rpc('record_conversation_action_assignment_attempt',conversationArgs)).error,'Authenticated client cannot invoke conversation evaluator writer');
  const archived = await server.from('knowledge_edge_actions').update({ status: 'archived' }).eq('id', templates[1].action.id); assert.ifError(archived.error);
  check((await rpc('record_action_assignment_attempt', submit(run.id, pendingKey, 'pending')))[0].duplicate, 'Saved attempt retry survives later Action archival');
  check((await server.rpc('record_action_assignment_attempt', { ...submit(run.id, pendingKey), p_response: { kind: 'answer', text: 'Changed response' } })).error, 'Archived retry still rejects changed response');
  const restored = await server.from('knowledge_edge_actions').update({ status: 'active' }).eq('id', templates[1].action.id).select('updated_at').single(); assert.ifError(restored.error); templates[1].action.updated_at = restored.data.updated_at;
  // Distinct real edges can share one Assignment. Their concurrent keys cannot steal lineage.
  const runA = await rpc('select_edge_action_v2', args(1)), runB = await rpc('select_edge_action_v2', args(2));
  await Promise.all([runA, runB].map(r => rpc('transition_edge_action_run_v2', { p_user_id: learner, p_run_id: r.id, p_operation: 'start' })));
  const sharedKey = randomUUID();
  const raced = await Promise.all([runA, runB].map(r => server.rpc('record_action_assignment_attempt', submit(r.id, sharedKey))));
  check(raced.filter(result => !result.error).length === 1 && raced.filter(result => result.error).length === 1, 'Concurrent shared Assignment key belongs to exactly one run');
  const winner = raced.findIndex(result => !result.error);
  const attempt = await server.from('learning_attempts').select('action_run_id').eq('user_id', learner).eq('idempotency_key', sharedKey).single(); assert.ifError(attempt.error);
  check(attempt.data.action_run_id === [runA, runB][winner].id, 'Losing run cannot overwrite winning lineage');
  check((await server.from('personal_course_route_versions').select('id').eq('user_id', learner)).data?.length === 0, 'Execution never creates a Route Version');
  // Published local review content exercises the existing Micro evaluator/attempt pipeline.
  const pathId = `acceptance-micro-${randomUUID()}`, unitId = `${pathId}-unit`, stepIds = [`${pathId}-one`, `${pathId}-two`]; microPaths.push(pathId);
  assert.ifError((await server.from('micro_learning_paths').insert({ id: pathId, knowledge_id: targetId, course_id: courseId, scope: 'course', mode: 'learn', title: 'Acceptance local repeated Micro', estimated_minutes: 1, required: false, status: 'published' })).error);
  assert.ifError((await server.from('micro_units').insert({ id: unitId, path_id: pathId, title: 'Local test unit', position: 0, estimated_minutes: 1, required: true })).error);
  assert.ifError((await server.from('micro_steps').insert(stepIds.map((id, position) => ({ id, unit_id: unitId, position, kind: 'explanation', title: `Local test step ${position}`, content: 'Local transaction fixture.' })))).error);
  const historicalTime = '2020-01-01T00:00:00Z';
  assert.ifError((await server.from('user_micro_path_progress').insert({ user_id: learner, path_id: pathId, status: 'completed', completed_at: historicalTime })).error);
  assert.ifError((await server.from('user_micro_unit_progress').insert({ user_id: learner, path_id: pathId, unit_id: unitId, status: 'completed', completed_step_ids: stepIds, completed_at: historicalTime })).error);
  const template = await server.from('knowledge_edge_actions').insert({ edge_id: edges[0].id, type: 'micro_learning', title: 'Acceptance local repeated Micro', description: 'Local only', estimated_minutes: 1, difficulty: 1, expected_evidence: 'Scoped Micro observations' }).select().single(); assert.ifError(template.error); actions.push(template.data.id);
  const microBinding = await server.from('course_action_bindings').insert({ course_id: courseId, action_id: template.data.id, micro_path_id: pathId }).select().single(); assert.ifError(microBinding.error);
  const active = await server.from('edge_action_runs').select('id').eq('user_id', learner).eq('edge_id', edges[0].id).in('status', ['selected', 'in_progress']).maybeSingle(); assert.ifError(active.error);
  const microArgs = { p_user_id: learner, p_course_id: courseId, p_action_id: template.data.id, p_selection_key: randomUUID(), p_action_version: template.data.updated_at, p_binding_version: microBinding.data.updated_at, p_expected_active_run_id: active.data?.id ?? null };
  const microRun = await rpc('select_edge_action_v2', microArgs);
  await rpc('transition_edge_action_run_v2', { p_user_id: learner, p_run_id: microRun.id, p_operation: 'start' });
  assert.ifError((await server.from('user_micro_path_progress').update({ status: 'completed' }).eq('user_id', learner).eq('path_id', pathId)).error);
  check((await rpc('transition_edge_action_run_v2', { p_user_id: learner, p_run_id: microRun.id, p_operation: 'sync-micro' })).status === 'in_progress', 'Historical Micro progress and legacy observer cannot complete fresh run');
  const route = await currentRoute(clients[0], learner, courseId); assert.ok(route.view.plan.valid);
  const expected = { interaction: null, kind: 'explanation', revision: 1 };
  const microStep = (stepId: string) => ({ p_user_id: learner, p_path_id: pathId, p_unit_id: unitId, p_step_id: stepId, p_context_course_id: courseId, p_key: randomUUID(), p_response: null, p_correct: true, p_outcome: 'observed', p_step_hash: learningDataHash(expected), p_duration: 100, p_decision_id: null, p_expected_step: expected, p_route_node_ids: route.view.plan.route!.selectedNodeIds, p_expected_version_id: route.view.activeVersion!.id, p_run_id: microRun.id });
  const firstStepArgs = microStep(stepIds[0]);
  const observation = await rpc('record_action_micro_step', firstStepArgs);
  check(observation.actionRun.status === 'in_progress' && observation.actionStepIds.length === 1, 'Micro action requires all current-run steps');
  const retry = await rpc('record_action_micro_step', firstStepArgs);
  check(retry.attempt.id === observation.attempt.id, 'Repeated Micro network retry preserves observation identity');
  const complete = await rpc('record_action_micro_step', microStep(stepIds[1]));
  check(complete.actionRun.status === 'completed' && complete.actionStepIds.length === 2, 'Actual repeated Micro work completes only its run');
  check(Date.parse((await server.from('user_micro_path_progress').select('completed_at').eq('user_id', learner).eq('path_id', pathId).single()).data!.completed_at) === Date.parse(historicalTime), 'Micro review preserves historical formal progress');
  check((await server.from('user_knowledge_states').select('node_id').eq('user_id', learner).eq('node_id', targetId)).data?.length === 0, 'Repeated Micro Action grants no capability');
  const replay = await rpc('select_edge_action_v2', { ...microArgs, p_selection_key: randomUUID(), p_expected_active_run_id: null });
  check(replay.id !== microRun.id, 'Completed Micro action can be selected for another distinct execution');
  // V3 contracts reuse real facts/resources above. The fixture snapshot is trusted
  // server output; this section tests atomic choice authority, not planner ranking.
  const snapshot = { ...route.view.activeVersion!.snapshot, executionSteps: [{ edgeId: edges[0].id, actionId: templates[0].action.id, sourceNodeId: edges[0].source_node_id, targetNodeId: targetId, order: 0 }] };
  const adoption = (base: string, actionId: string) => ({ p_user_id: learner, p_course_id: courseId, p_base_version_id: base, p_source: 'adjustment', p_include_node_ids: [], p_exclude_node_ids: [], p_snapshot: { ...snapshot, executionSteps: [{ ...snapshot.executionSteps[0], actionId }] }, p_structure_fingerprint: 'acceptance-local-v3', p_restored_from_version_id: null });
  const formal = await rpc('adopt_personal_course_route', adoption(route.view.activeVersion!.id, templates[0].action.id));
  const chosen = { ...args(0,replay.id), p_expected_version_id: formal.id };
  check((await clients[0].rpc('select_route_action_v3',chosen)).error,'Learner cannot invoke privileged route choice writer');
  check((await server.rpc('select_route_action_v3',{...args(1,replay.id),p_expected_version_id:formal.id})).error,'Unselected alternative cannot replace formal Action');
  check((await server.from('edge_action_runs').select('status').eq('id',replay.id).single()).data?.status==='selected','Adoption and rejected alternatives never cancel existing work');
  const selected = await Promise.all([rpc('select_route_action_v3',chosen),rpc('select_route_action_v3',chosen)]);
  check(selected[0].id===selected[1].id,'Concurrent V3 retries select one Run');
  check(selected[0].execution_snapshot.routeVersionId===formal.id,'New Run records adopted version reference');
  // Hold the adoption lock until the competing first start has entered the RPC.
  const changed = adoption(formal.id,templates[1].action.id);
  const sql = (value: unknown) => "'"+String(value).replace(/'/g,"''")+"'";
  const lockedAdoption = spawn('docker',['exec','-i','supabase_db_EduFlow','psql','-U','postgres','-v','ON_ERROR_STOP=1','-At'],{stdio:['pipe','pipe','pipe']});
  let lockedOutput=''; let lockedError='';
  lockedAdoption.stderr.on('data',chunk=>{lockedError+=chunk;});
  const locked = new Promise<void>((resolve,reject)=>{
    lockedAdoption.stdout.on('data',chunk=>{lockedOutput+=chunk;if(lockedOutput.includes('route-lock-held'))resolve();});
    lockedAdoption.on('error',reject);lockedAdoption.on('exit',code=>{if(code && !lockedOutput.includes('route-lock-held'))reject(new Error(lockedError));});
  });
  const finished = new Promise<void>((resolve,reject)=>lockedAdoption.on('exit',code=>code===0?resolve():reject(new Error(lockedError))));
  lockedAdoption.stdin.end(`begin; select pg_advisory_xact_lock(hashtextextended('personal-route:${learner}:${courseId}',0)); select 'route-lock-held'; select pg_sleep(1); select adopt_personal_course_route(${sql(learner)}::uuid,${sql(courseId)},${sql(formal.id)}::uuid,'adjustment','{}'::text[],'{}'::text[],${sql(JSON.stringify(changed.p_snapshot))}::jsonb,'acceptance-local-v3',null); commit;`);
  await locked;
  const racedStart = await server.rpc('transition_route_action_v3',{p_user_id:learner,p_run_id:selected[0].id,p_operation:'start',p_expected_version_id:formal.id});
  await finished;
  check(racedStart.error?.code==='PT409','First start racing adoption rechecks the version after the route lock');
  check((await server.from('edge_action_runs').select('status').eq('id',selected[0].id).single()).data?.status==='selected','Rejected stale start never becomes in_progress');
  check((await rpc('select_route_action_v3',chosen)).id===selected[0].id,'Committed selection retry stays idempotent after adoption');
  const pointer = await server.from('personal_course_routes').select('active_version_id').eq('user_id',learner).eq('course_id',courseId).single();assert.ifError(pointer.error);
  const nextChoice=await rpc('select_route_action_v3',{...args(1,selected[0].id),p_expected_version_id:pointer.data.active_version_id});
  await rpc('transition_route_action_v3',{p_user_id:learner,p_run_id:nextChoice.id,p_operation:'start',p_expected_version_id:pointer.data.active_version_id});
  await rpc('record_action_assignment_attempt',submit(nextChoice.id,randomUUID()));
  const newer=await rpc('adopt_personal_course_route',adoption(pointer.data.active_version_id,templates[0].action.id));
  const again=await rpc('select_route_action_v3',{...args(1),p_expected_version_id:newer.id,p_repeat_run_id:nextChoice.id});
  check(again.id!==nextChoice.id,'Legal repeat creates a distinct Run independent of current future choice');
  await rpc('transition_route_action_v3',{p_user_id:learner,p_run_id:again.id,p_operation:'start',p_expected_version_id:newer.id});
  check((await server.from('personal_course_routes').select('active_version_id').eq('user_id',learner).eq('course_id',courseId).single()).data?.active_version_id===newer.id,'Repeat and start leave route selection/version unchanged');
  check((await server.from('user_knowledge_states').select('node_id').eq('user_id',learner).eq('node_id',targetId)).data?.length===0,'V3 execution still grants no capability');
  const microFormal=await rpc('adopt_personal_course_route',adoption(newer.id,template.data.id));
  const microChosen={...microArgs,p_selection_key:randomUUID(),p_expected_active_run_id:again.id,p_expected_version_id:microFormal.id};
  const concurrentMicro=await rpc('select_route_action_v3',microChosen);
  await rpc('transition_route_action_v3',{p_user_id:learner,p_run_id:concurrentMicro.id,p_operation:'start',p_expected_version_id:microFormal.id});
  for(const operation of ['sync-micro','start','select']) {
    const stepArgs={...microStep(stepIds[0]),p_run_id:concurrentMicro.id,p_expected_version_id:microFormal.id};
    const held=spawn('docker',['exec','-i','supabase_db_EduFlow','psql','-U','postgres','-v','ON_ERROR_STOP=1','-At'],{stdio:['pipe','pipe','pipe']});
    let output='',errors='';held.stderr.on('data',chunk=>{errors+=chunk;});
    const acquired=new Promise<void>((resolve,reject)=>{held.stdout.on('data',chunk=>{output+=chunk;if(output.includes('micro-lock-held'))resolve();});held.on('error',reject);held.on('exit',code=>{if(code && !output.includes('micro-lock-held'))reject(new Error(errors));});});
    const done=new Promise<void>((resolve,reject)=>held.on('exit',code=>code===0?resolve():reject(new Error(errors))));
    held.stdin.end(`begin; set local statement_timeout='8s'; select pg_advisory_xact_lock(hashtextextended('criterion-evidence:${learner}',0)); select id from edge_action_runs where id=${sql(concurrentMicro.id)}::uuid for update; select 'micro-lock-held'; select pg_sleep(.3); select record_action_micro_step(${sql(learner)}::uuid,${sql(pathId)},${sql(unitId)},${sql(stepIds[0])},${sql(courseId)},${sql(stepArgs.p_key)},null,true,'observed',${sql(stepArgs.p_step_hash)},100,null,${sql(JSON.stringify(expected))}::jsonb,${sql('{'+route.view.plan.route!.selectedNodeIds.join(',')+'}')}::text[],${sql(microFormal.id)}::uuid,${sql(concurrentMicro.id)}::uuid); commit;`);
    await acquired;
    const competed=operation==='select'?await server.rpc('select_route_action_v3',{...microChosen,p_selection_key:randomUUID(),p_expected_active_run_id:concurrentMicro.id}):await server.rpc('transition_route_action_v3',{p_user_id:learner,p_run_id:concurrentMicro.id,p_operation:operation,p_expected_version_id:microFormal.id});
    await done;check(!competed.error,`Micro submission and V3 ${operation} share locks without deadlock`);
  }
  check((await server.from('personal_course_routes').select('active_version_id').eq('user_id',learner).eq('course_id',courseId).single()).data?.active_version_id===microFormal.id,'Concurrent Micro operations leave selected Action/version unchanged');
  console.log(JSON.stringify({ status: 'PASS', checks, scope: 'local labelled fixtures; no Hosted writes' }));
} finally {
  for (const user of users) {
    assert.ifError((await server.from('edge_action_runs').update({ status: 'cancelled', assignment_attempt_id: null }).eq('user_id', user)).error);
    assert.ifError((await server.from('learning_attempts').delete().eq('user_id', user)).error);
    assert.ifError((await server.from('micro_step_attempts').delete().eq('user_id', user)).error);
    assert.ifError((await server.from('edge_action_runs').delete().eq('user_id', user)).error);
    assert.ifError((await server.auth.admin.deleteUser(user)).error);
  }
  if (actions.length) {
    assert.ifError((await server.from('course_action_bindings').delete().in('action_id', actions)).error);
    assert.ifError((await server.from('knowledge_edge_actions').delete().in('id', actions)).error);
  }
  if (microPaths.length) assert.ifError((await server.from('micro_learning_paths').delete().in('id', microPaths)).error);
}

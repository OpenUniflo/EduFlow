/** Local actual-RPC concurrency, ownership and result lineage checks. No fabricated proposals. */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL!;
assert.match(url, /^http:\/\/(localhost|127\.0\.0\.1):/);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const server = createClient(url, process.env.SUPABASE_SECRET_KEY!, options);
const users: string[] = [], actionIds: string[] = [], sourceIds: string[] = [], microIds: string[] = [];
let assertions = 0;
const check = (condition: unknown, message: string) => { assert.ok(condition, message); assertions++; };
async function insert(table: string, row: object) { const result = await server.from(table).insert(row).select().single(); assert.ifError(result.error); return result.data; }
try {
  const clients = [];
  for (let i = 0; i < 2; i++) {
    const email = `action-run-local-${randomUUID()}@eduflow.test`, password = randomUUID() + randomUUID();
    const created = await server.auth.admin.createUser({ email, password, email_confirm: true }); assert.ifError(created.error); users.push(created.data.user!.id);
    const client = createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, options);
    assert.ifError((await client.auth.signInWithPassword({ email, password })).error); clients.push(client);
  }
  const [a, b] = users, [clientA, clientB] = clients;
  const edges = await server.from('knowledge_edges').select('id,source_node_id,target_node_id').eq('lifecycle_status', 'active').eq('relation', 'prerequisite').limit(1); assert.ifError(edges.error);
  const courses = await clientA.from('courses').select('id').eq('lifecycle', 'published').limit(1); assert.ifError(courses.error);
  const courseId = courses.data![0].id;
  const actionId = randomUUID(); actionIds.push(actionId);
  let action = await insert('knowledge_edge_actions', { id: actionId, edge_id: edges.data![0].id, type: 'practice_task', title: 'Run test fixture', description: 'Local security test', estimated_minutes: 10, difficulty: 1, expected_evidence: 'Actual private file' });
  const selection = () => ({ p_user_id: a, p_course_id: courseId, p_action_id: actionId, p_selection_key: randomUUID(), p_action_version: action.updated_at, p_binding_version: null, p_micro_path_id: null });
  const args = selection();
  check(Boolean((await clientA.rpc('select_edge_action', args)).error), 'Learner cannot invoke privileged selection');
  const responses = await Promise.all([server.rpc('select_edge_action', args), server.rpc('select_edge_action', args)]);
  responses.forEach(response => assert.ifError(response.error));
  let run = responses[0].data;
  check(run.id === responses[1].data.id, 'Concurrent selection is idempotent');
  check((await clientA.from('edge_action_runs').select('id')).data?.length === 1, 'One persisted run');
  check((await clientB.from('edge_action_runs').select('*').eq('id', run.id)).data?.length === 0, 'B cannot read A run');
  check(Boolean((await clientA.from('edge_action_runs').insert({ user_id: b })).error), 'Cannot forge owner');
  check(Boolean((await clientA.from('edge_action_runs').update({ status: 'completed' }).eq('id', run.id)).error), 'Cannot complete by client PATCH');
  check(Boolean((await server.rpc('transition_edge_action_run', { p_user_id: b, p_run_id: run.id, p_operation: 'start' })).error), 'Server rejects wrong owner');
  const updated = await server.from('knowledge_edge_actions').update({ description: 'Changed instructions' }).eq('id', actionId).select().single(); assert.ifError(updated.error); action = updated.data;
  check(Boolean((await server.rpc('transition_edge_action_run', { p_user_id: a, p_run_id: run.id, p_operation: 'start' })).error), 'Cannot start stale snapshot');
  const reselection = await server.rpc('select_edge_action', selection()); assert.ifError(reselection.error);
  check(reselection.data.id !== run.id, 'Changed template requires a new execution snapshot'); run = reselection.data;
  const started = await server.rpc('transition_edge_action_run', { p_user_id: a, p_run_id: run.id, p_operation: 'start' }); assert.ifError(started.error);
  check(started.data.status === 'in_progress', 'Start persists real execution');
  const source = async (owner: string, ready: boolean) => {
    const id = randomUUID(); sourceIds.push(id);
    const content = 'A completed work record for local transaction testing only.';
    const row = await insert('user_evidence_sources', { id, user_id: owner, title: 'Local result', storage_path: `${owner}/${id}`, content_type: 'text/plain', byte_size: Buffer.byteLength(content), parse_status: ready ? 'ready' : 'pending', ...(ready ? { parsed_lines: [{ line: 1, text: content }], source_sha256: createHash('sha256').update(content).digest('hex') } : {}) });
    assert.ifError((await server.storage.from('user-evidence').upload(`${owner}/${id}`, content, { contentType: 'text/plain' })).error);
    return row;
  };
  const bSource = await source(b, true), pending = await source(a, false), result = await source(a, true);
  const submit = (sourceId: string) => ({ p_user_id: a, p_run_id: run.id, p_operation: 'submit', p_source_id: sourceId });
  check(Boolean((await server.rpc('transition_edge_action_run', submit(bSource.id))).error), 'Cannot attach B file');
  check(Boolean((await server.rpc('transition_edge_action_run', submit(pending.id))).error), 'Cannot submit unparsed file');
  const completed = await Promise.all([server.rpc('transition_edge_action_run', submit(result.id)), server.rpc('transition_edge_action_run', submit(result.id))]);
  completed.forEach(response => assert.ifError(response.error));
  check(completed.every(response => response.data.status === 'completed' && response.data.evidence_source_id === result.id), 'Concurrent result submission idempotent');
  const provenance = await clientA.from('user_evidence_sources').select('provenance').eq('id', result.id).single(); assert.ifError(provenance.error);
  check(provenance.data.provenance.actionRunId === run.id, 'Source preserves execution lineage');
  check((await clientA.from('user_knowledge_states').select('node_id')).data?.length === 0, 'Action completion grants no capability');
  check((await clientA.from('knowledge_evidence').select('id')).data?.length === 0, 'Action result is not formal KnowledgeEvidence');
  check((await clientA.from('personal_course_route_versions').select('id')).data?.length === 0, 'Action does not create RouteVersion');
  check(Boolean((await clientB.storage.from('user-evidence').download(`${a}/${result.id}`)).error), 'B cannot read result file');
  const fresh = await server.rpc('select_edge_action', selection()); assert.ifError(fresh.error);
  const alternativeId = randomUUID(); actionIds.push(alternativeId);
  const alternative = await insert('knowledge_edge_actions', { id: alternativeId, edge_id: action.edge_id, type: 'practice_task', title: 'Alternative', description: 'Local only', estimated_minutes: 5, difficulty: 1, expected_evidence: 'Record' });
  const switched = await server.rpc('select_edge_action', { ...selection(), p_action_id: alternativeId, p_action_version: alternative.updated_at }); assert.ifError(switched.error);
  const back = await server.rpc('select_edge_action', selection()); assert.ifError(back.error);
  check(back.data.id !== fresh.data.id && back.data.status === 'selected', 'New choice intent can return to a cancelled alternative');
  const binding = await insert('course_action_bindings', { course_id: courseId, action_id: actionId });
  check(Boolean((await server.rpc('transition_edge_action_run', { p_user_id: a, p_run_id: back.data.id, p_operation: 'start' })).error), 'Null to new binding invalidates execution snapshot');
  assert.ifError((await server.from('course_action_bindings').delete().eq('id', binding.id)).error);
  const microId = `action-test-micro-${randomUUID()}`; microIds.push(microId);
  await insert('micro_learning_paths', { id: microId, knowledge_id: edges.data![0].target_node_id, scope: 'global', title: 'Local path authority fixture', mode: 'learn', estimated_minutes: 1, required: false, status: 'published' });
  const microActionId = randomUUID(); actionIds.push(microActionId);
  const microAction = await insert('knowledge_edge_actions', { id: microActionId, edge_id: action.edge_id, type: 'micro_learning', title: 'Local Micro', description: 'Local only', estimated_minutes: 1, difficulty: 1, expected_evidence: 'Micro rule output' });
  const microSelection = () => ({ ...selection(), p_action_id: microActionId, p_action_version: microAction.updated_at, p_micro_path_id: microId });
  const microRun = await server.rpc('select_edge_action', microSelection()); assert.ifError(microRun.error);
  assert.ifError((await server.from('micro_learning_paths').update({ status: 'archived' }).eq('id', microId)).error);
  check(Boolean((await server.rpc('transition_edge_action_run', { p_user_id: a, p_run_id: microRun.data.id, p_operation: 'start' })).error), 'Cannot start archived snapshot Micro path');
  assert.ifError((await server.from('micro_learning_paths').update({ status: 'published' }).eq('id', microId)).error);
  assert.ifError((await server.rpc('transition_edge_action_run', { p_user_id: a, p_run_id: microRun.data.id, p_operation: 'start' })).error);
  // Progress is a labelled local transaction fixture, not Hosted evidence or a claimed learning attempt.
  assert.ifError((await server.from('user_micro_path_progress').insert({ user_id: a, path_id: microId, status: 'completed', completed_at: new Date().toISOString() })).error);
  check((await clientA.from('edge_action_runs').select('status').eq('id', microRun.data.id).single()).data?.status === 'completed', 'Existing Micro completion observer marks matching run only');
  check((await clientA.from('user_knowledge_states').select('node_id')).data?.length === 0, 'Micro observer itself grants no capability');
  check((await clientA.from('personal_course_route_versions').select('id')).data?.length === 0, 'Micro observer creates no route version');
  // Explicit fixture tests the existing instructional-readiness status, not new mastery authority.
  assert.ifError((await server.from('user_knowledge_states').insert({ user_id: a, node_id: edges.data![0].source_node_id, status: 'practicing' })).error);
  const required = await server.from('knowledge_edge_actions').update({ required_capability_ids: [edges.data![0].source_node_id] }).eq('id', actionId).select().single(); assert.ifError(required.error); action = required.data;
  const practicingRun = await server.rpc('select_edge_action', selection()); assert.ifError(practicingRun.error);
  check((await server.rpc('transition_edge_action_run', { p_user_id: a, p_run_id: practicingRun.data.id, p_operation: 'start' })).data?.status === 'in_progress', 'Practicing matches existing teaching-readiness authority');
  console.log(JSON.stringify({ status: 'PASS', assertions, scope: 'local ordinary roles, real private Storage and service-only transactional transitions; not AI evidence quality' }));
} finally {
  assert.ifError((await server.from('edge_action_runs').delete().in('user_id', users)).error);
  for (const user of users) await server.storage.from('user-evidence').remove(sourceIds.map(id => `${user}/${id}`));
  assert.ifError((await server.from('user_evidence_sources').delete().in('id', sourceIds)).error);
  assert.ifError((await server.from('user_micro_path_progress').delete().in('user_id', users)).error);
  assert.ifError((await server.from('micro_learning_paths').delete().in('id', microIds)).error);
  assert.ifError((await server.from('user_knowledge_states').delete().in('user_id', users)).error);
  assert.ifError((await server.from('knowledge_edge_actions').delete().in('id', actionIds)).error);
  for (const user of users) assert.ifError((await server.auth.admin.deleteUser(user)).error);
}

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import micro from '../api/_handlers/micro';
import navigation from '../api/_handlers/navigation';
import { assertLocalSupabaseUrl } from './local-supabase';

const url = assertLocalSupabaseUrl(process.env.SUPABASE_URL!);
const server = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const prefix = `route-acceptance-${randomUUID()}`;
const courseId = `${prefix}-course`;
const ids = ['a', 'b', 'z', 'unrelated'].map(id => `${prefix}-${id}`);
const users: Array<{ id: string; token: string; client: SupabaseClient }> = [];
async function invoke(handler: typeof micro, token: string, body?: Record<string, unknown>) {
  let status = 200;
  let result: Record<string, any> = {};
  const res = { status(code: number) { status = code; return res; }, json(value: Record<string, any>) { result = value; return res; }, setHeader() {} };
  await handler({ method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}` }, query: { courseId }, body } as unknown as VercelRequest, res as unknown as VercelResponse);
  return { status, result };
}
async function write(table: string, rows: Record<string, unknown> | Record<string, unknown>[]) { const result = await server.from(table).insert(rows); assert.ifError(result.error); }
try {
  for (let i = 0; i < 2; i++) {
    const email = `${prefix}-${i}@eduflow.local`; const password = randomUUID();
    const made = await server.auth.admin.createUser({ email, password, email_confirm: true }); assert.ifError(made.error); assert.ok(made.data.user);
    const client = createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const login = await client.auth.signInWithPassword({ email, password }); assert.ifError(login.error); assert.ok(login.data.session);
    users.push({ id: made.data.user.id, token: login.data.session.access_token, client });
  }
  execFileSync('docker', ['exec', '-i', 'supabase_db_EduFlow', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: `begin; ${ids.map(id => `
    insert into knowledge_nodes(id,title,description,node_type,scope,current_revision_id) values ('${id}','${id}','Local acceptance','conceptual','global','${id}-r1');
    insert into knowledge_node_revisions(id,node_id,title,description,node_type,version) values ('${id}-r1','${id}','${id}','Local acceptance','conceptual',1);
  `).join('')} commit;`, stdio: ['pipe', 'pipe', 'pipe'] });
  await write('knowledge_edges', [0, 1].map(i => ({ id: `${prefix}-edge-${i}`, source_node_id: ids[i], target_node_id: ids[i + 1], relation: 'prerequisite', reason: 'Local acceptance prerequisite', prerequisite_strength: 'hard' })));
  await write('courses', { id: courseId, title: 'Local route acceptance', description: 'Temporary local acceptance only', revision: '1' });
  await write('course_curricula', { course_id: courseId, id: 'curriculum', generation_mode: 'manual' });
  await write('curriculum_chapters', { course_id: courseId, id: 'chapter', title: 'Chapter', description: '', display_order: 0, color: '#445566', outcome: '' });
  await write('curriculum_lessons', { course_id: courseId, id: 'lesson', chapter_id: 'chapter', title: 'Lesson', display_order: 0 });
  await write('curriculum_coverages', { course_id: courseId, id: 'coverage', lesson_id: 'lesson', node_id: ids[2], role: 'introduce', display_order: 0 });
  for (const id of ids) {
    await write('micro_learning_paths', { id: `${id}-path`, knowledge_id: id, scope: 'global', title: id, mode: 'learn', estimated_minutes: 1, status: 'published' });
    await write('micro_units', { id: `${id}-unit`, path_id: `${id}-path`, title: id, position: 0, estimated_minutes: 1 });
    await write('micro_steps', { id: `${id}-step`, unit_id: `${id}-unit`, position: 0, kind: 'explanation', title: id, content: 'Local acceptance instruction' });
  }
  // Current capability comes from the formal standalone Micro completion path, not a state UPDATE.
  const body = (id: string, course = true) => ({ action: 'complete-step', pathId: `${id}-path`, unitId: `${id}-unit`, stepId: `${id}-step`, ...(course ? { contextCourseId: courseId } : {}), idempotencyKey: `${id}-attempt` });
  assert.equal((await invoke(micro, users[0].token, body(ids[0], false))).status, 200);
  const first = await invoke(navigation, users[0].token);
  assert.equal(first.status, 200); assert.deepEqual(first.result.path.map((item: { nodeId: string }) => item.nodeId), ids.slice(0, 3));
  assert.equal(first.result.nextAction.nodeId, ids[1]);
  const other = await invoke(navigation, users[1].token);
  assert.equal(other.status, 200); assert.deepEqual(other.result.path.map((item: { nodeId: string }) => item.nodeId), [ids[2]]);
  for (const action of ['start', 'complete-step']) {
    const forged = await invoke(micro, users[0].token, { ...body(ids[3]), action, bridge: true, routeNodeIds: ids, userId: users[1].id });
    assert.equal(forged.status, 400, JSON.stringify(forged.result));
    const crossUser = await invoke(micro, users[1].token, { ...body(ids[1]), action });
    assert.equal(crossUser.status, 400);
  }
  const blocked = await invoke(micro, users[0].token, { ...body(ids[2]), action: 'start' });
  assert.equal(blocked.status, 403);
  assert.equal((await invoke(micro, users[0].token, { ...body(ids[1]), action: 'start' })).status, 200);
  const completed = await invoke(micro, users[0].token, body(ids[1]));
  assert.equal(completed.status, 200, JSON.stringify(completed.result)); assert.equal(completed.result.completed, true);
  const next = await invoke(navigation, users[0].token); assert.equal(next.result.nextAction.nodeId, ids[2]);
  assert.equal((await invoke(micro, users[0].token, body(ids[2]))).status, 200);
  const rows = await server.from('curriculum_coverages').select('node_id').eq('course_id', courseId); assert.deepEqual(rows.data, [{ node_id: ids[2] }]);
  const own = await users[0].client.from('user_knowledge_states').select('status').eq('node_id', ids[1]); assert.deepEqual(own.data, [{ status: 'learned' }]);
  const isolated = await users[1].client.from('user_knowledge_states').select('*').eq('node_id', ids[1]); assert.deepEqual(isolated.data, []);
  const rpcArgs = { p_user_id: users[1].id, p_path_id: `${ids[1]}-path`, p_unit_id: `${ids[1]}-unit`, p_step_id: `${ids[1]}-step`, p_context_course_id: courseId, p_key: 'forged-attempt', p_response: null, p_correct: true, p_outcome: 'observed', p_step_hash: 'forged', p_duration: null, p_decision_id: null, p_expected_step: {}, p_route_node_ids: ids };
  for (const client of [users[0].client, createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!)]) {
    const rpc = await client.rpc('record_micro_step_attempt_for_route', rpcArgs); assert.ok(rpc.error); assert.equal(rpc.error.code, '42501');
  }
  console.log('Personal route local acceptance passed: formal Current → bridge start/complete → Course complete; Navigation refresh; forged membership rejection; two-user isolation; unchanged coverage; anon/authenticated RPC denial.');
} finally {
  for (const user of users) await server.auth.admin.deleteUser(user.id);
  await server.from('courses').delete().eq('id', courseId);
  await server.from('micro_learning_paths').delete().in('knowledge_id', ids);
  await server.from('knowledge_edges').delete().in('source_node_id', ids);
  execFileSync('docker', ['exec', '-i', 'supabase_db_EduFlow', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: `begin; delete from knowledge_node_revisions where node_id in (${ids.map(id => `'${id}'`).join(',')}); delete from knowledge_nodes where id in (${ids.map(id => `'${id}'`).join(',')}); commit;`, stdio: ['pipe', 'pipe', 'pipe'] });
}

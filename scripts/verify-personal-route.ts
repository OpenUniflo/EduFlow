import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import micro from '../api/_handlers/micro';
import navigation from '../api/_handlers/navigation';
import routePlan from '../api/_handlers/route-plan';
import { assertLocalSupabaseUrl } from './local-supabase';

const url = assertLocalSupabaseUrl(process.env.SUPABASE_URL!);
const server = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const prefix = `route-acceptance-${randomUUID()}`;
const courseId = `${prefix}-course`;
const ids = ['a', 'b', 'z', 'unrelated', 'soft', 'soft-hard', 'enabled'].map(id => `${prefix}-${id}`);
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
  await write('knowledge_edges', [{ id: `${prefix}-optional`, source_node_id: ids[4], target_node_id: ids[2], relation: 'prerequisite', reason: 'Optional local fact', prerequisite_strength: 'soft' }, { id: `${prefix}-optional-hard`, source_node_id: ids[5], target_node_id: ids[4], relation: 'prerequisite', reason: 'Required local fact', prerequisite_strength: 'hard' }]);
  await write('knowledge_edges', [[ids[0], ids[5]], [ids[0], ids[6]], [ids[6], ids[2]], [ids[3], ids[1]], [ids[1], ids[0]]].map(([source, target], i) => ({ id: `${prefix}-enables-${i}`, source_node_id: source, target_node_id: target, relation: 'enables', reason: 'Explicit local execution support, not a learning prerequisite', associative_strength: .8 })));
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
  // A supplied unavailable hard source must preserve an explicit failed default V1.
  await server.from('knowledge_nodes').update({ status: 'deprecated' }).eq('id', ids[1]);
  const failedInitial = await invoke(routePlan, users[1].token);
  assert.equal(failedInitial.status, 200);
  assert.equal(failedInitial.result.plan.valid, false);
  assert.equal(failedInitial.result.activeVersion.snapshot.valid, false);
  assert.ok(failedInitial.result.activeVersion.snapshot.conflicts.length);
  const failedId = failedInitial.result.activeVersion.id;
  assert.equal((await invoke(routePlan, users[1].token)).result.activeVersion.id, failedId);
  const repairPreview = await invoke(routePlan, users[1].token, { action: 'preview', includeNodeIds: [], excludeNodeIds: [ids[2]] });
  assert.equal(repairPreview.result.plan.valid, true);
  const repaired = await invoke(routePlan, users[1].token, { action: 'adopt', baseVersionId: failedId, includeNodeIds: [], excludeNodeIds: [ids[2]] });
  assert.equal(repaired.status, 200); assert.equal(repaired.result.activeVersion.versionNumber, 2);
  await server.from('knowledge_nodes').update({ status: 'active' }).eq('id', ids[1]);
  const restoredDefault = await invoke(routePlan, users[1].token, { action: 'restore', baseVersionId: repaired.result.activeVersion.id, versionId: failedId });
  assert.equal(restoredDefault.status, 200); assert.equal(restoredDefault.result.activeVersion.versionNumber, 3);
  assert.equal(restoredDefault.result.activeVersion.snapshot.valid, true);
  const oldFailed = await server.from('personal_course_route_versions').select('snapshot').eq('id', failedId).single();
  assert.equal(oldFailed.data!.snapshot.valid, false);
  const initialRace = await Promise.all([invoke(routePlan, users[0].token), invoke(routePlan, users[0].token)]);
  assert.equal(initialRace[0].result.activeVersion.id, initialRace[1].result.activeVersion.id);
  // Current capability comes from the formal standalone Micro completion path, not a state UPDATE.
  const body = (id: string, course = true) => ({ action: 'complete-step', pathId: `${id}-path`, unitId: `${id}-unit`, stepId: `${id}-step`, ...(course ? { contextCourseId: courseId } : {}), idempotencyKey: `${id}-attempt` });
  assert.equal((await invoke(micro, users[0].token, body(ids[0], false))).status, 200);
  const first = await invoke(navigation, users[0].token);
  assert.equal(first.status, 200); assert.deepEqual(first.result.path.map((item: { nodeId: string }) => item.nodeId), ids.slice(0, 3));
  assert.equal(first.result.nextAction.nodeId, ids[1]);
  const supported = await invoke(routePlan, users[0].token);
  assert.ok(supported.result.model.bridgeKnowledgeIds.includes(ids[6]));
  assert.ok(supported.result.model.supportEdges.some((edge: { relation: string }) => edge.relation === 'enables'));
  assert.ok(!supported.result.plan.route.selectedNodeIds.includes(ids[6]));
  const enabledInclude = await invoke(routePlan, users[0].token, { action: 'preview', includeNodeIds: [ids[6]], excludeNodeIds: [ids[3]] });
  assert.equal(enabledInclude.result.plan.valid, true);
  assert.ok(enabledInclude.result.plan.route.selectedNodeIds.includes(ids[6]));
  assert.ok(!enabledInclude.result.plan.route.selectedNodeIds.includes(ids[3]));
  const enabledExclude = await invoke(routePlan, users[0].token, { action: 'preview', includeNodeIds: [], excludeNodeIds: [ids[6]] });
  assert.equal(enabledExclude.result.plan.valid, true);
  assert.equal((await invoke(routePlan, users[0].token)).result.activeVersion.id, supported.result.activeVersion.id);
  const other = await invoke(navigation, users[1].token);
  assert.equal(other.status, 200); assert.deepEqual(other.result.path.map((item: { nodeId: string }) => item.nodeId), ids.slice(0, 3));
  for (const action of ['start', 'complete-step']) {
    const forged = await invoke(micro, users[0].token, { ...body(ids[3]), action, bridge: true, routeNodeIds: ids, userId: users[1].id });
    assert.equal(forged.status, 400, JSON.stringify(forged.result));
    const crossUser = await invoke(micro, users[1].token, { ...body(ids[1]), action });
    assert.equal(crossUser.status, 403);
  }
  const hardConflict = await invoke(routePlan, users[0].token, { action: 'preview', includeNodeIds: [], excludeNodeIds: [ids[0]] });
  assert.equal(hardConflict.result.plan.valid, false);
  assert.equal(hardConflict.result.plan.conflicts[0].nodeId, ids[0]);
  const softSkipped = await invoke(routePlan, users[0].token, { action: 'preview', includeNodeIds: [], excludeNodeIds: [ids[4]] });
  assert.equal(softSkipped.result.plan.valid, true);
  const blocked = await invoke(micro, users[0].token, { ...body(ids[2]), action: 'start' });
  assert.equal(blocked.status, 403);
  assert.equal((await invoke(micro, users[0].token, { ...body(ids[1]), action: 'start' })).status, 200);
  const completed = await invoke(micro, users[0].token, body(ids[1]));
  assert.equal(completed.status, 200, JSON.stringify(completed.result)); assert.equal(completed.result.completed, true);
  const next = await invoke(navigation, users[0].token); assert.equal(next.result.nextAction.nodeId, ids[2]);
  const rows = await server.from('curriculum_coverages').select('node_id').eq('course_id', courseId); assert.deepEqual(rows.data, [{ node_id: ids[2] }]);
  const own = await users[0].client.from('user_knowledge_states').select('status').eq('node_id', ids[1]); assert.deepEqual(own.data, [{ status: 'learned' }]);
  const isolated = await users[1].client.from('user_knowledge_states').select('*').eq('node_id', ids[1]); assert.deepEqual(isolated.data, []);
  const rpcArgs = { p_user_id: users[1].id, p_path_id: `${ids[1]}-path`, p_unit_id: `${ids[1]}-unit`, p_step_id: `${ids[1]}-step`, p_context_course_id: courseId, p_key: 'forged-attempt', p_response: null, p_correct: true, p_outcome: 'observed', p_step_hash: 'forged', p_duration: null, p_decision_id: null, p_expected_step: {}, p_route_node_ids: ids };
  for (const client of [users[0].client, createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!)]) {
    const rpc = await client.rpc('record_micro_step_attempt_v2', { ...rpcArgs, p_expected_version_id: null }); assert.ok(rpc.error); assert.equal(rpc.error.code, '42501');
  }
  const view = await invoke(routePlan, users[0].token);
  assert.equal(view.status, 200, JSON.stringify(view.result));
  const v1 = view.result.activeVersion;
  assert.equal(v1.versionNumber, 1);
  assert.equal((await invoke(routePlan, users[0].token)).result.activeVersion.id, v1.id);
  const history = () => server.from('personal_course_route_versions').select('*').eq('user_id', users[0].id).eq('course_id', courseId).order('version_number');
  const preview = await invoke(routePlan, users[0].token, { action: 'preview', includeNodeIds: [ids[4]], excludeNodeIds: [] });
  assert.equal(preview.result.plan.valid, true);
  assert.ok(preview.result.plan.route.selectedNodeIds.includes(ids[5]));
  assert.equal((await history()).data!.length, 1);
  const overlap = await invoke(routePlan, users[0].token, { action: 'preview', includeNodeIds: [ids[4]], excludeNodeIds: [ids[4]] });
  assert.equal(overlap.result.plan.valid, false);
  for (const field of ['selectedNodeIds', 'orderedNodeIds', 'bridgeNodeIds', 'userId']) {
    assert.equal((await invoke(routePlan, users[0].token, { action: 'adopt', baseVersionId: v1.id, includeNodeIds: [], excludeNodeIds: [], [field]: ids })).status, 400);
  }
  assert.equal((await invoke(routePlan, users[0].token, { action: 'adopt', baseVersionId: v1.id, includeNodeIds: [ids[3]], excludeNodeIds: [] })).status, 422);
  const adopt = { action: 'adopt', baseVersionId: v1.id, includeNodeIds: [ids[4]], excludeNodeIds: [] };
  const racing = await Promise.all([invoke(routePlan, users[0].token, adopt), invoke(routePlan, users[0].token, adopt)]);
  assert.deepEqual(racing.map(r => r.status).sort(), [200, 409], JSON.stringify(racing.map(r => ({ status: r.status, error: r.result.error }))));
  const v2 = racing.find(r => r.status === 200)!.result.activeVersion;
  assert.equal(v2.versionNumber, 2); assert.equal(v2.parentVersionId, v1.id);
  const afterAdopt = await invoke(navigation, users[0].token);
  assert.ok(afterAdopt.result.path.some((r: { nodeId: string }) => r.nodeId === ids[5]));
  const oldSnapshots = JSON.stringify((await history()).data);
  const restore = await invoke(routePlan, users[0].token, { action: 'restore', baseVersionId: v2.id, versionId: v1.id });
  assert.equal(restore.status, 200, JSON.stringify(restore.result));
  const v3 = restore.result.activeVersion;
  assert.equal(v3.versionNumber, 3); assert.equal(v3.source, 'restore'); assert.equal(v3.restoredFromVersionId, v1.id);
  assert.equal(JSON.stringify((await history()).data!.slice(0, 2)), oldSnapshots);
  assert.equal((await invoke(micro, users[0].token, { ...body(ids[4]), action: 'start' })).status, 400);
  // Keep an unfinished target while testing V2.1 current-gap Include. Complete it
  // after restoring empty constraints, then prove learning creates no version.
  assert.equal((await invoke(micro, users[0].token, body(ids[2]))).status, 200);
  assert.equal((await invoke(routePlan, users[0].token)).result.activeVersion.id, v3.id);
  const v4 = await invoke(routePlan, users[0].token, { action: 'adopt', baseVersionId: v3.id, includeNodeIds: [], excludeNodeIds: [ids[2], ids[4]] });
  assert.equal(v4.status, 200, JSON.stringify(v4.result));
  assert.equal(v4.result.activeVersion.versionNumber, 4);
  const emptyNav = await invoke(navigation, users[0].token);
  assert.equal(emptyNav.status, 200); assert.deepEqual(emptyNav.result.path, []);
  assert.equal((await invoke(micro, users[0].token, { ...body(ids[2]), action: 'start' })).status, 400);
  const staleMicro = await server.rpc('start_micro_for_route_v2', { p_user_id: users[0].id, p_path_id: `${ids[2]}-path`, p_context_course_id: courseId, p_expected_version_id: v1.id, p_route_node_ids: ids });
  assert.equal(staleMicro.error?.code, 'PT409');
  const ownVersions = await users[1].client.from('personal_course_route_versions').select('*').eq('user_id', users[0].id);
  assert.deepEqual(ownVersions.data, []);
  const forgedApply = await users[0].client.rpc('adopt_personal_course_route', { p_user_id: users[1].id, p_course_id: courseId, p_base_version_id: null, p_source: 'initial', p_include_node_ids: [], p_exclude_node_ids: [], p_snapshot: {}, p_structure_fingerprint: 'forged', p_restored_from_version_id: null });
  assert.equal(forgedApply.error?.code, '42501');
  const mutate = await server.from('personal_course_route_versions').update({ snapshot: {} }).eq('id', v1.id);
  assert.equal(mutate.error?.code, '42501');
  const state = await server.from('user_knowledge_states').select('status').eq('user_id', users[0].id).eq('node_id', ids[2]).single();
  assert.ok(['learned','practicing','mastered'].includes(state.data!.status));
  console.log('V2 local acceptance passed: hard-only route/Micro, optional Include hard closure, immutable versions, Preview no write, concurrency 409, restore new version, empty goals, excluded member and stale Micro rejection, user isolation/RPC denial, unchanged learning and coverage.');

} finally {
  for (const user of users) await server.auth.admin.deleteUser(user.id);
  await server.from('courses').delete().eq('id', courseId);
  await server.from('micro_learning_paths').delete().in('knowledge_id', ids);
  await server.from('knowledge_edges').delete().in('source_node_id', ids);
  execFileSync('docker', ['exec', '-i', 'supabase_db_EduFlow', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: `begin; delete from knowledge_node_revisions where node_id in (${ids.map(id => `'${id}'`).join(',')}); delete from knowledge_nodes where id in (${ids.map(id => `'${id}'`).join(',')}); commit;`, stdio: ['pipe', 'pipe', 'pipe'] });
}

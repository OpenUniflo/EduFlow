/** Authorized Hosted V2 acceptance; no fixture/catalog edits or new completion evidence.
 * Administrator route versions are appended/restored and a completed Micro is reopened.
 * Logs only redacted assertions. Credentials are supplied at runtime, never saved.
 * GET lazily initializes routes if absent; ordinary learner tests are read/Preview/rejected writes.
 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const preview = process.env.ACCEPTANCE_PREVIEW_URL!;
const supabase = process.env.ACCEPTANCE_SUPABASE_URL!;
const key = process.env.ACCEPTANCE_PUBLISHABLE_KEY!;
assert.match(new URL(preview).hostname, /^edu-flow-.*\.vercel\.app$/);
assert.equal(new URL(supabase).hostname, 'uyljtdbvlivxniililay.supabase.co');
const course = 'ai-agents-in-depth';
const route = `/api/learner?resource=route-plan&courseId=${course}`;
const results: unknown[] = [];
async function login(role: 'LEARNER' | 'ADMIN') {
  const response = await fetch(`${supabase}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env[`ACCEPTANCE_${role}_EMAIL`], password: process.env[`ACCEPTANCE_${role}_PASSWORD`] }) });
  assert.equal(response.status, 200, `${role} authentication`);
  const body = await response.json(); return { token: body.access_token as string, userId: body.user.id as string };
}
async function request(token: string, path: string, body?: unknown, direct = false, method?: string) {
  const response = await fetch(`${direct ? supabase : preview}${path}`, { method: method ?? (body ? 'POST' : 'GET'), headers: { Authorization: `Bearer ${token}`, apikey: key, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json(); return { status: response.status, body: value };
}
function check(name: string, response: { status: number; body: any }, expected: number) { assert.equal(response.status, expected, name); results.push({ name, status: response.status, code: response.body.error?.code ?? response.body.code, conflicts: response.body.error?.details?.conflicts }); }
const learner = await login('LEARNER'), admin = await login('ADMIN');
const initial = await request(learner.token, route); check('current route', initial, 200);
const base = initial.body.activeVersion.id;
const administrator = await request(admin.token, route); check('administrator separate current route', administrator, 200);
assert.notEqual(administrator.body.activeVersion.id, base);
for (const field of ['selectedNodeIds', 'orderedNodeIds', 'bridgeNodeIds', 'userId']) {
  check(`forged ${field}`, await request(learner.token, route, { action: 'adopt', baseVersionId: base, includeNodeIds: [], excludeNodeIds: [], [field]: field === 'userId' ? admin.userId : ['A01'] }), 400);
}
check('null-base adoption rejected', await request(learner.token, route, { action: 'adopt', baseVersionId: null, includeNodeIds: [], excludeNodeIds: [] }), 400);
const outside = await request(learner.token, route, { action: 'preview', includeNodeIds: ['nonexistent-hosted-attack'], excludeNodeIds: [] });
check('outside-model preview', outside, 200); assert.equal(outside.body.plan.valid, false); assert.ok(outside.body.plan.conflicts.length);
// Administrator base remains stable while the ordinary user exercises the UI.
check('outside-model adoption', await request(admin.token, route, { action: 'adopt', baseVersionId: administrator.body.activeVersion.id, includeNodeIds: ['nonexistent-hosted-attack'], excludeNodeIds: [] }), 422);
check('restore another users version', await request(admin.token, route, { action: 'restore', baseVersionId: administrator.body.activeVersion.id, versionId: base }), 404);
const hidden = await request(learner.token, `/rest/v1/personal_course_route_versions?id=eq.${administrator.body.activeVersion.id}&select=id`, undefined, true);
check('RLS other-user history hidden', hidden, 200); assert.deepEqual(hidden.body, []);
check('direct history mutation denied', await request(learner.token, `/rest/v1/personal_course_route_versions?id=eq.${base}`, { source: 'restore' }, true, 'PATCH'), 403);
check('direct adoption RPC denied', await request(learner.token, '/rest/v1/rpc/adopt_personal_course_route', { p_user_id: learner.userId, p_course_id: course, p_base_version_id: base, p_source: 'adjustment', p_include_node_ids: [], p_exclude_node_ids: [], p_snapshot: {}, p_structure_fingerprint: 'forged', p_restored_from_version_id: null }, true), 403);
check('direct Micro RPC denied', await request(learner.token, '/rest/v1/rpc/start_micro_for_route_v2', { p_user_id: learner.userId, p_path_id: 'aiad-l1-agc02', p_context_course_id: course, p_expected_version_id: base, p_route_node_ids: ['AGC02'] }, true), 403);
// Hosted hard gate uses an existing published Micro whose hard prerequisite is unmet.
check('hard prerequisite denies actual Micro', await request(admin.token, '/api/micro', { action: 'start', pathId: 'cds525-k012-learning-rate', contextCourseId: 'cds525-deep-learning' }), 403);
const emptyIntent = { includeNodeIds: [], excludeNodeIds: administrator.body.model.courseKnowledgeIds };
const emptyPreview = await request(admin.token, route, { action: 'preview', ...emptyIntent });
check('empty commitment preview', emptyPreview, 200); assert.equal(emptyPreview.body.plan.valid, true); assert.deepEqual(emptyPreview.body.plan.route.selectedNodeIds, []);
const empty = await request(admin.token, route, { action: 'adopt', baseVersionId: administrator.body.activeVersion.id, ...emptyIntent });
check('empty commitment adopted', empty, 200);
const emptyNavigation = await request(admin.token, `/api/navigation?courseId=${course}`);
check('empty Navigation without curriculum fallback', emptyNavigation, 200); assert.deepEqual(emptyNavigation.body.path, []); assert.equal(emptyNavigation.body.nextAction.reasonCode, 'course_route_empty');
check('excluded covered node cannot start Micro', await request(admin.token, '/api/micro', { action: 'start', pathId: 'aiad-l1-agc02', contextCourseId: course, selectedNodeIds: ['AGC02'] }), 400);
check('stale administrator adoption', await request(admin.token, route, { action: 'adopt', baseVersionId: administrator.body.activeVersion.id, includeNodeIds: [], excludeNodeIds: [] }), 409);
const restored = await request(admin.token, route, { action: 'restore', baseVersionId: empty.body.activeVersion.id, versionId: administrator.body.activeVersion.id });
check('administrator restore appends version', restored, 200); assert.equal(restored.body.activeVersion.restoredFromVersionId, administrator.body.activeVersion.id); assert.equal(restored.body.activeVersion.versionNumber, empty.body.activeVersion.versionNumber + 1);
const nav = await request(admin.token, `/api/navigation?courseId=${course}`); check('restored Navigation', nav, 200);
assert.equal(nav.body.recommendationVersion, nav.body.recommendationPolicy === 'rule_v1' ? 'rule-v1-hard-only-v2' : 'fixed-course-rule-v6-v1');
// Existing catalog: A01 -> A02 is soft; A01 is not acquired, A02 is already completed.
// Reopen validates admission, not a new-learning claim; keep all prior completion/evidence.
const softState = await request(admin.token, `/rest/v1/user_knowledge_states?user_id=eq.${admin.userId}&node_id=eq.A01&select=status`, undefined, true);
assert.ok(!softState.body.some((row: any) => ['learned','practicing','mastered'].includes(row.status)));
const softRoute = await request(admin.token, route, { action: 'adopt', baseVersionId: restored.body.activeVersion.id, includeNodeIds: ['A01'], excludeNodeIds: [] });
check('include unmet real soft source', softRoute, 200);
assert.ok(softRoute.body.plan.route.prerequisiteEdges.some((edge: any) => edge.source === 'A01' && edge.target === 'A02' && edge.strength === 'soft'));
check('unmet selected soft source allows existing Micro reopen', await request(admin.token, '/api/micro', { action: 'start', pathId: 'aiad-l1-a02', contextCourseId: course }), 200);
check('administrator constraints restored after soft admission test', await request(admin.token, route, { action: 'restore', baseVersionId: softRoute.body.activeVersion.id, versionId: administrator.body.activeVersion.id }), 200);
const record = { preview, capturedAt: new Date().toISOString(), scope: 'Hosted HTTP + authenticated REST; administrator route adjustments restored; already-completed A02 reopened for soft admission; no catalog or evidence writes', results };
writeFileSync('.acceptance/project-capability-v2-hosted-api.json', JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ passed: results.length, preview }));

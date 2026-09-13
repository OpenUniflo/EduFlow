import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import microHandler from '../api/_handlers/micro';
import navigationHandler from '../api/_handlers/navigation';
import { estimateCriterionState } from '../src/shared/learning/criterionState';
import { microCriterionEvidence } from '../api/_lib/learningData';
import { assertLocalSupabaseUrl } from './local-supabase';

type Handler = typeof microHandler;
const required = (name: string) => { const value = process.env[name]; assert.ok(value, `${name} required`); return value; };
const url = assertLocalSupabaseUrl(required('SUPABASE_URL'));
const server = createClient(url, required('SUPABASE_SECRET_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
const browser = createClient(url, required('VITE_SUPABASE_PUBLISHABLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
const courseId = 'ai-agents-in-depth';
const createdUsers: string[] = [];
async function invoke(handler: Handler, method: string, token: string | undefined, body?: unknown, query: Record<string,string> = {}, expected = 200) {
  let status = 200; let payload: any;
  const response = { status(code: number) { status = code; return response; }, json(value: unknown) { payload = value; return response; }, setHeader() {} } as unknown as VercelResponse;
  await handler({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, body, query } as unknown as VercelRequest, response);
  assert.equal(status, expected, JSON.stringify(payload)); return payload;
}
async function createUser(admin = false) {
  const suffix = randomUUID(); const email = `learning-data-${suffix}@eduflow.local`; const password = `Local-${suffix}-Aa1!`;
  const result = await server.auth.admin.createUser({ email, password, email_confirm: true }); assert.ifError(result.error);
  const id = result.data.user!.id; createdUsers.push(id);
  const profile = await server.from('profiles').upsert({ id, role: admin ? 'admin' : 'student', display_name: 'Learning data acceptance' }); assert.ifError(profile.error);
  const login = await browser.auth.signInWithPassword({ email, password }); assert.ifError(login.error);
  return { id, token: login.data.session!.access_token };
}
const previousPolicy = await server.from('course_recommendation_policies').select('*').eq('course_id', courseId).maybeSingle(); assert.ifError(previousPolicy.error);
try {
  const learner = await createUser(); const admin = await createUser(true);
  const ownerClient = createClient(url, required('VITE_SUPABASE_PUBLISHABLE_KEY'), { global: { headers: { Authorization: `Bearer ${learner.token}` } }, auth: { persistSession: false } });
  const other = await createUser();
  const setPolicy = (policyKey: string) => invoke(navigationHandler, 'POST', admin.token, { policyKey }, { courseId });
  const plan = () => invoke(navigationHandler, 'GET', learner.token, undefined, { courseId });
  const state = (cutoff?: number) => invoke(microHandler, 'GET', learner.token, undefined, { view: 'learning-data', ...(cutoff === undefined ? {} : { throughSequence: String(cutoff) }) });
  await invoke(navigationHandler, 'GET', undefined, undefined, { courseId }, 401);
  await invoke(microHandler, 'GET', undefined, undefined, { view: 'learning-data' }, 401);
  await invoke(navigationHandler, 'POST', learner.token, { policyKey: 'rule_v1' }, { courseId }, 403);
  await setPolicy('fixed');
  const initial = await plan(); assert.equal(initial.recommendationPolicy, 'fixed'); assert.equal(initial.nextAction.nodeId, 'A02');
  assert.ok(initial.criterionStates.every((s: any) => s.attainment === 'unknown'));
  const paths = (await invoke(microHandler, 'GET', learner.token)).paths;
  const source = (id: string) => { const path = paths.find((p: any) => p.id === id); assert.ok(path, `Missing real path ${id}`); return path; };
  const answer = (step: any) => {
    const i = step.interaction; if (!i) return undefined;
    if (i.type === 'choice') return i.options[i.correctIndex];
    if (i.type === 'categorize') return i.correctCategories;
    if (i.type === 'flow-execution') return { kind: 'flow', edgeIds: i.correctEdgeIds ?? i.initialEdgeIds, executed: i.events.length };
    throw new Error(`Unsupported Golden interaction ${i.type}`);
  };
  const submit = (path: any, unit: any, step: any, submission: unknown, decisionId?: string, idempotencyKey = randomUUID(), token = learner.token, expected = 200) =>
    invoke(microHandler, 'POST', token, { action: 'complete-step', pathId: path.id, unitId: unit.id, stepId: step.id, contextCourseId: courseId, submission, decisionId, idempotencyKey }, {}, expected);
  const finish = async (id: string, decisionId?: string) => {
    const path = source(id);
    await invoke(microHandler, 'POST', learner.token, { action: 'start', pathId: id, contextCourseId: courseId });
    for (const unit of path.units) for (const step of unit.steps) assert.equal((await submit(path, unit, step, answer(step), decisionId)).correct, true);
  };
  // A real initial action produces both observed instruction and evaluated performance.
  await finish('aiad-l1-a02', initial.decisionId);
  let data = await state();
  const a02 = data.states.find((s: any) => s.criterionId === 'criterion-agent-component-roles');
  assert.equal(a02.attainment, 'developing'); assert.equal(a02.stability, 'unknown'); assert.equal(a02.evidenceCount, 1);
  assert.equal(data.attempts.filter((a: any) => a.outcome === 'observed').every((a: any) => a.criterion_refs.length === 0), true);
  const afterA02 = await plan();
  await finish('aiad-l1-agc01', afterA02.nextAction.resourceId === 'aiad-l1-agc01' ? afterA02.decisionId : undefined);
  // This is a legal manual action on a real later candidate, not a fabricated learner state.
  const beforeFailure = await plan();
  assert.ok(beforeFailure.candidates.some((c: any) => c.resourceId === 'aiad-l1-agc03'));
  assert.notEqual(beforeFailure.nextAction.resourceId, 'aiad-l1-agc03', 'Golden needs a genuine earlier Fixed frontier');
  const path = source('aiad-l1-agc03'); const unit = path.units[0]; const step = unit.steps.find((s: any) => s.id === 'aiad-l1-agc03-s4'); assert.ok(step);
  await invoke(microHandler,'POST',learner.token,{action:'start',pathId:path.id,contextCourseId:courseId});
  for (const before of unit.steps.slice(0,unit.steps.indexOf(step))) assert.equal((await submit(path,unit,before,answer(before))).correct,true);
  const bad = step.interaction.options.find((option: string) => option !== answer(step));
  const key = randomUUID();
  const concurrent = await Promise.all([submit(path, unit, step, bad, undefined, key), submit(path, unit, step, bad, undefined, key)]);
  const failed = concurrent[0]; assert.equal(failed.correct, false);
  assert.equal(concurrent[1].attemptId, failed.attemptId, 'Concurrent retries create one immutable fact');
  const duplicate = await submit(path, unit, step, bad, undefined, key); assert.equal(duplicate.attemptId, failed.attemptId); assert.equal(duplicate.duplicate, true);
  await submit(path, unit, step, answer(step), undefined, key, learner.token, 409);
  const fixed = await plan();
  await setPolicy('rule_v1'); const rule = await plan();
  assert.deepEqual(rule.candidates, fixed.candidates); assert.notEqual(rule.selectedAction.resourceId, fixed.selectedAction.resourceId);
  assert.equal(rule.selectedAction.resourceId, path.id); assert.equal(rule.nextAction.reasonCode, 'criterion_insufficient');
  assert.equal((await plan()).decisionId, rule.decisionId);
  // Reject another learner's decision and mismatched resources before inserting anything.
  await submit(path, unit, step, answer(step), rule.decisionId, randomUUID(), other.token, 403);
  const passed = await submit(path, unit, step, answer(step), rule.decisionId); assert.equal(passed.correct, true);
  data = await state(passed.evidenceSequence);
  const after = data.states.find((s: any) => s.criterionId === 'criterion-agent-model-selection');
  assert.equal(after.attainment, 'developing'); assert.equal(after.stability, 'improving');
  const attempt = data.attempts.find((a: any) => a.id === passed.attemptId); assert.equal(attempt.decision_id, rule.decisionId);
  const history = await server.from('navigation_decisions').select('*').eq('id', rule.decisionId).single(); assert.ifError(history.error);
  const factsBefore = microCriterionEvidence(data.attempts.filter((a: any) => a.sequence <= history.data!.evidence_cutoff));
  assert.deepEqual(history.data!.state_snapshot, rule.criterionStates);
  for (const snapshot of history.data!.state_snapshot) assert.deepEqual(estimateCriterionState(snapshot, factsBefore), snapshot);
  assert.deepEqual((await state(failed.evidenceSequence)).states.find((s: any) => s.criterionId === after.criterionId).attainment, 'insufficient');
  const replay = await invoke(microHandler, 'GET', learner.token, undefined, { view: 'learning-data', decisionId: rule.decisionId });
  assert.deepEqual(replay.states, rule.criterionStates);
  await invoke(microHandler, 'GET', other.token, undefined, { view: 'learning-data', decisionId: rule.decisionId }, 404);
  const forgedState = await ownerClient.from('user_knowledge_states').upsert({ user_id: learner.id, node_id: 'AGC03', status: 'mastered' }); assert.ok(forgedState.error);
  const forgedProgress = await ownerClient.from('user_micro_path_progress').update({ status: 'completed' }).eq('user_id', learner.id); assert.ok(forgedProgress.error);
  const forgedEvidence = await ownerClient.from('knowledge_evidence').insert({ user_id: learner.id, node_id: 'AGC03', source_type: 'micro', source_id: path.id }); assert.ok(forgedEvidence.error);
  const assignment = await server.from('course_assignments').select('id').eq('course_id', courseId).limit(1).single(); assert.ifError(assignment.error);
  const forgedAccepted = await ownerClient.from('user_assignment_states').upsert({ user_id: learner.id, course_id: courseId, assignment_id: assignment.data!.id, status: 'accepted' }); assert.ok(forgedAccepted.error);
  const forged = await ownerClient.from('micro_step_attempts').insert({ user_id: learner.id }); assert.ok(forged.error);
  const forgedPolicy = await ownerClient.from('course_recommendation_policies').upsert({ course_id: courseId, policy_key: 'rule_v1' }); assert.ok(forgedPolicy.error);
  const forgedDecision = await ownerClient.from('navigation_decisions').update({ reason_code: 'forged' }).eq('id', rule.decisionId);
  const decisionAfter = await server.from('navigation_decisions').select('reason_code').eq('id', rule.decisionId).single(); assert.ifError(decisionAfter.error);
  assert.equal(decisionAfter.data!.reason_code, 'criterion_insufficient'); assert.ok(forgedDecision.error || !forgedDecision.data);
  const otherData = await invoke(microHandler, 'GET', other.token, undefined, { view: 'learning-data' }); assert.equal(otherData.attempts.length, 0);
  const progression = await server.from('user_knowledge_states').select('node_id,status').eq('user_id', learner.id); assert.ifError(progression.error);
  assert.ok(progression.data!.every(row => row.status !== 'mastered'));
  console.log(JSON.stringify({ status: 'PASS', initialFixedDecision: initial.decisionId, fixedDecision: fixed.decisionId, ruleDecision: rule.decisionId,
    candidates: rule.candidates.map((c: any) => c.resourceId), fixedAction: fixed.selectedAction.resourceId, ruleAction: rule.selectedAction.resourceId,
    stateBefore: rule.criterionStates.find((s: any) => s.criterionId === after.criterionId), outcome: { attemptId: passed.attemptId, outcome: attempt.outcome, sequence: passed.evidenceSequence }, stateAfter: after }, null, 2));
} finally {
  const restored = previousPolicy.data ? await server.from('course_recommendation_policies').upsert(previousPolicy.data) : await server.from('course_recommendation_policies').delete().eq('course_id',courseId);
  assert.ifError(restored.error);
  for (const id of createdUsers.reverse()) { const removed = await server.auth.admin.deleteUser(id); assert.ifError(removed.error); }
}

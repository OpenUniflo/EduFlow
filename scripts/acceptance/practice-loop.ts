/** Real ordinary-user Practice result -> existing Evidence pipeline. Never seeds verdicts/state. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const mode = process.argv[2] ?? 'inspect';
const preview = process.env.ACCEPTANCE_PREVIEW_URL!;
assert.match(new URL(preview).hostname, /^edu-flow-.*\.vercel\.app$/);
const courseId = 'enterprise-vietnam-supply-collaboration';
const directory = '.acceptance/capability-evidence-action-loop/';
const clients = await Promise.all(['A', 'B'].map(async actor => {
  const client = createClient(process.env.ACCEPTANCE_SUPABASE_URL!, process.env.ACCEPTANCE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await client.auth.signInWithPassword({ email: process.env[`ACCEPTANCE_${actor}_EMAIL`]!, password: process.env[`ACCEPTANCE_${actor}_PASSWORD`]! }); assert.ifError(auth.error);
  return { client, token: auth.data.session!.access_token };
}));
async function call(actor: number, path: string, body?: unknown, status = 200) {
  const response = await fetch(preview + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${clients[actor].token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
}
async function rows(actor: number, table: string) { const result = await clients[actor].client.from(table).select('*').order(table === 'user_knowledge_states' ? 'node_id' : 'id'); assert.ifError(result.error); return result.data!; }
const current = await call(0, `/api/edge-actions?courseId=${courseId}`);
const run = current.runs.find((item: any) => item.status === 'completed' && item.evidence_source_id && item.execution_snapshot.action.type === 'practice_task');
assert.ok(run, 'Real browser must complete and upload Practice first');
const evidence = await call(0, '/api/evidence');
const source = evidence.sources.find((item: any) => item.id === run.evidence_source_id); assert.ok(source);
const snapshot = async () => ({ statesA: await rows(0, 'user_knowledge_states'), statesB: await rows(1, 'user_knowledge_states'), formalA: await rows(0, 'knowledge_evidence'), versions: await rows(0, 'personal_course_route_versions') });
const baselinePath = directory + 'practice-before-confirmation.json';
if (!existsSync(baselinePath)) {
  const before = await snapshot();
  assert.ok(!before.statesA.some(row => row.node_id === run.execution_snapshot.targetId && ['learned', 'practicing', 'mastered'].includes(row.status)), 'Target must not be acquired from Action completion');
  writeFileSync(baselinePath, JSON.stringify({ preview, run, source, ...before }, null, 2) + '\n');
}
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
assert.equal(baseline.run.id, run.id, 'Do not silently replace the accepted execution baseline');
if (mode === 'security' || mode === 'inspect') {
  const before = await snapshot();
  assert.equal((await clients[1].client.from('edge_action_runs').select('*').eq('id', run.id)).data?.length, 0);
  await call(1, '/api/edge-actions', { action: 'transition', runId: run.id, operation: 'submit', sourceId: source.id }, 404);
  await call(0, '/api/edge-actions', { action: 'transition', runId: run.id, operation: 'start', user_id: 'forged' }, 400);
  assert.ok((await clients[0].client.from('edge_action_runs').update({ status: 'completed' }).eq('id', run.id)).error);
  assert.ok((await clients[0].client.rpc('transition_edge_action_run', { p_user_id: run.user_id, p_run_id: run.id, p_operation: 'submit', p_source_id: source.id })).error);
  assert.ok((await clients[1].client.storage.from('user-evidence').download(source.storage_path)).error);
  const downloaded = await clients[0].client.storage.from('user-evidence').download(source.storage_path); assert.ifError(downloaded.error);
  assert.equal(createHash('sha256').update(new Uint8Array(await downloaded.data!.arrayBuffer())).digest('hex'), source.source_sha256);
  const repeats = await Promise.all([1, 2].map(() => call(0, '/api/edge-actions', { action: 'transition', runId: run.id, operation: 'submit', sourceId: source.id })));
  repeats.forEach(item => assert.deepEqual(item.run, run));
  assert.equal(source.provenance.actionRunId, run.id);
  assert.deepEqual(await snapshot(), before, 'Repeated result submission must not alter state, evidence or route history');
  writeFileSync(directory + 'practice-hosted-security.json', JSON.stringify({ preview, runId: run.id, sourceId: source.id, checks: ['B run read isolated', 'B transition404', 'owner spoof400', 'client PATCH denied', 'privileged RPC denied', 'B private Storage denied', 'A actual bytes match checksum', 'concurrent result submission returns same immutable run', 'source execution provenance', 'formal states/evidence/route rows unchanged'], verdict: 'PASS' }, null, 2) + '\n');
}
if (mode === 'diagnose') {
  const existing = evidence.runs.filter((item: any) => item.source_ids.includes(source.id));
  assert.equal(existing.length, 0, 'Retain existing diagnostics; do not retry semantic results');
  let outcome: unknown;
  try { outcome = await call(0, '/api/evidence', { action: 'diagnose', sourceIds: [source.id] }); }
  catch (error) { outcome = { error: error instanceof Error ? error.message : String(error) }; }
  const after = await call(0, '/api/evidence');
  const runs = after.runs.filter((item: any) => item.source_ids.includes(source.id));
  const ids = new Set(runs.map((item: any) => item.id));
  const result = { preview, actionRun: run, source, outcome, runs, units: after.units.filter((item: any) => ids.has(item.run_id)), proposals: after.proposals.filter((item: any) => ids.has(item.run_id)), stateAfter: await snapshot() };
  assert.deepEqual(result.stateAfter.statesA, baseline.statesA);
  assert.deepEqual(result.stateAfter.formalA, baseline.formalA);
  assert.deepEqual(result.stateAfter.versions, baseline.versions);
  writeFileSync(directory + 'practice-diagnosis.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ runIds: runs.map((item: any) => item.id), units: result.units.length, proposals: result.proposals.map((item: any) => ({ node: item.node_id, sufficiency: item.sufficiency, state: item.proposed_status })), outcome }));
} else console.log(JSON.stringify({ mode, actionRun: run.id, source: source.id, status: 'PASS', beforeConfirmationTargetNotAcquired: !baseline.statesA.some((row: any) => row.node_id === run.execution_snapshot.targetId && ['learned', 'practicing', 'mastered'].includes(row.status)) }));

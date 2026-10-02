/** Read-only Hosted support/gating audit. Env credentials never enter evidence. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateCourseIntegrity } from '../src/features/course/runtime/courseRuntime.js';
import { InMemoryKnowledgeRepository } from '../src/features/knowledge/repository/InMemoryKnowledgeRepository.js';
import { userKnowledgeAccess } from '../src/features/knowledge/repository/KnowledgeRepository.js';
import { auditProjectStructure } from '../src/shared/learning/projectStructureAudit.js';
const preview = process.env.ACCEPTANCE_PREVIEW_URL!;
const supabase = process.env.ACCEPTANCE_SUPABASE_URL!;
const key = process.env.ACCEPTANCE_PUBLISHABLE_KEY!;
assert.match(new URL(preview).hostname, /^edu-flow-.*\.vercel\.app$/);
assert.equal(new URL(supabase).hostname, 'uyljtdbvlivxniililay.supabase.co');
const courseId = 'ai-agents-in-depth';
const evidence: unknown[] = [];
for (const role of ['LEARNER', 'ADMIN']) {
  const login = await fetch(`${supabase}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env[`ACCEPTANCE_${role}_EMAIL`], password: process.env[`ACCEPTANCE_${role}_PASSWORD`] }) });
  assert.equal(login.status, 200, `${role} login`);
  const auth = await login.json();
  async function get(path: string, body?: unknown, direct = false) {
    const response = await fetch(`${direct ? supabase : preview}${path}`, { method: body ? 'POST' : 'GET', headers: { apikey: key, Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, 200, path.split('?')[0]); return response.json();
  }
  const path = `/api/learner?resource=route-plan&courseId=${courseId}`;
  const route = await get(path);
  const states = await get(`/rest/v1/user_knowledge_states?user_id=eq.${auth.user.id}&select=node_id,status`, undefined, true);
  let learningStatusesUnchanged: boolean | undefined;
  if (process.env.ACCEPTANCE_STATE_BASELINE) {
    const baseline = JSON.parse(readFileSync(process.env.ACCEPTANCE_STATE_BASELINE, 'utf8'));
    const normalize = (rows: Array<{ nodeId: string; status: string }>) => rows.map(row => `${row.nodeId}:${row.status}`).sort();
    assert.deepEqual(normalize(states.map((row: { node_id: string; status: string }) => ({ nodeId: row.node_id, status: row.status }))), normalize(baseline.states.filter((row: { userId: string }) => row.userId === auth.user.id)), 'Hosted acceptance preserves real learning statuses');
    learningStatusesUnchanged = true;
  }
  const acquired = new Set(states.filter((row: { status: string }) => ['learned','practicing','mastered'].includes(row.status)).map((row: { node_id: string }) => row.node_id));
  const model = route.model;
  const [{ graph }, { course: runtime }] = await Promise.all([get('/api/knowledge'), get(`/api/courses?id=${courseId}`)]);
  assert.equal(validateCourseIntegrity(runtime, new InMemoryKnowledgeRepository(graph), userKnowledgeAccess(auth.user.id)), true);
  const factualAudit = auditProjectStructure(model.courseKnowledgeIds, graph.edges, model.orderedNodeIds);

  assert.equal(model.courseKnowledgeIds.length, 116);
  assert.deepEqual([...model.currentKnowledgeIds].sort(), model.orderedNodeIds.filter((id: string) => acquired.has(id)).sort());
  assert.ok(model.supportEdges.some((edge: { relation: string }) => edge.relation === 'enables'));
  assert.ok(model.supportEdges.every((edge: { relation: string }) => edge.relation !== 'related'));
  const audit = auditProjectStructure(model.courseKnowledgeIds, model.supportEdges, model.orderedNodeIds);
  assert.deepEqual(audit.isolatedTargetIds, []);
  const withoutRecovery = await get(path, { action: 'preview', includeNodeIds: [], excludeNodeIds: ['RT14'] });
  assert.equal(withoutRecovery.plan.valid, true, 'enables cannot create an Exclude prerequisite conflict');
  assert.ok(withoutRecovery.plan.route.selectedNodeIds.includes('RT01'));
  assert.ok(!withoutRecovery.plan.route.selectedNodeIds.includes('RT14'));
  assert.ok(!withoutRecovery.plan.route.prerequisiteEdges.some((edge: { id: string }) => edge.id === 'knowledge-enables-rt14-rt01'));
  const historicalInclude = await get(path, { action: 'preview', includeNodeIds: ['A01'], excludeNodeIds: [] });
  assert.equal(historicalInclude.plan.valid, false);
  assert.ok(historicalInclude.plan.conflicts.some((conflict: { kind: string; nodeId: string }) => conflict.kind === 'include_outside_model' && conflict.nodeId === 'A01'));
  const history = await get(`/rest/v1/personal_course_route_versions?user_id=eq.${auth.user.id}&course_id=eq.${courseId}&select=*&order=version_number`, undefined, true);
  const digests = history.map((row: { id: string; version_number: number }) => ({ id: row.id, version: row.version_number, sha256: createHash('sha256').update(JSON.stringify(row)).digest('hex') }));
  const after = await get(path);
  assert.equal(after.activeVersion.id, route.activeVersion.id, 'read/preview must not create versions');
  evidence.push({ role, ...audit, learningStatusesUnchanged, relatedAuditOnlyCount: factualAudit.relatedEdgeCount, courseIntegrity: true, blue: model.currentKnowledgeIds.length,
    green: model.courseKnowledgeIds.filter((id: string) => !acquired.has(id)).length,
    gray: model.bridgeKnowledgeIds.filter((id: string) => !acquired.has(id)), blueTargets: model.courseKnowledgeIds.filter((id: string) => acquired.has(id)),
    activeVersion: route.activeVersion.versionNumber, historicalDigests: digests, excludeEnablesSourcePassed: true, historicalIncludeRejected: true });
}
const record = { preview, capturedAt: new Date().toISOString(), evidence };
writeFileSync(process.env.ACCEPTANCE_REPORT_PATH ?? '.acceptance/project-capability-v22-api-audit.json', JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record));

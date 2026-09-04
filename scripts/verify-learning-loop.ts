import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import learningHandler from "../api/_handlers/learning";
import navigationHandler from "../api/_handlers/navigation";
import microHandler from "../api/_handlers/micro";
import { assertLocalSupabaseUrl } from "./local-supabase";

type Handler = (request: VercelRequest, response: VercelResponse) => Promise<void> | void;
const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
async function invoke(handler: Handler, method: string, token: string, body?: unknown, query: Record<string, string> = {}, expectedStatus = 200) {
  let status = 200; let responseBody: any;
  const response = { status(code: number) { status = code; return response; }, json(value: unknown) { responseBody = value; return response; }, setHeader() { return response; } } as unknown as VercelResponse;
  await handler({ method, headers: { authorization: `Bearer ${token}` }, body, query } as unknown as VercelRequest, response);
  assert.equal(status, expectedStatus, JSON.stringify(responseBody));
  return responseBody;
}

const supabaseUrl = assertLocalSupabaseUrl(required("SUPABASE_URL"));
const server = createClient(supabaseUrl, required("SUPABASE_SECRET_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const browser = createClient(supabaseUrl, required("VITE_SUPABASE_PUBLISHABLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = randomUUID(); const email = `learning-loop-${suffix}@eduflow.local`; const password = `Loop-${suffix}-Aa1!`; let userId = "";
try {
  const created = await server.auth.admin.createUser({ email, password, email_confirm: true }); assert.ifError(created.error); userId = created.data.user!.id;
  const signedIn = await browser.auth.signInWithPassword({ email, password }); assert.ifError(signedIn.error); const token = signedIn.data.session!.access_token;
  const courseId = "ai-agents-in-depth"; const assignmentId = "book-v1-node-r10";
  const directWrite = await browser.rpc("record_assignment_attempt", { p_learner_user_id: userId, p_course_id: courseId, p_assignment_id: assignmentId, p_idempotency_key: `bypass-${suffix}`, p_response: { kind: "trace", selectedStepId: "skip-observation" }, p_outcome: "passed", p_score: 1, p_feedback: {}, p_evaluator_kind: "rule" });
  assert.ok(directWrite.error, "authenticated clients must not call the result-writing RPC directly");
  const microComplete=await invoke(microHandler,"POST",token,{action:"complete-step",pathId:"aiad-rt01-agent-loop",unitId:"aiad-rt01-agent-loop-unit",stepId:"aiad-rt01-trace",submission:"skip"});
  assert.equal(microComplete.correct,true);
  const membership=await server.from("user_course_states").select("is_active").eq("user_id",userId).eq("course_id",courseId).single();assert.ifError(membership.error);assert.equal(membership.data?.is_active,true,"direct Course Micro completion must activate membership");
  await invoke(learningHandler, "POST", token, { action: "start-assignment", courseId, assignmentId });
  const key = `attempt-${suffix}`;
  const failed = await invoke(learningHandler, "POST", token, { action: "submit-assignment", courseId, assignmentId, idempotencyKey: key, response: { kind: "trace", selectedStepId: "verify" } });
  assert.equal(failed.outcome, "failed"); assert.equal(failed.status, "needs_revision"); assert.equal(failed.duplicate, false);
  const duplicate = await invoke(learningHandler, "POST", token, { action: "submit-assignment", courseId, assignmentId, idempotencyKey: key, response: { kind: "trace", selectedStepId: "verify" } });
  assert.equal(duplicate.attemptId, failed.attemptId); assert.equal(duplicate.resultId, failed.resultId); assert.equal(duplicate.outcome, "failed"); assert.equal(duplicate.duplicate, true);
  await invoke(learningHandler, "POST", token, { action: "submit-assignment", courseId, assignmentId, idempotencyKey: key, response: { kind: "trace", selectedStepId: "skip-observation" } }, {}, 409);
  const remediation = await invoke(navigationHandler, "GET", token, undefined, { courseId });
  assert.equal(remediation.nextAction.kind, "remediation"); assert.equal(remediation.nextAction.nodeId, "R10");
  const sameDecision = await invoke(navigationHandler, "GET", token, undefined, { courseId });
  assert.equal(sameDecision.decisionId, remediation.decisionId, "identical state must reuse its persisted NavigationDecision");
  const passed = await invoke(learningHandler, "POST", token, { action: "submit-assignment", courseId, assignmentId, idempotencyKey: `retry-${suffix}`, response: { kind: "trace", selectedStepId: "skip-observation" } });
  assert.equal(passed.outcome, "passed"); assert.equal(passed.status, "accepted");
  const afterPass = await invoke(navigationHandler, "GET", token, undefined, { courseId });
  assert.notEqual(afterPass.decisionId, remediation.decisionId); assert.notEqual(afterPass.nextAction.kind, "remediation");
  const attempts = await server.from("learning_attempts").select("id,attempt_number,response").eq("user_id", userId).eq("course_id", courseId).eq("assignment_id", assignmentId).order("attempt_number"); assert.ifError(attempts.error);
  const results = await server.from("performance_results").select("id,outcome").eq("user_id", userId).eq("course_id", courseId).eq("assignment_id", assignmentId).order("evaluated_at"); assert.ifError(results.error);
  assert.deepEqual(attempts.data?.map((row) => row.attempt_number), [1, 2]); assert.deepEqual(results.data?.map((row) => row.outcome), ["failed", "passed"]);
  console.log(JSON.stringify({ status: "PASS", failedAttempt: failed.attemptId, retryAttempt: passed.attemptId, remediationDecision: remediation.decisionId, afterPassDecision: afterPass.decisionId }, null, 2));
} finally {
  if (userId) { const removed = await server.auth.admin.deleteUser(userId); assert.ifError(removed.error); }
}

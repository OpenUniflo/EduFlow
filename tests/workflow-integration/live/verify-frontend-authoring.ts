import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createStartingTemplate } from "../../../src/features/workflow/domain/v2/startingTemplates";
import { createEditorV2, createWorkflowV2 } from "../../../src/features/workflow/domain/v2/factory";
import type { WorkflowDocumentV2 } from "../../../src/features/workflow/domain/v2/types";

// Explicit disposable Local acceptance data; never run against a Hosted project.
const localUrl = new URL(process.env.SUPABASE_URL!);
if (localUrl.hostname !== "127.0.0.1" || localUrl.port !== "54321") throw Error("Local Supabase only");
const client = createClient(localUrl.toString(), process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const auth = await client.auth.signInWithPassword({ email: "canvas-integration@eduflow.local", password: "CanvasIntegration-local-2026!" });
assert.ifError(auth.error);
const token = auth.data.session!.access_token;
async function request(resource: string, method = "GET", body?: unknown, query: Record<string, string> = {}) {
  const response = await fetch("http://127.0.0.1:5173/api/workflows?" + new URLSearchParams({ resource, ...query }), { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  assert.ok(response.ok, `${resource}: ${response.status}`);
  return result;
}
const fixture = createStartingTemplate("search", createWorkflowV2("自动检查 · 起步流程与执行策略"), { providerRef: "provider", modelRef: "model", hnTool: { ref: "hn_search", contractDigest: "digest" } });
fixture.definition.policy.authoring = { recursionLimit: 75, waitTimeoutMs: 604800000, checkpoint: "superstep" };
fixture.definition.nodes.find(node => node.id === "answer")!.config.authoring = { cache: { ttlMs: 300000 }, errorHandler: { functionRef: "registered.error_handler" } };
fixture.editor = { ...fixture.editor, ...createEditorV2(fixture.definition), nodes: { ...fixture.editor.nodes, answer: { x: 640, y: 140 } } };
const saved = await request("definitions", "POST", fixture);
try {
  const loaded: WorkflowDocumentV2 = await request("definitions", "GET", undefined, { id: saved.workflowId });
  assert.deepEqual(loaded.definition.policy.authoring, fixture.definition.policy.authoring);
  assert.deepEqual(loaded.definition.nodes.find(node => node.id === "answer")!.config.authoring, fixture.definition.nodes.find(node => node.id === "answer")!.config.authoring);
  assert.deepEqual(loaded.editor.nodes.answer, { x: 640, y: 140 });
  assert.deepEqual(loaded.definition.state, fixture.definition.state);
  const historical: WorkflowDocumentV2 = await request("definitions", "GET", undefined, { id: saved.workflowId, revision: "1" });
  assert.deepEqual(historical.editor.nodes, loaded.editor.nodes);
  assert.equal((await request("runs", "GET", undefined, { workflowId: saved.workflowId })).items.length, 0);
  console.log(JSON.stringify({ workflowId: saved.workflowId, saved: true, policiesRetained: true, starterLayoutRetained: true, immutableRevisionRetained: true, formalRuns: 0 }));
} finally {
  await request("definitions", "DELETE", { baseRevision: saved.revision }, { id: saved.workflowId });
}

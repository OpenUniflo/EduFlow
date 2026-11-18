/**
 * Local-only Phase 3 acceptance for executing fixed independent Workflow refs.
 *
 * Uses the real API handler, Local Supabase and the Local compiler/worker/DB
 * path. Every Workflow and synthetic user is removed at the end.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertLocalSupabaseUrl } from "./local-supabase";

type Row = Record<string, any>;
type Invocation = { status: number; body: any };
const localUrl = assertLocalSupabaseUrl(required("SUPABASE_URL"));
const secretKey = required("SUPABASE_SECRET_KEY");
const publishableKey = required("VITE_SUPABASE_PUBLISHABLE_KEY");
const runtimeFile = ".acceptance/workflow-v2-m1/runtime-private.json";
let runtime: Row = {};
try { runtime = JSON.parse(readFileSync(runtimeFile, "utf8")); } catch { /* optional */ }
process.env.WORKFLOW_COMPILER_URL ||= runtime.compilerUrl ?? "http://127.0.0.1:18110";
process.env.WORKFLOW_INTERNAL_TOKEN ||= runtime.internalToken;
if (!process.env.WORKFLOW_INTERNAL_TOKEN) throw new Error("Local Workflow compiler identity is missing; start the Local compiler/worker.");

const server = createClient(localUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = `Local-${suffix}-Aa1!`;
const userIds: string[] = [];
const workflowIds: string[] = [];
const evidence: Row = { checks: [] as string[], compilerUrl: process.env.WORKFLOW_COMPILER_URL };

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }
function localSql(sql: string) {
  return execFileSync("docker", ["exec", "-i", process.env.WORKFLOW_LOCAL_DB_CONTAINER ?? "supabase_db_EduFlow", "psql", "-U", "postgres", "-d", "postgres", "-tAc", sql], { encoding: "utf8" }).trim();
}
function note(message: string) { evidence.checks.push(message); }
function track(id: string) { if (!workflowIds.includes(id)) workflowIds.push(id); }
async function invoke(method: string, token: string, query: Row, body?: unknown, headers: Row = {}): Promise<Invocation> {
  let status = 200; let responseBody: unknown;
  const response = { status(code: number) { status = code; return response; }, json(value: unknown) { responseBody = value; return response; }, setHeader() { return response; } } as unknown as VercelResponse;
  const request = { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body, query } as unknown as VercelRequest;
  const handler = (await import("../api/workflows")).default;
  await handler(request, response);
  return { status, body: responseBody };
}
function expectStatus(result: Invocation, status: number, operation: string) { assert.equal(result.status, status, `${operation}: ${result.status} ${JSON.stringify(result.body)}`); }
function expectCode(result: Invocation, code: string, operation: string) { assert.equal(result.body?.error?.code ?? result.body?.code, code, `${operation}: ${JSON.stringify(result.body)}`); }

const policy = { timeoutMs: 120000, nodeTimeoutMs: 30000, maxNodeExecutions: 50, maxToolCalls: 10, maxInputBytes: 65536, maxStateBytes: 1048576, maxEventBytes: 65536, maxOutputTokens: 2048, maxAttempts: 1 };
const literal = (value: unknown) => ({ source: "literal", value });
const input = (field: string) => ({ source: "input", pointer: `/${field}`, onMissing: { mode: "error" } });
const state = (field: string) => ({ source: "state", pointer: `/${field}`, onMissing: { mode: "error" } });
const start = { id: "start", label: "Start", type: "core.start", typeVersion: 1, config: {}, inputs: {}, writes: {} };
const end = { id: "end", label: "End", type: "core.end", typeVersion: 1, config: {}, inputs: {}, writes: {} };
const inputSchema = { type: "object", properties: { value: { type: "number" } }, required: ["value"], additionalProperties: false };
const outputSchema = { type: "object", properties: { answer: { type: "number" } }, required: ["answer"], additionalProperties: false };

function childDefinition(workflowId: string, revision = 1, add = 37): Row {
  return {
    schemaVersion: "2.0", workflowId, revision, name: `Child ${add}`, description: "synthetic phase3 target",
    inputSchema, outputSchema,
    state: { schema: { type: "object", properties: { value: { type: "number" }, answer: { type: "number" } }, required: ["value", "answer"], additionalProperties: false }, initial: { value: 0, answer: 0 }, inputBindings: { value: input("value") }, reducers: {} },
    entryNodeId: "start",
    nodes: [start, { id: "add", label: "Add", type: "core.transform", typeVersion: 1, config: { operationRef: "core.add", operationVersion: 1 }, inputs: { left: input("value"), right: literal(add) }, writes: { answer: "/value" } }, end],
    transitions: [{ id: "start-add", from: "start", outlet: "next", to: "add" }, { id: "add-end", from: "add", outlet: "next", to: "end" }],
    outputBindings: { answer: state("answer") }, policy: { ...policy }, requiredCapabilities: [],
  };
}
function interruptChild(workflowId: string): Row {
  const definition = childDefinition(workflowId);
  definition.nodes[1].config.authoring = { interrupt: { title: "Confirm", schema: { type: "object", properties: { answer: { type: "number" } }, required: ["answer"], additionalProperties: false }, resumeWrites: { answer: "answer" } } };
  return definition;
}
function referenceNode(id: string, workflowId: string, revision: number): Row {
  return { id, label: `Call ${id}`, type: "core.subgraph", typeVersion: 1, config: { workflowRef: { workflowId, revision }, environmentRef: "local" }, inputs: { value: literal(5) }, writes: { answer: "/answer" } };
}
function parentDefinition(workflowId: string, targetId: string, revision = 1): Row {
  return {
    schemaVersion: "2.0", workflowId, revision, name: "Synthetic parent", description: "phase3 execution parent",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema,
    state: { schema: { type: "object", properties: { answer: { type: "number" } }, required: ["answer"], additionalProperties: false }, initial: { answer: 0 }, inputBindings: {}, reducers: {} },
    entryNodeId: "start", nodes: [start, referenceNode("call", targetId, revision), end],
    transitions: [{ id: "start-call", from: "start", outlet: "next", to: "call" }, { id: "call-end", from: "call", outlet: "next", to: "end" }],
    outputBindings: { answer: state("answer") }, policy: { ...policy }, requiredCapabilities: [],
  };
}

function middleDefinition(workflowId: string, leafId: string): Row {
  return {
    schemaVersion: "2.0", workflowId, revision: 1, name: "Synthetic middle", description: "phase3 nested target",
    inputSchema, outputSchema,
    state: { schema: { type: "object", properties: { value: { type: "number" }, answer: { type: "number" } }, required: ["value", "answer"], additionalProperties: false }, initial: { value: 0, answer: 0 }, inputBindings: { value: input("value") }, reducers: {} },
    entryNodeId: "start",
    nodes: [start, { ...referenceNode("leaf", leafId, 1), inputs: { value: input("value") } }, end],
    transitions: [{ id: "start-leaf", from: "start", outlet: "next", to: "leaf" }, { id: "leaf-end", from: "leaf", outlet: "next", to: "end" }],
    outputBindings: { answer: state("answer") }, policy: { ...policy }, requiredCapabilities: [],
  };
}
function parallelParentDefinition(workflowId: string, targetId: string): Row {
  return {
    schemaVersion: "2.0", workflowId, revision: 1, name: "Synthetic parallel parent", description: "phase3 parallel references",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"], additionalProperties: false },
    state: { schema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"], additionalProperties: false }, initial: { a: 0, b: 0 }, inputBindings: {}, reducers: {} },
    entryNodeId: "start",
    nodes: [
      start,
      { ...referenceNode("call1", targetId, 1), inputs: { value: literal(5) }, writes: { a: "/answer" } },
      { ...referenceNode("call2", targetId, 1), inputs: { value: literal(10) }, writes: { b: "/answer" } },
      { id: "join", label: "Join", type: "control.join", typeVersion: 1, config: { waitFor: ["call1", "call2"], strategy: "all" }, inputs: {}, writes: {} },
      end,
    ],
    transitions: [
      { id: "start-call1", from: "start", outlet: "next", to: "call1" },
      { id: "start-call2", from: "start", outlet: "next", to: "call2" },
      { id: "call1-join", from: "call1", outlet: "next", to: "join" },
      { id: "call2-join", from: "call2", outlet: "next", to: "join" },
      { id: "join-end", from: "join", outlet: "next", to: "end" },
    ],
    outputBindings: { a: state("a"), b: state("b") }, policy: { ...policy }, requiredCapabilities: [],
  };
}


function budgetToolNode(id: string, toolRef: string, digest: string): Row {
  return { id, label: `Delay ${id}`, type: "core.tool", typeVersion: 2, config: { toolRef, contractDigest: digest }, inputs: {}, writes: { answer: "/result/value" } };
}
function budgetWaitNode(): Row {
  return { id: "wait", label: "Wait", type: "core.transform", typeVersion: 1, config: { operationRef: "core.identity", operationVersion: 1, authoring: { interrupt: { title: "Confirm", schema: { type: "object", properties: { answer: { type: "number" } }, required: ["answer"], additionalProperties: false }, resumeWrites: { answer: "answer" } } } }, inputs: { value: state("value") }, writes: {} };
}
function budgetToolChild(workflowId: string, toolRef: string, digest: string, kind: "plain" | "leaf"): Row {
  const definition = childDefinition(workflowId);
  const nodes: Row[] = kind === "leaf"
    ? [start, budgetToolNode("t1", toolRef, digest), budgetToolNode("t2", toolRef, digest), budgetWaitNode(), budgetToolNode("t3", toolRef, digest), end]
    : [start, budgetToolNode("t1", toolRef, digest), end];
  definition.nodes = nodes;
  definition.transitions = nodes.slice(1).map((node, index) => ({ id: `step-${index}`, from: nodes[index].id, outlet: "next", to: node.id }));
  return definition;
}
function budgetMiddleDefinition(workflowId: string, plainId: string, leafId: string): Row {
  const definition = childDefinition(workflowId);
  definition.policy = { ...policy, timeoutMs: 3400, maxToolCalls: 10 };
  definition.nodes = [
    start,
    { ...referenceNode("one", plainId, 1), inputs: { value: literal(5) } },
    { ...referenceNode("two", leafId, 1), inputs: { value: literal(5) } },
    end,
  ];
  definition.transitions = [
    { id: "start-one", from: "start", outlet: "next", to: "one" },
    { id: "one-two", from: "one", outlet: "next", to: "two" },
    { id: "two-end", from: "two", outlet: "next", to: "end" },
  ];
  definition.outputBindings = { answer: state("answer") };
  return definition;
}

function resourceChildDefinition(workflowId: string, ref: string, kind: "connection" | "function"): Row {
  const definition = childDefinition(workflowId);
  definition.inputSchema = { type: "object", properties: { value: { type: "number" } }, additionalProperties: false };
  definition.state = { schema: { type: "object", properties: { answer: {} }, required: ["answer"], additionalProperties: false }, initial: { answer: 0 }, inputBindings: {}, reducers: {} };
  definition.outputSchema = { type: "object", properties: { answer: {} }, required: ["answer"], additionalProperties: false };
  definition.outputBindings = { answer: state("answer") };
  definition.nodes = [start, kind === "connection"
    ? { id: "use", label: "Use connection", type: "core.tool", typeVersion: 2, config: { toolRef: ref, contractDigest: "phase3-contract" }, inputs: {}, writes: { answer: "/result" } }
    : { id: "use", label: "Use function", type: "core.function", typeVersion: 1, config: { implementation: "registered", functionRef: ref, functionVersion: 1 }, inputs: {}, writes: { answer: "/result" } }, end];
  definition.transitions = [{ id: "start-use", from: "start", outlet: "next", to: "use" }, { id: "use-end", from: "use", outlet: "next", to: "end" }];
  return definition;
}
async function publishConnection(token: string, ref: string) {
  const result = await invoke("POST", token, { resource: "extensions" }, { environmentRef: "local", action: "publish", kind: "connection", ref, version: 1, content: { type: "http", name: "Phase3 probe", baseUrl: "http://127.0.0.1:9", path: "/probe", method: "GET", sideEffect: "read", inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: { type: "object" } } });
  expectStatus(result, 200, "publish connection"); return result.body;
}
async function publishDelayConnection(token: string, ref: string, port: number) {
  const result = await invoke("POST", token, { resource: "extensions" }, { environmentRef: "local", action: "publish", kind: "connection", ref, version: 1, content: { type: "http", name: "Phase3 budget delay", baseUrl: `http://127.0.0.1:${port}`, path: "/delay", method: "GET", sideEffect: "read", inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: { type: "object", properties: { value: { type: "number" } }, required: ["value"], additionalProperties: false } } });
  expectStatus(result, 200, "publish delay connection"); return result.body;
}
async function delayedTool(token: string, owner: string, ref: string, port: number) {
  await publishDelayConnection(token, ref, port);
  const { workflowCompiler } = await import("../api/_lib/workflowV2Protocol");
  const catalog = await workflowCompiler<Row>("/v1/catalog", { ownerId: owner, environmentRef: "local" });
  const tool = (catalog.items as Row[]).find((item) => item.ref === `p4:${owner}:${ref}:1`);
  assert.ok(tool?.contractDigest, `delay tool contract missing: ${JSON.stringify(catalog.items)}`);
  return { key: `p4:${owner}:${ref}:1`, digest: String(tool.contractDigest) };
}
async function publishFunction(token: string, ref: string) {
  const result = await invoke("POST", token, { resource: "extensions" }, { environmentRef: "local", action: "publish", kind: "function", ref, version: 1, content: { name: "Phase3 probe", language: "python", code: "def main(inputs):\n    return {}", inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: { type: "object" }, purpose: "node" } });
  expectStatus(result, 200, "publish function"); return result.body;
}


function nodeTestParentDefinition(workflowId: string, targetId: string): Row {
  return {
    schemaVersion: "2.0", workflowId, revision: 1, name: "Synthetic node-test parent", description: "phase3 node test closure",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema,
    state: { schema: { type: "object", properties: { value: { type: "number" }, answer: { type: "number" } }, required: ["value", "answer"], additionalProperties: false }, initial: { value: 0, answer: 0 }, inputBindings: {}, reducers: {} },
    entryNodeId: "start",
    nodes: [
      start,
      { id: "transform", label: "Transform", type: "core.transform", typeVersion: 1, config: { operationRef: "core.identity", operationVersion: 1 }, inputs: { value: literal(1) }, writes: { value: "/value" } },
      referenceNode("call", targetId, 1),
      end,
    ],
    transitions: [
      { id: "start-transform", from: "start", outlet: "next", to: "transform" },
      { id: "transform-call", from: "transform", outlet: "next", to: "call" },
      { id: "call-end", from: "call", outlet: "next", to: "end" },
    ],
    outputBindings: { answer: state("answer") }, policy: { ...policy }, requiredCapabilities: [],
  };
}

function editorFor(definition: Row) {
  return { schemaVersion: 1, workflowId: definition.workflowId, editorRevision: 1, definitionRevision: definition.revision, nodes: Object.fromEntries(definition.nodes.map((node: Row, index: number) => [node.id, { x: 80 + index * 240, y: 160 }])), edges: Object.fromEntries(definition.transitions.map((edge: Row) => [edge.id, {}])) };
}
async function createWorkflow(token: string, definition: Row, operation: string) {
  const creationId = randomUUID(); definition.workflowId = creationId;
  const result = await invoke("POST", token, { resource: "definitions" }, { definition, editor: editorFor(definition), creationId });
  expectStatus(result, 201, operation); track(creationId); return creationId;
}
async function readWorkflow(token: string, workflowId: string, revision?: number) {
  const result = await invoke("GET", token, { resource: "definitions", id: workflowId, ...(revision === undefined ? {} : { revision: String(revision) }) });
  expectStatus(result, 200, `read ${workflowId}`); return result.body;
}
async function saveWorkflow(token: string, workflowId: string, definition: Row, operation: string) {
  const current = await readWorkflow(token, workflowId);
  const next = { ...definition, workflowId, revision: current.definition.revision + 1 };
  const result = await invoke("PUT", token, { resource: "definitions", id: workflowId }, { definition: next, editor: { ...editorFor(next), editorRevision: current.editor.editorRevision + 1 }, baseRevision: current.definition.revision, baseEditorRevision: current.editor.editorRevision, environmentRef: "local" });
  expectStatus(result, 200, operation); return result.body as Row;
}
async function restoreRevision(owner: string, workflowId: string, revision: number, definition: Row) {
  const restored = await server.from("workflow_revisions").update({ definition }).eq("owner_user_id", owner).eq("workflow_id", workflowId).eq("revision", revision);
  assert.ifError(restored.error);
}
function idempotency() { return `phase3-${randomUUID()}`; }
async function startRun(token: string, workflowId: string, revision: number, options: Row = {}) {
  return invoke("POST", token, { resource: "runs" }, { workflowId, revision, input: options.input ?? {}, environmentRef: "local", ...options }, { "idempotency-key": idempotency() });
}
async function runRecord(token: string, runId: string) {
  const result = await invoke("GET", token, { resource: "runs", id: runId }); expectStatus(result, 200, "read run"); return result.body;
}
async function waitRun(token: string, runId: string, terminal = true) {
  for (let index = 0; index < 120; index += 1) {
    const run = await runRecord(token, runId);
    if (run.status === "success" || run.status === "failed" || run.status === "cancelled") return run;
    if (!terminal && run.status === "waiting") return run;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Run ${runId} did not reach a terminal/waiting state`);
}

async function main() {
  const users: { id: string; token: string }[] = [];
  for (const label of ["a", "b"]) {
    const email = `workflow-phase3-${label}-${suffix}@eduflow.local`;
    const created = await server.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `Phase3 ${label}` } });
    assert.ifError(created.error); assert.ok(created.data.user); userIds.push(created.data.user.id);
    const client = createClient(localUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await client.auth.signInWithPassword({ email, password }); assert.ifError(signedIn.error); assert.ok(signedIn.data.session);
    users.push({ id: created.data.user.id, token: signedIn.data.session.access_token });
  }
  const [a, b] = users;

  const childId = await createWorkflow(a.token, childDefinition("placeholder"), "create child@1");
  const parentId = await createWorkflow(a.token, parentDefinition("placeholder", childId), "create parent@1");
  const first = await startRun(a.token, parentId, 1);
  expectStatus(first, 202, "start parent run"); assert.ok(first.body.runId);
  const firstRun = await waitRun(a.token, first.body.runId);
  assert.equal(firstRun.status, "success", JSON.stringify(firstRun));
  assert.deepEqual(firstRun.output, { answer: 42 });
  note("API->compiler/worker->DB: 5 -> child -> output 42");

  const steps = await invoke("GET", a.token, { resource: "steps", runId: first.body.runId }); expectStatus(steps, 200, "read steps");
  const childStep = (steps.body.items as Row[]).find((step) => step.execution?.workflowId === childId);
  assert.ok(childStep, `child step identity missing: ${JSON.stringify(steps.body.items)}`);
  assert.equal(childStep.execution.revision, 1);
  assert.ok(Array.isArray(childStep.execution.workflowPath) && childStep.execution.workflowPath.some((entry: Row) => entry.workflowId === childId && entry.revision === 1), JSON.stringify(childStep.execution));
  note("steps freeze source Workflow/revision and node path identity");

  const childV2 = await saveWorkflow(a.token, childId, childDefinition(childId, 2, 100), "save child@2");
  assert.equal(childV2.revision, 2);
  const second = await startRun(a.token, parentId, 1); expectStatus(second, 202, "start parent run after target v2");
  const secondRun = await waitRun(a.token, second.body.runId);
  assert.equal(secondRun.status, "success", JSON.stringify(secondRun));
  assert.deepEqual(secondRun.output, { answer: 42 });
  note("target v2 save does not change an existing parent reference or its run output");

  const interruptId = await createWorkflow(a.token, interruptChild("placeholder"), "create interrupt child");
  const interruptParent = await createWorkflow(a.token, parentDefinition("placeholder", interruptId), "create interrupt parent");
  const pausedStart = await startRun(a.token, interruptParent, 1); expectStatus(pausedStart, 202, "start paused parent");
  const paused = await waitRun(a.token, pausedStart.body.runId, false);
  assert.equal(paused.status, "waiting", JSON.stringify(paused));
  const thread = await invoke("GET", a.token, { resource: "threads", id: paused.threadId }); expectStatus(thread, 200, "read waiting thread");
  assert.ok(thread.body.interrupts?.length);
  const checkpointMetadata = JSON.parse(localSql(`select coalesce(json_agg(metadata),'[]'::json) from workflow_checkpoints.checkpoints where thread_id='${paused.threadId}'`));
  const childBudget = checkpointMetadata.map((metadata: Row) => metadata?.eduflowChildBudget).find((value: Row | undefined) => value && typeof value.usedMs === "number");
  assert.ok(childBudget, `child budget metadata missing: ${JSON.stringify(checkpointMetadata)}`);
  const childScope = checkpointMetadata.map((metadata: Row) => metadata?.eduflowChildScope).find((value: Row | undefined) => typeof value?.key === "string");
  assert.ok(childScope?.key.startsWith(`${paused.threadId}:`), `child budget scope must survive Run resume: ${JSON.stringify(childScope)}`);
  note("child invocation compute budget is persisted in checkpoint metadata before a wait");
  await saveWorkflow(a.token, interruptId, childDefinition(interruptId, 2, 100), "save interrupt child v2 while waiting");
  const resume = await invoke("POST", a.token, { resource: "runs", id: pausedStart.body.runId, op: "resume" }, { checkpointId: thread.body.checkpointId, responses: { [thread.body.interrupts[0].id]: { answer: 42 } }, currentRunId: pausedStart.body.runId });
  expectStatus(resume, 202, "resume paused parent");
  const resumedRun = await waitRun(a.token, resume.body.runId ?? pausedStart.body.runId);
  assert.equal(resumedRun.status, "success", JSON.stringify(resumedRun));
  assert.deepEqual(resumedRun.output, { answer: 42 });
  note("wait/resume revalidates authorization and still uses the frozen child@1");

  const missingParent = await createWorkflow(a.token, parentDefinition("placeholder", childId), "create missing-case parent");
  const missingHead = await readWorkflow(a.token, missingParent);
  const broken = JSON.parse(JSON.stringify(missingHead.definition)); broken.nodes.find((node: Row) => node.id === "call").config.workflowRef.revision = 999;
  const brokenWrite = await server.from("workflow_revisions").update({ definition: broken }).eq("owner_user_id", a.id).eq("workflow_id", missingParent).eq("revision", 1); assert.ifError(brokenWrite.error);
  const missingRun = await startRun(a.token, missingParent, 1);
  expectCode(missingRun, "WORKFLOW_REFERENCE_UNAVAILABLE", "missing revision at run validation");
  await restoreRevision(a.id, missingParent, 1, missingHead.definition);
  note("missing exact revision is rejected at run validation, not treated as a leaf");

  const crossParent = await createWorkflow(a.token, parentDefinition("placeholder", childId), "create cross-owner run parent");
  const crossHead = await readWorkflow(a.token, crossParent);
  const crossBroken = JSON.parse(JSON.stringify(crossHead.definition)); crossBroken.nodes.find((node: Row) => node.id === "call").config.workflowRef.workflowId = randomUUID();
  const crossWrite = await server.from("workflow_revisions").update({ definition: crossBroken }).eq("owner_user_id", a.id).eq("workflow_id", crossParent).eq("revision", 1); assert.ifError(crossWrite.error);
  const crossRun = await startRun(a.token, crossParent, 1);
  expectCode(crossRun, "WORKFLOW_REFERENCE_UNAVAILABLE", "cross-owner/missing run validation");
  await restoreRevision(a.id, crossParent, 1, crossHead.definition);
  note("cross-owner/missing target cannot be used at run validation");

  const boundaryChild = await createWorkflow(a.token, childDefinition("placeholder"), "create boundary child");
  const boundaryParent = await createWorkflow(a.token, parentDefinition("placeholder", boundaryChild), "create boundary parent");
  const boundaryHead = await readWorkflow(a.token, boundaryChild);
  const boundaryBroken = JSON.parse(JSON.stringify(boundaryHead.definition));
  boundaryBroken.nodes.find((node: Row) => node.id === "add").config.authoring = { command: { enabled: true, graph: "parent", destinations: ["end"] } };
  boundaryBroken.nodes.find((node: Row) => node.id === "add").writes = {};
  const boundaryWrite = await server.from("workflow_revisions").update({ definition: boundaryBroken }).eq("owner_user_id", a.id).eq("workflow_id", boundaryChild).eq("revision", 1); assert.ifError(boundaryWrite.error);
  const boundaryRun = await startRun(a.token, boundaryParent, 1);
  assert.equal(boundaryRun.body?.error?.code, "GRAPH_INVALID", `fixed target parent Command at run validation: ${JSON.stringify(boundaryRun.body)}`);
  assert.ok((boundaryRun.body?.error?.details?.diagnostics ?? []).some((item: Row) => item.code === "WORKFLOW_REFERENCE_BOUNDARY"), JSON.stringify(boundaryRun.body));
  await restoreRevision(a.id, boundaryChild, 1, boundaryHead.definition);
  note("a fixed target root cannot issue a parent Command that writes/routes the invoking Workflow");

  const mappingParent = await createWorkflow(a.token, parentDefinition("placeholder", childId), "create mapping run parent");
  const mappingHead = await readWorkflow(a.token, mappingParent);
  const mappingBroken = JSON.parse(JSON.stringify(mappingHead.definition)); mappingBroken.nodes.find((node: Row) => node.id === "call").inputs = {};
  const mappingWrite = await server.from("workflow_revisions").update({ definition: mappingBroken }).eq("owner_user_id", a.id).eq("workflow_id", mappingParent).eq("revision", 1); assert.ifError(mappingWrite.error);
  const mappingRun = await startRun(a.token, mappingParent, 1);
  expectCode(mappingRun, "WORKFLOW_REFERENCE_MAPPING", "mapping run validation");
  await restoreRevision(a.id, mappingParent, 1, mappingHead.definition);
  note("mapping incompatibility is rejected at run validation");

  const envParent = await createWorkflow(a.token, parentDefinition("placeholder", childId), "create env run parent");
  const envHead = await readWorkflow(a.token, envParent);
  const envBroken = JSON.parse(JSON.stringify(envHead.definition)); envBroken.nodes.find((node: Row) => node.id === "call").config.environmentRef = "forbidden-phase3";
  const envWrite = await server.from("workflow_revisions").update({ definition: envBroken }).eq("owner_user_id", a.id).eq("workflow_id", envParent).eq("revision", 1); assert.ifError(envWrite.error);
  const envRun = await startRun(a.token, envParent, 1);
  assert.ok(envRun.status >= 400, JSON.stringify(envRun));
  await restoreRevision(a.id, envParent, 1, envHead.definition);
  note("unauthorized target environment is rejected at run validation");

  // Parent budget: three root nodes plus three child nodes exceed a four-node run budget.
  const budgetParentDefinition = parentDefinition("placeholder", childId); budgetParentDefinition.policy = { ...policy, maxNodeExecutions: 4 };
  const budgetParent = await createWorkflow(a.token, budgetParentDefinition, "create budget parent");
  const budgetRun = await startRun(a.token, budgetParent, 1); expectStatus(budgetRun, 202, "start budget parent");
  const budgetResult = await waitRun(a.token, budgetRun.body.runId);
  assert.equal(budgetResult.status, "failed"); assert.equal(budgetResult.error?.code, "NODE_BUDGET_EXCEEDED");
  note("parent node budget is shared with the child and cannot be reset per invocation");

  const cancelStart = await startRun(a.token, interruptParent, 1); expectStatus(cancelStart, 202, "start cancel parent");
  const cancelPaused = await waitRun(a.token, cancelStart.body.runId, false); assert.equal(cancelPaused.status, "waiting");
  const cancel = await invoke("POST", a.token, { resource: "runs", id: cancelStart.body.runId, op: "cancel" }, {}); expectStatus(cancel, 200, "cancel waiting run");
  const cancelled = await runRecord(a.token, cancelStart.body.runId); assert.equal(cancelled.status, "cancelled");
  note("waiting parent run is cancellable through the existing boundary");

  const revokedStart = await startRun(a.token, interruptParent, 1); expectStatus(revokedStart, 202, "start revocation parent");
  const revokedPaused = await waitRun(a.token, revokedStart.body.runId, false); assert.equal(revokedPaused.status, "waiting");
  const revokedThread = await invoke("GET", a.token, { resource: "threads", id: revokedPaused.threadId }); expectStatus(revokedThread, 200, "read revoked thread");
  const archived = await server.from("workflow_v2_definitions").update({ archived: true }).eq("owner_user_id", a.id).eq("workflow_id", interruptId); assert.ifError(archived.error);
  const revokedResume = await invoke("POST", a.token, { resource: "runs", id: revokedStart.body.runId, op: "resume" }, { checkpointId: revokedThread.body.checkpointId, responses: { [revokedThread.body.interrupts[0].id]: { answer: 42 } }, currentRunId: revokedStart.body.runId });
  expectCode(revokedResume, "WORKFLOW_REFERENCE_ARCHIVED", "resume after target revocation");
  await server.from("workflow_v2_definitions").update({ archived: false }).eq("owner_user_id", a.id).eq("workflow_id", interruptId);
  note("resume revalidates target authorization; frozen definitions cannot bypass revocation");

  const leafId = await createWorkflow(a.token, childDefinition("placeholder"), "create nested leaf");
  const middleId = await createWorkflow(a.token, middleDefinition("placeholder", leafId), "create nested middle");
  const nestedParent = await createWorkflow(a.token, parentDefinition("placeholder", middleId), "create nested parent");
  const nestedStart = await startRun(a.token, nestedParent, 1); expectStatus(nestedStart, 202, "start nested parent");
  const nestedRun = await waitRun(a.token, nestedStart.body.runId);
  assert.equal(nestedRun.status, "success", JSON.stringify(nestedRun));
  assert.deepEqual(nestedRun.output, { answer: 42 });
  note("multi-level fixed closure executes and maps the leaf output to the root");

  const delayServer = createServer((_request, response) => {
    setTimeout(() => { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ value: 42 })); }, 300);
  });
  await new Promise<void>((resolve) => delayServer.listen(0, "127.0.0.1", resolve));
  try {
    const delayPort = (delayServer.address() as { port: number }).port;
    const delayRef = `phase3_budget_${suffix.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 36)}`;
    const delayTool = await delayedTool(a.token, a.id, delayRef, delayPort);
    const budgetPlain = await createWorkflow(a.token, budgetToolChild("placeholder", delayTool.key, delayTool.digest, "plain"), "create delayed plain child");
    const budgetLeaf = await createWorkflow(a.token, budgetToolChild("placeholder", delayTool.key, delayTool.digest, "leaf"), "create delayed leaf child");
    const budgetMiddlePolicy = budgetMiddleDefinition("placeholder", budgetPlain, budgetLeaf);
    const budgetMiddle = await createWorkflow(a.token, budgetMiddlePolicy, "create delayed middle");
    const budgetParent = await createWorkflow(a.token, parentDefinition("placeholder", budgetMiddle), "create delayed parent");
    const budgetStart = await startRun(a.token, budgetParent, 1); expectStatus(budgetStart, 202, "start delayed parent");
    const budgetPaused = await waitRun(a.token, budgetStart.body.runId, false);
    assert.equal(budgetPaused.status, "waiting", JSON.stringify(budgetPaused));
    const budgetThread = await invoke("GET", a.token, { resource: "threads", id: budgetPaused.threadId }); expectStatus(budgetThread, 200, "read delayed thread");
    assert.equal(budgetThread.body.interrupts?.length, 1, JSON.stringify(budgetThread.body));
    const budgetMetadata = JSON.parse(localSql(`select coalesce(json_agg(metadata),'[]'::json) from workflow_checkpoints.checkpoints where thread_id='${budgetPaused.threadId}'`));
    const middleSnapshots = budgetMetadata.flatMap((metadata: Row) => Object.entries(metadata?.eduflowChildBudgets ?? {}).filter(([key]) => String(key).endsWith(":1:call")).map(([, value]) => value as Row));
    assert.ok(middleSnapshots.some((snapshot: Row) => Number(snapshot?.usedMs) >= 1500), `middle ancestor snapshot missing: ${JSON.stringify(budgetMetadata)}`);
    const budgetResume = await invoke("POST", a.token, { resource: "runs", id: budgetStart.body.runId, op: "resume" }, { checkpointId: budgetThread.body.checkpointId, responses: { [budgetThread.body.interrupts[0].id]: { answer: 42 } }, currentRunId: budgetStart.body.runId });
    expectStatus(budgetResume, 202, "resume delayed parent");
    const budgetResumed = await waitRun(a.token, budgetResume.body.runId ?? budgetStart.body.runId);
    assert.equal(budgetResumed.status, "failed", JSON.stringify(budgetResumed));
    assert.equal(budgetResumed.error?.code, "RUN_TIMEOUT", JSON.stringify(budgetResumed));
    evidence.nestedResumeBudget = {
      scope: "middle",
      timeoutMs: budgetMiddlePolicy.policy.timeoutMs,
      usedMsAtPause: Math.max(...middleSnapshots.map((snapshot: Row) => Number(snapshot.usedMs) || 0)),
      resumedStatus: budgetResumed.status,
      resumedError: budgetResumed.error?.code,
      resumedTimeoutMs: budgetResumed.error?.timeoutMs ?? null,
      postWaitToolDelayMs: 300,
    };
    note("nested resume is constrained by descendant usage: pre-wait compute rejects the post-wait tool");
  } finally {
    await new Promise<void>((resolve) => delayServer.close(() => resolve()));
  }

  const parallelParent = await createWorkflow(a.token, parallelParentDefinition("placeholder", childId), "create parallel parent");
  const parallelStart = await startRun(a.token, parallelParent, 1); expectStatus(parallelStart, 202, "start parallel parent");
  const parallelRun = await waitRun(a.token, parallelStart.body.runId);
  assert.equal(parallelRun.status, "success", JSON.stringify(parallelRun));
  assert.deepEqual(parallelRun.output, { a: 42, b: 47 });
  note("same target called twice in parallel has independent child State and parent outputs");

  const cycleA = await createWorkflow(a.token, parentDefinition("placeholder", childId), "create cycle A");
  const cycleB = await createWorkflow(a.token, childDefinition("placeholder"), "create cycle B");
  const cycleAHead = await readWorkflow(a.token, cycleA);
  const cycleADefinition = parentDefinition(cycleA, cycleB); cycleADefinition.revision = 1;
  const cycleAWrite = await server.from("workflow_revisions").update({ definition: { ...cycleADefinition, workflowId: cycleA, revision: 1 } }).eq("owner_user_id", a.id).eq("workflow_id", cycleA).eq("revision", 1); assert.ifError(cycleAWrite.error);
  const cycleBHead = await readWorkflow(a.token, cycleB);
  const cycleBDefinition = childDefinition(cycleB); cycleBDefinition.revision = 1;
  cycleBDefinition.inputSchema = { type: "object", properties: { value: { type: "number" } }, additionalProperties: false };
  cycleBDefinition.nodes[1] = { ...referenceNode("back", cycleA, 1), inputs: {}, writes: { answer: "/answer" } };
  cycleBDefinition.transitions = [{ id: "start-back", from: "start", outlet: "next", to: "back" }, { id: "back-end", from: "back", outlet: "next", to: "end" }];
  const cycleBWrite = await server.from("workflow_revisions").update({ definition: { ...cycleBDefinition, workflowId: cycleB, revision: 1 } }).eq("owner_user_id", a.id).eq("workflow_id", cycleB).eq("revision", 1); assert.ifError(cycleBWrite.error);
  const cycleRun = await startRun(a.token, cycleA, 1);
  expectCode(cycleRun, "WORKFLOW_REFERENCE_CYCLE", "cycle at run validation");
  note("fixed-revision cycle is rejected at run validation");
  await server.from("workflow_revisions").update({ definition: { ...cycleBHead.definition, workflowId: cycleB, revision: 1 } }).eq("owner_user_id", a.id).eq("workflow_id", cycleB).eq("revision", 1);
  const cycleSimple = childDefinition(cycleA); cycleSimple.inputSchema = { type: "object", properties: {}, additionalProperties: false }; cycleSimple.state.inputBindings = {};
  await server.from("workflow_revisions").update({ definition: cycleSimple }).eq("owner_user_id", a.id).eq("workflow_id", cycleA).eq("revision", 1);

  const timeoutDefinition = parentDefinition("placeholder", childId); timeoutDefinition.policy = { ...policy, timeoutMs: 1 };
  const timeoutParent = await createWorkflow(a.token, timeoutDefinition, "create timeout parent");
  const timeoutStart = await startRun(a.token, timeoutParent, 1); expectStatus(timeoutStart, 202, "start timeout parent");
  const timeoutRun = await waitRun(a.token, timeoutStart.body.runId);
  assert.equal(timeoutRun.status, "failed"); assert.equal(timeoutRun.error?.code, "RUN_TIMEOUT");
  note("parent timeout remains the run boundary");

  const connectionRef = `phase3_probe_${suffix.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40)}`;
  await publishConnection(a.token, connectionRef);
  const connectionKey = `p4:${a.id}:${connectionRef}:1`;
  const resourceChild = await createWorkflow(a.token, resourceChildDefinition("placeholder", connectionKey, "connection"), "create resource child old");
  await saveWorkflow(a.token, resourceChild, childDefinition(resourceChild), "resource child new removes connection");
  const resourceParent = await createWorkflow(a.token, parentDefinition("placeholder", resourceChild), "create resource parent");
  const connectionReferences = await invoke("GET", a.token, { resource: "extensions", view: "references", kind: "connection", ref: connectionRef }); expectStatus(connectionReferences, 200, "connection closure references");
  assert.ok(connectionReferences.body.items.some((item: Row) => item.workflowId === resourceChild && item.revision === 1), JSON.stringify(connectionReferences.body));
  const blockedConnectionDelete = await invoke("POST", a.token, { resource: "extensions" }, { environmentRef: "local", action: "delete", kind: "connection", ref: connectionRef, version: 1 });
  expectCode(blockedConnectionDelete, "CONNECTION_IN_USE", "API preflight blocks connection delete through old target revision");
  await assert.rejects(
    async () => (await import("../api/_lib/workflowV2Protocol")).workflowCompiler("/v1/extensions", { ownerId: a.id, environmentRef: "local", action: "delete", kind: "connection", ref: connectionRef, version: 1 }),
    (error: any) => error?.code === "CONNECTION_IN_USE",
    "DB transaction blocks connection delete through old target revision",
  );
  note("connection deletion is blocked by a current root reaching an old target revision; API preflight and worker transaction agree");
  await saveWorkflow(a.token, resourceParent, childDefinition(resourceParent), "resource parent drops old reference");
  const allowedConnectionDelete = await invoke("POST", a.token, { resource: "extensions" }, { environmentRef: "local", action: "delete", kind: "connection", ref: connectionRef, version: 1 });
  expectStatus(allowedConnectionDelete, 200, "delete connection after current root drops reference");
  note("removing the current root releases the historical connection dependency");

  const functionRef = `phase3_fn_${suffix.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40)}`;
  await publishFunction(a.token, functionRef);
  const functionChild = await createWorkflow(a.token, resourceChildDefinition("placeholder", functionRef, "function"), "create function child old");
  await saveWorkflow(a.token, functionChild, childDefinition(functionChild), "function child new removes function");
  const functionParent = await createWorkflow(a.token, parentDefinition("placeholder", functionChild), "create function parent");
  const functionReferences = await invoke("GET", a.token, { resource: "extensions", view: "references", kind: "function", ref: functionRef }); expectStatus(functionReferences, 200, "function closure references");
  assert.ok(functionReferences.body.items.some((item: Row) => item.workflowId === functionChild && item.revision === 1), JSON.stringify(functionReferences.body));
  const blockedFunctionDelete = await invoke("POST", a.token, { resource: "extensions" }, { environmentRef: "local", action: "delete", kind: "function", ref: functionRef, version: 1 });
  expectCode(blockedFunctionDelete, "FUNCTION_IN_USE", "API preflight blocks function delete through old target revision");
  await assert.rejects(
    async () => (await import("../api/_lib/workflowV2Protocol")).workflowCompiler("/v1/extensions", { ownerId: a.id, environmentRef: "local", action: "delete", kind: "function", ref: functionRef, version: 1 }),
    (error: any) => error?.code === "FUNCTION_IN_USE",
    "DB transaction blocks function delete through old target revision",
  );
  note("function deletion is blocked by a current root reaching an old target revision");
  await saveWorkflow(a.token, functionParent, childDefinition(functionParent), "function parent drops old reference");
  const allowedFunctionDelete = await invoke("POST", a.token, { resource: "extensions" }, { environmentRef: "local", action: "delete", kind: "function", ref: functionRef, version: 1 });
  expectStatus(allowedFunctionDelete, 200, "delete function after current root drops reference");
  note("removing the current root releases the historical function dependency");

  const nodeTestParent = await createWorkflow(a.token, nodeTestParentDefinition("placeholder", childId), "create node-test parent");
  const nodeTestDoc = await readWorkflow(a.token, nodeTestParent);
  const nodeTest = await invoke("POST", a.token, { resource: "node-tests" }, { workflowId: nodeTestParent, baseRevision: nodeTestDoc.definition.revision, definition: nodeTestDoc.definition, nodeId: "transform", input: {}, state: { value: 0, answer: 0 }, environmentRef: "local" });
  expectStatus(nodeTest, 200, "node test with fixed reference closure");
  assert.equal(nodeTest.body.mode, "node-test");
  note("node-test resolves the fixed closure before isolated node execution");

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const raceConnectionRef = `phase3_race_${iteration}_${suffix.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 30)}`;
    await publishConnection(a.token, raceConnectionRef);
    const raceConnectionKey = `p4:${a.id}:${raceConnectionRef}:1`;
    const raceTarget = await createWorkflow(a.token, resourceChildDefinition("placeholder", raceConnectionKey, "connection"), `race target old ${iteration}`);
    await saveWorkflow(a.token, raceTarget, childDefinition(raceTarget), `race target new ${iteration}`);
    const raceParent = await createWorkflow(a.token, childDefinition("placeholder"), `race parent simple ${iteration}`);
    const raceParentDoc = await readWorkflow(a.token, raceParent);
    const raceDefinition = parentDefinition(raceParent, raceTarget); raceDefinition.revision = raceParentDoc.definition.revision + 1;
    const raceSave = invoke("PUT", a.token, { resource: "definitions", id: raceParent }, { definition: raceDefinition, editor: { ...editorFor(raceDefinition), editorRevision: raceParentDoc.editor.editorRevision + 1 }, baseRevision: raceParentDoc.definition.revision, baseEditorRevision: raceParentDoc.editor.editorRevision, environmentRef: "local" });
    const raceDelete = invoke("POST", a.token, { resource: "extensions" }, { environmentRef: "local", action: "delete", kind: "connection", ref: raceConnectionRef, version: 1 });
    const [saved, deleted] = await Promise.all([raceSave, raceDelete]);
    assert.ok((saved.status === 200) !== (deleted.status === 200), `resource race ${iteration}: exactly one side must win (${saved.status}/${JSON.stringify(saved.body)}, ${deleted.status}/${JSON.stringify(deleted.body)})`);
    if (saved.status === 200) {
      expectCode(deleted, "CONNECTION_IN_USE", `resource race ${iteration}: winning save protects old target resource`);
      await saveWorkflow(a.token, raceParent, childDefinition(raceParent), `race parent drops reference ${iteration}`);
      const cleanupDelete = await invoke("POST", a.token, { resource: "extensions" }, { environmentRef: "local", action: "delete", kind: "connection", ref: raceConnectionRef, version: 1 });
      expectStatus(cleanupDelete, 200, `resource race ${iteration}: cleanup delete`);
    } else {
      expectCode(saved, "CONNECTION_UNAVAILABLE", `resource race ${iteration}: winning delete makes target resource unavailable`);
    }
  }
  note("concurrent parent save reaching an old target vs resource delete: exactly one wins, no dangling current resource reference");

  evidence.status = "passed";
}

async function cleanup() {
  if (process.env.PHASE3_KEEP === "1") return;
  for (const userId of userIds) {
    const threads = await server.from("workflow_execution_threads").select("thread_id,status").eq("owner_user_id", userId).in("status", ["active", "waiting"]);
    for (const thread of threads.data ?? []) await server.rpc("workflow_v2_cancel_thread", { p_owner: userId, p_thread: thread.thread_id });
  }
  await server.from("workflow_v2_definitions").update({ archived: false }).in("owner_user_id", userIds);
  for (let pass = 0; pass < 6; pass += 1) {
    let progress = false;
    for (const workflowId of [...workflowIds].reverse()) {
      const head = await server.from("workflow_v2_definitions").select("current_revision,owner_user_id").eq("workflow_id", workflowId).maybeSingle();
      if (!head.data) continue;
      const result = await server.rpc("workflow_v2_delete", { p_owner: head.data.owner_user_id, p_workflow: workflowId, p_base: head.data.current_revision });
      if (!result.error) progress = true;
    }
    if (!progress) break;
  }
  for (const userId of userIds) await server.auth.admin.deleteUser(userId);
}

main().then(async () => { await cleanup(); console.log(JSON.stringify(evidence, null, 2)); }).catch(async (error) => { console.error(error); if (process.env.PHASE3_KEEP !== "1") await cleanup().catch(() => undefined); process.exitCode = 1; });

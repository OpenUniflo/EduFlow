/**
 * Local-only acceptance for fixed independent Workflow references.
 *
 * It creates synthetic users and Workflows, exercises the real API handler,
 * Supabase tables and RPCs against Local Supabase, then deletes every synthetic
 * Workflow and user. It refuses any non-Local Supabase URL.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertLocalSupabaseUrl } from "./local-supabase";

type Row = Record<string, any>;
type Invocation = { status: number; body: any };
type Handler = (request: VercelRequest, response: VercelResponse) => Promise<void> | void;
let workflowsHandler: Handler;

const localUrl = assertLocalSupabaseUrl(required("SUPABASE_URL"));
const secretKey = required("SUPABASE_SECRET_KEY");
const publishableKey = required("VITE_SUPABASE_PUBLISHABLE_KEY");
const runtimeFile = ".acceptance/workflow-v2-m1/runtime-private.json";
let runtime: Row = {};
try { runtime = JSON.parse(readFileSync(runtimeFile, "utf8")); } catch { /* optional local service identity */ }
process.env.WORKFLOW_COMPILER_URL ||= runtime.compilerUrl ?? "http://127.0.0.1:18110";
process.env.WORKFLOW_INTERNAL_TOKEN ||= runtime.internalToken;
if (!process.env.WORKFLOW_INTERNAL_TOKEN) throw new Error("Local Workflow compiler identity is missing; run pnpm workflow:local or set WORKFLOW_INTERNAL_TOKEN.");

const server = createClient(localUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = `Local-${suffix}-Aa1!`;
const createdUserIds: string[] = [];
const workflowIds: string[] = [];
const evidence: Row = { localUrl, compilerUrl: process.env.WORKFLOW_COMPILER_URL, checks: [] as string[] };

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }
function note(message: string) { evidence.checks.push(message); }
function track(workflowId: string) { if (!workflowIds.includes(workflowId)) workflowIds.push(workflowId); }
async function invoke(handler: Handler, method: string, token: string | undefined, query: Row, body?: unknown): Promise<Invocation> {
  let status = 200; let responseBody: unknown;
  const response = {
    status(code: number) { status = code; return response; },
    json(value: unknown) { responseBody = value; return response; },
    setHeader() { return response; },
  } as unknown as VercelResponse;
  const request = { method, headers: token ? { authorization: `Bearer ${token}` } : {}, body, query } as unknown as VercelRequest;
  await handler(request, response);
  return { status, body: responseBody };
}
function expectStatus(result: Invocation, status: number, operation: string) {
  assert.equal(result.status, status, `${operation}: expected ${status}, received ${result.status} (${JSON.stringify(result.body)})`);
}
function expectCode(result: Invocation, status: number, code: string, operation: string) {
  expectStatus(result, status, operation);
  assert.equal(result.body?.error?.code, code, `${operation}: expected ${code}, received ${JSON.stringify(result.body)}`);
}
function expectRpcError(error: { message?: string } | null, code: string, operation: string) {
  assert.ok(error, `${operation}: expected ${code}`);
  assert.match(String(error?.message), new RegExp(code), `${operation}: expected ${code}, received ${error?.message}`);
}

const policy = { timeoutMs: 120000, nodeTimeoutMs: 30000, maxNodeExecutions: 50, maxToolCalls: 10, maxInputBytes: 65536, maxStateBytes: 1048576, maxEventBytes: 65536, maxOutputTokens: 2048, maxAttempts: 1 };
const start = { id: "start", label: "Start", type: "core.start", typeVersion: 1, config: {}, inputs: {}, writes: {} };
const end = { id: "end", label: "End", type: "core.end", typeVersion: 1, config: {}, inputs: {}, writes: {} };
const literal = (value: unknown) => ({ source: "literal", value });
const stateBinding = (field: string) => ({ source: "state", pointer: `/${field}`, onMissing: { mode: "error" } });
const inputBinding = (field: string) => ({ source: "input", pointer: `/${field}`, onMissing: { mode: "error" } });
const inputSchema = { type: "object", properties: { value: { type: "number" } }, required: ["value"], additionalProperties: false };
const outputSchema = { type: "object", properties: { answer: { type: "number" } }, required: ["answer"], additionalProperties: false };

function childDefinition(workflowId: string, revision = 1): Row {
  return {
    schemaVersion: "2.0", workflowId, revision, name: `Child ${workflowId}`, description: "synthetic fixed-reference target",
    inputSchema, outputSchema,
    state: {
      schema: { type: "object", properties: { value: { type: "number" }, answer: { type: "number" } }, required: ["value", "answer"], additionalProperties: false },
      initial: { value: 0, answer: 0 }, inputBindings: { value: inputBinding("value") }, reducers: {},
    },
    entryNodeId: "start",
    nodes: [start, { id: "add", label: "Add", type: "core.transform", typeVersion: 1, config: { operationRef: "core.add", operationVersion: 1 }, inputs: { left: inputBinding("value"), right: literal(37) }, writes: { answer: "/value" } }, end],
    transitions: [{ id: "start-add", from: "start", outlet: "next", to: "add" }, { id: "add-end", from: "add", outlet: "next", to: "end" }],
    outputBindings: { answer: stateBinding("answer") }, policy, requiredCapabilities: [],
  };
}
function referenceNode(id: string, workflowId: string, revision: number, extra: Row = {}) {
  return {
    id, label: `Call ${id}`, type: "core.subgraph", typeVersion: 1,
    config: { workflowRef: { workflowId, revision }, environmentRef: "local", ...extra },
    inputs: { value: literal(5) }, writes: { answer: "/answer" },
  };
}
function embeddedGraph(workflowId: string, revision: number) {
  return {
    schemaVersion: "2.0", workflowId: `${workflowId}-embedded`, revision: 1, name: "Embedded wrapper", description: "",
    inputSchema, outputSchema,
    state: {
      schema: { type: "object", properties: { value: { type: "number" }, answer: { type: "number" } }, required: ["value", "answer"], additionalProperties: false },
      initial: { value: 0, answer: 0 }, inputBindings: { value: inputBinding("value") }, reducers: {},
    },
    entryNodeId: "start",
    nodes: [start, referenceNode("inner", workflowId, revision), end],
    transitions: [{ id: "start-inner", from: "start", outlet: "next", to: "inner" }, { id: "inner-end", from: "inner", outlet: "next", to: "end" }],
    outputBindings: { answer: stateBinding("answer") }, policy, requiredCapabilities: [],
  };
}
function parentDefinition(workflowId: string, targetId: string, targetRevision: number, options: { reuse?: boolean; embedded?: boolean } = {}) {
  const nodes: Row[] = [start, referenceNode("call1", targetId, targetRevision)];
  const transitions = [{ id: "start-call1", from: "start", outlet: "next", to: "call1" }];
  if (options.reuse) {
    nodes.push(referenceNode("call2", targetId, targetRevision));
    transitions.push({ id: "call1-call2", from: "call1", outlet: "next", to: "call2" });
    if (options.embedded) {
      nodes.push({ id: "wrapper", label: "Wrapper", type: "core.subgraph", typeVersion: 1, config: { graph: embeddedGraph(targetId, targetRevision) }, inputs: { value: literal(5) }, writes: { answer: "/answer" } });
      transitions.push({ id: "call2-wrapper", from: "call2", outlet: "next", to: "wrapper" }, { id: "wrapper-end", from: "wrapper", outlet: "next", to: "end" });
    } else transitions.push({ id: "call2-end", from: "call2", outlet: "next", to: "end" });
  } else transitions.push({ id: "call1-end", from: "call1", outlet: "next", to: "end" });
  nodes.push(end);
  return {
    schemaVersion: "2.0", workflowId, revision: 1, name: `Parent ${workflowId}`, description: "synthetic fixed-reference parent",
    inputSchema: { type: "object", properties: { value: { type: "number" } }, additionalProperties: false }, outputSchema,
    state: {
      schema: { type: "object", properties: { answer: { type: "number" } }, required: ["answer"], additionalProperties: false },
      initial: { answer: 0 }, inputBindings: {}, reducers: {},
    },
    entryNodeId: "start", nodes, transitions,
    outputBindings: { answer: stateBinding("answer") }, policy, requiredCapabilities: [],
  };
}
function simpleDefinition(workflowId: string): Row {
  const definition = childDefinition(workflowId);
  definition.inputSchema = { type: "object", properties: { value: { type: "number" } }, additionalProperties: false };
  definition.state.inputBindings = {};
  const add = definition.nodes[1];
  add.inputs = { left: literal(17), right: literal(25) };
  return definition;
}
function editorFor(definition: Row) {
  return {
    schemaVersion: 1, workflowId: definition.workflowId, editorRevision: 1, definitionRevision: definition.revision,
    nodes: Object.fromEntries(definition.nodes.map((node: Row, index: number) => [node.id, { x: 80 + index * 240, y: 160 }])),
    edges: Object.fromEntries(definition.transitions.map((edge: Row) => [edge.id, {}])),
  };
}
async function createWorkflow(token: string, definition: Row, operation: string) {
  const creationId = randomUUID();
  definition.workflowId = creationId;
  const editor = editorFor(definition);
  const result = await invoke(workflowsHandler, "POST", token, { resource: "definitions" }, { definition, editor, creationId });
  expectStatus(result, 201, operation);
  track(creationId);
  return creationId;
}
async function readWorkflow(token: string, workflowId: string, revision?: number) {
  const result = await invoke(workflowsHandler, "GET", token, { resource: "definitions", id: workflowId, ...(revision === undefined ? {} : { revision: String(revision) }) });
  expectStatus(result, 200, `read ${workflowId}${revision === undefined ? "" : `@${revision}`}`);
  return result.body;
}
async function saveWorkflow(token: string, workflowId: string, definition: Row, operation: string) {
  const current = await readWorkflow(token, workflowId);
  const next = { ...definition, workflowId, revision: current.definition.revision + 1 };
  const editor = editorFor(next);
  const result = await invoke(workflowsHandler, "PUT", token, { resource: "definitions", id: workflowId }, { definition: next, editor, baseRevision: current.definition.revision, baseEditorRevision: current.editor.editorRevision, environmentRef: "local" });
  expectStatus(result, 200, operation);
  return result.body as Row;
}
async function directSave(owner: string, workflowId: string, definition: Row, base: number | null, editorRevision: number | null) {
  return server.rpc("workflow_v2_save", {
    p_owner: owner, p_workflow: workflowId, p_base: base, p_editor_base: editorRevision,
    p_definition: definition, p_editor: editorFor({ ...definition, workflowId }), p_definition_hash: `hash-${workflowId}-${base ?? "new"}-${suffix}`, p_provenance: {}, p_environment: "local",
  });
}
async function currentHead(owner: string, workflowId: string) {
  return server.from("workflow_v2_definitions").select("current_revision,editor_revision,archived").eq("owner_user_id", owner).eq("workflow_id", workflowId).maybeSingle();
}

async function main() {
  workflowsHandler = (await import("../api/workflows")).default;
  const users: { id: string; token: string; client: SupabaseClient }[] = [];
  for (const label of ["a", "b"]) {
    const email = `workflow-refs-${label}-${suffix}@eduflow.local`;
    const created = await server.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `Workflow Reference ${label}` } });
    assert.ifError(created.error); assert.ok(created.data.user); createdUserIds.push(created.data.user.id);
    const client = createClient(localUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await client.auth.signInWithPassword({ email, password });
    assert.ifError(signedIn.error); assert.ok(signedIn.data.session);
    users.push({ id: created.data.user.id, token: signedIn.data.session.access_token, client });
  }
  const [a, b] = users;

  const childId = await createWorkflow(a.token, childDefinition("placeholder"), "create target");
  const parentId = await createWorkflow(a.token, parentDefinition("placeholder", childId, 1, { reuse: true, embedded: true }), "create parent with three fixed references");
  const readParent = await readWorkflow(a.token, parentId);
  assert.deepEqual(readParent.definition.nodes.find((node: Row) => node.id === "call1").config.workflowRef, { workflowId: childId, revision: 1 });
  const indexRows = await server.from("workflow_reference_index").select("*").eq("owner_user_id", a.id).eq("workflow_id", parentId);
  assert.ifError(indexRows.error);
  assert.equal(indexRows.data?.length, 3, "root, reused and embedded reference rows are indexed");
  assert.ok(indexRows.data?.some((row: Row) => JSON.stringify(row.graph_path) === JSON.stringify(["wrapper"])));
  note("save/readback: exact child@1 retained in root, reused and embedded mappings");

  const outgoing = await invoke(workflowsHandler, "GET", a.token, { resource: "definitions", id: parentId, op: "references" });
  expectStatus(outgoing, 200, "outgoing references");
  assert.equal(outgoing.body.items.length, 3);
  assert.equal(outgoing.body.items[0].target.revision, 1);
  const incoming = await invoke(workflowsHandler, "GET", a.token, { resource: "definitions", id: childId, op: "referenced-by", revision: "1" });
  expectStatus(incoming, 200, "incoming references");
  assert.equal(incoming.body.items.length, 3);
  assert.ok(incoming.body.items.every((item: Row) => item.sourceCurrent && item.sourceWorkflowId === parentId));

  const childV2 = await saveWorkflow(a.token, childId, childDefinition(childId, 2), "save target v2");
  assert.equal(childV2.revision, 2);
  const readAfterTargetV2 = await readWorkflow(a.token, parentId);
  assert.deepEqual(readAfterTargetV2.definition.nodes.find((node: Row) => node.id === "call1").config.workflowRef, { workflowId: childId, revision: 1 });
  const indexAfterTargetV2 = await server.from("workflow_reference_index").select("target_revision").eq("owner_user_id", a.id).eq("workflow_id", parentId);
  assert.ok((indexAfterTargetV2.data ?? []).every((row: Row) => row.target_revision === 1));
  note("target v2 does not upgrade stored references; index still points at v1");

  const childHead = await currentHead(a.id, childId); assert.ifError(childHead.error);
  const blockedDelete = await invoke(workflowsHandler, "DELETE", a.token, { resource: "definitions", id: childId, op: "delete" }, { baseRevision: childHead.data?.current_revision });
  expectCode(blockedDelete, 409, "WORKFLOW_REFERENCED", "current reference protects old target revision");
  const blockedArchive = await invoke(workflowsHandler, "DELETE", a.token, { resource: "definitions", id: childId }, { baseRevision: childHead.data?.current_revision });
  expectCode(blockedArchive, 409, "WORKFLOW_REFERENCED", "current reference protects archive");
  const directDelete = await server.rpc("workflow_v2_delete", { p_owner: a.id, p_workflow: childId, p_base: childHead.data?.current_revision });
  expectRpcError(directDelete.error, "WORKFLOW_REFERENCED", "database transaction rechecks references");
  note("delete/archive protection is enforced inside the database transaction");

  const badDouble = parentDefinition(parentId, childId, 1);
  badDouble.nodes[1].config.graph = embeddedGraph(childId, 1);
  const doubleSave = await invoke(workflowsHandler, "PUT", a.token, { resource: "definitions", id: parentId }, { definition: { ...badDouble, workflowId: parentId, revision: 4 }, editor: editorFor({ ...badDouble, workflowId: parentId, revision: 4 }), baseRevision: readAfterTargetV2.definition.revision, baseEditorRevision: readAfterTargetV2.editor.editorRevision, environmentRef: "local" });
  expectCode(doubleSave, 400, "INVALID_SUBGRAPH_REFERENCE", "double configuration");
  note("double configuration rejected before writing");

  const missing = parentDefinition("placeholder", childId, 999);
  missing.workflowId = parentId;
  const missingBase = await currentHead(a.id, parentId);
  const missingSave = await invoke(workflowsHandler, "PUT", a.token, { resource: "definitions", id: parentId }, { definition: { ...missing, revision: Number(missingBase.data?.current_revision) + 1 }, editor: editorFor({ ...missing, workflowId: parentId, revision: Number(missingBase.data?.current_revision) + 1 }), baseRevision: Number(missingBase.data?.current_revision), baseEditorRevision: Number(missingBase.data?.editor_revision), environmentRef: "local" });
  expectCode(missingSave, 409, "WORKFLOW_REFERENCE_UNAVAILABLE", "missing exact revision");
  note("missing exact revision rejected");

  const mappingHead = await currentHead(a.id, parentId); assert.ifError(mappingHead.error);
  const badMapping = parentDefinition(parentId, childId, 1); badMapping.nodes[1].inputs = {};
  const mappingSave = await invoke(workflowsHandler, "PUT", a.token, { resource: "definitions", id: parentId }, { definition: { ...badMapping, revision: Number(mappingHead.data?.current_revision) + 1 }, editor: editorFor({ ...badMapping, revision: Number(mappingHead.data?.current_revision) + 1 }), baseRevision: Number(mappingHead.data?.current_revision), baseEditorRevision: Number(mappingHead.data?.editor_revision), environmentRef: "local" });
  expectCode(mappingSave, 400, "WORKFLOW_REFERENCE_MAPPING", "incompatible input mapping");
  note("input mapping is checked against the pinned target revision");

  const crossOwner = await invoke(workflowsHandler, "POST", b.token, { resource: "definitions" }, { definition: parentDefinition("placeholder", childId, 1), editor: editorFor({ ...parentDefinition("placeholder", childId, 1), workflowId: randomUUID() }), creationId: randomUUID() });
  expectCode(crossOwner, 409, "WORKFLOW_REFERENCE_UNAVAILABLE", "cross-owner reference");
  const forbiddenRead = await invoke(workflowsHandler, "GET", b.token, { resource: "definitions", id: parentId });
  expectStatus(forbiddenRead, 404, "cross-owner read");
  note("cross-owner target and cross-owner read are explicitly rejected");

  const copy = await invoke(workflowsHandler, "POST", a.token, { resource: "definitions", op: "copy" }, { sourceWorkflowId: parentId, sourceRevision: 1, name: "Parent copy" });
  expectStatus(copy, 201, "copy fixed references");
  track(copy.body.workflowId);
  const copied = await readWorkflow(a.token, copy.body.workflowId);
  assert.deepEqual(copied.definition.nodes.find((node: Row) => node.id === "call1").config.workflowRef, { workflowId: childId, revision: 1 });
  const copiedIndex = await server.from("workflow_reference_index").select("node_id").eq("owner_user_id", a.id).eq("workflow_id", copy.body.workflowId);
  assert.equal(copiedIndex.data?.length, 3);
  note("copy preserves and revalidates all fixed references");

  const oldRevision = await readWorkflow(a.token, parentId, 1);
  const restored = await invoke(workflowsHandler, "PUT", a.token, { resource: "definitions", id: parentId }, { definition: { ...oldRevision.definition, revision: Number(missingBase.data?.current_revision) + 1 }, editor: editorFor({ ...oldRevision.definition, workflowId: parentId, revision: Number(missingBase.data?.current_revision) + 1 }), baseRevision: Number(missingBase.data?.current_revision), baseEditorRevision: Number(missingBase.data?.editor_revision), environmentRef: "local" });
  expectStatus(restored, 200, "restore old revision with references");
  const restoredRead = await readWorkflow(a.token, parentId);
  assert.deepEqual(restoredRead.definition.nodes.find((node: Row) => node.id === "call1").config.workflowRef, { workflowId: childId, revision: 1 });
  note("restore creates a new revision and revalidates/preserves references");

  const legacyTarget = await createWorkflow(a.token, simpleDefinition("placeholder"), "create legacy target");
  const legacyEmbedded = simpleDefinition("placeholder");
  legacyEmbedded.nodes[1] = { id: "legacy", label: "Legacy", type: "core.subgraph", typeVersion: 1, config: { graph: simpleDefinition("embedded-child") }, inputs: {}, writes: {} };
  legacyEmbedded.transitions = [{ id: "start-legacy", from: "start", outlet: "next", to: "legacy" }, { id: "legacy-end", from: "legacy", outlet: "next", to: "end" }];
  const legacyParent = await createWorkflow(a.token, legacyEmbedded, "create legacy embedded graph");
  const legacyRead = await readWorkflow(a.token, legacyParent);
  assert.equal(legacyRead.definition.nodes[1].type, "core.subgraph");
  assert.ok(legacyRead.definition.nodes[1].config.graph);
  note("legacy embedded config.graph remains readable and saveable");

  // Transitive closure: A current -> B old -> C old. B's current revision no
  // longer references C, but A's current revision still pins B's old revision,
  // so deleting or archiving C must fail. referenced-by/delete-impact must
  // explain the actual chain, and the database transaction must recheck it.
  const transitiveRoot = await createWorkflow(a.token, simpleDefinition("placeholder"), "create transitive root");
  const transitiveMiddle = await createWorkflow(a.token, simpleDefinition("placeholder"), "create transitive middle");
  const transitiveLeaf = await createWorkflow(a.token, simpleDefinition("placeholder"), "create transitive leaf");
  await saveWorkflow(a.token, transitiveMiddle, parentDefinition(transitiveMiddle, transitiveLeaf, 1), "transitive middle -> leaf");
  await saveWorkflow(a.token, transitiveRoot, parentDefinition(transitiveRoot, transitiveMiddle, 2), "transitive root -> middle old");
  await saveWorkflow(a.token, transitiveMiddle, simpleDefinition(transitiveMiddle), "transitive middle drops leaf");
  const transitiveLeafHead = await currentHead(a.id, transitiveLeaf); assert.ifError(transitiveLeafHead.error);
  const transitiveImpact = await invoke(workflowsHandler, "GET", a.token, { resource: "definitions", id: transitiveLeaf, op: "delete-impact" });
  expectStatus(transitiveImpact, 200, "transitive delete impact");
  assert.equal(transitiveImpact.body.referenceCount, 1, `expected one transitive blocking edge: ${JSON.stringify(transitiveImpact.body)}`);
  assert.equal(transitiveImpact.body.referencedBy, 1);
  const transitiveBlock = transitiveImpact.body.blockingReferences?.[0];
  assert.ok(transitiveBlock, "delete impact must include the blocking chain");
  assert.deepEqual(transitiveBlock.chain, [`${transitiveRoot}:2`, `${transitiveMiddle}:2`, `${transitiveLeaf}:1`]);
  assert.equal(transitiveBlock.sourceWorkflowId, transitiveMiddle);
  assert.equal(transitiveBlock.sourceRevision, 2);
  assert.equal(transitiveBlock.sourceCurrent, false);
  assert.ok(Array.isArray(transitiveBlock.chainNames) && transitiveBlock.chainNames.length === 3);
  const transitiveIncoming = await invoke(workflowsHandler, "GET", a.token, { resource: "definitions", id: transitiveLeaf, op: "referenced-by", revision: "1" });
  expectStatus(transitiveIncoming, 200, "transitive referenced-by");
  assert.equal(transitiveIncoming.body.mode, "current-closure");
  assert.equal(transitiveIncoming.body.items.length, 1);
  assert.deepEqual(transitiveIncoming.body.items[0].chain, [`${transitiveRoot}:2`, `${transitiveMiddle}:2`, `${transitiveLeaf}:1`]);
  assert.equal(transitiveIncoming.body.items[0].indirect, true);
  assert.equal(transitiveIncoming.body.items[0].sourceCurrent, false);
  const blockedTransitiveDelete = await invoke(workflowsHandler, "DELETE", a.token, { resource: "definitions", id: transitiveLeaf, op: "delete" }, { baseRevision: transitiveLeafHead.data?.current_revision });
  expectCode(blockedTransitiveDelete, 409, "WORKFLOW_REFERENCED", "transitive current-root closure protects delete");
  const blockedTransitiveArchive = await invoke(workflowsHandler, "DELETE", a.token, { resource: "definitions", id: transitiveLeaf }, { baseRevision: transitiveLeafHead.data?.current_revision });
  expectCode(blockedTransitiveArchive, 409, "WORKFLOW_REFERENCED", "transitive current-root closure protects archive");
  const directTransitiveDelete = await server.rpc("workflow_v2_delete", { p_owner: a.id, p_workflow: transitiveLeaf, p_base: transitiveLeafHead.data?.current_revision });
  expectRpcError(directTransitiveDelete.error, "WORKFLOW_REFERENCED", "database closure protects direct delete");
  const directTransitiveArchive = await server.rpc("workflow_v2_archive", { p_owner: a.id, p_workflow: transitiveLeaf, p_base: transitiveLeafHead.data?.current_revision });
  expectRpcError(directTransitiveArchive.error, "WORKFLOW_REFERENCED", "database closure protects direct archive");
  note("A current -> B old -> C old blocks delete/archive and exposes the full chain");

  // Removing the only current root reference must make the historical chain
  // non-blocking; the old A/B revisions and their index rows stay readable.
  await saveWorkflow(a.token, transitiveRoot, simpleDefinition(transitiveRoot), "transitive root drops old middle");
  const clearedTransitiveImpact = await invoke(workflowsHandler, "GET", a.token, { resource: "definitions", id: transitiveLeaf, op: "delete-impact" });
  expectStatus(clearedTransitiveImpact, 200, "cleared transitive impact");
  assert.equal(clearedTransitiveImpact.body.referenceCount, 0);
  assert.equal(clearedTransitiveImpact.body.referencedBy, 0);
  const clearedTransitiveIncoming = await invoke(workflowsHandler, "GET", a.token, { resource: "definitions", id: transitiveLeaf, op: "referenced-by", revision: "1" });
  expectStatus(clearedTransitiveIncoming, 200, "cleared transitive referenced-by");
  assert.equal(clearedTransitiveIncoming.body.items.length, 0);
  const archiveTransitiveLeaf = await invoke(workflowsHandler, "DELETE", a.token, { resource: "definitions", id: transitiveLeaf }, { baseRevision: transitiveLeafHead.data?.current_revision });
  expectStatus(archiveTransitiveLeaf, 200, "historical-only dependency stops blocking archive");
  const deleteTransitiveLeaf = await invoke(workflowsHandler, "DELETE", a.token, { resource: "definitions", id: transitiveLeaf, op: "delete" }, { baseRevision: transitiveLeafHead.data?.current_revision });
  expectStatus(deleteTransitiveLeaf, 200, "historical-only dependency stops blocking delete");
  note("only dependencies unreachable from every current root stop blocking archive and delete");

  // The derived target rows cascade away with C's revision. Saving a new pin
  // to B's old revision must still validate B's Definition and reject the
  // missing transitive C revision instead of treating it as a leaf.
  const missingTransitiveParentId = randomUUID();
  const missingTransitiveDefinition = parentDefinition(missingTransitiveParentId, transitiveMiddle, 2);
  const missingTransitiveSave = await invoke(workflowsHandler, "POST", a.token, { resource: "definitions" }, { definition: missingTransitiveDefinition, editor: editorFor({ ...missingTransitiveDefinition, workflowId: missingTransitiveParentId }), creationId: missingTransitiveParentId });
  expectCode(missingTransitiveSave, 409, "WORKFLOW_REFERENCE_UNAVAILABLE", "missing transitive target after index cascade");
  note("missing transitive target is revalidated from Definitions after index cascade");

  const transitiveMiddleHead = await currentHead(a.id, transitiveMiddle); assert.ifError(transitiveMiddleHead.error);
  const deleteTransitiveMiddle = await invoke(workflowsHandler, "DELETE", a.token, { resource: "definitions", id: transitiveMiddle, op: "delete" }, { baseRevision: transitiveMiddleHead.data?.current_revision });
  expectStatus(deleteTransitiveMiddle, 200, "delete transitive middle after root drops it");
  const transitiveRootHead = await currentHead(a.id, transitiveRoot); assert.ifError(transitiveRootHead.error);
  const deleteTransitiveRoot = await invoke(workflowsHandler, "DELETE", a.token, { resource: "definitions", id: transitiveRoot, op: "delete" }, { baseRevision: transitiveRootHead.data?.current_revision });
  expectStatus(deleteTransitiveRoot, 200, "delete transitive root");

  // An archived transitive target must fail a new pin to the old source
  // revision, even though that source's current revision dropped the edge.
  const archivedMiddle = await createWorkflow(a.token, simpleDefinition("placeholder"), "create archived-middle");
  const archivedTarget = await createWorkflow(a.token, simpleDefinition("placeholder"), "create archived target");
  await saveWorkflow(a.token, archivedMiddle, parentDefinition(archivedMiddle, archivedTarget, 1), "archived middle -> target");
  await saveWorkflow(a.token, archivedMiddle, simpleDefinition(archivedMiddle), "archived middle drops target");
  const archivedTargetHead = await currentHead(a.id, archivedTarget); assert.ifError(archivedTargetHead.error);
  const archiveTarget = await invoke(workflowsHandler, "DELETE", a.token, { resource: "definitions", id: archivedTarget }, { baseRevision: archivedTargetHead.data?.current_revision });
  expectStatus(archiveTarget, 200, "archive unreferenced transitive target");
  const archivedTransitiveParentId = randomUUID();
  const archivedTransitiveDefinition = parentDefinition(archivedTransitiveParentId, archivedMiddle, 2);
  const archivedTransitiveSave = await invoke(workflowsHandler, "POST", a.token, { resource: "definitions" }, { definition: archivedTransitiveDefinition, editor: editorFor({ ...archivedTransitiveDefinition, workflowId: archivedTransitiveParentId }), creationId: archivedTransitiveParentId });
  expectCode(archivedTransitiveSave, 409, "WORKFLOW_REFERENCE_ARCHIVED", "archived transitive target");
  note("archived transitive target is rejected through the old source revision");
  const archivedMiddleHead = await currentHead(a.id, archivedMiddle); assert.ifError(archivedMiddleHead.error);
  await invoke(workflowsHandler, "DELETE", a.token, { resource: "definitions", id: archivedMiddle, op: "delete" }, { baseRevision: archivedMiddleHead.data?.current_revision });
  await invoke(workflowsHandler, "DELETE", a.token, { resource: "definitions", id: archivedTarget, op: "delete" }, { baseRevision: archivedTargetHead.data?.current_revision });

  // Mapping compatibility is checked on every reachable hop, not only the
  // target of the new root. Corrupt the middle's pinned target revision as an
  // old-data simulation, then a new root pinning the middle must fail.
  const mappingMiddle = await createWorkflow(a.token, simpleDefinition("placeholder"), "create mapping middle");
  const mappingTarget = await createWorkflow(a.token, simpleDefinition("placeholder"), "create mapping target");
  await saveWorkflow(a.token, mappingMiddle, parentDefinition(mappingMiddle, mappingTarget, 1), "mapping middle -> target");
  const originalMappingTarget = await readWorkflow(a.token, mappingTarget, 1);
  const changedMappingTarget = JSON.parse(JSON.stringify(originalMappingTarget.definition));
  changedMappingTarget.inputSchema = { type: "object", properties: { value: { type: "number" }, extra: { type: "number" } }, required: ["value", "extra"], additionalProperties: false };
  const mappingMutation = await server.from("workflow_revisions").update({ definition: changedMappingTarget }).eq("owner_user_id", a.id).eq("workflow_id", mappingTarget).eq("revision", 1);
  assert.ifError(mappingMutation.error);
  const mappingParentId = randomUUID();
  const mappingParentDefinition = parentDefinition(mappingParentId, mappingMiddle, 2);
  const mappingParentSave = await invoke(workflowsHandler, "POST", a.token, { resource: "definitions" }, { definition: mappingParentDefinition, editor: editorFor({ ...mappingParentDefinition, workflowId: mappingParentId }), creationId: mappingParentId });
  expectCode(mappingParentSave, 400, "WORKFLOW_REFERENCE_MAPPING", "transitive mapping compatibility");
  note("interface mapping is checked on the complete reachable chain");
  await server.from("workflow_revisions").update({ definition: originalMappingTarget.definition }).eq("owner_user_id", a.id).eq("workflow_id", mappingTarget).eq("revision", 1);
  await saveWorkflow(a.token, mappingMiddle, simpleDefinition(mappingMiddle), "mapping middle drops target");
  const mappingMiddleHead = await currentHead(a.id, mappingMiddle); assert.ifError(mappingMiddleHead.error);
  await invoke(workflowsHandler, "DELETE", a.token, { resource: "definitions", id: mappingMiddle, op: "delete" }, { baseRevision: mappingMiddleHead.data?.current_revision });
  const mappingTargetHead = await currentHead(a.id, mappingTarget); assert.ifError(mappingTargetHead.error);
  await invoke(workflowsHandler, "DELETE", a.token, { resource: "definitions", id: mappingTarget, op: "delete" }, { baseRevision: mappingTargetHead.data?.current_revision });

  // Concurrency: a save that would make the old chain reachable races a
  // physical delete of the leaf. Exactly one side may win; a save that wins
  // must make delete fail with the chain, and a delete that wins must make the
  // save fail because the pinned transitive revision is gone.
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const raceRoot = await createWorkflow(a.token, simpleDefinition("placeholder"), `race root ${iteration}`);
    const raceMiddle = await createWorkflow(a.token, simpleDefinition("placeholder"), `race middle ${iteration}`);
    const raceLeaf = await createWorkflow(a.token, simpleDefinition("placeholder"), `race leaf ${iteration}`);
    await saveWorkflow(a.token, raceMiddle, parentDefinition(raceMiddle, raceLeaf, 1), `race middle -> leaf ${iteration}`);
    await saveWorkflow(a.token, raceMiddle, simpleDefinition(raceMiddle), `race middle drops leaf ${iteration}`);
    const raceLeafHead = await currentHead(a.id, raceLeaf); assert.ifError(raceLeafHead.error);
    const raceRootHead = await currentHead(a.id, raceRoot); assert.ifError(raceRootHead.error);
    const raceDefinition = parentDefinition(raceRoot, raceMiddle, 2);
    const raceEditor = editorFor({ ...raceDefinition, workflowId: raceRoot, revision: Number(raceRootHead.data?.current_revision) + 1 });
    const [raceSave, raceDelete] = await Promise.all([
      invoke(workflowsHandler, "PUT", a.token, { resource: "definitions", id: raceRoot }, { definition: { ...raceDefinition, workflowId: raceRoot, revision: Number(raceRootHead.data?.current_revision) + 1 }, editor: raceEditor, baseRevision: Number(raceRootHead.data?.current_revision), baseEditorRevision: Number(raceRootHead.data?.editor_revision), environmentRef: "local" }),
      invoke(workflowsHandler, "DELETE", a.token, { resource: "definitions", id: raceLeaf, op: "delete" }, { baseRevision: raceLeafHead.data?.current_revision }),
    ]);
    assert.ok((raceSave.status === 200) !== (raceDelete.status === 200), `iteration ${iteration}: exactly one of current-root save and transitive leaf delete must win (${raceSave.status}/${JSON.stringify(raceSave.body)}, ${raceDelete.status}/${JSON.stringify(raceDelete.body)})`);
    if (raceSave.status === 200) expectCode(raceDelete, 409, "WORKFLOW_REFERENCED", `iteration ${iteration}: winning save protects transitive leaf`);
    else expectCode(raceSave, 409, "WORKFLOW_REFERENCE_UNAVAILABLE", `iteration ${iteration}: winning delete makes pinned chain unavailable`);
    const dangling = await server.from("workflow_reference_index").select("workflow_id,target_workflow_id,target_revision").eq("owner_user_id", a.id).eq("target_workflow_id", raceLeaf);
    for (const row of dangling.data ?? []) {
      const targetRow = await server.from("workflow_revisions").select("revision").eq("owner_user_id", a.id).eq("workflow_id", row.target_workflow_id).eq("revision", row.target_revision).maybeSingle();
      assert.ok(targetRow.data, `iteration ${iteration}: no index row may point at a missing target revision`);
    }
    if (raceSave.status === 200) await saveWorkflow(a.token, raceRoot, simpleDefinition(raceRoot), `race root drops middle ${iteration}`);
    const raceMiddleHead = await currentHead(a.id, raceMiddle); assert.ifError(raceMiddleHead.error);
    await invoke(workflowsHandler, "DELETE", a.token, { resource: "definitions", id: raceMiddle, op: "delete" }, { baseRevision: raceMiddleHead.data?.current_revision });
    const raceRootAfter = await currentHead(a.id, raceRoot); assert.ifError(raceRootAfter.error);
    await invoke(workflowsHandler, "DELETE", a.token, { resource: "definitions", id: raceRoot, op: "delete" }, { baseRevision: raceRootAfter.data?.current_revision });
    if (raceDelete.status === 200) {
      const raceLeafAfter = await currentHead(a.id, raceLeaf);
      assert.equal(raceLeafAfter.data, null, `iteration ${iteration}: winning delete removes the leaf`);
    }
  }
  note("concurrent save of reachable old chain vs delete leaves no dangling current references");

  // Remove references from the current revision, then physical delete must succeed.
  const noRefs = simpleDefinition("placeholder"); noRefs.workflowId = parentId;
  const removalHead = await currentHead(a.id, parentId); assert.ifError(removalHead.error);
  const removal = await invoke(workflowsHandler, "PUT", a.token, { resource: "definitions", id: parentId }, { definition: { ...noRefs, revision: Number(removalHead.data?.current_revision) + 1 }, editor: editorFor({ ...noRefs, workflowId: parentId, revision: Number(removalHead.data?.current_revision) + 1 }), baseRevision: Number(removalHead.data?.current_revision), baseEditorRevision: Number(removalHead.data?.editor_revision), environmentRef: "local" });
  expectStatus(removal, 200, "remove references");
  const emptyIndex = await server.from("workflow_reference_index").select("node_id").eq("owner_user_id", a.id).eq("workflow_id", parentId).eq("revision", Number(removalHead.data?.current_revision) + 1);
  assert.equal(emptyIndex.data?.length, 0);
  const copyHead = await currentHead(a.id, copy.body.workflowId); assert.ifError(copyHead.error);
  const deleteCopy = await invoke(workflowsHandler, "DELETE", a.token, { resource: "definitions", id: copy.body.workflowId, op: "delete" }, { baseRevision: copyHead.data?.current_revision });
  expectStatus(deleteCopy, 200, "delete copy before its target");
  const deleteChild = await invoke(workflowsHandler, "DELETE", a.token, { resource: "definitions", id: childId, op: "delete" }, { baseRevision: childHead.data?.current_revision });
  expectStatus(deleteChild, 200, "delete now-unreferenced target");
  const historical = await readWorkflow(a.token, parentId, 1);
  assert.deepEqual(historical.definition.nodes.find((node: Row) => node.id === "call1").config.workflowRef, { workflowId: childId, revision: 1 });
  note("historical snapshot stays readable after target deletion; current index no longer dangles");

  // Real fixed-revision cycle: corrupt one historical target definition, then
  // a normal save that closes the cycle must be rejected by the database.
  const cycleA = await createWorkflow(a.token, simpleDefinition("placeholder"), "create cycle A");
  const cycleB = await createWorkflow(a.token, simpleDefinition("placeholder"), "create cycle B");
  const cycleA2 = await saveWorkflow(a.token, cycleA, parentDefinition(cycleA, cycleB, 1), "cycle A2 -> B1");
  assert.equal(cycleA2.revision, 2);
  const cycleB1 = await readWorkflow(a.token, cycleB, 1);
  const corrupt = parentDefinition(cycleB, cycleA, 2); corrupt.workflowId = cycleB; corrupt.nodes[1].inputs = {};
  const corruptWrite = await server.from("workflow_revisions").update({ definition: { ...corrupt, workflowId: cycleB, revision: 1 } }).eq("owner_user_id", a.id).eq("workflow_id", cycleB).eq("revision", 1);
  assert.ifError(corruptWrite.error);
  const cycleHead = await currentHead(a.id, cycleA); assert.ifError(cycleHead.error);
  const cycleCloseDefinition = parentDefinition(cycleA, cycleB, 1); cycleCloseDefinition.nodes[1].inputs = {};
  const cycleClose = await invoke(workflowsHandler, "PUT", a.token, { resource: "definitions", id: cycleA }, { definition: { ...cycleCloseDefinition, revision: 3 }, editor: { ...editorFor({ ...cycleCloseDefinition, workflowId: cycleA, revision: 3 }), editorRevision: 1 }, baseRevision: 2, baseEditorRevision: Number(cycleHead.data?.editor_revision), environmentRef: "local" });
  expectCode(cycleClose, 409, "WORKFLOW_REFERENCE_CYCLE", "fixed-version cycle");
  assert.equal(cycleB1.definition.workflowId, cycleB);
  note("actual fixed-revision chain cycle is rejected");
  // Repair the synthetic corrupt revision and remove the pair in dependency order.
  await server.from("workflow_revisions").update({ definition: { ...simpleDefinition(cycleB), workflowId: cycleB } }).eq("owner_user_id", a.id).eq("workflow_id", cycleB).eq("revision", 1);
  await server.rpc("workflow_v2_delete", { p_owner: a.id, p_workflow: cycleA, p_base: 2 });
  await server.rpc("workflow_v2_delete", { p_owner: a.id, p_workflow: cycleB, p_base: 1 });

  // Depth limit: build the deepest target first, then each parent. The root save
  // would create a ninth reference hop and must be rejected.
  const depthIds: string[] = []; let nextTarget: string | undefined;
  for (let index = 8; index >= 0; index -= 1) {
    const id = `ref-depth-${index}-${suffix}`;
    const definition = nextTarget ? parentDefinition(id, nextTarget, 1) : simpleDefinition(id);
    definition.workflowId = id;
    const saved = await directSave(a.id, id, definition, null, null);
    assert.ifError(saved.error);
    track(id); depthIds.push(id);
    nextTarget = id;
  }
  const tooDeep = `ref-depth-root-${suffix}`;
  const tooDeepDefinition = parentDefinition(tooDeep, nextTarget!, 1); tooDeepDefinition.workflowId = tooDeep;
  const depthError = await directSave(a.id, tooDeep, tooDeepDefinition, null, null);
  expectRpcError(depthError.error, "WORKFLOW_REFERENCE_LIMIT", "reference depth limit");
  note("reference depth limit is enforced on the actual chain");

  // Concurrent save/delete must never leave a current index row pointing at a
  // missing target. Whichever transaction wins, the other one fails cleanly.
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const target = `ref-race-target-${iteration}-${suffix}`; const parent = `ref-race-parent-${iteration}-${suffix}`;
    const targetDefinition = simpleDefinition(target); targetDefinition.workflowId = target;
    const targetSave = await directSave(a.id, target, targetDefinition, null, null); assert.ifError(targetSave.error); track(target);
    const parentDefinitionValue = parentDefinition(parent, target, 1); parentDefinitionValue.workflowId = parent;
    const [saveResult, deleteResult] = await Promise.all([
      directSave(a.id, parent, parentDefinitionValue, null, null),
      server.rpc("workflow_v2_delete", { p_owner: a.id, p_workflow: target, p_base: 1 }),
    ]);
    assert.ok(Boolean(saveResult.error) !== Boolean(deleteResult.error), `iteration ${iteration}: exactly one concurrent write must win`);
    if (!saveResult.error) track(parent);
    const dangling = await server.from("workflow_reference_index").select("workflow_id,target_workflow_id,target_revision").eq("owner_user_id", a.id).eq("target_workflow_id", target);
    for (const row of dangling.data ?? []) {
      const targetRow = await server.from("workflow_revisions").select("revision").eq("owner_user_id", a.id).eq("workflow_id", row.target_workflow_id).eq("revision", row.target_revision).maybeSingle();
      assert.ok(targetRow.data, "no current reference may point at a missing target revision");
    }
  }
  note("concurrent save/delete never produces a dangling current reference");

  // RLS and grants: owner-only reads, no browser writes, no direct RPC authority.
  const aIndex = await a.client.from("workflow_reference_index").select("workflow_id,target_workflow_id").eq("owner_user_id", a.id);
  assert.ifError(aIndex.error); assert.ok((aIndex.data ?? []).length > 0);
  const bIndex = await b.client.from("workflow_reference_index").select("workflow_id");
  assert.ifError(bIndex.error); assert.equal(bIndex.data?.length, 0, "RLS hides another owner's derived rows");
  const anon = createClient(localUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonRead = await anon.from("workflow_reference_index").select("workflow_id");
  assert.ok(anonRead.error, "anon has no table grant");
  const browserInsert = await (a.client as any).from("workflow_reference_index").insert({ owner_user_id: a.id, workflow_id: "x", revision: 1, node_id: "n", target_workflow_id: "y", target_revision: 1, target_environment_ref: "local" });
  assert.ok(browserInsert.error, "browser cannot write derived rows");
  const browserRpc = await (a.client as any).rpc("workflow_v2_save", { p_owner: a.id, p_workflow: "x", p_base: null, p_editor_base: null, p_definition: {}, p_editor: {}, p_definition_hash: "x", p_provenance: null, p_environment: "local" });
  assert.ok(browserRpc.error, "browser role cannot execute the save RPC");
  const browserImpact = await (a.client as any).rpc("workflow_v2_reference_impact", { p_owner: a.id, p_workflow: legacyParent });
  assert.ok(browserImpact.error, "browser role cannot execute the reference impact RPC");
  note("RLS/grant checks: owner-only index reads, no anon access, no browser writes or RPC execution");

  evidence.workflows = { childId, parentId, copyId: copy.body.workflowId, depthIds, cycleA, cycleB, legacyParent, legacyTarget };
  evidence.status = "passed";
}

async function cleanup() {
  for (let pass = 0; pass < 3; pass += 1) {
    let remaining = 0;
    for (const workflowId of [...workflowIds].reverse()) {
      const head = await server.from("workflow_v2_definitions").select("current_revision,owner_user_id").eq("workflow_id", workflowId).maybeSingle();
      if (!head.data) continue;
      const result = await server.rpc("workflow_v2_delete", { p_owner: head.data.owner_user_id, p_workflow: workflowId, p_base: head.data.current_revision });
      if (result.error) remaining += 1;
    }
    if (!remaining) break;
  }
  for (const userId of createdUserIds) await server.auth.admin.deleteUser(userId);
}

main().then(async () => {
  await cleanup();
  console.log(JSON.stringify(evidence, null, 2));
}).catch(async (error) => {
  await cleanup().catch(() => undefined);
  console.error(error);
  process.exitCode = 1;
});

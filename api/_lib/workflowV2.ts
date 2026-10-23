import { z } from "zod";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "./supabase.js";
import { ApiError, json } from "./http.js";
import { workflowCompiler, workflowDigest, workflowStrictBody, workflowObject, workflowString, workflowInteger, workflowUuid, workflowProjection, workflowSecretProjection, validateWorkflowEditor, workflowNewId, workflowInputReuse, workflowDiagnosticCorrelation, workflowScopedDiagnostics, type WorkflowRow } from "./workflowV2Protocol.js";
import { applyTemplateBindings, TemplateBindingError, validateTemplateBindings } from "./workflowTemplateBinding.js";
import { readAssignmentEligibility } from "./assignmentEligibility.js";
import { connectionReferenceRows, variableReferenceRows, type ReferenceWorkflow } from "./workflowV2References.js";
import { cleanVariableOverrides, configurationSaveIssue, configurationSaveSchema, frozenVariableEnvironment, normalizeConfiguration, resolveDefaultEnvironmentId, withFrozenVariableEnvironment } from "./workflowVariableEnvironments.js";

type Result<T> = { data: T | null; error: { message: string; code?: string } | null };
function result<T>(query: Result<T>): T {
  if (query.error) {
    const message = query.error.message;
    const code = ["REVISION_CONFLICT", "IDEMPOTENCY_CONFLICT", "WORKFLOW_ARCHIVED", "WORKFLOW_BUSY", "SOURCE_CHANGED", "RUN_QUOTA_EXCEEDED", "LAUNCH_CONTEXT_CHANGED", "THREAD_QUOTA_EXCEEDED", "THREAD_STATE_CONFLICT", "THREAD_NOT_RESUMABLE", "WAIT_EXPIRED", "INTERRUPT_ID_CONFLICT", "INVALID_CONFIGURATION", "VARIABLE_ENVIRONMENT_NOT_FOUND", "NOT_FOUND"].find((code) => message.includes(code));
    if (code) throw new ApiError(code === "NOT_FOUND" ? 404 : ["INVALID_CONFIGURATION", "VARIABLE_ENVIRONMENT_NOT_FOUND"].includes(code) ? 400 : ["RUN_QUOTA_EXCEEDED","THREAD_QUOTA_EXCEEDED"].includes(code) ? 429 : 409, code, code.split("_").join(" "));
    throw new ApiError(500, "WORKFLOW_STORAGE_ERROR", "Workflow persistence request failed");
  }
  return query.data as T;
}
function queryString(request: VercelRequest, key: string) { const value = request.query[key]; return typeof value === "string" ? value : undefined; }
function pageLimit(request: VercelRequest) { const limit = Number(queryString(request, "limit") ?? 100); return Math.max(1, Math.min(Number.isFinite(limit) ? limit : 100, 200)); }
/** Display-only operator metadata; missing or unknown values remain unclassified. */
export function workflowLibraryGroup(provenance: unknown): "test" | "general" | undefined {
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance) || !Object.prototype.hasOwnProperty.call(provenance, "libraryGroup")) return undefined;
  const group = (provenance as WorkflowRow).libraryGroup;
  return group === "test" || group === "general" ? group : undefined;
}
async function rpc(client: SupabaseClient, name: string, args: WorkflowRow) { return result(await client.rpc(name, args)) as WorkflowRow; }
async function head(client: SupabaseClient, owner: string, id: string) {
  const row = result(await client.from("workflow_v2_definitions").select("*").eq("owner_user_id", owner).eq("workflow_id", id).maybeSingle()) as WorkflowRow | null;
  if (!row) throw new ApiError(404, "NOT_FOUND", "Workflow not found"); return row;
}
export async function readWorkflowDocument(client: SupabaseClient, owner: string, id: string, revision?: number, layout: "snapshot" | "current" = revision === undefined ? "current" : "snapshot") {
  const current = await head(client, owner, id);
  const selected = revision ?? Number(current.current_revision);
  const row = result(await client.from("workflow_revisions").select("*").eq("owner_user_id", owner).eq("workflow_id", id).eq("revision", selected).maybeSingle()) as WorkflowRow | null;
  if (!row) throw new ApiError(404, "NOT_FOUND", "Workflow revision not found");
  let editor = row.editor_snapshot;
  if (layout === "current" && selected === Number(current.current_revision)) editor = (result(await client.from("workflow_editor_documents").select("document").eq("owner_user_id", owner).eq("workflow_id", id).single()) as WorkflowRow).document;
  return { definition: workflowObject(row.definition), editor: workflowObject(editor), archived: current.archived === true, provenance: current.provenance };
}
const REFERENCE_PAGE_SIZE = 100;
/**
 * Loads every non-archived Workflow's current definition for the resource reference scans.
 * Callers pass the authenticated user client so the reads remain RLS-scoped; the owner
 * filter is kept as defense in depth. Definitions are read from their current revision so
 * the scan never depends on unsaved editor layout.
 */
async function loadReferenceWorkflows(client: SupabaseClient, owner: string): Promise<ReferenceWorkflow[]> {
  const workflows: ReferenceWorkflow[] = [];
  let cursor: string | undefined;
  for (;;) {
    let query = client.from("workflow_v2_definitions").select("workflow_id,current_revision,archived").eq("owner_user_id", owner).eq("archived", false).order("workflow_id").limit(REFERENCE_PAGE_SIZE);
    if (cursor) query = query.gt("workflow_id", cursor);
    const heads = result(await query) as WorkflowRow[];
    const active = heads.filter((row) => row.archived !== true && Number(row.current_revision) > 0);
    const definitions: (ReferenceWorkflow | null)[] = [];
    // Bound concurrent revision reads for owners with many Workflows.
    for (let index = 0; index < active.length; index += 10) {
      definitions.push(...await Promise.all(active.slice(index, index + 10).map(async (row): Promise<ReferenceWorkflow | null> => {
        const workflowId = String(row.workflow_id);
        const revision = result(await client.from("workflow_revisions").select("revision,definition").eq("owner_user_id", owner).eq("workflow_id", workflowId).eq("revision", Number(row.current_revision)).maybeSingle()) as WorkflowRow | null;
        if (!revision) return null;
        const definition = workflowObject(revision.definition);
        const revisionNumber = Number(revision.revision);
        return {
          workflowId,
          workflowName: typeof definition.name === "string" && definition.name.trim() ? definition.name : workflowId,
          revision: Number.isSafeInteger(revisionNumber) && revisionNumber > 0 ? revisionNumber : Number(row.current_revision),
          definition,
        };
      })));
    }
    workflows.push(...definitions.filter((row): row is ReferenceWorkflow => row !== null));
    if (heads.length < REFERENCE_PAGE_SIZE) break;
    cursor = String(heads[heads.length - 1].workflow_id);
  }
  return workflows;
}
function libraryName(value: unknown) {
  const name = workflowString(value).trim();
  if (!name || name.length > 120) throw new ApiError(400, "INVALID_NAME", "Name must contain 1 to 120 characters");
  return name;
}
async function saveCreation(client: SupabaseClient, owner: string, definition: WorkflowRow, editor: WorkflowRow, hash: unknown, provenance: WorkflowRow = {}) {
  const workflowId = String(definition.workflowId);
  const creationHash = await workflowDigest({ definition, editor });
  async function previous() {
    const existing = result(await client.from("workflow_v2_definitions").select("current_revision,editor_revision,provenance").eq("owner_user_id", owner).eq("workflow_id", workflowId).maybeSingle()) as WorkflowRow | null;
    if (!existing) return null;
    if (workflowObject(existing.provenance ?? {}).creationHash !== creationHash) throw new ApiError(409,"IDEMPOTENCY_CONFLICT","Creation content changed");
    return { workflowId, revision: existing.current_revision, editorRevision: existing.editor_revision };
  }
  const replay = await previous(); if (replay) return replay;
  try { return await rpc(client,"workflow_v2_save",{p_owner:owner,p_workflow:workflowId,p_base:null,p_editor_base:null,p_definition:definition,p_editor:editor,p_definition_hash:hash,p_provenance:{...provenance,creationHash}}); }
  catch (error) { if (error instanceof ApiError && error.code === "REVISION_CONFLICT") { const receipt = await previous(); if (receipt) return receipt; } throw error; }
}
async function liveRun(client: SupabaseClient, owner: string, id: string) {
  workflowUuid(id);
  const row = result(await client.from("workflow_live_runs").select("*").eq("owner_user_id", owner).eq("run_id", id).maybeSingle()) as WorkflowRow | null;
  if (!row) {
    const tombstone = result(await client.from("workflow_run_tombstones").select("run_id").eq("owner_user_id", owner).eq("run_id", id).maybeSingle());
    throw new ApiError(tombstone ? 410 : 404, tombstone ? "HISTORY_EXPIRED" : "NOT_FOUND", tombstone ? "Run history has expired" : "Run not found");
  }
  return row;
}
/** Current variable-environment names for display fallback when a Run has no frozen name. */
async function variableEnvironmentNames(client: SupabaseClient, owner: string, ids: readonly (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (!unique.length) return new Map<string, string>();
  const rows = result(await client.from("workflow_variable_environments").select("id,name").eq("owner_user_id", owner).in("id", unique)) as WorkflowRow[];
  return new Map(rows.map((row) => [String(row.id), String(row.name)]));
}
/** Reads the normalized workspace configuration; the RPC lazily creates the default environment. */
async function readConfiguration(client: SupabaseClient, owner: string) {
  return normalizeConfiguration(await rpc(client, "workflow_v2_configuration_read", { p_owner: owner }));
}
/**
 * Resolves the Run's effective variable environment. An explicit id must be owned by the
 * caller; otherwise the owner's default environment is used (the Worker would resolve the
 * same default when no id is sent, but freezing it here keeps the Run deterministic).
 */
async function selectedVariableEnvironment(client: SupabaseClient, owner: string, requested?: string) {
  if (requested !== undefined) {
    const row = result(await client.from("workflow_variable_environments").select("id,name").eq("owner_user_id", owner).eq("id", workflowUuid(requested)).maybeSingle()) as WorkflowRow | null;
    if (!row) throw new ApiError(400, "INVALID_VARIABLE_ENVIRONMENT", "Variable environment not found");
    return { id: String(row.id), name: String(row.name) };
  }
  const configuration = result(await client.from("workflow_workspace_configuration").select("default_environment_id").eq("owner_user_id", owner).maybeSingle()) as WorkflowRow | null;
  const defaultId = typeof configuration?.default_environment_id === "string" ? configuration.default_environment_id : "";
  if (!defaultId) return null;
  const row = result(await client.from("workflow_variable_environments").select("id,name").eq("owner_user_id", owner).eq("id", defaultId).maybeSingle()) as WorkflowRow | null;
  return row ? { id: String(row.id), name: String(row.name) } : null;
}
/**
 * Run projection. The selected variable environment is returned as frozen identity (id) and
 * display name; the name is preferred from the frozen registry snapshot so historical Runs
 * keep it after the environment is deleted, with the current row name as a fallback.
 */
export function workflowRunDto(row: WorkflowRow, includeInputReuse = false, environmentNames?: ReadonlyMap<string, string>) {
  const frozen = frozenVariableEnvironment(row.registry_snapshot);
  const variableEnvironmentId = typeof row.variable_environment_id === "string" && row.variable_environment_id ? row.variable_environment_id : frozen.id;
  const variableEnvironment = frozen.name ?? (variableEnvironmentId ? environmentNames?.get(variableEnvironmentId) ?? null : null);
  const projected = workflowProjection({ runId: row.run_id, threadId: row.thread_id, resumeOfRunId: row.resume_of_run_id, continuationRunId: row.continuation_run_id, workflowId: row.workflow_id, revision: row.revision, mode: row.mode, verification: row.verification, status: row.status, variableEnvironmentId: variableEnvironmentId ?? null, variableEnvironment: variableEnvironment ?? null, launchContext: row.launch_context ?? undefined, definitionHash: row.definition_hash, semanticHash: row.semantic_hash, compileFingerprint: row.compile_fingerprint, environmentRef: row.environment_ref, environmentRevision: row.environment_revision, operation: row.operation, policyVersion: row.policy_version, inputRef: `run:${row.run_id}:input`, ...(row.output === null ? {} : { output: row.output, outputRef: `run:${row.run_id}:output` }), finalState: row.raw_state, error: row.error ? { ...workflowObject(row.error), scope: "run", runId: row.run_id } : undefined, createdAt: row.created_at, startedAt: row.started_at, finishedAt: row.finished_at, cancelRequestedAt: row.cancel_requested_at, lastSeq: row.last_seq }) as WorkflowRow;
  return { ...projected, ...(includeInputReuse ? { inputReuse: workflowInputReuse(row.input) } : {}) };
}
function eventDto(row: WorkflowRow) { return workflowProjection({ protocolVersion: "1", eventId: row.event_id, runId: row.run_id, seq: row.seq, type: row.type, occurredAt: row.occurred_at, stepId: row.step_id, nodeId: row.node_id, attempt: row.attempt, stateVersion: row.state_version, payload: row.payload }); }
function stepDto(row: WorkflowRow) { return workflowProjection({ ...(row.execution_identity ? {execution: row.execution_identity, graphPath: workflowObject(row.execution_identity).graphPath ?? [], taskId: workflowObject(row.execution_identity).taskId} : {}), runId: row.run_id, stepId: row.step_id, nodeId: row.node_id, invocation: row.invocation, attempt: row.attempt, status: row.status, input: row.input, output: row.output, inputRef: `step:${row.run_id}:${row.step_id}:input`, outputRef: `step:${row.run_id}:${row.step_id}:output`, stateVersionBefore: row.state_version_before, stateVersionAfter: row.state_version_after, startedAt: row.started_at, finishedAt: row.finished_at, error: row.error ? { ...workflowObject(row.error), scope: "run", runId: row.run_id, stepId: row.step_id, invocation: row.invocation } : undefined, usage: row.usage, toolCallIds: row.tool_call_ids }); }
function threadDto(row: WorkflowRow) {
  return workflowProjection({threadId:row.thread_id,workflowId:row.workflow_id,revision:row.revision,status:row.status,currentRunId:row.current_run_id,checkpointId:row.checkpoint_id,state:row.state,stateVersion:row.state_version,interrupts:row.interrupts,waitExpiresAt:row.wait_expires_at,updatedAt:row.updated_at,lastError:row.last_error,nodeExecutions:row.node_executions,toolCalls:row.tool_calls,computeMs:row.compute_ms});
}
async function executionThread(client: SupabaseClient,owner:string,id:string) {
  const row=result(await client.from('workflow_execution_threads').select('*').eq('owner_user_id',owner).eq('thread_id',workflowUuid(id)).maybeSingle()) as WorkflowRow|null;
  if(!row)throw new ApiError(404,'NOT_FOUND','Execution thread not found'); return row;
}
async function resumeThread(client:SupabaseClient,owner:string,id:string,body:WorkflowRow) {
  const checkpoint=workflowString(body.checkpointId); const responses=workflowObject(body.responses);
  if(JSON.stringify(responses)!==JSON.stringify(workflowSecretProjection(responses)))throw new ApiError(400,'SECRET_IN_RUN_INPUT','Credentials cannot enter node responses');
  const expectedRun=body.currentRunId===undefined?undefined:workflowUuid(body.currentRunId);
  const hash=await workflowDigest({threadId:id,checkpointId:checkpoint,responses,...(expectedRun?{currentRunId:expectedRun}:{})}); const key='resume:'+hash;
  const prior=result(await client.from('workflow_idempotency').select('*').eq('owner_user_id',owner).eq('key',key).gt('expires_at',new Date().toISOString()).maybeSingle()) as WorkflowRow|null;
  // A lost response can be recovered even after the Thread moved on or was pruned.
  if(prior){ const run=result(await client.from('workflow_live_runs').select('status,last_seq').eq('owner_user_id',owner).eq('run_id',prior.run_id).maybeSingle()) as WorkflowRow|null;return {runId:prior.run_id,revision:prior.revision,status:run?.status??'expired',historyExpired:!run,eventsCursor:run?.last_seq??0}; }
  const thread=await executionThread(client,owner,id);
  if(expectedRun&&thread.current_run_id!==expectedRun)throw new ApiError(409,'THREAD_STATE_CONFLICT','Waiting tasks have changed; refresh before responding');
  if(thread.checkpoint_id!==checkpoint||!['waiting','closed'].includes(String(thread.status)))throw new ApiError(409,'THREAD_STATE_CONFLICT','Thread has already moved on');
  const doc=await readWorkflowDocument(client,owner,String(thread.workflow_id),Number(thread.revision));
  await workflowCompiler('/v1/resume-validate',{ownerId:owner,thread,definition:doc.definition,responses});
  return rpc(client,'workflow_v2_resume',{p_owner:owner,p_thread:id,p_checkpoint:checkpoint,p_responses:responses,p_hash:hash,p_key:key,...(expectedRun?{p_expected_run:expectedRun}:{})});
}
async function validateLaunch(client: SupabaseClient, owner: string, workflowId: string, value: unknown) {
  if (value === undefined) return null;
  const context = workflowStrictBody(value, ["courseId", "assignmentId", "workflowTemplateId"], ["courseId", "assignmentId", "workflowTemplateId"]);
  Object.values(context).forEach(workflowString);
  if (context.workflowTemplateId !== workflowId) throw new ApiError(403, "INVALID_LAUNCH_CONTEXT", "Copied workflows cannot claim Assignment template authority");
  const course = result(await client.from("courses").select("id,lifecycle,owner_user_id,course_type").eq("id", context.courseId).maybeSingle()) as WorkflowRow | null;
  if (!course || course.lifecycle !== "published" || course.course_type === "personal" && course.owner_user_id !== owner) throw new ApiError(404, "NOT_FOUND", "Course not found");
  const assignment = result(await client.from("course_assignments").select("*").eq("course_id", context.courseId).eq("id", context.assignmentId).maybeSingle()) as WorkflowRow | null;
  if (!assignment || assignment.mode !== "workflow" || assignment.workflow_template_id !== workflowId) throw new ApiError(403, "INVALID_LAUNCH_CONTEXT", "Assignment does not authorize this template");
  const { eligibility } = await readAssignmentEligibility(client, owner, String(context.courseId), String(context.assignmentId));
  if (eligibility.reason) throw new ApiError(403, "ASSIGNMENT_PREREQUISITE_REQUIRED", eligibility.reason);
  if (!eligibility.canStart) throw new ApiError(409, "ASSIGNMENT_STATE_CONFLICT", "This Assignment is submitted or complete; view its saved result instead");
  // Freeze identities only; Runtime never receives product entities or context.
  return { context, workflowInput: assignment.workflow_input === null || assignment.workflow_input === undefined ? undefined : assignment.workflow_input };
}

export async function handleWorkflowV2(request: VercelRequest, response: VercelResponse, owner: string, userClient?: SupabaseClient) {
  const resource = queryString(request, "resource"); if (!resource) return false;
  const op = queryString(request, "op"); const id = queryString(request, "id"); const client = createServerSupabase();
  if (resource === "capabilities" && request.method === "GET") { json(response, 200, await workflowCompiler("/capabilities")); return true; }
  if (resource === "templates" && request.method === "GET") {
    if (id) {
      const templateId = workflowString(id);
      const row = result(await client.from("workflow_templates").select("id,name,description,definition").eq("id", templateId).eq("definition->>schemaVersion", "2.0").maybeSingle()) as WorkflowRow | null;
      if (!row) throw new ApiError(404, "NOT_FOUND", "Workflow template not found");
      json(response, 200, { workflowId: row.id, name: row.name, description: row.description, definition: row.definition }); return true;
    }
    const rows = result(await client.from("workflow_templates").select("id,name,description,definition").eq("definition->>schemaVersion", "2.0").order("id")) as WorkflowRow[];
    json(response, 200, { items: rows.map(row => ({ workflowId: row.id, name: row.name, description: row.description })) }); return true;
  }
  if (resource === "p5" && request.method === "POST") {
    const body=workflowStrictBody(request.body,["action","workflowId","environmentRef","threadId","checkpointId","namespace","graphPath","before","input","updates","idempotencyKey","confirmExternalEffects","scope","collection","key","value","expectedVersion","ttlMinutes","offset"],["action"]);
    if(JSON.stringify(body)!==JSON.stringify(workflowSecretProjection(body)))throw new ApiError(400,'SECRET_IN_RUN_INPUT','Credentials cannot enter memory or state updates');
    const data=await workflowCompiler('/v1/p5',{...body,ownerId:owner});
    json(response,200,workflowProjection(data));return true;
  }
  if(resource === "extensions") {
    if(request.method === "GET" && queryString(request,"view") === "references") {
      // Read-only reference scan; the user client keeps the query RLS-scoped to its owner.
      const ref = workflowString(queryString(request,"ref"));
      const workflows = await loadReferenceWorkflows(userClient ?? client, owner);
      json(response,200,{items:connectionReferenceRows(workflows,ref)});return true;
    }
    if(request.method === "GET") json(response,200,await workflowCompiler("/v1/extensions",{ownerId:owner,environmentRef:workflowString(queryString(request,"environmentRef"))}));
    else if(request.method === "POST") {
      const body=workflowStrictBody(request.body,["environmentRef","action","kind","ref","version","content","credential","arguments","confirmExternalEffect"],["environmentRef","action","kind","ref","version"]);
      workflowString(body.environmentRef);json(response,200,await workflowCompiler("/v1/extensions",{...body,ownerId:owner}));
    } else throw new ApiError(405,"METHOD_NOT_ALLOWED","Unsupported extension operation");
    return true;
  }
  if(resource === "configuration") {
    if(request.method === "GET") {
      if(queryString(request,"view") === "references") {
        const workflows = await loadReferenceWorkflows(userClient ?? client, owner);
        json(response,200,{items:variableReferenceRows(workflows)});return true;
      }
      json(response,200,await readConfiguration(client,owner));return true;
    }
    if(request.method === "PUT") {
      const parsed=configurationSaveSchema.safeParse(request.body);
      if(!parsed.success)throw new ApiError(400,"INVALID_CONFIGURATION","Invalid variable configuration");
      const body=parsed.data;
      if(new Set(body.variables.map(v=>v.key)).size!==body.variables.length)throw new ApiError(400,"INVALID_CONFIGURATION","Variable names must be unique");
      if(JSON.stringify(body.variables)!==JSON.stringify(workflowSecretProjection(body.variables)))throw new ApiError(400,"SECRET_IN_DEFINITION","Use managed connections for credentials");
      // Descriptions are ordinary prose, but they still must not smuggle credential material.
      if(body.variables.some(v=>v.description!==undefined&&v.description!==workflowSecretProjection(v.description)))throw new ApiError(400,"SECRET_IN_DEFINITION","Secrets belong in connections");
      // key is a value in the array: also inspect the effective keyed object to reject credential names.
      const keyed=Object.fromEntries(body.variables.map(v=>[v.key,v.value]));if(JSON.stringify(keyed)!==JSON.stringify(workflowSecretProjection(keyed)))throw new ApiError(400,"SECRET_IN_DEFINITION","Secrets belong in connections");
      const current=await readConfiguration(client,owner);
      // Older clients that only send variables keep the existing environments instead of
      // deleting them.
      const environments = body.environments === undefined
        ? current.environments.map(({id,name,description,order})=>({id,name,description,order}))
        : body.environments;
      const issue=configurationSaveIssue({environments,defaultEnvironmentId:body.defaultEnvironmentId});
      if(issue)throw new ApiError(400,"INVALID_CONFIGURATION",issue);
      if(environments.some(environment=>environment.name!==workflowSecretProjection(environment.name)||(environment.description??"")!==workflowSecretProjection(environment.description??"")))throw new ApiError(400,"SECRET_IN_DEFINITION","Secrets belong in connections");
      // Whole-table save: overrides owned by removed environments are dropped, and the
      // default pointer falls back to the first remaining environment.
      const environmentIds=new Set(environments.map(environment=>environment.id).filter((id):id is string => typeof id==="string"&&id.length>0));
      const variables=cleanVariableOverrides(body.variables,environmentIds);
      const requestedDefault=body.defaultEnvironmentId===undefined?current.defaultEnvironmentId:body.defaultEnvironmentId;
      const defaultEnvironmentId=resolveDefaultEnvironmentId(environments,requestedDefault);
      const saved=await rpc(client,"workflow_v2_configuration_save",{p_owner:owner,p_base:body.baseRevision,p_variables:variables,p_environments:environments.map((environment,index)=>({...(environment.id!==undefined?{id:environment.id}:{}),name:environment.name,description:environment.description??"",order:environment.order??index})),p_default:defaultEnvironmentId});
      json(response,200,normalizeConfiguration(saved));return true;
    }
  }
  if (resource === "environments" && request.method === "GET") { json(response, 200, await workflowCompiler("/v1/catalog", { ownerId: owner })); return true; }
  if (resource === "tools") {
    if (request.method === "GET") json(response, 200, await workflowCompiler("/v1/catalog", { ownerId: owner, environmentRef: workflowString(queryString(request, "environmentRef")) }));
    else if (request.method === "POST" && op === "discover") { const body = workflowStrictBody(request.body, ["environmentRef", "connectorRef"], ["environmentRef", "connectorRef"]); json(response, 200, await workflowCompiler("/v1/discover", { ...body, ownerId: owner })); }
    else throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported tool operation"); return true;
  }
  if (resource === "definitions") {
    if (request.method === "POST" && op === "template") {
      const body = workflowStrictBody(request.body, ["templateId", "name", "creationId", "fresh", "environmentRef", "bindings"], ["templateId"]);
      if (body.fresh !== undefined && typeof body.fresh !== "boolean") throw new ApiError(400,"INVALID_REQUEST","Invalid template creation mode");
      const templateId = workflowString(body.templateId);
      const template = result(await client.from("workflow_templates").select("definition").eq("id",templateId).eq("definition->>schemaVersion","2.0").maybeSingle()) as WorkflowRow | null;
      if (!template) throw new ApiError(404,"NOT_FOUND","Workflow template not found");
      const workflowId = body.fresh === true ? workflowUuid(body.creationId) : templateId;
      const existing = body.fresh === true ? null : result(await client.from("workflow_v2_definitions").select("workflow_id,current_revision").eq("owner_user_id",owner).eq("workflow_id",templateId).maybeSingle()) as WorkflowRow | null;
      if(existing) { json(response,200,{workflowId:templateId,revision:existing.current_revision}); return true; }
      const definition: WorkflowRow = { ...workflowObject(template.definition), workflowId, revision:1, ...(body.name !== undefined ? {name:libraryName(body.name)} : {}) };
      const bindings = z.array(z.object({
        nodeId: z.string().min(1).max(200),
        graphPath: z.array(z.string().max(200)).max(8),
        field: z.enum(["providerRef", "toolRef"]),
        reference: z.string().min(1).max(500),
        modelRef: z.string().max(200).optional(),
        contractDigest: z.string().max(200).optional(),
      })).max(100).safeParse(body.bindings ?? []);
      if (!bindings.success) throw new ApiError(400, "INVALID_REQUEST", "Invalid template bindings");
      let boundDefinition = definition;
      if (bindings.data.length) {
        const environmentRef = workflowString(body.environmentRef);
        const catalog = await workflowCompiler<{ items?: unknown[]; environment?: { providers?: unknown[] } }>("/v1/catalog", { ownerId: owner, environmentRef });
        const providers = Array.isArray(catalog.environment?.providers) ? catalog.environment.providers as WorkflowRow[] : [];
        const tools = Array.isArray(catalog.items) ? catalog.items as WorkflowRow[] : [];
        try {
          validateTemplateBindings(bindings.data, {
            providers: providers.map(item => ({ ref: String(item.ref), modelRefs: Array.isArray(item.modelRefs) ? item.modelRefs.map(String) : [] })),
            tools: tools.map(item => ({ ref: String(item.ref), available: item.available !== false, ...(typeof item.contractDigest === "string" ? { contractDigest: item.contractDigest } : {}) })),
          });
          boundDefinition = applyTemplateBindings(definition, bindings.data) as WorkflowRow;
        } catch (reason) {
          if (reason instanceof TemplateBindingError) throw new ApiError(409, reason.code, reason.message);
          throw reason;
        }
      }
      const nodes = boundDefinition.nodes as WorkflowRow[];
      const editor = { schemaVersion:1,workflowId,editorRevision:1,definitionRevision:1,nodes:Object.fromEntries(nodes.map((node,index)=>[String(node.id),{x:80+index*280,y:180}])),edges:{} };
      const validation = await workflowCompiler("/v1/document",{definition:boundDefinition});
      json(response,201,await saveCreation(client,owner,boundDefinition,editor,validation.definitionHash,{sourceTemplateId:templateId,libraryGroup:"general"})); return true;
    }
    if (request.method === "GET" && op === "library") {
      const params = z.object({search:z.string().max(200),scope:z.enum(["all","personal","course"]),sort:z.enum(["updated","name"]),page:z.coerce.number().int().min(1).max(1000000),pageSize:z.coerce.number().int().min(1).max(48)}).safeParse({search:queryString(request,"search")??"",scope:queryString(request,"scope")??"all",sort:queryString(request,"sort")??"updated",page:queryString(request,"page")??1,pageSize:queryString(request,"pageSize")??12});
      if (!params.success) throw new ApiError(400,"INVALID_REQUEST","Invalid library query");
      const p=params.data; json(response,200,await rpc(client,"workflow_v2_library_page",{p_owner:owner,p_search:p.search,p_scope:p.scope,p_sort:p.sort,p_page:p.page,p_size:p.pageSize})); return true;
    }
    if (request.method === "GET" && id && op === "delete-impact") {
      const current=await head(client,owner,id);
      const [versions,runs,threads]=await Promise.all([
        client.from("workflow_revisions").select("revision",{count:"exact",head:true}).eq("owner_user_id",owner).eq("workflow_id",id),
        client.from("workflow_live_runs").select("status").eq("owner_user_id",owner).eq("workflow_id",id),
        client.from("workflow_execution_threads").select("thread_id",{count:"exact",head:true}).eq("owner_user_id",owner).eq("workflow_id",id).in("status",["active","waiting"])
      ]); result(versions); const rows=result(runs) as WorkflowRow[];
      json(response,200,{revision:current.current_revision,revisions:versions.count??0,runs:rows.length,activeRuns:(result(threads),threads.count??0)}); return true;
    }
    if (request.method === "DELETE" && id && op === "delete") {
      const body=workflowStrictBody(request.body,["baseRevision"],["baseRevision"]);
      json(response,200,await rpc(client,"workflow_v2_delete",{p_owner:owner,p_workflow:id,p_base:workflowInteger(body.baseRevision)})); return true;
    }
    if (request.method === "PATCH" && id && op === "rename") {
      const body=workflowStrictBody(request.body,["name","baseRevision"],["name","baseRevision"]);
      const current=await readWorkflowDocument(client,owner,id); const base=workflowInteger(body.baseRevision);
      if(current.definition.revision!==base)throw new ApiError(409,"REVISION_CONFLICT","Workflow revision changed");
      if(current.archived)throw new ApiError(409,"WORKFLOW_ARCHIVED","Archived Workflow cannot be renamed");
      const definition={...current.definition,name:libraryName(body.name),revision:base+1};
      const validation=await workflowCompiler("/v1/document",{definition});
      json(response,200,await rpc(client,"workflow_v2_save",{p_owner:owner,p_workflow:id,p_base:base,p_editor_base:current.editor.editorRevision,p_definition:definition,p_editor:current.editor,p_definition_hash:validation.definitionHash})); return true;
    }
    if (request.method === "GET" && id) {
      const revision = queryString(request, "revision"); const doc = await readWorkflowDocument(client, owner, id, revision ? workflowInteger(Number(revision)) : undefined);
      const validation = await workflowCompiler("/v1/document", { definition: doc.definition });
      json(response, 200, { ...doc, ...validation, diagnostics: workflowScopedDiagnostics(validation.diagnostics) }); return true;
    }
    if (request.method === "GET") {
      let query = client.from("workflow_v2_definitions").select("*").eq("owner_user_id", owner).order("workflow_id").limit(pageLimit(request) + 1);
      if (queryString(request, "archived") !== "true") query = query.eq("archived", false);
      const cursor = queryString(request, "cursor"); if (cursor) query = query.gt("workflow_id", cursor);
      const heads = result(await query) as WorkflowRow[]; const visible = heads.slice(0, pageLimit(request));
      const items = await Promise.all(visible.map(async (row) => { const doc = await readWorkflowDocument(client, owner, String(row.workflow_id)); const group = workflowLibraryGroup(row.provenance); return { workflowId: row.workflow_id, revision: row.current_revision, name: doc.definition.name, description: doc.definition.description, archived: row.archived, nodeCount: (doc.definition.nodes as unknown[]).length, provenance: row.provenance, updatedAt: row.updated_at, ...(group ? { group } : {}) }; }));
      json(response, 200, { items, nextCursor: heads.length > visible.length ? visible[visible.length - 1]?.workflow_id : null }); return true;
    }
    if (request.method === "DELETE" && id) {
      const body = workflowStrictBody(request.body, ["baseRevision"], ["baseRevision"]); const current = await head(client, owner, id);
      if (current.current_revision !== body.baseRevision) throw new ApiError(409, "REVISION_CONFLICT", "Workflow revision changed");
      const rows = result(await client.from("workflow_v2_definitions").update({ archived: true }).eq("owner_user_id", owner).eq("workflow_id", id).eq("current_revision", body.baseRevision).select("workflow_id")) as WorkflowRow[];
      if (!rows.length) throw new ApiError(409, "REVISION_CONFLICT", "Workflow revision changed"); json(response, 200, { ok: true }); return true;
    }
    if (request.method === "POST" && op === "copy") {
      const body = workflowStrictBody(request.body, ["sourceWorkflowId", "sourceRevision", "name", "creationId"], ["sourceWorkflowId", "sourceRevision"]);
      const sourceId = workflowString(body.sourceWorkflowId); const source = await readWorkflowDocument(client, owner, sourceId, workflowInteger(body.sourceRevision), "current"); const workflowId = body.creationId !== undefined ? workflowUuid(body.creationId) : workflowNewId();
      const definition = { ...source.definition, workflowId, revision: 1, name: body.name !== undefined ? libraryName(body.name) : `${source.definition.name} 副本` }; const editor = { ...source.editor, workflowId, definitionRevision: 1, editorRevision: 1 };
      const hash = await workflowDigest(definition);
      const provenance = { ...workflowObject(source.provenance ?? {}), copiedFromWorkflowId: sourceId, sourceRevision: source.definition.revision };
      json(response, 201, body.creationId !== undefined ? await saveCreation(client,owner,definition,editor,hash,provenance) : await rpc(client, "workflow_v2_save", { p_owner: owner, p_workflow: workflowId, p_base: null, p_editor_base: null, p_definition: definition, p_editor: editor, p_definition_hash: hash, p_provenance: provenance })); return true;
    }
    if (["POST", "PUT"].includes(request.method ?? "")) {
      const create = request.method === "POST"; const body = workflowStrictBody(request.body, ["definition", "editor", "baseRevision", "baseEditorRevision", "creationId"], ["definition", "editor", ...(create ? [] : ["baseRevision", "baseEditorRevision"])]);
      const definition = workflowObject(body.definition); const editor = workflowObject(body.editor); const workflowId = create ? (body.creationId !== undefined ? workflowUuid(body.creationId) : workflowNewId()) : workflowString(id);
      if (!create && definition.workflowId !== workflowId) throw new ApiError(400, "IDENTITY_MISMATCH", "Workflow identity mismatch");
      if (JSON.stringify(definition) !== JSON.stringify(workflowSecretProjection(definition))) throw new ApiError(400, "SECRET_IN_DEFINITION", "Secret values cannot be stored in a Workflow definition");
      const next = create ? 1 : workflowInteger(body.baseRevision) + 1;
      const saved = { ...definition, name: libraryName(definition.name), workflowId, revision: next }; const validation = await workflowCompiler("/v1/document", { definition: saved });
      const previous = create ? undefined : (await readWorkflowDocument(client, owner, workflowId)).editor;
      validateWorkflowEditor(editor, saved, previous);
      json(response, create ? 201 : 200, create ? await saveCreation(client,owner,saved,editor,validation.definitionHash) : await rpc(client, "workflow_v2_save", { p_owner: owner, p_workflow: workflowId, p_base: create ? null : body.baseRevision, p_editor_base: create ? null : workflowInteger(body.baseEditorRevision), p_definition: saved, p_editor: editor, p_definition_hash: validation.definitionHash })); return true;
    }
  }
  if (resource === "editor" && request.method === "PUT" && id) {
    const body = workflowStrictBody(request.body, ["baseEditorRevision", "editor"], ["baseEditorRevision", "editor"]); const editor = workflowObject(body.editor); const doc = await readWorkflowDocument(client, owner, id);
    if (editor.workflowId !== id || editor.definitionRevision !== doc.definition.revision) throw new ApiError(409, "REVISION_CONFLICT", "Editor definition revision changed"); validateWorkflowEditor(editor, doc.definition, doc.editor);
    json(response, 200, await rpc(client, "workflow_v2_save_editor", { p_owner: owner, p_workflow: id, p_base: workflowInteger(body.baseEditorRevision), p_editor: editor })); return true;
  }
  if(resource === "node-tests" && request.method === "POST") {
    const body=workflowStrictBody(request.body,["workflowId","baseRevision","definition","nodeId","input","state","environmentRef","confirmExternalEffect"],["workflowId","baseRevision","definition","nodeId","input","state","environmentRef"]);
    const workflowId=workflowString(body.workflowId); const current=await head(client,owner,workflowId);
    if(current.current_revision!==body.baseRevision)throw new ApiError(409,"REVISION_CONFLICT","Test base revision changed");
    if(current.archived)throw new ApiError(409,"WORKFLOW_ARCHIVED","Archived Workflow cannot test nodes");
    const definition=workflowObject(body.definition);
    if(definition.workflowId!==workflowId||definition.revision!==body.baseRevision)throw new ApiError(400,"IDENTITY_MISMATCH","Test definition identity mismatch");
    for(const value of [definition,body.input,body.state])if(JSON.stringify(value)!==JSON.stringify(workflowSecretProjection(value)))throw new ApiError(400,"SECRET_IN_DEFINITION","Secrets cannot enter a node test");
    json(response,200,workflowProjection(await workflowCompiler("/v1/test-node",{...body,ownerId:owner})));return true;
  }
  if (resource === "validate" && request.method === "POST") {
    const draft = workflowObject(request.body).mode === "draft";
    const body = workflowStrictBody(request.body, ["mode", "workflowId", "environmentRef", "input", "clientRequestId", "draftGeneration", ...(draft ? ["baseRevision", "draftDefinition"] : ["revision"])], ["workflowId", "environmentRef", ...(draft ? ["baseRevision", "draftDefinition"] : ["revision"])]);
    if (body.mode !== undefined && (typeof body.mode !== "string" || !["draft", "saved"].includes(body.mode))) throw new ApiError(400, "INVALID_REQUEST", "Unknown validation mode");
    const correlation = workflowDiagnosticCorrelation(body);
    try {
      const workflowId = workflowString(body.workflowId);
      let definition: WorkflowRow;
      if (draft) {
        const current = await head(client, owner, workflowId); const base = workflowInteger(body.baseRevision);
        if (current.current_revision !== base) throw new ApiError(409, "REVISION_CONFLICT", "Draft base revision changed");
        definition = workflowObject(body.draftDefinition);
        if (definition.workflowId !== workflowId || definition.revision !== base) throw new ApiError(400, "INVALID_REQUEST", "Draft identities must match its saved base");
      } else definition = (await readWorkflowDocument(client, owner, workflowId, workflowInteger(body.revision))).definition;
      if (JSON.stringify(definition) !== JSON.stringify(workflowSecretProjection(definition))) throw new ApiError(400, "SECRET_IN_DEFINITION", "Secret values cannot enter Workflow Definition");
      if ("input" in body && JSON.stringify(body.input) !== JSON.stringify(workflowSecretProjection(body.input))) throw new ApiError(400, "SECRET_IN_RUN_INPUT", "Secret values cannot enter Workflow Input or State");
      const validation = await workflowCompiler("/v1/validate", { ownerId: owner, environmentRef: workflowString(body.environmentRef), definition, ...("input" in body ? { input: body.input } : {}) });
      const { registrySnapshot: _registry, ...visible } = validation;
      json(response, 200, { ...visible, ...correlation, diagnostics: workflowScopedDiagnostics(validation.diagnostics, correlation) }); return true;
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      const scope = error.code === "SECRET_IN_RUN_INPUT" ? "input" : error.code.startsWith("ENVIRONMENT_") || error.status === 503 ? "environment" : "definition";
      throw new ApiError(error.status, error.code, error.message, { ...workflowObject(error.details ?? {}), ...correlation, scope });
    }
  }
  if (resource === "revisions" && request.method === "GET") {
    const workflowId = workflowString(queryString(request, "workflowId")); await head(client, owner, workflowId);
    const limit = Math.floor(pageLimit(request));
    let query = client.from("workflow_revisions").select("revision,definition,definition_hash,created_at").eq("owner_user_id", owner).eq("workflow_id", workflowId).order("revision", { ascending: false }).limit(limit + 1);
    const cursor = queryString(request, "cursor"); if (cursor !== undefined) query = query.lt("revision", workflowInteger(Number(cursor)));
    const rows = result(await query) as WorkflowRow[]; const visible = rows.slice(0, limit);
    json(response, 200, { items: visible.map((row) => ({ revision: row.revision, name: workflowObject(row.definition).name, createdAt: row.created_at, definitionHash: row.definition_hash, availability: "available" })), nextCursor: rows.length > limit ? visible[visible.length - 1]?.revision : null }); return true;
  }
  if(resource==='threads') {
    if(request.method==='GET'&&id){json(response,200,threadDto(await executionThread(client,owner,id)));return true;}
    if(request.method==='GET'){
      const workflowId=workflowString(queryString(request,'workflowId'));await head(client,owner,workflowId);
      const rows=result(await client.from('workflow_execution_threads').select('*').eq('owner_user_id',owner).eq('workflow_id',workflowId).or('status.eq.waiting,and(status.eq.closed,last_error.not.is.null,last_error->>code.not.in.(RUN_CANCELLED,WAIT_EXPIRED))').not('checkpoint_id','is',null).order('updated_at',{ascending:false}).limit(20)) as WorkflowRow[];
      json(response,200,{items:rows.filter(row=>row.status!=='closed'||Boolean(row.last_error)&&!['RUN_CANCELLED','WAIT_EXPIRED'].includes(String(workflowObject(row.last_error).code))).map(threadDto)});return true;
    }
    if(request.method==='POST'&&id&&op==='resume'){const body=workflowStrictBody(request.body,['checkpointId','responses','currentRunId'],['checkpointId','responses']);json(response,202,await resumeThread(client,owner,workflowUuid(id),body));return true;}
    if(request.method==='POST'&&id&&op==='cancel'){workflowStrictBody(request.body,[]);await rpc(client,'workflow_v2_cancel_thread',{p_owner:owner,p_thread:workflowUuid(id)});json(response,200,{ok:true});return true;}
  }
  if (resource === "runs") {
    if (request.method === "POST" && id && op === "resume") { const run=await liveRun(client,owner,id); const body=workflowStrictBody(request.body,['checkpointId','responses','currentRunId'],['checkpointId','responses']);json(response,202,await resumeThread(client,owner,String(run.thread_id),body));return true; }
    if (request.method === "POST" && id && op === "cancel") { workflowStrictBody(request.body, []); const cancelled = await rpc(client, "workflow_v2_cancel", { p_owner: owner, p_run: workflowUuid(id) }); json(response, cancelled.terminal ? 200 : 202, cancelled); return true; }
    if (request.method === "POST" && !id) {
      const body = workflowStrictBody(request.body, ["workflowId", "revision", "input", "environmentRef", "launchContext", "variableEnvironmentId"], ["workflowId", "revision", "input", "environmentRef"]); const variableEnvironmentId = body.variableEnvironmentId === undefined ? undefined : workflowUuid(body.variableEnvironmentId); const key = workflowString(request.headers["idempotency-key"]); const requestHash = await workflowDigest(body);
      const prior = result(await client.from("workflow_idempotency").select("*").eq("owner_user_id", owner).eq("key", key).gt("expires_at", new Date().toISOString()).maybeSingle()) as WorkflowRow | null;
      if (prior) {
        if (prior.request_hash !== requestHash) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was used for another request");
        const priorRun = result(await client.from("workflow_live_runs").select("status,last_seq").eq("owner_user_id", owner).eq("run_id", prior.run_id).maybeSingle()) as WorkflowRow | null;
        json(response, 202, { runId: prior.run_id, revision: prior.revision, status: priorRun?.status ?? "expired", eventsCursor: priorRun?.last_seq ?? 0, historyExpired: !priorRun }); return true;
      }
      if (JSON.stringify(body.input) !== JSON.stringify(workflowSecretProjection(body.input))) throw new ApiError(400, "SECRET_IN_RUN_INPUT", "Secret values cannot enter Workflow Input or State");
      const workflowId = workflowString(body.workflowId); const doc = await readWorkflowDocument(client, owner, workflowId, workflowInteger(body.revision));
      if (doc.archived) throw new ApiError(409, "WORKFLOW_ARCHIVED", "Archived workflows cannot start new runs");
      const launch = await validateLaunch(client, owner, workflowId, body.launchContext);
      if (launch?.workflowInput !== undefined) {
        const [clientInputHash, assignmentInputHash] = await Promise.all([workflowDigest(body.input), workflowDigest(launch.workflowInput)]);
        if (clientInputHash !== assignmentInputHash) throw new ApiError(409, "INVALID_LAUNCH_CONTEXT", "Assignment authorizes a different Workflow startup input");
      }
      const variableEnvironment = await selectedVariableEnvironment(client, owner, variableEnvironmentId);
      const validation = await workflowCompiler("/v1/validate", { ownerId: owner, environmentRef: workflowString(body.environmentRef), definition: doc.definition, input: body.input, ...(variableEnvironment ? { variableEnvironmentId: variableEnvironment.id } : {}) });
      if (!validation.valid) { const correlation = workflowDiagnosticCorrelation(); throw new ApiError(422, "GRAPH_INVALID", "Workflow execution validation failed", { ...correlation, diagnostics: workflowScopedDiagnostics(validation.diagnostics, correlation) }); }
      json(response, 202, await rpc(client, "workflow_v2_enqueue", { p_owner: owner, p_workflow: workflowId, p_revision: body.revision, p_input: body.input, p_environment: body.environmentRef, p_environment_revision: validation.environmentRevision, p_registry: withFrozenVariableEnvironment(validation.registrySnapshot, variableEnvironment), p_semantic: validation.semanticHash, p_fingerprint: validation.compileFingerprint, p_request_hash: requestHash, p_key: key, p_launch: launch?.context ?? null, p_variable_environment: variableEnvironment?.id ?? null })); return true;
    }
    if (request.method === "GET" && id) {
      const run = await liveRun(client, owner, id);
      const names = await variableEnvironmentNames(client, owner, [typeof run.variable_environment_id === "string" ? run.variable_environment_id : frozenVariableEnvironment(run.registry_snapshot).id]);
      json(response, 200, workflowRunDto(run, true, names)); return true;
    }
    if (request.method === "GET") {
      const workflowId = workflowString(queryString(request, "workflowId")); await head(client, owner, workflowId); await rpc(client, "workflow_v2_prune", { p_owner: owner, p_workflow: workflowId });
      const rows = result(await client.from("workflow_live_runs").select("*").eq("owner_user_id", owner).eq("workflow_id", workflowId).order("created_at", { ascending: false }).limit(pageLimit(request))) as WorkflowRow[];
      const names = await variableEnvironmentNames(client, owner, rows.map((row) => typeof row.variable_environment_id === "string" ? row.variable_environment_id : frozenVariableEnvironment(row.registry_snapshot).id));
      json(response, 200, { items: rows.map((row) => workflowRunDto(row, false, names)), nextCursor: null }); return true;
    }
  }
  if (["events", "steps"].includes(resource) && request.method === "GET") {
    const runId = workflowString(queryString(request, "runId")); const run = await liveRun(client, owner, runId); const limit = pageLimit(request);
    if (resource === "events") {
      const after = workflowInteger(Number(queryString(request, "afterSeq") ?? 0)); const rows = result(await client.from("workflow_run_events").select("*").eq("run_id", runId).gt("seq", after).order("seq").limit(limit + 1)) as WorkflowRow[]; const visible = rows.slice(0, limit);
      const gap=visible.length?Number(visible[0].seq)>after+1:Number(run.last_seq)>after;
      json(response, 200, { events: visible.map(eventDto), nextSeq: visible[visible.length - 1]?.seq ?? (gap?Number(run.last_seq):after), hasMore: rows.length > limit, status: run.status, gap, ...(gap?{calibration:{status:run.status,state:workflowProjection(run.raw_state),output:workflowProjection(run.output),lastSeq:run.last_seq}}:{}) });
    } else {
      const after = workflowInteger(Number(queryString(request, "cursor") ?? 0)); const rows = result(await client.from("workflow_run_steps").select("*").eq("run_id", runId).gt("invocation", after).order("invocation").limit(limit + 1)) as WorkflowRow[];
      json(response, 200, { items: rows.slice(0, limit).map(stepDto), nextCursor: rows.length > limit ? rows[limit - 1]?.invocation : null });
    } return true;
  }
  if (resource === "artifacts" && request.method === "GET" && id) {
    const [kind, runId, part, field] = id.split(":"); const run = await liveRun(client, owner, workflowString(runId));
    if (kind === "run" && ["input", "output", "state"].includes(part)) { json(response, 200, { content: workflowProjection(run[part === "state" ? "raw_state" : part]), ...(part === "input" ? { inputReuse: workflowInputReuse(run.input) } : {}) }); return true; }
    if (kind === "step" && ["input", "output"].includes(field)) {
      const step = result(await client.from("workflow_run_steps").select("input,output").eq("run_id", runId).eq("step_id", part).maybeSingle()) as WorkflowRow | null;
      if (!step) throw new ApiError(404, "NOT_FOUND", "Artifact not found"); json(response, 200, { content: workflowProjection(step[field]) }); return true;
    } throw new ApiError(404, "NOT_FOUND", "Artifact not found");
  }
  return false;
}

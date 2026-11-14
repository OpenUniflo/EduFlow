import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ApiError, json } from "./http.js";
import { workflowCompiler, workflowInteger, workflowProjection, workflowStrictBody, workflowString, workflowUuid, type WorkflowRow } from "./workflowV2Protocol.js";
import { dispatchEvaluationWakeup } from "./workflowEvaluationQueue.js";

type Result<T> = { data: T | null; error: { message: string; code?: string } | null };

function result<T>(query: Result<T>): T {
  if (query.error) throw new ApiError(500, "WORKFLOW_EVALUATION_STORAGE_ERROR", "Workflow evaluation persistence request failed");
  return query.data as T;
}

function queryString(request: VercelRequest, key: string) {
  const value = request.query[key];
  return typeof value === "string" ? value : undefined;
}

function text(row: WorkflowRow, key: string) {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function integer(row: WorkflowRow, key: string) {
  const value = Number(row[key]);
  return Number.isSafeInteger(value) ? value : 0;
}

function safeText(value: unknown, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new ApiError(400, "INVALID_EVALUATION_CONFIG", `Text must contain 1 to ${max} characters`);
  return value.trim();
}

function optionalGoal(value: unknown) {
  if (typeof value !== "string" || value.length > 4000) throw new ApiError(400, "INVALID_EVALUATION_CONFIG", "Goal must be at most 4000 characters");
  return value.trim();
}

function criteriaList(value: unknown) {
  if (!Array.isArray(value) || value.length > 20) throw new ApiError(400, "INVALID_EVALUATION_CONFIG", "Provide at most 20 evaluation criteria");
  return value.map((item) => {
    if (typeof item !== "string" || !item.trim() || item.length > 1000) throw new ApiError(400, "INVALID_EVALUATION_CONFIG", "Each criterion must contain 1 to 1000 characters");
    return item.trim();
  });
}

async function ownedWorkflow(client: SupabaseClient, owner: string, workflowId: string) {
  const row = result(await client.from("workflow_v2_definitions").select("workflow_id,current_revision,archived").eq("owner_user_id", owner).eq("workflow_id", workflowId).maybeSingle()) as WorkflowRow | null;
  if (!row) throw new ApiError(404, "NOT_FOUND", "Workflow not found");
  return row;
}

async function ownedRun(client: SupabaseClient, owner: string, runId: string) {
  const row = result(await client.from("workflow_live_runs").select("run_id,workflow_id,revision,status,last_seq").eq("owner_user_id", owner).eq("run_id", runId).maybeSingle()) as WorkflowRow | null;
  if (!row) throw new ApiError(404, "NOT_FOUND", "Run not found");
  return row;
}

export function defaultEvaluationConfig(workflowId: string) {
  return {
    workflowId,
    version: 0,
    enabled: true,
    goal: "",
    criteria: [] as string[],
    providerRef: null as string | null,
    modelRef: null as string | null,
    environmentRef: null as string | null,
    updatedAt: null as string | null,
  };
}

export function evaluationConfigDto(row: WorkflowRow | null, workflowId: string) {
  if (!row) return defaultEvaluationConfig(workflowId);
  return {
    workflowId,
    version: integer(row, "version"),
    enabled: row.enabled !== false,
    goal: text(row, "goal"),
    criteria: Array.isArray(row.criteria) ? row.criteria.filter((item): item is string => typeof item === "string") : [],
    providerRef: typeof row.provider_ref === "string" ? row.provider_ref : null,
    modelRef: typeof row.model_ref === "string" ? row.model_ref : null,
    environmentRef: typeof row.environment_ref === "string" ? row.environment_ref : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export function evaluationDto(row: WorkflowRow) {
  const report = row.report === null || row.report === undefined ? null : workflowProjection(row.report);
  return {
    evaluationId: text(row, "evaluation_id"),
    runId: text(row, "run_id"),
    workflowId: text(row, "workflow_id"),
    revision: integer(row, "revision"),
    trigger: row.trigger_kind === "manual" ? "manual" : "automatic",
    status: text(row, "status"),
    outcome: typeof row.outcome === "string" ? row.outcome : null,
    mode: text(row, "mode"),
    semanticStatus: text(row, "semantic_status"),
    rubricVersion: integer(row, "rubric_version"),
    providerRef: typeof row.provider_ref === "string" ? row.provider_ref : null,
    modelRef: typeof row.model_ref === "string" ? row.model_ref : null,
    report,
    error: typeof row.error_code === "string" && row.error_code
      ? { code: row.error_code, message: typeof row.error_message === "string" ? row.error_message : "评价未完成" }
      : null,
    attemptCount: integer(row, "attempt_count"),
    maxAttempts: integer(row, "max_attempts"),
    supersedesId: typeof row.supersedes_id === "string" ? row.supersedes_id : null,
    createdAt: text(row, "created_at"),
    startedAt: typeof row.started_at === "string" ? row.started_at : null,
    finishedAt: typeof row.finished_at === "string" ? row.finished_at : null,
  };
}

function rpcError(reason: unknown): never {
  const message = reason instanceof Error ? reason.message : "";
  if (message.includes("REVISION_CONFLICT")) throw new ApiError(409, "REVISION_CONFLICT", "Evaluation settings changed; refresh before saving");
  if (message.includes("INVALID_EVALUATION_CONFIG")) throw new ApiError(400, "INVALID_EVALUATION_CONFIG", "Evaluation settings are invalid");
  if (message.includes("IDEMPOTENCY_CONFLICT")) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "This retry key was used for another Run");
  if (message.includes("RUN_NOT_TERMINAL")) throw new ApiError(409, "RUN_NOT_TERMINAL", "Evaluation can start after the Run reaches a terminal state");
  if (message.includes("NOT_FOUND")) throw new ApiError(404, "NOT_FOUND", "Run or Workflow not found");
  throw new ApiError(500, "WORKFLOW_EVALUATION_STORAGE_ERROR", "Workflow evaluation persistence request failed");
}

export async function handleWorkflowEvaluation(request: VercelRequest, response: VercelResponse, owner: string, client: SupabaseClient) {
  const resource = queryString(request, "resource");
  if (resource === "evaluation-config") {
    const bodyWorkflowId = request.body && typeof request.body === "object" && !Array.isArray(request.body) ? (request.body as WorkflowRow).workflowId : undefined;
    const workflowId = workflowString(queryString(request, "workflowId") ?? bodyWorkflowId);
    await ownedWorkflow(client, owner, workflowId);
    if (request.method === "GET") {
      const row = result(await client.from("workflow_evaluation_configs").select("*").eq("owner_user_id", owner).eq("workflow_id", workflowId).maybeSingle()) as WorkflowRow | null;
      json(response, 200, { config: workflowProjection(evaluationConfigDto(row, workflowId)) });
      return true;
    }
    if (request.method === "PUT") {
      const body = workflowStrictBody(request.body, ["workflowId", "baseVersion", "enabled", "goal", "criteria", "providerRef", "modelRef", "environmentRef"], ["workflowId", "baseVersion", "enabled", "goal", "criteria"]);
      if (workflowString(body.workflowId) !== workflowId) throw new ApiError(400, "INVALID_REQUEST", "Workflow identity mismatch");
      if (typeof body.enabled !== "boolean") throw new ApiError(400, "INVALID_EVALUATION_CONFIG", "Choose whether semantic evaluation is enabled");
      const goal = optionalGoal(body.goal);
      const criteria = criteriaList(body.criteria);
      const providerRef = body.providerRef === undefined || body.providerRef === null ? null : safeText(body.providerRef, 256);
      const modelRef = body.modelRef === undefined || body.modelRef === null ? null : safeText(body.modelRef, 256);
      const environmentRef = body.environmentRef === undefined || body.environmentRef === null ? null : safeText(body.environmentRef, 256);
      if ((providerRef === null) !== (modelRef === null)) throw new ApiError(400, "INVALID_EVALUATION_CONFIG", "Choose both an evaluation provider and model");
      if (providerRef && !environmentRef) throw new ApiError(400, "INVALID_EVALUATION_CONFIG", "Choose the environment that owns the evaluation model");
      if (providerRef) {
        const catalog = await workflowCompiler<{ environment?: { providers?: WorkflowRow[] } }>("/v1/catalog", { ownerId: owner, environmentRef });
        const provider = (catalog.environment?.providers ?? []).find((item) => item.ref === providerRef);
        const modelRefs = provider && Array.isArray(provider.modelRefs) ? provider.modelRefs : [];
        if (!provider || !modelRefs.includes(modelRef)) throw new ApiError(400, "INVALID_EVALUATION_MODEL", "The selected evaluation model is not enabled in this environment");
      }
      const saved = await client.rpc("workflow_evaluation_config_save", {
        p_owner: owner,
        p_workflow: workflowId,
        p_base_version: workflowInteger(body.baseVersion),
        p_enabled: body.enabled,
        p_goal: goal,
        p_criteria: criteria,
        p_provider_ref: providerRef,
        p_model_ref: modelRef,
        p_environment_ref: environmentRef,
      });
      if (saved.error) rpcError(new Error(saved.error.message));
      json(response, 200, { config: workflowProjection(evaluationConfigDto(saved.data as WorkflowRow, workflowId)) });
      return true;
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported evaluation settings operation");
  }

  if (resource === "evaluations") {
    if (request.method === "GET") {
      const runId = workflowUuid(queryString(request, "runId"));
      const run = await ownedRun(client, owner, runId);
      const rows = result(await client.from("workflow_run_evaluations").select("*").eq("owner_user_id", owner).eq("run_id", runId).order("created_at", { ascending: false }).limit(20)) as WorkflowRow[];
      json(response, 200, { items: rows.map(evaluationDto), runStatus: run.status, runId });
      return true;
    }
    if (request.method === "POST" && queryString(request, "op") === "retry") {
      const runId = workflowUuid(queryString(request, "id"));
      workflowStrictBody(request.body, []);
      await ownedRun(client, owner, runId);
      const key = workflowString(request.headers["idempotency-key"]);
      const created = await client.rpc("workflow_evaluation_retry", { p_owner: owner, p_run: runId, p_key: key });
      if (created.error) rpcError(new Error(created.error.message));
      const evaluation = evaluationDto(created.data as WorkflowRow);
      const wakeup = await dispatchEvaluationWakeup(evaluation.evaluationId);
      json(response, 202, { evaluation, wakeup });
      return true;
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported evaluation operation");
  }
  return false;
}

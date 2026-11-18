import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const deps = vi.hoisted(() => ({ client: undefined as unknown as SupabaseClient, compiler: vi.fn(), rpc: vi.fn(), wake: vi.fn() }));
vi.mock("./workflowEvaluationQueue.js", () => ({ dispatchEvaluationWakeup: deps.wake }));
vi.mock("./workflowV2Protocol.js", async original => ({ ...await original<typeof import("./workflowV2Protocol.js")>(), workflowCompiler: deps.compiler }));
import { handleWorkflowEvaluation } from "./workflowEvaluation";
import { ApiError } from "./http.js";

type Row = Record<string, unknown>;
function response() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as VercelResponse;
  return res;
}
function request(method: string, query: Row, body?: unknown, headers?: Row) {
  return { method, query, body, headers: headers ?? {} } as unknown as VercelRequest;
}

function setup(rows: Record<string, Row | null>, listRows: Record<string, Row[]> = {}) {
  const filters: Record<string, Row> = {};
  deps.client = {
    from(table: string) {
      const values: Row = {};
      const chain = {
        select() { return chain; },
        eq(key: string, value: unknown) { values[key] = value; return chain; },
        order() { return chain; },
        limit() { return chain; },
        async maybeSingle() { filters[table] = { ...values }; return { data: rows[table] ?? null, error: null }; },
        then(resolve: (value: unknown) => unknown) { filters[table] = { ...values }; return Promise.resolve({ data: listRows[table] ?? [], error: null }).then(resolve); },
      };
      return chain;
    },
    rpc: deps.rpc,
  } as unknown as SupabaseClient;
  return { filters, res: response() };
}

const owner = "22222222-2222-4222-8222-222222222222";
const workflowId = "workflow";
const runId = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  deps.rpc.mockReset();
  deps.wake.mockReset().mockResolvedValue("queued");
  deps.compiler.mockReset().mockResolvedValue({ environment: { providers: [{ ref: "provider", modelRefs: ["model-a"] }] } });
});

it("returns defaults without exposing another user's configuration", async () => {
  setup({ workflow_v2_definitions: { workflow_id: workflowId }, workflow_evaluation_configs: null });
  const res = response();
  await handleWorkflowEvaluation(request("GET", { resource: "evaluation-config", workflowId }), res, owner, deps.client);
  expect(deps.client.from).toBeDefined();
  expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ config: { workflowId, version: 0, enabled: true, goal: "", criteria: [] } });
});

it("saves a frozen rubric identity only after validating the owner's current model", async () => {
  setup({ workflow_v2_definitions: { workflow_id: workflowId } });
  deps.rpc.mockResolvedValue({ data: { workflow_id: workflowId, version: 2, enabled: true, goal: "目标", criteria: ["标准"], provider_ref: "provider", model_ref: "model-a", environment_ref: "local", updated_at: "2026-11-14T00:00:00Z" }, error: null });
  const res = response();
  await handleWorkflowEvaluation(request("PUT", { resource: "evaluation-config", workflowId }, { workflowId, baseVersion: 1, enabled: true, goal: "目标", criteria: ["标准"], providerRef: "provider", modelRef: "model-a", environmentRef: "local" }), res, owner, deps.client);
  expect(deps.compiler).toHaveBeenCalledWith("/v1/catalog", { ownerId: owner, environmentRef: "local" });
  expect(deps.rpc).toHaveBeenCalledWith("workflow_evaluation_config_save", expect.objectContaining({ p_owner: owner, p_workflow: workflowId, p_base_version: 1, p_model_ref: "model-a" }));
  expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ config: { version: 2, goal: "目标", modelRef: "model-a" } });
});

it("rejects a model that is not enabled in the selected environment", async () => {
  setup({ workflow_v2_definitions: { workflow_id: workflowId } });
  const res = response();
  await expect(handleWorkflowEvaluation(request("PUT", { resource: "evaluation-config", workflowId }, { workflowId, baseVersion: 0, enabled: true, goal: "目标", criteria: ["标准"], providerRef: "provider", modelRef: "model-b", environmentRef: "local" }), res, owner, deps.client))
    .rejects.toMatchObject({ status: 400, code: "INVALID_EVALUATION_MODEL" });
  expect(deps.rpc).not.toHaveBeenCalled();
});

it("returns only report history, not frozen config snapshots or retry keys", async () => {
  setup({ workflow_live_runs: { run_id: runId, workflow_id: workflowId, status: "success" } }, {
    workflow_run_evaluations: [{
      evaluation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", run_id: runId, workflow_id: workflowId, revision: 1,
      trigger_kind: "automatic", status: "completed", outcome: "rules_passed", mode: "rules", semantic_status: "not_configured",
      rubric_version: 0, provider_ref: null, model_ref: null, error_code: null, error_message: null,
      attempt_count: 1, max_attempts: 3, created_at: "2026-11-14T00:00:00Z", started_at: null, finished_at: null,
      config_snapshot: { goal: "goal", providerRef: "secret-ish-ref" }, request_key: "private-retry-key",
      report: { headline: "基础检查通过", outcome: "rules_passed", dimensions: [] },
    }],
  });
  const res = response();
  await handleWorkflowEvaluation(request("GET", { resource: "evaluations", runId }), res, owner, deps.client);
  const value = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
  expect(value.items[0]).toMatchObject({ evaluationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "completed", outcome: "rules_passed" });
  expect(value.items[0]).not.toHaveProperty("config_snapshot");
  expect(value.items[0]).not.toHaveProperty("request_key");
  expect(JSON.stringify(value)).not.toContain("private-retry-key");
});

it("rejects a retry before the Run is terminal", async () => {
  setup({ workflow_live_runs: { run_id: runId, workflow_id: workflowId, status: "running" } });
  deps.rpc.mockResolvedValue({ data: null, error: { message: "RUN_NOT_TERMINAL" } });
  const res = response();
  await expect(handleWorkflowEvaluation(request("POST", { resource: "evaluations", id: runId, op: "retry" }, {}, { "idempotency-key": "retry-1" }), res, owner, deps.client))
    .rejects.toMatchObject({ status: 409, code: "RUN_NOT_TERMINAL" });
});

it("does not return a Workflow or Run owned by another user", async () => {
  setup({ workflow_v2_definitions: null, workflow_live_runs: null });
  const res = response();
  await expect(handleWorkflowEvaluation(request("GET", { resource: "evaluation-config", workflowId }), res, owner, deps.client))
    .rejects.toMatchObject({ status: 404 });
  await expect(handleWorkflowEvaluation(request("GET", { resource: "evaluations", runId }), res, owner, deps.client))
    .rejects.toMatchObject({ status: 404 });
});


it("wakes the hosted worker for a manual retry without changing the Run", async () => {
  setup({ workflow_live_runs: { run_id: runId, workflow_id: workflowId, status: "success" } });
  deps.rpc.mockResolvedValue({ data: {
    evaluation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", run_id: runId, workflow_id: workflowId, revision: 1,
    trigger_kind: "manual", status: "queued", outcome: null, mode: "semantic", semantic_status: "pending",
    rubric_version: 2, provider_ref: "provider", model_ref: "model-a", error_code: null, error_message: null,
    attempt_count: 0, max_attempts: 3, supersedes_id: null, created_at: "2026-11-14T00:00:00Z", started_at: null, finished_at: null, report: null,
  }, error: null });
  const res = response();
  await handleWorkflowEvaluation(request("POST", { resource: "evaluations", id: runId, op: "retry" }, {}, { "idempotency-key": "manual-1" }), res, owner, deps.client);
  expect(deps.wake).toHaveBeenCalledWith("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ wakeup: "queued", evaluation: { status: "queued", trigger: "manual" } });
});


it("recovers the same persisted retry after a wake-up failure with the same idempotency key", async () => {
  setup({ workflow_live_runs: { run_id: runId, workflow_id: workflowId, status: "success" } });
  const row = {
    evaluation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", run_id: runId, workflow_id: workflowId, revision: 1,
    trigger_kind: "manual", status: "queued", outcome: null, mode: "semantic", semantic_status: "pending",
    rubric_version: 2, provider_ref: "provider", model_ref: "model-a", error_code: null, error_message: null,
    attempt_count: 0, max_attempts: 3, supersedes_id: null, created_at: "2026-11-14T00:00:00Z", started_at: null, finished_at: null, report: null,
  };
  deps.rpc.mockResolvedValue({ data: row, error: null });
  deps.wake.mockRejectedValueOnce(new ApiError(503, "EVALUATION_WAKEUP_FAILED", "wakeup failed")).mockResolvedValue("queued");
  const first = response();
  await expect(handleWorkflowEvaluation(request("POST", { resource: "evaluations", id: runId, op: "retry" }, {}, { "idempotency-key": "same-key" }), first, owner, deps.client))
    .rejects.toMatchObject({ status: 503, code: "EVALUATION_WAKEUP_FAILED" });
  const second = response();
  await handleWorkflowEvaluation(request("POST", { resource: "evaluations", id: runId, op: "retry" }, {}, { "idempotency-key": "same-key" }), second, owner, deps.client);
  expect(deps.rpc).toHaveBeenNthCalledWith(1, "workflow_evaluation_retry", expect.objectContaining({ p_key: "same-key" }));
  expect(deps.rpc).toHaveBeenNthCalledWith(2, "workflow_evaluation_retry", expect.objectContaining({ p_key: "same-key" }));
  expect(deps.wake).toHaveBeenNthCalledWith(1, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  expect(deps.wake).toHaveBeenNthCalledWith(2, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
});

import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
const deps = vi.hoisted(() => ({ client: undefined as unknown as SupabaseClient, compiler: vi.fn(), rpc: vi.fn() }));
const queue = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@vercel/queue', () => ({ send: queue.send }));
vi.mock('./supabase.js', () => ({ createServerSupabase: () => deps.client }));
vi.mock('./assignmentEligibility.js', () => ({ readAssignmentEligibility: vi.fn().mockResolvedValue({ eligibility: { canStart: true } }) }));
vi.mock('./workflowV2Protocol.js', async original => ({ ...await original<typeof import('./workflowV2Protocol.js')>(), workflowCompiler: deps.compiler }));
import { handleWorkflowV2 } from './workflowV2';
import { workflowDigest } from './workflowV2Protocol';

const workflowId = 'workflow';
const courseId = 'course';
const assignmentId = 'assignment';
const input = { query: 'A1001' };

function setup(assignmentInput: unknown, options: { environment?: Record<string, unknown>; defaultEnvironmentId?: string; run?: Record<string, unknown>; prior?: Record<string, unknown> } = {}) {
  const reads: { table: string; filters: Record<string, unknown> }[] = [];
  const environments = options.environment ? [options.environment] : [];
  deps.client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      reads.push({ table, filters });
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { filters[key] = value; return query; },
        gt() { return query; },
        in(key: string, values: unknown[]) { filters[`in:${key}`] = values; return query; },
        async maybeSingle() {
          const data = table === 'workflow_v2_definitions' ? { current_revision: 1, archived: false }
            : table === 'workflow_revisions' ? { definition: { schemaVersion: '2.0', workflowId, revision: 1, name: 'Test' }, editor_snapshot: {} }
              : table === 'courses' ? { id: courseId, lifecycle: 'published', course_type: 'standard' }
                : table === 'course_assignments' ? { id: assignmentId, workflow_template_id: workflowId, mode: 'workflow', workflow_input: assignmentInput }
                  : table === 'workflow_workspace_configuration' ? (options.defaultEnvironmentId ? { default_environment_id: options.defaultEnvironmentId } : null)
                    : table === 'workflow_variable_environments' ? environments.find((item) => item.id === filters.id) ?? null
                      : table === 'workflow_live_runs' ? (options.run ?? null)
                        : table === 'workflow_idempotency' ? (options.prior ?? null)
                          : null;
          return { data, error: null };
        },
        then(resolve: (value: unknown) => unknown) {
          if (table === 'workflow_variable_environments') {
            const wanted = filters['in:id'];
            const rows = environments.filter((item) => !Array.isArray(wanted) || wanted.includes(item.id));
            return Promise.resolve({ data: rows, error: null }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return query;
    },
    rpc: deps.rpc,
  } as unknown as SupabaseClient;
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as VercelResponse;
  return { response, reads };
}

function request(value: unknown, extra: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    query: { resource: 'runs' },
    body: { workflowId, revision: 1, input: value, environmentRef: 'local', launchContext: { courseId, assignmentId, workflowTemplateId: workflowId }, ...extra },
    headers: { 'idempotency-key': 'test-idempotency' },
  } as unknown as VercelRequest;
}

const validated = { valid: true, environmentRevision: 1, registrySnapshot: {}, semanticHash: 'semantic', compileFingerprint: 'fingerprint' };

beforeEach(() => {
  delete process.env.WORKFLOW_RUNNER_MODE;
  queue.send.mockReset().mockResolvedValue({ messageId: 'message-id' });
  deps.compiler.mockReset().mockResolvedValue(validated);
  deps.rpc.mockReset().mockResolvedValue({ data: { runId: '11111111-1111-4111-8111-111111111111', revision: 1, status: 'queued' }, error: null });
});

it('accepts the exact Assignment input regardless of object key order', async () => {
  const state = setup({ extra: 1, query: 'A1001' });
  await handleWorkflowV2(request({ query: 'A1001', extra: 1 }), state.response, 'owner');
  expect(deps.rpc).toHaveBeenCalledWith('workflow_v2_enqueue', expect.objectContaining({ p_input: { query: 'A1001', extra: 1 }, p_launch: { courseId, assignmentId, workflowTemplateId: workflowId } }));
});

it('rejects a client input that differs from the Assignment authority before validation or enqueue', async () => {
  const state = setup(input);
  await expect(handleWorkflowV2(request({ query: 'MISMATCH' }), state.response, 'owner')).rejects.toMatchObject({ status: 409, code: 'INVALID_LAUNCH_CONTEXT' });
  expect(deps.compiler).not.toHaveBeenCalled();
  expect(deps.rpc).not.toHaveBeenCalled();
});

it('keeps manual input for Assignments without a caller-provided value', async () => {
  const state = setup(null);
  await handleWorkflowV2(request({ query: 'manual' }), state.response, 'owner');
  expect(deps.rpc).toHaveBeenCalledWith('workflow_v2_enqueue', expect.objectContaining({ p_input: { query: 'manual' } }));
});

const environment = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: '开发' };

it('forwards an explicit variable environment to Worker validation and freezes it on the Run', async () => {
  const state = setup(null, { environment });
  await handleWorkflowV2(request({ query: 'manual' }, { variableEnvironmentId: environment.id }), state.response, 'owner');
  expect(deps.compiler).toHaveBeenCalledWith('/v1/validate', expect.objectContaining({ variableEnvironmentId: environment.id }));
  expect(deps.rpc).toHaveBeenCalledWith('workflow_v2_enqueue', expect.objectContaining({
    p_variable_environment: environment.id,
    p_registry: { variableEnvironment: { id: environment.id, name: environment.name } },
  }));
});

it('uses the owner default environment when the request omits one', async () => {
  const state = setup(null, { environment, defaultEnvironmentId: environment.id });
  await handleWorkflowV2(request({ query: 'manual' }), state.response, 'owner');
  expect(deps.compiler).toHaveBeenCalledWith('/v1/validate', expect.objectContaining({ variableEnvironmentId: environment.id }));
  expect(deps.rpc).toHaveBeenCalledWith('workflow_v2_enqueue', expect.objectContaining({ p_variable_environment: environment.id }));
});

it('rejects an unknown or malformed variable environment before validation', async () => {
  const missing = setup(null, { environment });
  await expect(handleWorkflowV2(request({ query: 'manual' }, { variableEnvironmentId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }), missing.response, 'owner'))
    .rejects.toMatchObject({ status: 400, code: 'INVALID_VARIABLE_ENVIRONMENT' });
  expect(deps.compiler).not.toHaveBeenCalled();
  const malformed = setup(null, { environment });
  await expect(handleWorkflowV2(request({ query: 'manual' }, { variableEnvironmentId: 'not-a-uuid' }), malformed.response, 'owner'))
    .rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
  expect(deps.compiler).not.toHaveBeenCalled();
});

it('returns the frozen variable environment name on a Run after the environment was deleted', async () => {
  const runId = '11111111-1111-4111-8111-111111111111';
  const state = setup(null, {
    run: {
      run_id: runId, workflow_id: workflowId, revision: 1, mode: 'live', verification: 'unverified', status: 'success',
      definition_hash: 'hash', semantic_hash: 'semantic', compile_fingerprint: 'fingerprint', environment_ref: 'local', environment_revision: '1',
      policy_version: 'm1.1', variable_environment_id: null, registry_snapshot: { variableEnvironment: { id: environment.id, name: '开发' } },
      input: {}, output: {}, raw_state: {}, created_at: '2026-10-23T00:00:00Z', last_seq: 0,
    },
  });
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as VercelResponse;
  await handleWorkflowV2({ method: 'GET', query: { resource: 'runs', id: runId }, headers: {} } as unknown as VercelRequest, response, 'owner');
  expect(vi.mocked(response.json).mock.calls[0][0]).toMatchObject({ variableEnvironmentId: environment.id, variableEnvironment: '开发' });
});

it('projects safe structured provider error context without changing the error code', async () => {
  const { workflowRunDto } = await import('./workflowV2');
  const dto = workflowRunDto({
    run_id: '11111111-1111-4111-8111-111111111111', workflow_id: 'workflow', revision: 3, mode: 'live', verification: 'unverified', status: 'failed',
    definition_hash: 'd', semantic_hash: 's', compile_fingerprint: 'f', environment_ref: 'local', environment_revision: 'e', policy_version: '1',
    registry_snapshot: {}, created_at: '2026-10-24T10:16:00Z', last_seq: 2,
    error: { code: 'MODEL_REQUEST_FAILED', category: 'auth', message: 'Model request failed', reason: 'auth_failed', provider: 'DeepSeek', model: 'deepseek-chat', host: 'api.deepseek.com', httpStatus: 401 },
  } as never);
  expect((dto as Record<string, unknown>).error).toMatchObject({ code: 'MODEL_REQUEST_FAILED', reason: 'auth_failed', provider: 'DeepSeek', model: 'deepseek-chat', host: 'api.deepseek.com', httpStatus: 401 });
});

it('admits a Run in queue mode without a Worker heartbeat and publishes its runId', async () => {
  process.env.WORKFLOW_RUNNER_MODE = 'queue';
  try {
    const runId = '22222222-2222-4222-8222-222222222222';
    deps.rpc.mockResolvedValue({ data: { runId, revision: 1, status: 'queued' }, error: null });
    const state = setup(null);
    await handleWorkflowV2(request({ query: 'manual' }), state.response, 'owner');
    expect(queue.send).toHaveBeenNthCalledWith(1, 'workflow-runs', { runId }, { idempotencyKey: `run:${runId}` });
    expect(queue.send).toHaveBeenNthCalledWith(2, 'workflow-runs', { runId, kind: 'timeout' }, { idempotencyKey: `run:${runId}:timeout`, delaySeconds: 75, retentionSeconds: 3600 });
  } finally {
    delete process.env.WORKFLOW_RUNNER_MODE;
  }
});

it('keeps the queued Run and returns a retryable error when the queue publish fails', async () => {
  process.env.WORKFLOW_RUNNER_MODE = 'queue';
  try {
    const runId = '33333333-3333-4333-8333-333333333333';
    deps.rpc.mockResolvedValue({ data: { runId, revision: 1, status: 'queued' }, error: null });
    queue.send.mockRejectedValueOnce(new Error('queue unavailable'));
    const state = setup(null);
    await expect(handleWorkflowV2(request({ query: 'manual' }), state.response, 'owner'))
      .rejects.toMatchObject({ status: 503, code: 'WORKFLOW_QUEUE_DISPATCH_FAILED', details: { runId, retryable: true } });
    expect(deps.rpc).toHaveBeenCalledWith('workflow_v2_enqueue', expect.anything());
    expect(queue.send).toHaveBeenCalledTimes(1);
  } finally {
    delete process.env.WORKFLOW_RUNNER_MODE;
  }
});

it('re-publishes a still-queued Run on an idempotent replay', async () => {
  process.env.WORKFLOW_RUNNER_MODE = 'queue';
  try {
    const runId = '44444444-4444-4444-8444-444444444444';
    const value = request({ query: 'manual' });
    const state = setup(null, {
      prior: { run_id: runId, revision: 1, request_hash: await workflowDigest(value.body) },
      run: { status: 'queued', last_seq: 3 },
    });
    await handleWorkflowV2(value, state.response, 'owner');
    expect(deps.rpc).not.toHaveBeenCalled();
    expect(queue.send).toHaveBeenNthCalledWith(1, 'workflow-runs', { runId }, { idempotencyKey: `run:${runId}` });
    expect(queue.send).toHaveBeenNthCalledWith(2, 'workflow-runs', { runId, kind: 'timeout' }, { idempotencyKey: `run:${runId}:timeout`, delaySeconds: 75, retentionSeconds: 3600 });
  } finally {
    delete process.env.WORKFLOW_RUNNER_MODE;
  }
});

it('forces queue mode on Vercel and leaves daemon mode to local development', async () => {
  const { resolveWorkflowRunnerMode } = await import('./workflowQueue');
  expect(resolveWorkflowRunnerMode({ VERCEL_ENV: 'preview', WORKFLOW_RUNNER_MODE: 'daemon' } as NodeJS.ProcessEnv)).toBe('queue');
  expect(resolveWorkflowRunnerMode({ VERCEL_ENV: 'production' } as NodeJS.ProcessEnv)).toBe('queue');
  expect(resolveWorkflowRunnerMode({} as NodeJS.ProcessEnv)).toBe('daemon');
  expect(resolveWorkflowRunnerMode({ WORKFLOW_RUNNER_MODE: 'queue' } as NodeJS.ProcessEnv)).toBe('queue');
});

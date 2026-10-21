import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
const deps = vi.hoisted(() => ({ client: undefined as unknown as SupabaseClient, compiler: vi.fn(), rpc: vi.fn() }));
vi.mock('./supabase.js', () => ({ createServerSupabase: () => deps.client }));
vi.mock('./assignmentEligibility.js', () => ({ readAssignmentEligibility: vi.fn().mockResolvedValue({ eligibility: { canStart: true } }) }));
vi.mock('./workflowV2Protocol.js', async original => ({ ...await original<typeof import('./workflowV2Protocol.js')>(), workflowCompiler: deps.compiler }));
import { handleWorkflowV2 } from './workflowV2';

const workflowId = 'workflow';
const courseId = 'course';
const assignmentId = 'assignment';
const input = { query: 'A1001' };

function setup(assignmentInput: unknown) {
  const reads: { table: string; filters: Record<string, unknown> }[] = [];
  deps.client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      reads.push({ table, filters });
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { filters[key] = value; return query; },
        gt() { return query; },
        async maybeSingle() {
          const data = table === 'workflow_v2_definitions' ? { current_revision: 1, archived: false }
            : table === 'workflow_revisions' ? { definition: { schemaVersion: '2.0', workflowId, revision: 1, name: 'Test' }, editor_snapshot: {} }
              : table === 'courses' ? { id: courseId, lifecycle: 'published', course_type: 'standard' }
                : table === 'course_assignments' ? { id: assignmentId, workflow_template_id: workflowId, mode: 'workflow', workflow_input: assignmentInput }
                  : null;
          return { data, error: null };
        },
      };
      return query;
    },
    rpc: deps.rpc,
  } as unknown as SupabaseClient;
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as VercelResponse;
  return { response, reads };
}

function request(value: unknown) {
  return {
    method: 'POST',
    query: { resource: 'runs' },
    body: { workflowId, revision: 1, input: value, environmentRef: 'local', launchContext: { courseId, assignmentId, workflowTemplateId: workflowId } },
    headers: { 'idempotency-key': 'test-idempotency' },
  } as unknown as VercelRequest;
}

beforeEach(() => {
  deps.compiler.mockReset().mockResolvedValue({ valid: true, environmentRevision: 1, registrySnapshot: {}, semanticHash: 'semantic', compileFingerprint: 'fingerprint' });
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

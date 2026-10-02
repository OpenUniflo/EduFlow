import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), course: vi.fn(), input: vi.fn(), active: vi.fn(), read: vi.fn(), persist: vi.fn(), current: vi.fn() }));
vi.mock('../_lib/supabase.js', () => ({ createUserSupabase: mocks.auth }));
vi.mock('../_lib/courseMembership.js', () => ({ requirePublishedCourse: mocks.course }));
vi.mock('../_lib/routePlanning.js', () => ({ readRouteInput: mocks.input, readActiveVersion: mocks.active, readVersion: mocks.read, persistRoute: mocks.persist, currentRoute: mocks.current, mapRouteVersion: (r: unknown) => r }));
import handler from './route-plan';
const base = '11111111-1111-4111-8111-111111111111';
const old = '22222222-2222-4222-8222-222222222222';
const data = { input: { nodeIds: ['A', 'T', 'S', 'X'], currentNodeIds: [], courseOrder: [{ nodeId: 'T', lessonOrder: 0, coverageOrder: 0 }], prerequisiteEdges: [{ id: 'A>T', source: 'A', target: 'T', strength: 'hard' }, { id: 'S>T', source: 'S', target: 'T', strength: 'soft' }] }, nodes: [], states: [] };
async function invoke(body?: Record<string, unknown>) {
  let status = 0; let result: any;
  const res = { status(code: number) { status = code; return res; }, json(value: unknown) { result = value; }, setHeader() {} };
  await handler({ method: body ? 'POST' : 'GET', body, query: { courseId: 'course' }, headers: {} } as unknown as VercelRequest, res as unknown as VercelResponse);
  return { status, result };
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ client: 'authenticated-client', user: { id: 'learner' } }); mocks.course.mockResolvedValue({});
  mocks.input.mockResolvedValue(structuredClone(data)); mocks.active.mockResolvedValue({ id: base });
  mocks.persist.mockResolvedValue({ id: 'new' }); mocks.read.mockResolvedValue({ constraints: { includeNodeIds: ['S'], excludeNodeIds: [] } });
});
describe('authoritative V2 route intent API', () => {
  it('cannot adopt custom intent as the default initial version, including concurrent null bases', async () => {
    mocks.active.mockResolvedValue(null);
    const request = { action: 'adopt', baseVersionId: null, includeNodeIds: ['S'], excludeNodeIds: [] };
    const results = await Promise.all([invoke(request), invoke(request)]);
    expect(results.map(r => r.status)).toEqual([400, 400]);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it('preview does not initialize or write and includes hard closure only', async () => {
    const r = await invoke({ action: 'preview', includeNodeIds: [], excludeNodeIds: [] });
    expect(r.status).toBe(200); expect(r.result.plan.route.selectedNodeIds).toEqual(['A', 'T']);
    expect(mocks.persist).not.toHaveBeenCalled(); expect(mocks.current).not.toHaveBeenCalled();
    expect(mocks.input).toHaveBeenCalledWith('authenticated-client', 'learner', 'course');
  });
  it.each(['selectedNodeIds', 'orderedNodeIds', 'bridgeNodeIds', 'userId'])('rejects forged %s instead of trusting it', async field => {
    expect((await invoke({ action: 'adopt', baseVersionId: base, includeNodeIds: [], excludeNodeIds: [], [field]: ['X'] })).status).toBe(400);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it('rejects model-external Include', async () => {
    const r = await invoke({ action: 'adopt', baseVersionId: base, includeNodeIds: ['X'], excludeNodeIds: [] });
    expect(r.status).toBe(422); expect(r.result.error.details.conflicts[0]).toMatchObject({ kind: 'include_outside_model', rootNodeId: 'X' });
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it('returns the excluded hard support and affected target', async () => {
    const r = await invoke({ action: 'adopt', baseVersionId: base, includeNodeIds: [], excludeNodeIds: ['A'] });
    expect(r.status).toBe(422); expect(r.result.error.details.conflicts[0]).toMatchObject({ rootNodeId: 'T', nodeId: 'A', kind: 'excluded_hard_prerequisite' });
  });
  it('stale intent never overwrites the active version', async () => {
    expect((await invoke({ action: 'adopt', baseVersionId: old, includeNodeIds: [], excludeNodeIds: [] })).status).toBe(409);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it('adoption recomputes current inputs, not previous preview output', async () => {
    await invoke({ action: 'preview', includeNodeIds: [], excludeNodeIds: [] });
    mocks.input.mockResolvedValue({ ...data, input: { ...data.input, currentNodeIds: ['T'] } });
    expect((await invoke({ action: 'adopt', baseVersionId: base, includeNodeIds: [], excludeNodeIds: [] })).status).toBe(200);
    expect(mocks.persist.mock.calls[0][4].selectedNodeIds).toEqual(['T']);
  });
  it('restores historical constraints through current planning and a new write', async () => {
    mocks.input.mockResolvedValue({ ...data, input: { ...data.input, currentNodeIds: ['A', 'S'] } });
    expect((await invoke({ action: 'restore', baseVersionId: base, versionId: old })).status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith('authenticated-client', 'learner', 'course', old);
    expect(mocks.persist.mock.calls[0].slice(5)).toEqual([base, 'restore', old]);
    expect(mocks.persist.mock.calls[0][4].selectedNodeIds).toEqual(['A', 'S', 'T']);
  });
  it('rejects historical Include that left the current gap without rewriting history', async () => {
    const historical = { constraints: { includeNodeIds: ['S'], excludeNodeIds: [] } };
    mocks.read.mockResolvedValue(historical);
    const r = await invoke({ action: 'restore', baseVersionId: base, versionId: old });
    expect(r.status).toBe(422);
    expect(r.result.error.details.conflicts).toContainEqual(expect.objectContaining({ kind: 'include_outside_model', nodeId: 'S' }));
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(historical.constraints).toEqual({ includeNodeIds: ['S'], excludeNodeIds: [] });
  });

});

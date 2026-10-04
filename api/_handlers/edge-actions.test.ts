import { beforeEach, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), input: vi.fn(), active: vi.fn(), micro: vi.fn() }));
vi.mock('../_lib/supabase.js', () => ({ createUserSupabase: mocks.auth, createServerSupabase: vi.fn() }));
vi.mock('../_lib/courseMembership.js', () => ({ requirePublishedCourse: vi.fn() }));
vi.mock('../_lib/routePlanning.js', () => ({ readRouteInput: mocks.input, readActiveVersion: mocks.active, defaultConstraints: { includeNodeIds: [], excludeNodeIds: [] } }));
vi.mock('../_lib/edgeActionRuns.js', () => ({ availableMicroPaths: mocks.micro, requireActionExecution: vi.fn() }));
import handler from './edge-actions';

type Row = Record<string, unknown>;
beforeEach(() => {
  vi.resetAllMocks();
  const tables: Record<string, Row[]> = {
    knowledge_edge_actions: ['retained', 'unrelated', 'invented'].map(edge_id => ({ id: `${edge_id}-action`, edge_id, status: 'active', type: 'micro_learning' })),
  };
  const client = { from(table: string) {
    let rows = tables[table] ?? [];
    const query = {
      select: () => query, order: () => query,
      eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[key])); return query; },
      range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
    }; return query;
  } };
  mocks.auth.mockResolvedValue({ client, user: { id: 'learner' } });
  mocks.input.mockResolvedValue({ input: {
    nodeIds: ['source', 'target', 'other'], currentNodeIds: ['source', 'target'],
    courseOrder: [{ nodeId: 'target', lessonOrder: 1, coverageOrder: 1 }],
    prerequisiteEdges: [
      { id: 'retained', source: 'source', target: 'target', strength: 'soft' },
      { id: 'unrelated', source: 'other', target: 'source', strength: 'soft' },
    ],
  } });
  mocks.active.mockResolvedValue({ constraints: { includeNodeIds: ['source'], excludeNodeIds: [] } });
  mocks.micro.mockResolvedValue([]);
});

it('returns an explicitly retained acquired route edge without history, but excludes unrelated and invented connections', async () => {
  let status = 0; let body: { actions: { id: string }[]; availableActionIds: string[] } | undefined;
  const response = { status(code: number) { status = code; return response; }, json(value: typeof body) { body = value; }, setHeader() {} };
  await handler({ method: 'GET', query: { courseId: 'course' }, headers: {} } as unknown as VercelRequest, response as unknown as VercelResponse);
  expect(status).toBe(200);
  expect(body?.actions.map(action => action.id)).toEqual(['retained-action']);
  expect(body?.availableActionIds).toEqual([]);
});

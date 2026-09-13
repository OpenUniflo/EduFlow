import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readLearningData } from './learningData';

describe('historical Criterion replay', () => {
  it('replays saved versions from own facts when current catalog definitions are unavailable', async () => {
    const attempt = { id: 'fact', sequence: 7, outcome: 'incorrect', criterion_refs: [{ criterionId: 'criterion', version: 1 }] };
    const client = { from(table: string) {
      const data = table === 'mastery_criteria' ? [] : [attempt];
      const query = { select: () => query, order: () => query, eq: () => query, lte: () => query, limit: () => query,
        maybeSingle: async () => ({ data: { sequence: 7 }, error: null }),
        range: async () => ({ data, error: null }) };
      return query;
    } } as unknown as SupabaseClient;
    const result = await readLearningData(client, 'owner', undefined, 7, [{ criterionId: 'criterion', version: 1 }, { criterionId: 'criterion', version: 2 }]);
    expect(result.criteria).toEqual([]);
    expect(result.states[0]).toMatchObject({ version: 1, attainment: 'insufficient', evidenceIds: ['fact'] });
    expect(result.states[1]).toMatchObject({ version: 2, attainment: 'unknown', evidenceCount: 0 });
  });
  it('pushes Course Knowledge scope into definition, cutoff and evidence SQL, retaining shared Knowledge evidence', async () => {
    const queries: Array<{ table: string; ids?: string[] }> = [];
    const rows = [
      { id: 'shared-fact', knowledge_id: 'shared', course_id: 'other-course', sequence: 3, outcome: 'correct', criterion_refs: [{ criterionId: 'criterion', version: 1 }] },
      { id: 'unrelated-fact', knowledge_id: 'unrelated', course_id: 'other-course', sequence: 4, outcome: 'incorrect', criterion_refs: [{ criterionId: 'other', version: 1 }] },
    ];
    const client = { from(table: string) {
      const trace: { table: string; ids?: string[] } = { table }; queries.push(trace);
      let data: Record<string, unknown>[] = table === 'mastery_criteria' ? [{ id: 'criterion', version: 1, knowledge_id: 'shared', status: 'active' }] : rows;
      const query = { select: () => query, order: () => query, eq: () => query, lte: () => query, limit: () => query,
        in: (column: string, ids: string[]) => { expect(column).toBe('knowledge_id'); trace.ids = ids; data = data.filter(row => ids.includes(String(row.knowledge_id))); return query; },
        maybeSingle: async () => ({ data: data[data.length - 1] ?? null, error: null }),
        range: async () => ({ data, error: null }) };
      return query;
    } } as unknown as SupabaseClient;
    const result = await readLearningData(client, 'owner', ['shared']);
    expect(result.attempts.map(row => row.id)).toEqual(['shared-fact']);
    expect(result.cutoff).toBe(3);
    expect(queries).toHaveLength(3);
    expect(queries.every(query => JSON.stringify(query.ids) === '["shared"]')).toBe(true);
    queries.length = 0;
    expect((await readLearningData(client, 'owner', [])).attempts).toEqual([]);
    expect(queries).toEqual([]);
  });

});

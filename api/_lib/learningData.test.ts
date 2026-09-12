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
});

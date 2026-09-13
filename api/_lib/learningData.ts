import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { estimateCriterionState, type CriterionEvidence, type CriterionReference, type MasteryCriterion } from '../../src/shared/learning/criterionState.js';
import { allRows, dataOrThrow } from './query.js';

type Row = Record<string, unknown>;
export const learningDataHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** The immutable attempt is the Evidence; never duplicate it into completion evidence. */
export function microCriterionEvidence(attempts: readonly Row[]): CriterionEvidence[] {
  return attempts.flatMap(row => row.outcome === 'correct' || row.outcome === 'incorrect'
    ? (row.criterion_refs as CriterionReference[]).map(ref => ({ ...ref, id: String(row.id), sequence: Number(row.sequence),
      outcome: row.outcome as 'correct' | 'incorrect', sourceKind: 'micro_step_attempt', sourceId: String(row.id) })) : []);
}

export async function readLearningData(client: SupabaseClient, userId: string, nodeIds?: string[], throughSequence?: number, references?: CriterionReference[]) {
  // Knowledge is shared across Courses: scope by relevant Knowledge, not source course_id.
  // Chunk identities to bound PostgREST URLs; historical replay intentionally keeps its own saved refs.
  const groups = nodeIds === undefined ? [undefined] : Array.from({ length: Math.ceil(new Set(nodeIds).size / 100) }, (_, index) => [...new Set(nodeIds)].sort().slice(index * 100, index * 100 + 100));
  const criteria: Row[] = [];
  const scoped = (table: string, select: string, ids: string[] | undefined) => {
    const query = client.from(table).select(select);
    return ids === undefined ? query : query.in('knowledge_id', ids);
  };
  for (const ids of groups) criteria.push(...await allRows(scoped('mastery_criteria', '*', ids).order('id').order('version'), 'Mastery Criterion lookup'));
  const relevantCriteria = criteria.filter(row => references ? references.some(ref => ref.criterionId === row.id && ref.version === row.version) : row.status === 'active')
    .sort((a, b) => String(a.id).localeCompare(String(b.id)) || Number(a.version) - Number(b.version));
  const latestSequences: number[] = [];
  for (const ids of groups) {
    const result = await scoped('micro_step_attempts', 'sequence', ids).eq('user_id', userId).order('sequence', { ascending: false }).limit(1).maybeSingle();
    const latest = dataOrThrow(result.data as Row | null, result.error, 'Evidence cutoff lookup');
    latestSequences.push(Number(latest?.sequence ?? 0));
  }
  const latestSequence = Math.max(0, ...latestSequences);
  const cutoff = Math.min(throughSequence ?? latestSequence, latestSequence);
  const attempts: Row[] = [];
  for (const ids of groups) attempts.push(...await allRows(scoped('micro_step_attempts', '*', ids).eq('user_id', userId).lte('sequence', cutoff).order('sequence'), 'Criterion Evidence lookup'));
  attempts.sort((a,b) => Number(a.sequence) - Number(b.sequence));
  const evidence = microCriterionEvidence(attempts);
  // Historical identities belong to the caller's saved Decision, even if today's catalog hides an archived Knowledge.
  const stateReferences = references ?? relevantCriteria.map(row => ({ criterionId: String(row.id), version: Number(row.version) }));
  const states = stateReferences.map(ref => estimateCriterionState(ref, evidence));
  const definitions: MasteryCriterion[] = relevantCriteria.map(row => ({ id: String(row.id), version: Number(row.version), knowledgeId: String(row.knowledge_id), knowledgeRevisionId: String(row.knowledge_revision_id),
    title: String(row.title), description: String(row.description), cognitiveLevel: row.cognitive_level as MasteryCriterion['cognitiveLevel'],
    criterionType: row.criterion_type as MasteryCriterion['criterionType'], required: Boolean(row.required), displayOrder: Number(row.display_order), status: row.status as MasteryCriterion['status'] }));
  return { criteria: definitions, states, attempts, cutoff, stateHash: learningDataHash(states) };
}

export async function readPathCriterionMappings(client: SupabaseClient, pathIds: string[]) {
  const [mappings, units, steps, criteria] = await Promise.all([
    allRows(client.from('micro_step_criteria').select('step_id,criterion_id,criterion_version,purpose').eq('purpose', 'evidence').order('step_id').order('criterion_id').order('criterion_version'), 'Micro Criterion mappings'),
    allRows(client.from('micro_units').select('id,path_id').order('id'), 'Criterion unit lookup'),
    allRows(client.from('micro_steps').select('id,unit_id').order('id'), 'Criterion step lookup'),
    allRows(client.from('mastery_criteria').select('id,version').eq('status', 'active').order('id'), 'Active Criterion lookup'),
  ]);
  const active = new Set(criteria.map(row => JSON.stringify([row.id, row.version])));
  const pathByUnit = new Map(units.map(row => [String(row.id), String(row.path_id)]));
  const pathByStep = new Map(steps.map(row => [String(row.id), pathByUnit.get(String(row.unit_id))]));
  const output = new Map<string, string[]>();
  for (const mapping of mappings) {
    const pathId = pathByStep.get(String(mapping.step_id));
    if (pathId && pathIds.includes(pathId) && active.has(JSON.stringify([mapping.criterion_id, mapping.criterion_version]))) {
      output.set(pathId, [...(output.get(pathId) ?? []), String(mapping.criterion_id)]);
    }
  }
  return output;
}

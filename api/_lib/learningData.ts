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
  const criteria = (await allRows(client.from('mastery_criteria').select('*').order('id').order('version'), 'Mastery Criterion lookup'))
    .filter(row => references ? references.some(ref => ref.criterionId === row.id && ref.version === row.version) : row.status === 'active')
    .filter(row => !nodeIds || nodeIds.includes(String(row.knowledge_id)));
  // Page by sequence; capture the high-water mark before scanning to exclude newer writes.
  const latestResult = await client.from('micro_step_attempts').select('sequence').eq('user_id', userId).order('sequence', { ascending: false }).limit(1).maybeSingle();
  const latest = dataOrThrow(latestResult.data as Row | null, latestResult.error, 'Evidence cutoff lookup');
  const cutoff = Math.min(throughSequence ?? Number(latest?.sequence ?? 0), Number(latest?.sequence ?? 0));
  const attempts: Row[] = [];
  for (let from = 0; ; from += 500) {
    const result = await client.from('micro_step_attempts').select('*').eq('user_id', userId).lte('sequence', cutoff).order('sequence').range(from, from + 499);
    const page = dataOrThrow(result.data as Row[] | null, result.error, 'Criterion Evidence lookup');
    attempts.push(...page);
    if (page.length < 500) break;
  }
  const evidence = microCriterionEvidence(attempts);
  // Historical identities belong to the caller's saved Decision, even if today's catalog hides an archived Knowledge.
  const stateReferences = references ?? criteria.map(row => ({ criterionId: String(row.id), version: Number(row.version) }));
  const states = stateReferences.map(ref => estimateCriterionState(ref, evidence));
  const definitions: MasteryCriterion[] = criteria.map(row => ({ id: String(row.id), version: Number(row.version), knowledgeId: String(row.knowledge_id), knowledgeRevisionId: String(row.knowledge_revision_id),
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

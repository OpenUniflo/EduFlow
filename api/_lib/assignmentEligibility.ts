import type { SupabaseClient } from '@supabase/supabase-js';
import { assignmentEligibility } from '../../src/shared/learning/assignmentEligibility.js';
import { dataOrThrow } from './query.js';

type Row = Record<string, unknown>;
export async function readAssignmentEligibility(client: SupabaseClient, userId: string, courseId: string, assignmentId: string) {
  const [coverageResult, dependencyResult, stateResult] = await Promise.all([
    client.from('assignment_coverages').select('node_id').eq('course_id', courseId).eq('assignment_id', assignmentId),
    client.from('assignment_dependencies').select('source_assignment_id').eq('course_id', courseId).eq('target_assignment_id', assignmentId).eq('strength', 'hard'),
    client.from('user_assignment_states').select('status,started_at').eq('user_id', userId).eq('course_id', courseId).eq('assignment_id', assignmentId).maybeSingle(),
  ]);
  const coverage = dataOrThrow(coverageResult.data as Row[] | null, coverageResult.error, 'Assignment coverage lookup');
  const dependencies = dataOrThrow(dependencyResult.data as Row[] | null, dependencyResult.error, 'Assignment prerequisite lookup');
  const previous = dataOrThrow(stateResult.data as Row | null, stateResult.error, 'Assignment state lookup');
  const ids = [...new Set(coverage.map(row => String(row.node_id)))];
  const dependencyIds = dependencies.map(row => String(row.source_assignment_id));
  const [nodesResult, knowledgeResult, dependencyStatesResult] = await Promise.all([
    ids.length ? client.from('curriculum_coverages').select('node_id').eq('course_id', courseId).in('node_id', ids) : { data: [], error: null },
    ids.length ? client.from('user_knowledge_states').select('node_id,status').eq('user_id', userId).in('node_id', ids) : { data: [], error: null },
    dependencyIds.length ? client.from('user_assignment_states').select('assignment_id,status').eq('user_id', userId).eq('course_id', courseId).in('assignment_id', dependencyIds) : { data: [], error: null },
  ]);
  const nodes = dataOrThrow(nodesResult.data as Row[] | null, nodesResult.error, 'Assignment Course Knowledge lookup');
  const knowledge = dataOrThrow(knowledgeResult.data as Row[] | null, knowledgeResult.error, 'Assignment readiness lookup');
  const states = dataOrThrow(dependencyStatesResult.data as Row[] | null, dependencyStatesResult.error, 'Assignment prerequisite state lookup');
  return { previous, coverage, eligibility: assignmentEligibility({
    // Caller has already revalidated published Course and owned Assignment.
    published: true, coverageValid: ids.every(id => nodes.some(row => row.node_id === id)),
    knowledgeStatuses: ids.map(id => knowledge.find(row => row.node_id === id)?.status as string | undefined),
    hardDependencyStatuses: dependencyIds.map(id => states.find(row => row.assignment_id === id)?.status as string | undefined),
    status: previous?.status as string | undefined,
  }) };
}

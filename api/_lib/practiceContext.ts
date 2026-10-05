import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './http.js';
import { allRows, dataOrThrow } from './query.js';
import type { PracticeEvidenceContext } from '../../src/features/evidence/evidenceTypes.js';

type Row = Record<string, any>;
/** Owned, read-only context. Metadata is never an evidence quotation. */
export async function readPracticeContext(client: SupabaseClient, userId: string, attemptId: string): Promise<PracticeEvidenceContext> {
  const found = await client.from('learning_attempts').select('*').eq('id', attemptId).eq('user_id', userId).maybeSingle();
  const attempt = dataOrThrow(found.data, found.error, 'Practice Attempt') as Row | null;
  if (!attempt) throw new ApiError(404, 'practice_attempt_unavailable', '本人正式成果不可用。');
  const [task, evaluated, runResult, coverage] = await Promise.all([
    client.from('course_assignments').select('id,title,description,requirements,expected_output,acceptance_criteria,experience').eq('course_id', attempt.course_id).eq('id', attempt.assignment_id).maybeSingle(),
    client.from('performance_results').select('id,version,outcome,score,feedback,evaluator_kind,evaluated_at').eq('attempt_id', attempt.id).eq('user_id', userId).order('version', { ascending: false }).limit(1).maybeSingle(),
    attempt.action_run_id ? client.from('edge_action_runs').select('id,action_id,edge_id,course_id,assignment_id,status,execution_snapshot').eq('id', attempt.action_run_id).eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    allRows(client.from('assignment_coverages').select('node_id').eq('course_id',attempt.course_id).eq('assignment_id',attempt.assignment_id).order('node_id'), 'Practice coverage'),
  ]);
  const assignment = dataOrThrow(task.data, task.error, 'Practice Assignment') as Row | null;
  const result = dataOrThrow(evaluated.data, evaluated.error, 'Practice Result');
  const run = dataOrThrow(runResult.data, runResult.error, 'Practice Run') as Row | null;
  if (!assignment || !result || (attempt.action_run_id && (!run || run.course_id !== attempt.course_id || run.assignment_id !== attempt.assignment_id))) throw new ApiError(409, 'practice_context_incomplete', '正式实践上下文不完整，请重试读取。');
  let action = null, edge = null;
  if (run) {
    const [a, e] = await Promise.all([
      client.from('knowledge_edge_actions').select('id,edge_id,title,type,description,expected_evidence').eq('id', run.action_id).maybeSingle(),
      client.from('knowledge_edges').select('id,source_node_id,target_node_id,relation,prerequisite_strength,reason').eq('id', run.edge_id).maybeSingle(),
    ]);
    action = dataOrThrow(a.data,a.error,'Practice Action'); edge = dataOrThrow(e.data,e.error,'Practice factual Edge');
    if (!action || !edge || action.edge_id !== edge.id) throw new ApiError(409, 'practice_context_incomplete', '实践行动与真实关系无法核验。');
  }
  return { courseId: attempt.course_id, assignment: { id: assignment.id, title: assignment.title, scenario: assignment.description, requirements: assignment.requirements, expectedOutput: assignment.expected_output, acceptanceCriteria: assignment.acceptance_criteria, experience: assignment.experience }, knowledgeIds: coverage.map(row=>String(row.node_id)), attempt: { id: attempt.id, number: attempt.attempt_number, submittedAt: attempt.submitted_at, response: attempt.response }, performanceResult: result, actionRun: run ? { id: run.id, status: run.status, executionSnapshot: run.execution_snapshot } : null, action, edge };
}

export async function practiceContextsForSource(client: SupabaseClient, userId: string, source: Row) {
  const provenance = source.provenance ?? {};
  if (!['assignment-response','practice-attachment','user-upload','user-supplement'].includes(provenance.kind)) return [];
  if (provenance.kind === 'assignment-response') {
    if (typeof provenance.attemptId !== 'string') throw new ApiError(409,'practice_context_incomplete','实践资料缺少正式提交来源。');
    const context = await readPracticeContext(client,userId,provenance.attemptId);
    if (source.id !== context.attempt.id || provenance.courseId !== context.courseId || provenance.assignmentId !== context.assignment.id) throw new ApiError(409,'practice_context_mismatch','实践资料来源不一致。');
    return [context];
  }
  // An attachment may participate in several immutable attempts. Keep every actual association.
  const attempts = await allRows(client.from('learning_attempts').select('id').eq('user_id',userId).contains('response',{attachmentSourceIds:[source.id]}).order('submitted_at'), 'Practice file lineage');
  return Promise.all(attempts.map(attempt=>readPracticeContext(client,userId,String(attempt.id))));
}

export async function readPracticeReview(client: SupabaseClient,userId: string,attemptId: string) {
  const context = await readPracticeContext(client,userId,attemptId);
  const ids = context.attempt.response.attachmentSourceIds ?? [];
  const files = ids.length ? await client.from('user_evidence_sources').select('id,title,parsed_lines,parse_status,archived_at').eq('user_id',userId).in('id',ids) : {data:[],error:null};
  const attachments = dataOrThrow(files.data,files.error,'Review files');
  if (attachments.length !== ids.length || attachments.some(source=>source.archived_at || source.parse_status !== 'ready')) throw new ApiError(409,'practice_file_unavailable','正式提交的原始文件暂不可读取。');
  return { ...context, attachments, authority: 'Tutoring only. Never grade, change Result, confirm capability or adopt Route. Assistant output is not user Evidence.' };
}

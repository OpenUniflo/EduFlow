import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseAssistantContext, parseAssistantStructuredContent } from '../../src/features/assistant/assistantContract.js';
import { ApiError } from './http.js';
import { dataOrThrow } from './query.js';

function stableId(value: string) { const hex = createHash('sha256').update(value).digest('hex'); return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`; }
export async function workspaceAssistantAction(client: SupabaseClient, userId: string, body: Record<string, unknown>) {
  let context;
  try {context=parseAssistantContext(body.context);}catch{throw new ApiError(400,'workspace_context_invalid','Invalid workspace context');}
  if (!['practice', 'capability-update'].includes(String(body.mode))) throw new ApiError(400, 'workspace_mode_invalid', 'Invalid conversation mode');
  if (body.mode === 'practice') {
    if (!context.courseId || !context.assignmentId) throw new ApiError(400, 'assignment_required', 'Assignment context required');
    const assignment = await client.from('course_assignments').select('id').eq('course_id', context.courseId).eq('id', context.assignmentId).maybeSingle();
    if (!dataOrThrow(assignment.data, assignment.error, 'Conversation Assignment')) throw new ApiError(404, 'assignment_not_found', 'Assignment unavailable');
    if (context.actionRunId) {
      const run = await client.from('edge_action_runs').select('id').eq('user_id', userId).eq('id', context.actionRunId).eq('course_id', context.courseId).eq('assignment_id', context.assignmentId).maybeSingle();
      if (!dataOrThrow(run.data, run.error, 'Conversation ActionRun')) throw new ApiError(404, 'run_not_found', 'Execution unavailable');
    }
  }
  if (context.evidenceSourceId) {
    const source = await client.from('user_evidence_sources').select('id').eq('id', context.evidenceSourceId).eq('user_id', userId).maybeSingle();
    if (!dataOrThrow(source.data, source.error, 'Conversation source')) throw new ApiError(404, 'source_not_found', 'Source unavailable');
  }
  if (context.diagnosisRunId) {
    const run = await client.from('capability_diagnosis_runs').select('id').eq('id', context.diagnosisRunId).eq('user_id', userId).maybeSingle();
    if (!dataOrThrow(run.data, run.error, 'Conversation diagnosis')) throw new ApiError(404, 'run_not_found', 'Diagnosis unavailable');
  }
  if(context.repeatAttemptId){
    const original=await client.from('learning_attempts').select('id,action_run_id').eq('id',context.repeatAttemptId).eq('user_id',userId).eq('course_id',context.courseId!).eq('assignment_id',context.assignmentId!).maybeSingle();
    const attempt=dataOrThrow(original.data,original.error,'Repeat workspace origin');
    if(!attempt || attempt.action_run_id || context.actionRunId)throw new ApiError(404,'repeat_context_unavailable','Repeated practice origin unavailable');
  }
  const binding = [body.mode, context.courseId, context.assignmentId, context.actionRunId, context.evidenceSourceId, context.diagnosisRunId,...(context.repeatAttemptId?[context.repeatAttemptId]:[])];
  const courseKey=createHash('sha256').update(context.courseId??'personal').digest('hex').slice(0,16);
  const title = `workspace:${body.mode}:${courseKey}:${createHash('sha256').update(JSON.stringify(binding)).digest('hex').slice(0,32)}`;
  if (body.action === 'workspace-session') {
    const existing = await client.from('assistant_sessions').select('id').eq('user_id', userId).eq('title', title).order('created_at').limit(1).maybeSingle();
    const session = dataOrThrow(existing.data, existing.error, 'Workspace conversation lookup');
    if (session) return { sessionId: session.id };
    const id = stableId(`${userId}:${title}`);
    const created = await client.from('assistant_sessions').upsert({ id, user_id: userId, title },{onConflict:'id',ignoreDuplicates:true});
    dataOrThrow(created.data, created.error, 'Workspace conversation creation'); return {sessionId:id};
  }
  if (typeof body.sessionId !== 'string') throw new ApiError(400, 'session_required', 'Session required');
  const session = await client.from('assistant_sessions').select('id,title').eq('id', body.sessionId).eq('user_id', userId).maybeSingle();
  if (dataOrThrow(session.data, session.error, 'Workspace session ownership')?.title !== title) throw new ApiError(404, 'session_not_found', 'Session unavailable');
  let event;
  try{event=parseAssistantStructuredContent(body.structuredContent);}catch{throw new ApiError(400,'event_invalid','Invalid workspace reference');}
  if (event?.type !== 'workspace_event') throw new ApiError(400, 'event_invalid', 'Workspace event required');
  const table = event.event === 'attachment' ? 'user_evidence_sources' : event.event === 'submission' ? 'learning_attempts' : 'capability_diagnosis_runs';
  const target = await client.from(table).select('*').eq('id', event.referenceId).eq('user_id', userId).maybeSingle();
  const targetRow = dataOrThrow(target.data, target.error, 'Workspace reference ownership');
  if (!targetRow) throw new ApiError(404, 'reference_not_found', 'Owned reference unavailable');
  if(['diagnosis','confirmation'].includes(event.event)&&context.evidenceSourceId&&!targetRow.source_ids.includes(context.evidenceSourceId))throw new ApiError(409,'diagnosis_context_mismatch','Analysis does not contain the workspace source');
  if (event.event === 'submission' && (targetRow.course_id !== context.courseId || targetRow.assignment_id !== context.assignmentId || (targetRow.action_run_id ?? undefined) !== context.actionRunId)) throw new ApiError(409,'submission_context_mismatch','Submission belongs to another workspace');
  if (event.event === 'confirmation') {
    const confirmed = await client.from('capability_state_proposals').select('id').eq('user_id',userId).eq('run_id',event.referenceId).eq('confirmation_state','confirmed').limit(1);
    if (targetRow.status !== 'completed' || !dataOrThrow(confirmed.data,confirmed.error,'Confirmation record').length) throw new ApiError(409,'confirmation_not_recorded','No formal confirmation exists');
  }
  const previous = await client.from('assistant_messages').select('id').eq('session_id', body.sessionId).contains('structured_content', event).limit(1).maybeSingle();
  if (dataOrThrow(previous.data, previous.error, 'Workspace event retry')) return { saved: true };
  const content = { attachment: '已收到本人提交的资料。', submission: '正式实践提交已记录。', diagnosis: '本次能力分析记录已保存。', confirmation: '本次能力确认记录已保存，正式路线没有自动修改。' }[event.event];
  const write = await client.from('assistant_messages').upsert({ id:stableId(`${body.sessionId}:${event.event}:${event.referenceId}`), session_id: body.sessionId, role: 'assistant', content, structured_content: event, message_kind: 'action', context_snapshot: context },{onConflict:'id',ignoreDuplicates:true});
  dataOrThrow(write.data, write.error, 'Workspace timeline write');
  return { saved: true };
}

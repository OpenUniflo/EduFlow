import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './http.js';
import { dataOrThrow } from './query.js';
import { parseEvidenceText } from '../../src/features/evidence/diagnosis.js';

// Read persisted user response only. Never export conversation or Assistant text.
export async function assignmentEvidenceSource(client: SupabaseClient, server: SupabaseClient, userId: string, attemptId: string) {
  const attemptResult = await client.from('learning_attempts').select('*').eq('id',attemptId).eq('user_id',userId).maybeSingle();
  const attempt = dataOrThrow(attemptResult.data,attemptResult.error,'Assignment evidence ownership');
  if (!attempt) throw new ApiError(404,'attempt_not_found','Formal submission unavailable');
  const result = await client.from('performance_results').select('id,outcome').eq('attempt_id',attemptId).order('version',{ascending:false}).limit(1).maybeSingle();
  const performance = dataOrThrow(result.data,result.error,'Assignment evidence result');
  if (!performance) throw new ApiError(409,'result_required','Formal result required');
  const response = attempt.response as {kind:string;text?:string;code?:string;selectedStepId?:string;attachmentSourceIds?:string[]};
  const attachmentIds=response.attachmentSourceIds??[];
  if(attachmentIds.length>4)throw new ApiError(409,'too_many_sources','一次实践最多分析4份附件和本人文字成果。');
  if (attachmentIds.length) {
    const sources = await client.from('user_evidence_sources').select('id').in('id',attachmentIds).eq('user_id',userId).eq('parse_status','ready').is('archived_at',null);
    if (dataOrThrow(sources.data,sources.error,'Assignment original sources').length !== attachmentIds.length) throw new ApiError(409,'source_unavailable','Original attachment unavailable');

  }
  let text = response.text ?? response.code;
  if (response.kind === 'trace') text = `本人在受控 Trace 任务中正式选择的步骤 ID：${response.selectedStepId}。这只证明本次选择，不能单独证明完整能力。`;
  if (!text?.trim() && attachmentIds.length) return {sourceIds:attachmentIds};
  if (!text?.trim()) throw new ApiError(409,'user_work_required','请提交本人实际工作内容，文件名或系统反馈不能成为资料。');
  const sourceId=attempt.id; const path=`${userId}/${sourceId}`;
  const existing = await client.from('user_evidence_sources').select('id,parse_status,archived_at').eq('id',sourceId).eq('user_id',userId).maybeSingle();
  const source = dataOrThrow(existing.data,existing.error,'Assignment source retry');
  if (source?.archived_at) throw new ApiError(409,'source_archived','Original source is archived');
  if (source?.parse_status === 'ready') return {sourceIds:[source.id,...attachmentIds]};
  const bytes=Buffer.from(text,'utf8'); const lines=parseEvidenceText(text);
  const stored=await server.storage.from('user-evidence').upload(path,bytes,{contentType:'text/plain',upsert:false});
  if (stored.error && String(stored.error.statusCode)!=='409' && stored.error.message !== 'The resource already exists') throw new ApiError(503,'evidence_storage_failed','资料保存暂未完成，请重试。');
  const written=await server.from('user_evidence_sources').upsert({id:sourceId,user_id:userId,title:'本人正式实践提交.txt',storage_path:path,content_type:'text/plain',byte_size:bytes.length,parse_status:'ready',parsed_lines:lines,source_sha256:createHash('sha256').update(bytes).digest('hex'),provenance:{kind:'assignment-response',courseId:attempt.course_id,assignmentId:attempt.assignment_id,actionRunId:attempt.action_run_id,attemptId,resultId:performance.id,outcome:performance.outcome}},{onConflict:'id',ignoreDuplicates:true});
  dataOrThrow(written.data,written.error,'Assignment source persistence');return {sourceIds:[sourceId,...attachmentIds]};
}

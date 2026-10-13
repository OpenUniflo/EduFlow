import { apiRequest } from '@/shared/api/apiClient';
import { supabaseClient } from '@/shared/api/supabaseClient';
import type { EvidenceSource, EvidenceSourceSummary, EvidenceSourceDetail, EvidenceRunDetail, EvidenceHistory } from './evidenceTypes';
export type { EvidenceSource, EvidenceUnit, EvidenceProposal, EvidenceSourceSummary, EvidenceSourceDetail, EvidenceRunDetail, EvidenceHistory } from './evidenceTypes';
export const evidenceRequest=<T=unknown>(body:unknown)=>apiRequest<T>('/api/evidence',{method:'POST',body:JSON.stringify(body)});
export const readEvidenceLibrary=()=>apiRequest<{sources:EvidenceSourceSummary[]}>('/api/evidence?view=library');
export const readEvidenceSource=(sourceId:string)=>apiRequest<EvidenceSourceDetail>(`/api/evidence?view=source&sourceId=${encodeURIComponent(sourceId)}`);
export const readEvidenceRun=(runId:string)=>apiRequest<EvidenceRunDetail>(`/api/evidence?view=run&runId=${encodeURIComponent(runId)}`);
export const readEvidenceHistory=(cursor?:string)=>apiRequest<EvidenceHistory>(`/api/evidence?view=history${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);
export type EvidenceUploadProgress={upload?:{source:EvidenceSource;bucket:string;path:string;token:string};uploaded?:boolean};
export async function uploadEvidence(file:File, context: {courseId?:string;assignmentId?:string;actionRunId?:string;supplement?:boolean} = {}, progress:EvidenceUploadProgress={}) {
  const contentType=/\.csv$/i.test(file.name)?'text/csv':/\.md$/i.test(file.name)?'text/markdown':'text/plain';
  if(!/\.(txt|md|csv)$/i.test(file.name)) throw new Error('目前支持 UTF-8 的 .txt、.md、.csv 工作资料。');
  const upload=progress.upload??await evidenceRequest<{source:EvidenceSource;bucket:string;path:string;token:string}>({action:'upload',title:file.name,contentType,size:file.size,...context});
  progress.upload=upload;
  if(!progress.uploaded){const result=await supabaseClient.storage.from(upload.bucket).uploadToSignedUrl(upload.path,upload.token,file,{contentType});
  if(result.error)throw new Error('文件上传失败，请重试本次上传。');progress.uploaded=true;}
  await evidenceRequest({action:'parse',sourceId:upload.source.id});
  return upload.source.id;
}

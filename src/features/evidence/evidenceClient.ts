import { apiRequest } from '@/shared/api/apiClient';
import { supabaseClient } from '@/shared/api/supabaseClient';
import type { EvidenceSource, EvidenceSourceSummary, EvidenceSourceDetail, EvidenceRunDetail, EvidenceHistory } from './evidenceTypes';
export type { EvidenceSource, EvidenceUnit, EvidenceProposal, EvidenceSourceSummary, EvidenceSourceDetail, EvidenceRunDetail, EvidenceHistory } from './evidenceTypes';
export const evidenceRequest=<T=unknown>(body:unknown)=>apiRequest<T>('/api/evidence',{method:'POST',body:JSON.stringify(body)});
export const readEvidenceLibrary=()=>apiRequest<{sources:EvidenceSourceSummary[]}>('/api/evidence?view=library');
export const readEvidenceSource=(sourceId:string)=>apiRequest<EvidenceSourceDetail>(`/api/evidence?view=source&sourceId=${encodeURIComponent(sourceId)}`);
export const readEvidenceRun=(runId:string)=>apiRequest<EvidenceRunDetail>(`/api/evidence?view=run&runId=${encodeURIComponent(runId)}`);
export const readEvidenceHistory=(cursor?:string)=>apiRequest<EvidenceHistory>(`/api/evidence?view=history${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);
export async function uploadEvidence(file:File) {
  const contentType=file.name.endsWith('.csv')?'text/csv':file.name.endsWith('.md')?'text/markdown':'text/plain';
  if(!/\.(txt|md|csv)$/i.test(file.name)) throw new Error('目前支持 UTF-8 的 .txt、.md、.csv 工作资料。');
  const upload=await evidenceRequest<{source:EvidenceSource;bucket:string;path:string;token:string}>({action:'upload',title:file.name,contentType,size:file.size});
  const result=await supabaseClient.storage.from(upload.bucket).uploadToSignedUrl(upload.path,upload.token,file,{contentType});
  if(result.error)throw new Error('文件上传失败，请重新上传。');
  await evidenceRequest({action:'parse',sourceId:upload.source.id});
  return upload.source.id;
}

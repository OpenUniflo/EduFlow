import { apiRequest } from '@/shared/api/apiClient';
import { supabaseClient } from '@/shared/api/supabaseClient';
export type EvidenceSource={id:string;title:string;parse_status:'pending'|'ready'|'failed';parsed_lines:{line:number;text:string}[];parse_error:string|null;created_at:string;archived_at:string|null;provenance:Record<string,unknown>};
export type EvidenceUnit={id:string;run_id:string;source_id:string;source_line:number;quote:string;observation:string;capability:string};
export type EvidenceProposal={id:string;run_id:string;unit_ids:string[];node_id:string|null;proposed_status:'learning'|'learned'|null;sufficiency:'supported'|'partial'|'insufficient'|'unmatched';confidence:number;reason:string;confirmation_state:'pending'|'confirmed'|'rejected';knowledge_evidence_id:string|null};
export type EvidenceData={sources:EvidenceSource[];units:EvidenceUnit[];proposals:EvidenceProposal[];runs:{id:string;source_ids?:string[];status:string;error:string|null;created_at:string}[]};
export const evidenceRequest=<T=unknown>(body:unknown)=>apiRequest<T>('/api/evidence',{method:'POST',body:JSON.stringify(body)});
export const readEvidence=()=>apiRequest<EvidenceData>('/api/evidence');
export async function uploadEvidence(file:File) {
  const contentType=file.name.endsWith('.csv')?'text/csv':file.name.endsWith('.md')?'text/markdown':'text/plain';
  if(!/\.(txt|md|csv)$/i.test(file.name)) throw new Error('目前支持 UTF-8 的 .txt、.md、.csv 工作资料。');
  const upload=await evidenceRequest<{source:EvidenceSource;bucket:string;path:string;token:string}>({action:'upload',title:file.name,contentType,size:file.size});
  const result=await supabaseClient.storage.from(upload.bucket).uploadToSignedUrl(upload.path,upload.token,file,{contentType});
  if(result.error)throw new Error('文件上传失败，请重新上传。');
  await evidenceRequest({action:'parse',sourceId:upload.source.id});
  return upload.source.id;
}

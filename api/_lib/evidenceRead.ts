import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ApiError } from './http.js';
import { allRows, dataOrThrow } from './query.js';

export const evidenceSourceColumns='id,title,parse_status,parse_error,created_at,archived_at,provenance';
const runColumns='id,source_ids,status,error,created_at';
const unitColumns='id,run_id,source_id,source_line,quote,observation,capability';
const proposalColumns='id,run_id,unit_ids,node_id,proposed_status,sufficiency,confidence,reason,confirmation_state,knowledge_evidence_id';
const querySchema=z.discriminatedUnion('view',[
 z.object({view:z.literal('library')}).strict(),
 z.object({view:z.literal('source'),sourceId:z.string().uuid()}).strict(),
 z.object({view:z.literal('run'),runId:z.string().uuid()}).strict(),
 z.object({view:z.literal('history'),cursor:z.string().max(400).optional(),limit:z.coerce.number().int().min(1).max(50).default(20)}).strict(),
]);
const cursorSchema=z.object({createdAt:z.string().datetime({offset:true}),id:z.string().uuid()}).strict();
export async function readEvidenceView(client:SupabaseClient,query:unknown) {
 const parsed=querySchema.safeParse(query);
 if(!parsed.success)throw new ApiError(400,'invalid_evidence_query','资料查询参数无效。');
 const input=parsed.data;
 if(input.view==='library') {
  const [sources,units,proposals,runs]=await Promise.all([
   allRows(client.from('user_evidence_sources').select(evidenceSourceColumns).order('created_at',{ascending:false}).order('id'),'Evidence summaries'),
   allRows(client.from('evidence_units').select('id,source_id').order('id'),'Evidence associations'),
   allRows(client.from('capability_state_proposals').select('unit_ids,node_id,confirmation_state').order('id'),'Evidence proposal summaries'),
   allRows(client.from('capability_diagnosis_runs').select('id,source_ids').order('id'),'Evidence usage'),
  ]);
  return {sources:sources.map(source=>{
   const unitIds=new Set(units.filter(unit=>unit.source_id===source.id).map(unit=>unit.id));
   const associated=proposals.filter(proposal=>Array.isArray(proposal.unit_ids)&&proposal.unit_ids.some(id=>unitIds.has(id)));
   return {...source,diagnosisCount:runs.filter(run=>Array.isArray(run.source_ids)&&run.source_ids.includes(source.id)).length,capabilityCount:new Set(associated.map(p=>p.node_id).filter(Boolean)).size,confirmedCount:associated.filter(p=>p.confirmation_state==='confirmed').length};
  })};
 }
 if(input.view==='source') {
  const result=await client.from('user_evidence_sources').select(`${evidenceSourceColumns},parsed_lines`).eq('id',input.sourceId).maybeSingle();
  const source=dataOrThrow(result.data,result.error,'Evidence source');
  if(!source)throw new ApiError(404,'source_not_found','资料不存在。');
  const [units,runs]=await Promise.all([
   allRows(client.from('evidence_units').select(unitColumns).eq('source_id',input.sourceId).order('source_line').order('id'),'Source evidence'),
   allRows(client.from('capability_diagnosis_runs').select(runColumns).contains('source_ids',[input.sourceId]).order('created_at',{ascending:false}).order('id'),'Source diagnoses'),
  ]);
  const proposals=units.length?await allRows(client.from('capability_state_proposals').select(proposalColumns).overlaps('unit_ids',units.map(unit=>unit.id)).order('created_at',{ascending:false}).order('id'),'Source proposals'):[];
  return {source,units,proposals,runs};
 }
 if(input.view==='run') {
  const result=await client.from('capability_diagnosis_runs').select(runColumns).eq('id',input.runId).maybeSingle();
  const run=dataOrThrow(result.data,result.error,'Diagnosis');
  if(!run)throw new ApiError(404,'run_not_found','诊断记录不存在。');
  const [sources,units,proposals]=await Promise.all([
   allRows(client.from('user_evidence_sources').select('id,title').in('id',run.source_ids).order('id'),'Diagnosis sources'),
   allRows(client.from('evidence_units').select(unitColumns).eq('run_id',input.runId).order('source_line').order('id'),'Diagnosis units'),
   allRows(client.from('capability_state_proposals').select(proposalColumns).eq('run_id',input.runId).order('created_at').order('id'),'Diagnosis proposals'),
  ]);
  return {run,sources,units,proposals};
 }
 let cursor:z.infer<typeof cursorSchema>|undefined;
 if(input.cursor) {
  try {cursor=cursorSchema.parse(JSON.parse(Buffer.from(input.cursor,'base64url').toString('utf8')));}catch {throw new ApiError(400,'invalid_evidence_cursor','诊断历史位置无效。');}
 }
 let request=client.from('capability_diagnosis_runs').select(runColumns).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(input.limit+1);
 if(cursor)request=request.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
 const result=await request;const rows=dataOrThrow(result.data,result.error,'Diagnosis history');
 const runs=rows.slice(0,input.limit);const last=runs[runs.length-1];
 return {runs,nextCursor:rows.length>input.limit&&last?Buffer.from(JSON.stringify({createdAt:last.created_at,id:last.id})).toString('base64url'):null};
}

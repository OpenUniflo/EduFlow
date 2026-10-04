import { readEvidenceView } from '../_lib/evidenceRead.js';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createServerSupabase, createUserSupabase } from '../_lib/supabase.js';
import { ApiError, handleApi, json, methodNotAllowed } from '../_lib/http.js';
import { allRows, dataOrThrow } from '../_lib/query.js';
import { createEmbeddingService } from '../_lib/embedding.js';
import { readEmbeddingEnvironment, readLlmEnvironment } from '../_lib/env.js';
import { OpenAICompatibleJsonGenerationClient } from '../_lib/llm.js';
import { diagnoseEvidence,EvidenceDiagnosisError, EVIDENCE_PROMPT_VERSION, EVIDENCE_TOP_K, parseEvidenceText, type RetrievedKnowledge } from '../../src/features/evidence/diagnosis.js';

export const maxDuration=300;
const uploadSchema=z.object({action:z.literal('upload'),title:z.string().trim().min(1).max(240),contentType:z.enum(['text/plain','text/markdown','text/csv']),size:z.number().int().min(1).max(1048576)}).strict();
const sourceSchema=z.object({action:z.enum(['parse','archive','download']),sourceId:z.string().uuid()}).strict();
const diagnosisSchema=z.object({action:z.literal('diagnose'),sourceIds:z.array(z.string().uuid()).min(1).max(5)}).strict();
const confirmationSchema=z.object({action:z.enum(['confirm','reject']),proposalIds:z.array(z.string().uuid()).min(1).max(50),runId:z.string().uuid().optional()}).strict();
const indexSchema=z.object({action:z.literal('index'),after:z.string().optional()}).strict();
const requestSchema=z.union([uploadSchema,sourceSchema,diagnosisSchema,confirmationSchema,indexSchema]);

export default handleApi(async(request,response)=>{
  const {client,user}=await createUserSupabase(request);
  response.setHeader('Cache-Control','private, no-store');
  if(request.method==='GET') {
    const query={...request.query};
    if(query.resource==='evidence')delete query.resource; // Vercel learner multiplexing, not a view filter.
    if(Object.keys(query).length){json(response,200,await readEvidenceView(client,query));return;}
    const results=await Promise.all([
      allRows(client.from('user_evidence_sources').select('*').order('created_at',{ascending:false}).order('id'),'Evidence sources'),
      allRows(client.from('evidence_units').select('*').order('created_at',{ascending:false}).order('id'),'Evidence units'),
      allRows(client.from('capability_diagnosis_runs').select('*').order('created_at',{ascending:false}).order('id'),'Evidence runs'),
      allRows(client.from('capability_state_proposals').select('*').order('created_at',{ascending:false}).order('id'),'Evidence proposals')
    ]);
    json(response,200,Object.fromEntries(results.map((r,index)=>[['sources','units','runs','proposals'][index],r])));return;
  }
  if(request.method!=='POST') return methodNotAllowed(response,['GET','POST']);
  const parsed=requestSchema.safeParse(request.body);
  if(!parsed.success) throw new ApiError(400,'invalid_evidence_request','Invalid evidence request');
  const body=parsed.data;
  const server=createServerSupabase();
  if(body.action==='index') {
    const profile=await server.from('profiles').select('role,capabilities').eq('id',user.id).single();
    if(profile.error || (profile.data.role!=='admin' && !profile.data.capabilities?.includes('global-domain-admin'))) throw new ApiError(403,'forbidden','Global administrator authority is required');
    const env=readEmbeddingEnvironment();
    let query=server.from('knowledge_nodes').select('id,current_revision_id').eq('scope','global').eq('status','active').order('id').limit(12);
    if(body.after) query=query.gt('id',body.after);
    const queryResult=await query;
    const nodes=dataOrThrow(queryResult.data,queryResult.error,'Knowledge index');
    let added=0;
    for(const node of nodes??[]) {
      const existing=await server.from('knowledge_node_revision_embeddings').select('revision_id').eq('revision_id',node.current_revision_id).eq('model',env.embeddingModel).maybeSingle();
      if(existing.error) throw new Error('Embedding index lookup failed');
      if(existing.data) continue;
      const revisionResult=await server.from('knowledge_node_revisions').select('title,description,mastery_criteria').eq('id',node.current_revision_id).single();
      const revision=dataOrThrow(revisionResult.data,revisionResult.error,'Knowledge revision');
      let vector:number[];
      try { vector=await createEmbeddingService(env).embed(JSON.stringify(revision)); }
      catch(error) { console.error('Evidence embedding provider unavailable',error instanceof Error?error.message:'Unknown error');throw new ApiError(424,'embedding_provider_unavailable','Embedding 服务不可用，请管理员检查 Preview 配置。'); }
      const stored=await server.from('knowledge_node_revision_embeddings').upsert({revision_id:node.current_revision_id,model:env.embeddingModel,dimensions:env.embeddingDimensions,embedding:JSON.stringify(vector)},{onConflict:'revision_id,model',ignoreDuplicates:true});
      dataOrThrow(stored.data,stored.error,'Embedding persistence');added++;
    }
    json(response,200,{added,next:nodes?.length===12?nodes[nodes.length-1].id:null,model:env.embeddingModel,dimensions:env.embeddingDimensions});return;
  }
  if(body.action==='upload') {
    const id=randomUUID();const path=`${user.id}/${id}`;
    const result=await server.from('user_evidence_sources').insert({id,user_id:user.id,title:body.title,storage_path:path,content_type:body.contentType,byte_size:body.size,provenance:{kind:'user-upload'}}).select().single();
    const source=dataOrThrow(result.data,result.error,'Evidence source creation');
    const signed=await server.storage.from('user-evidence').createSignedUploadUrl(path);
    if(signed.error) throw new ApiError(503,'upload_unavailable','上传地址创建失败，请重试。');
    json(response,201,{source,bucket:'user-evidence',path,token:signed.data.token});return;
  }
  if(body.action==='parse'||body.action==='archive'||body.action==='download') {
    const result=await client.from('user_evidence_sources').select('*').eq('id',body.sourceId).maybeSingle();
    const source=dataOrThrow(result.data,result.error,'Evidence source');
    if(!source) throw new ApiError(404,'source_not_found','Evidence source not found');
    if(body.action==='download') {
      const signed=await client.storage.from('user-evidence').createSignedUrl(source.storage_path,300);
      if(signed.error) throw new ApiError(404,'source_unavailable','原始文件暂不可用。');
      json(response,200,{url:signed.data.signedUrl});return;
    }
    if(body.action==='archive') {
      const updated=await server.from('user_evidence_sources').update({archived_at:new Date().toISOString()}).eq('id',source.id).eq('user_id',user.id);
      dataOrThrow(updated.data,updated.error,'Archive evidence');json(response,200,{archived:true});return;
    }
    if(source.archived_at) throw new ApiError(409,'source_archived','已归档资料不能重新解析。');
    if(source.parse_status==='ready') {json(response,200,{source});return;}
    const file=await server.storage.from('user-evidence').download(source.storage_path);
    if(file.error||!file.data) throw new ApiError(409,'upload_incomplete','请先完成文件上传。');
    try {
      if(file.data.size!==source.byte_size) throw new Error('文件大小与上传声明不一致。');
      const bytes=new Uint8Array(await file.data.arrayBuffer());
      const lines=parseEvidenceText(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      const update=await server.from('user_evidence_sources').update({parse_status:'ready',parsed_lines:lines,source_sha256:createHash('sha256').update(bytes).digest('hex'),parse_error:null}).eq('id',source.id).eq('user_id',user.id).is('archived_at',null).select().single();
      json(response,200,{source:dataOrThrow(update.data,update.error,'Evidence parse')});
    } catch(error) {
      const message=error instanceof Error?error.message:'解析失败';
      await server.from('user_evidence_sources').update({parse_status:'failed',parse_error:message}).eq('id',source.id).eq('user_id',user.id);
      throw new ApiError(422,'parse_failed',message);
    }
    return;
  }
  if(body.action==='confirm'||body.action==='reject') {
    if(new Set(body.proposalIds).size!==body.proposalIds.length) throw new ApiError(400,'duplicate_proposal','Duplicate proposal');
    if(body.runId) {
      const selected=await client.from('capability_state_proposals').select('id,run_id').in('id',body.proposalIds);
      const proposals=dataOrThrow(selected.data,selected.error,'Diagnosis confirmation scope');
      if(proposals.length!==body.proposalIds.length||proposals.some(proposal=>proposal.run_id!==body.runId))throw new ApiError(409,'diagnosis_scope_mismatch','请选择同一次诊断中的能力候选。');
    }
    const result=await server.rpc('confirm_capability_proposals',{p_user_id:user.id,p_ids:body.proposalIds,p_decision:body.action});
    if(result.error) throw new ApiError(result.error.code==='P0002'?404:409,'confirmation_rejected','候选已变化、资料已归档或没有足够证据；请刷新后检查。');
    json(response,200,{resolutions:result.data});return;
  }
  if(body.action==='diagnose') {
    if(new Set(body.sourceIds).size!==body.sourceIds.length) throw new ApiError(400,'duplicate_source','Duplicate source');
    const selected=await client.from('user_evidence_sources').select('*').in('id',body.sourceIds).eq('parse_status','ready').is('archived_at',null);
    const sources=dataOrThrow(selected.data,selected.error,'Selected evidence');
    if(sources.length!==body.sourceIds.length) throw new ApiError(404,'source_not_ready','请选择已解析且未归档的本人资料。');
    const env=readLlmEnvironment();const embeddingEnv=readEmbeddingEnvironment();
    const indexStatus=await server.rpc('evidence_index_missing',{p_model:embeddingEnv.embeddingModel});
    if(indexStatus.error || Number(indexStatus.data)>0) throw new ApiError(503,'index_not_ready','知识检索索引尚未完成，请稍后再试。');
    const created=await server.from('capability_diagnosis_runs').insert({user_id:user.id,source_ids:body.sourceIds,model:env.llmModel,prompt_version:EVIDENCE_PROMPT_VERSION}).select().single();
    const run=dataOrThrow(created.data,created.error,'Diagnosis creation');
    try {
      const diagnosis=await diagnoseEvidence(sources.map(source=>({id:source.id,lines:source.parsed_lines})),new OpenAICompatibleJsonGenerationClient(env,fetch,120000),async(capability)=>{
        const vector=await createEmbeddingService(embeddingEnv).embed(capability);
        const matches=await server.rpc('retrieve_evidence_knowledge',{p_embedding:JSON.stringify(vector),p_model:embeddingEnv.embeddingModel,p_limit:EVIDENCE_TOP_K});
        const nodes=dataOrThrow(matches.data,matches.error,'Knowledge retrieval') as RetrievedKnowledge[];
        if(!nodes.length) throw new Error('Global Knowledge embedding index is not ready');
        return nodes;
      });
      const units=diagnosis.units.map(unit=>({id:randomUUID(),user_id:user.id,run_id:run.id,source_id:unit.sourceId,source_line:unit.line,quote:unit.quote,observation:unit.observation,capability:unit.capability,extraction_version:EVIDENCE_PROMPT_VERSION}));
      if(units.length) {const inserted=await server.from('evidence_units').insert(units);dataOrThrow(inserted.data,inserted.error,'Evidence units');}
      const proposals=diagnosis.matches.map(match=>({user_id:user.id,run_id:run.id,unit_ids:match.unitIndexes.map(index=>units[index].id),node_id:match.nodeId,revision_id:match.revisionId,proposed_status:match.proposedStatus,sufficiency:match.sufficiency,confidence:match.confidence,reason:match.reason}));
      if(proposals.length) {const inserted=await server.from('capability_state_proposals').insert(proposals);dataOrThrow(inserted.data,inserted.error,'Evidence proposals');}
      const complete=await server.from('capability_diagnosis_runs').update({status:'completed',completed_at:new Date().toISOString(),diagnostics:{embedding:{provider:embeddingEnv.embeddingProvider,model:embeddingEnv.embeddingModel,dimensions:embeddingEnv.embeddingDimensions},metadata:diagnosis.metadata,artifacts:diagnosis.artifacts,retrievalCount:diagnosis.retrievalCount,topK:EVIDENCE_TOP_K,sourceCount:sources.length,llmCalls:diagnosis.llmCalls}}).eq('id',run.id);
      dataOrThrow(complete.data,complete.error,'Diagnosis completion');json(response,201,{runId:run.id});
    } catch(error) {
      const failure=await server.from('capability_diagnosis_runs').update({status:'failed',error:'诊断未完成，请稍后重试；正式能力状态没有改变。',completed_at:new Date().toISOString(),...(error instanceof EvidenceDiagnosisError?{diagnostics:{...error.diagnostics,embedding:{provider:embeddingEnv.embeddingProvider,model:embeddingEnv.embeddingModel,dimensions:embeddingEnv.embeddingDimensions}}}:{})}).eq('id',run.id);
      if(failure.error) console.error('Diagnosis failure recording failed',failure.error.code);
      console.error('Evidence diagnosis failed',{runId:run.id,code:error instanceof EvidenceDiagnosisError?'invalid_or_unavailable_diagnosis':'diagnosis_persistence_failure'});
      throw new ApiError(503,'diagnosis_failed','诊断未完成，请稍后重试；正式能力状态没有改变。');
    }
  }
});

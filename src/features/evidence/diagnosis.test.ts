import { describe,expect,it,vi } from 'vitest';
import { diagnoseEvidence,EvidenceDiagnosisError,parseEvidenceText,validateMatches,validateObservations } from './diagnosis';
import type { StructuredGenerationClient } from '../knowledge/generation/types';
const source={id:'source',lines:parseEvidenceText('本人计算：100件需求减去40件可用库存，净需求60件。\n计划学习产能核验。')};
const unit={sourceId:'source',line:1,quote:'净需求60件',observation:'计算净需求',capability:'物料净需求计算'};
const verified={value:{verdicts:{net:{criterionScopePreserved:true,verdict:'supported',reason:'checked'}}},metadata:{stage:'admission'}};
const partial={unitIndexes:[0],sufficiency:'partial',confidence:0.7,reason:'仅部分过程'};
const node={node_id:'net',revision_id:'net-v1',title:'净需求',description:'计算净需求',mastery_criteria:[],similarity:0.99};
describe('personal evidence discovery boundary',()=>{
 it('preserves real line locations rather than compacted line indexes',()=>expect(parseEvidenceText('\n第一行\n\n第二行').map(l=>l.line)).toEqual([2,4]));
 it('rejects binary, empty and oversized sources without silently truncating',()=>{
  for(const value of ['\0bytes','   ','x'.repeat(24001)])expect(()=>parseEvidenceText(value)).toThrow();
 });
 it('rejects invented quotes and source references',()=>{
  expect(validateObservations({units:[unit]},[source])).toEqual([unit]);
  for(const change of [{quote:'已掌握全部能力'},{sourceId:'other'},{line:2}])expect(()=>validateObservations({units:[{...unit,...change}]},[source])).toThrow();
 });
 it('similarity never chooses formal status and insufficient evidence has no proposal status',()=>{
  const result=validateMatches({matches:[{unitIndexes:[0],nodeId:'net',sufficiency:'insufficient',confidence:0.99,reason:'只有计划，没有已完成的表现'}]},[unit],[[node]]);
  expect(result[0].proposedStatus).toBeNull();
 });
 it('does not silently lose judgments or strip source context in the second stage',async()=>{
  expect(()=>validateMatches({matches:[]},[unit],[[node]])).toThrow(/Every evidence unit/);
  const generateJson=vi.fn().mockResolvedValueOnce({value:{units:[unit]},metadata:{stage:'extraction'}}).mockResolvedValueOnce({value:{judgments:{net:{unitIndexes:[0],sufficiency:'insufficient',confidence:0.9,reason:'上下文限定'}}},metadata:{stage:'admission'}});
  await diagnoseEvidence([source],{generateJson} as unknown as StructuredGenerationClient,async()=>[node]);
  expect(JSON.parse(generateJson.mock.calls[1][0].user).sources).toEqual([source]);
 });
 it('requires retrieved existing identity, never admits invented nodes',()=>{
  expect(()=>validateMatches({matches:[{unitIndexes:[0],nodeId:'invented',sufficiency:'supported',confidence:1,reason:'test'}]},[unit],[[node]])).toThrow(/outside retrieved/);
 });
 it('allows unmatched evidence and partial evidence only proposes learning',()=>{
  const result=validateMatches({matches:[{unitIndexes:[0],nodeId:null,sufficiency:'unmatched',confidence:0.6,reason:'不是同一能力'},{unitIndexes:[1],nodeId:'net',sufficiency:'partial',confidence:0.7,reason:'仅部分过程'}]},[unit,{...unit,sourceId:'second'}],[[node],[node]]);
  expect(result.map(r=>r.proposedStatus)).toEqual([null,'learning']);
 });
 it('rejects contradictory matched/unmatched outputs and duplicate node verdicts from real Gold failures',()=>{
  const match={unitIndexes:[0],nodeId:'net',sufficiency:'partial',confidence:0.7,reason:'partial'};
  expect(()=>validateMatches({matches:[match,{...match,nodeId:null,sufficiency:'unmatched'}]},[unit],[[node]])).toThrow(/both matched and unmatched/);
  expect(()=>validateMatches({matches:[match,{...match,sufficiency:'supported'}]},[unit],[[node]])).toThrow(/one judgment per knowledge node/);
 });
 it('repairs one invalid judgment with retained failure evidence, without repeating extraction or retrieval',async()=>{
  const generateJson=vi.fn().mockResolvedValueOnce({value:{units:[unit]},metadata:{stage:'extraction'}}).mockResolvedValueOnce({value:{judgments:{wrong:partial}},metadata:{stage:'admission'}}).mockResolvedValueOnce({value:{judgments:{net:partial}},metadata:{stage:'admission'}}).mockResolvedValueOnce(verified);
  const retrieve=vi.fn(async()=>[node]);const result=await diagnoseEvidence([source],{generateJson} as unknown as StructuredGenerationClient,retrieve);
  expect(generateJson).toHaveBeenCalledTimes(4);expect(retrieve).toHaveBeenCalledTimes(1);
  expect(result.artifacts).toMatchObject({judgmentAttempts:[{validationError:expect.stringMatching(/exactly the server node groups/)},{value:{judgments:{net:partial}}}]});
  expect(result.matches[0].proposedStatus).toBe('learning');
 });
 it('fails closed after the one allowed judgment repair also fails',async()=>{
  const generateJson=vi.fn().mockResolvedValueOnce({value:{units:[unit]},metadata:{stage:'extraction'}}).mockResolvedValue({value:{judgments:{wrong:partial}},metadata:{stage:'admission'}});
  await expect(diagnoseEvidence([source],{generateJson} as unknown as StructuredGenerationClient,async()=>[node])).rejects.toThrow(/exactly the server node groups/);
  expect(generateJson).toHaveBeenCalledTimes(3);
 });
 it('retains the rejected judgment when its repair request fails',async()=>{
  const generateJson=vi.fn().mockResolvedValueOnce({value:{units:[unit]},metadata:{stage:'extraction'}}).mockResolvedValueOnce({value:{judgments:{wrong:partial}},metadata:{stage:'admission'}}).mockRejectedValueOnce(new Error('LLM unavailable'));
  const error=await diagnoseEvidence([source],{generateJson} as unknown as StructuredGenerationClient,async()=>[node]).catch(error=>error);
  expect(error).toBeInstanceOf(EvidenceDiagnosisError);
  expect(error.diagnostics.llmCalls).toBe(3);
  expect(error.diagnostics.artifacts.judgmentAttempts).toHaveLength(1);
  expect(error.diagnostics.artifacts.judgmentAttempts[0].validationError).toMatch(/exactly the server node groups/);
 });
 it('deterministically groups two sources and allows only one sufficiency verdict for their shared node',async()=>{
  const second={...unit,sourceId:'source2'};
  const generateJson=vi.fn().mockResolvedValueOnce({value:{units:[unit,second]},metadata:{stage:'extraction'}}).mockResolvedValueOnce({value:{judgments:{net:{...partial,unitIndexes:[0,1]}}},metadata:{stage:'admission'}}).mockResolvedValueOnce(verified);
  const result=await diagnoseEvidence([source,{...source,id:'source2'}],{generateJson} as unknown as StructuredGenerationClient,async()=>[node]);
  expect(result.matches).toHaveLength(1);expect(result.matches[0].unitIndexes).toEqual([0,1]);
  expect(JSON.parse(generateJson.mock.calls[1][0].user).sources).toHaveLength(2);
 });
 it('derives unmatched units only after all candidate judgments validate',async()=>{
  const generateJson=vi.fn().mockResolvedValueOnce({value:{units:[unit]},metadata:{stage:'extraction'}}).mockResolvedValueOnce({value:{judgments:{net:{unitIndexes:[],sufficiency:'unmatched',confidence:0.9,reason:'different capability'}}},metadata:{stage:'admission'}});
  const result=await diagnoseEvidence([source],{generateJson} as unknown as StructuredGenerationClient,async()=>[node]);
  expect(generateJson).toHaveBeenCalledTimes(2);expect(result.matches[0]).toMatchObject({nodeId:null,sufficiency:'unmatched',proposedStatus:null});
 });
 it('multiple sources can support one capability and one source multiple capabilities',()=>{
  const other={...node,node_id:'risk',revision_id:'risk-v1'};
  const matches=[{unitIndexes:[0,1],nodeId:'net',sufficiency:'supported',confidence:0.9,reason:'两份过程相互核验'},{unitIndexes:[0],nodeId:'risk',sufficiency:'partial',confidence:0.8,reason:'一份资料还指出风险'}];
  expect(validateMatches({matches},[unit,{...unit,sourceId:'source2'}],[[node,other],[node]])).toHaveLength(2);
 });
 it('calls extraction without catalog, then retrieval only for evidence candidates',async()=>{
  const generateJson=vi.fn().mockResolvedValueOnce({value:{units:[unit]},metadata:{stage:'extraction'}}).mockResolvedValueOnce({value:{judgments:{net:{unitIndexes:[0],sufficiency:'supported',confidence:0.9,reason:'有可核验计算'}}},metadata:{stage:'admission'}}).mockResolvedValueOnce(verified);
  const retrieve=vi.fn(async()=>[node]);
  const result=await diagnoseEvidence([source],{generateJson} as unknown as StructuredGenerationClient,retrieve);
  expect(generateJson).toHaveBeenCalledTimes(3);expect(retrieve).toHaveBeenCalledExactlyOnceWith(unit.capability);
  expect(generateJson.mock.calls[0][0].user).not.toContain('net-v1');
  expect(result.matches[0]).toMatchObject({nodeId:'net',revisionId:'net-v1',proposedStatus:'learned'});
  expect(result.retrievalCount).toBe(1);
 });
 it('irrelevant material with no observed capability performs zero knowledge retrieval',async()=>{
  const generateJson=vi.fn().mockResolvedValue({value:{units:[]},metadata:{stage:'extraction'}});const retrieve=vi.fn();
  expect((await diagnoseEvidence([source],{generateJson} as unknown as StructuredGenerationClient,retrieve)).matches).toEqual([]);
  expect(retrieve).not.toHaveBeenCalled();expect(generateJson).toHaveBeenCalledTimes(1);
 });
 it('rejects unit reassignment outside a node Top-K group and malformed unmatched verdicts',async()=>{
  for(const verdict of [{...partial,unitIndexes:[1]},{...partial,unitIndexes:[0,0]},{...partial,unitIndexes:[]},{...partial,sufficiency:'unmatched'}]){
   const generateJson=vi.fn().mockResolvedValueOnce({value:{units:[unit,{...unit,capability:'other'}]},metadata:{stage:'extraction'}}).mockResolvedValue({value:{judgments:{net:verdict}},metadata:{stage:'admission'}});
   await expect(diagnoseEvidence([source],{generateJson} as unknown as StructuredGenerationClient,async text=>text==='other'?[]:[node])).rejects.toBeInstanceOf(EvidenceDiagnosisError);
  }
 });
 it('batches every retrieved node without dropping candidates and preserves cross-batch matched coverage',async()=>{
  const units=Array.from({length:5},(_,index)=>({...unit,capability:String(index)}));
  const generateJson=vi.fn(async input=>{
   if(input.stage==='extraction')return {value:{units},metadata:{stage:'extraction'}};
   if(input.schemaVersion==='evidence-factual-verification-v2')return {value:{verdicts:Object.fromEntries(JSON.parse(input.user).candidates.map((match:{nodeId:string})=>[match.nodeId,{criterionScopePreserved:true,verdict:'supported',reason:'checked'}]))},metadata:{stage:'admission'}};
   const {groups}=JSON.parse(input.user);expect(Object.keys(groups).length).toBeLessThanOrEqual(20);
   return {value:{judgments:Object.fromEntries(Object.entries(groups).map(([id,g])=>[id,{...partial,unitIndexes:(g as {unitIndexes:number[]}).unitIndexes}]))},metadata:{stage:'admission'}};
  });
  const result=await diagnoseEvidence([source],{generateJson} as unknown as StructuredGenerationClient,async text=>Array.from({length:5},(_,index)=>({...node,node_id:text+'-'+index})));
  expect(generateJson).toHaveBeenCalledTimes(6);expect(result.matches).toHaveLength(25);
  expect(result.matches.every(match=>match.nodeId!==null)).toBe(true);
 });
 it('never returns partial proposals when a later judgment batch fails',async()=>{
  const units=Array.from({length:5},(_,index)=>({...unit,capability:String(index)}));
  const generateJson=vi.fn(async input=>{
   if(input.stage==='extraction')return {value:{units},metadata:{stage:'extraction'}};
   const {groups}=JSON.parse(input.user);
   if(Object.keys(groups).includes('4-0'))throw new Error('provider unavailable');
   return {value:{judgments:Object.fromEntries(Object.entries(groups).map(([id,g])=>[id,{...partial,unitIndexes:(g as {unitIndexes:number[]}).unitIndexes}]))},metadata:{stage:'admission'}};
  });
  const error=await diagnoseEvidence([source],{generateJson} as unknown as StructuredGenerationClient,async text=>Array.from({length:5},(_,index)=>({...node,node_id:text+'-'+index}))).catch(error=>error);
  expect(error).toBeInstanceOf(EvidenceDiagnosisError);expect(error.diagnostics.artifacts.judgmentAttempts).toHaveLength(1);
 });

 it('can only downgrade positive candidates after factual verification, retaining both judgments',async()=>{
  for(const verdict of ['insufficient','uncertain']){
   const generateJson=vi.fn().mockResolvedValueOnce({value:{units:[unit]},metadata:{stage:'extraction'}}).mockResolvedValueOnce({value:{judgments:{net:partial}},metadata:{stage:'admission'}}).mockResolvedValueOnce({value:{verdicts:{net:{criterionScopePreserved:true,verdict,reason:'arithmetic was not correct'}}},metadata:{stage:'admission'}});
   const result=await diagnoseEvidence([source],{generateJson} as unknown as StructuredGenerationClient,async()=>[node]);
   expect(result.matches[0]).toMatchObject({nodeId:'net',unitIndexes:[0],sufficiency:'insufficient',proposedStatus:null});
   expect(result.artifacts.verifications).toHaveLength(1);expect(result.artifacts.judgmentAttempts).toHaveLength(1);
  }
 });
 it('fails closed when verification omits a positive candidate or attempts to introduce another',async()=>{
  for(const verdicts of [{},{other:{criterionScopePreserved:true,verdict:'supported',reason:'invented'}}]){
   const generateJson=vi.fn().mockResolvedValueOnce({value:{units:[unit]},metadata:{stage:'extraction'}}).mockResolvedValueOnce({value:{judgments:{net:partial}},metadata:{stage:'admission'}}).mockResolvedValueOnce({value:{verdicts},metadata:{stage:'admission'}});
   await expect(diagnoseEvidence([source],{generateJson} as unknown as StructuredGenerationClient,async()=>[node])).rejects.toThrow(/exactly the positive candidate/);
  }
 });

 it('preserves verified correct substeps by lowering supported to partial without upgrading partial',async()=>{
  for(const sufficiency of ['supported','partial']){
   const generateJson=vi.fn().mockResolvedValueOnce({value:{units:[unit]},metadata:{stage:'extraction'}}).mockResolvedValueOnce({value:{judgments:{net:{...partial,sufficiency}}},metadata:{stage:'admission'}}).mockResolvedValueOnce({value:{verdicts:{net:{criterionScopePreserved:true,verdict:'partial',reason:'correct substep but incomplete coverage'}}},metadata:{stage:'admission'}});
   const result=await diagnoseEvidence([source],{generateJson} as unknown as StructuredGenerationClient,async()=>[node]);
   expect(result.matches[0]).toMatchObject({nodeId:'net',sufficiency:'partial',proposedStatus:'learning'});
  }
 });

 it('accepts only the harmless provider JSON-format annotation while retaining strict identity validation',()=>{
  expect(validateObservations({type:'json_object',units:[unit]},[source])).toEqual([unit]);
  expect(()=>validateObservations({type:'mastered',units:[unit]},[source])).toThrow();
  expect(()=>validateObservations({type:'json_object',owner:'other',units:[unit]},[source])).toThrow();
 });

 it('rejects cross-object positive verdicts and requires explicit scope verification',async()=>{
  for(const criterionScopePreserved of [false,undefined]){
   const generateJson=vi.fn().mockResolvedValueOnce({value:{units:[unit]},metadata:{stage:'extraction'}}).mockResolvedValueOnce({value:{judgments:{net:{...partial,sufficiency:'supported'}}},metadata:{stage:'admission'}}).mockResolvedValueOnce({value:{verdicts:{net:{criterionScopePreserved,verdict:'supported',reason:'generic action without the required object'}}},metadata:{stage:'admission'}});
   const result=diagnoseEvidence([source],{generateJson} as unknown as StructuredGenerationClient,async()=>[node]);
   if(criterionScopePreserved===undefined)await expect(result).rejects.toThrow();
   else expect((await result).matches[0]).toMatchObject({sufficiency:'insufficient',proposedStatus:null});
  }
 });

 it('retries invalid provider JSON only once per diagnosis and retains the failure',async()=>{
  const error=new Error('LLM content was not valid JSON: provider=test, model=test');
  const generateJson=vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({value:{units:[]},metadata:{stage:'extraction'}});
  const result=await diagnoseEvidence([source],{generateJson} as unknown as StructuredGenerationClient,async()=>[]);
  expect(generateJson).toHaveBeenCalledTimes(2);expect(result.llmCalls).toBe(2);expect(result.artifacts.formatFailures).toEqual([{stage:'extraction',schemaVersion:'evidence-units-v1',message:error.message}]);
  const failed=vi.fn().mockRejectedValue(error);
  await expect(diagnoseEvidence([source],{generateJson:failed} as unknown as StructuredGenerationClient,async()=>[])).rejects.toThrow(error.message);
  expect(failed).toHaveBeenCalledTimes(2);
 });

});

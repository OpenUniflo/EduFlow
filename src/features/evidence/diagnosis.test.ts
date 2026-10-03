import { describe,expect,it,vi } from 'vitest';
import { diagnoseEvidence,parseEvidenceText,validateMatches,validateObservations } from './diagnosis';
import type { StructuredGenerationClient } from '../knowledge/generation/types';
const source={id:'source',lines:parseEvidenceText('本人计算：100件需求减去40件可用库存，净需求60件。\n计划学习产能核验。')};
const unit={sourceId:'source',line:1,quote:'净需求60件',observation:'计算净需求',capability:'物料净需求计算'};
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
  const generateJson=vi.fn().mockResolvedValueOnce({value:{units:[unit]},metadata:{stage:'extraction'}}).mockResolvedValueOnce({value:{matches:[{unitIndexes:[0],nodeId:'net',sufficiency:'insufficient',confidence:0.9,reason:'上下文限定'}]},metadata:{stage:'admission'}});
  await diagnoseEvidence([source],{generateJson} as StructuredGenerationClient,async()=>[node]);
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
  const match={unitIndexes:[0],nodeId:'net',sufficiency:'partial',confidence:0.7,reason:'仅部分过程'};
  const generateJson=vi.fn().mockResolvedValueOnce({value:{units:[unit]},metadata:{stage:'extraction'}}).mockResolvedValueOnce({value:{matches:[match,match]},metadata:{stage:'admission'}}).mockResolvedValueOnce({value:{matches:[match]},metadata:{stage:'admission'}});
  const retrieve=vi.fn(async()=>[node]);const result=await diagnoseEvidence([source],{generateJson} as StructuredGenerationClient,retrieve);
  expect(generateJson).toHaveBeenCalledTimes(3);expect(retrieve).toHaveBeenCalledTimes(1);
  expect(result.artifacts.judgmentAttempts?.[0].validationError).toMatch(/one judgment per knowledge node/);
  expect(result.matches[0].proposedStatus).toBe('learning');
 });
 it('fails closed after the one allowed judgment repair also fails',async()=>{
  const match={unitIndexes:[0],nodeId:'net',sufficiency:'partial',confidence:0.7,reason:'仅部分过程'};
  const generateJson=vi.fn().mockResolvedValueOnce({value:{units:[unit]},metadata:{stage:'extraction'}}).mockResolvedValue({value:{matches:[match,match]},metadata:{stage:'admission'}});
  await expect(diagnoseEvidence([source],{generateJson} as StructuredGenerationClient,async()=>[node])).rejects.toThrow(/one judgment per knowledge node/);
  expect(generateJson).toHaveBeenCalledTimes(3);
 });
 it('multiple sources can support one capability and one source multiple capabilities',()=>{
  const other={...node,node_id:'risk',revision_id:'risk-v1'};
  const matches=[{unitIndexes:[0,1],nodeId:'net',sufficiency:'supported',confidence:0.9,reason:'两份过程相互核验'},{unitIndexes:[0],nodeId:'risk',sufficiency:'partial',confidence:0.8,reason:'一份资料还指出风险'}];
  expect(validateMatches({matches},[unit,{...unit,sourceId:'source2'}],[[node,other],[node]])).toHaveLength(2);
 });
 it('calls extraction without catalog, then retrieval only for evidence candidates',async()=>{
  const generateJson=vi.fn().mockResolvedValueOnce({value:{units:[unit]},metadata:{stage:'extraction'}}).mockResolvedValueOnce({value:{matches:[{unitIndexes:[0],nodeId:'net',sufficiency:'supported',confidence:0.9,reason:'有可核验计算'}]},metadata:{stage:'admission'}});
  const retrieve=vi.fn(async()=>[node]);
  const result=await diagnoseEvidence([source],{generateJson} as StructuredGenerationClient,retrieve);
  expect(generateJson).toHaveBeenCalledTimes(2);expect(retrieve).toHaveBeenCalledExactlyOnceWith(unit.capability);
  expect(generateJson.mock.calls[0][0].user).not.toContain('net-v1');
  expect(result.matches[0]).toMatchObject({nodeId:'net',revisionId:'net-v1',proposedStatus:'learned'});
  expect(result.retrievalCount).toBe(1);
 });
 it('irrelevant material with no observed capability performs zero knowledge retrieval',async()=>{
  const generateJson=vi.fn().mockResolvedValue({value:{units:[]},metadata:{stage:'extraction'}});const retrieve=vi.fn();
  expect((await diagnoseEvidence([source],{generateJson} as StructuredGenerationClient,retrieve)).matches).toEqual([]);
  expect(retrieve).not.toHaveBeenCalled();expect(generateJson).toHaveBeenCalledTimes(1);
 });
});

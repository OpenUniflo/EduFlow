import {expect,it} from 'vitest';
import {pendingRunProposals,supportedConfirmationBatch,readyEvidenceSelection} from './confirmationSelection';
import type {EvidenceProposal,EvidenceSourceSummary} from './evidenceTypes';
const proposal=(id:string,overrides:Partial<EvidenceProposal>={}):EvidenceProposal=>({id,run_id:'current',unit_ids:[],node_id:'knowledge',proposed_status:'learned',sufficiency:'supported',confidence:.9,reason:'evidence',confirmation_state:'pending',knowledge_evidence_id:null,...overrides});
it('keeps a 51-candidate run actionable through explicit batches without mixing historical pending candidates',()=>{
 const proposals=[proposal('historical',{run_id:'other'}),...Array.from({length:51},(_,i)=>proposal(String(i)))];
 const first=supportedConfirmationBatch(proposals,'current');expect(first).toHaveLength(50);expect(first).not.toContain('historical');
 const after=proposals.map(p=>first.includes(p.id)?{...p,confirmation_state:'confirmed' as const}:p);
 expect(supportedConfirmationBatch(after,'current')).toEqual(['50']);
});
it('offers partial evidence for manual selection but never bulk-selects it or an unresolved proposal',()=>{
 const proposals=[proposal('partial',{sufficiency:'partial',proposed_status:'learning'}),proposal('unmatched',{proposed_status:null}),proposal('rejected',{confirmation_state:'rejected'}),proposal('weak',{confidence:.7})];
 expect(pendingRunProposals(proposals,'current').map(p=>p.id)).toEqual(['partial','weak']);expect(supportedConfirmationBatch(proposals,'current')).toEqual([]);
});

it('excludes archived historical sources and failed or missing sources from a new diagnosis',()=>{
 const source={id:'ready',title:'Work',parse_status:'ready',parse_error:null,created_at:'2026-10-04',archived_at:null,provenance:{},diagnosisCount:1,capabilityCount:0,confirmedCount:0} satisfies EvidenceSourceSummary;
 expect(readyEvidenceSelection(['archived','failed','missing','ready'],[source,{...source,id:'archived',archived_at:'2026-10-04'},{...source,id:'failed',parse_status:'failed'}])).toEqual(['ready']);
});

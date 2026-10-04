import type { EvidenceProposal, EvidenceSourceSummary } from './evidenceTypes';
export const CONFIRMATION_BATCH_LIMIT=50;
export function pendingRunProposals(proposals:EvidenceProposal[],runId:string|null){
 return proposals.filter(proposal=>proposal.run_id===runId&&proposal.confirmation_state==='pending'&&proposal.proposed_status!==null);
}
export function supportedConfirmationBatch(proposals:EvidenceProposal[],runId:string|null){
 return pendingRunProposals(proposals,runId).filter(proposal=>proposal.sufficiency==='supported'&&Number(proposal.confidence)>=.85).slice(0,CONFIRMATION_BATCH_LIMIT).map(proposal=>proposal.id);
}

export function readyEvidenceSelection(ids:string[],sources:EvidenceSourceSummary[]){
 const available=new Set(sources.filter(source=>source.parse_status==='ready'&&!source.archived_at).map(source=>source.id));
 return ids.filter(id=>available.has(id));
}

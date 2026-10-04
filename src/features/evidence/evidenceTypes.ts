export type EvidenceSourceSummary = {
  id: string; title: string; parse_status: 'pending' | 'ready' | 'failed'; parse_error: string | null;
  created_at: string; archived_at: string | null; provenance: Record<string, unknown>;
  diagnosisCount: number; capabilityCount: number; confirmedCount: number;
};
export type EvidenceSource = Omit<EvidenceSourceSummary, 'diagnosisCount' | 'capabilityCount' | 'confirmedCount'> & { parsed_lines: { line: number; text: string }[] };
export type EvidenceUnit = {id:string;run_id:string;source_id:string;source_line:number;quote:string;observation:string;capability:string};
export type EvidenceProposal = {id:string;run_id:string;unit_ids:string[];node_id:string|null;proposed_status:'learning'|'learned'|null;sufficiency:'supported'|'partial'|'insufficient'|'unmatched';confidence:number;reason:string;confirmation_state:'pending'|'confirmed'|'rejected';knowledge_evidence_id:string|null};
export type EvidenceRun = {id:string;source_ids:string[];status:'running'|'completed'|'failed';error:string|null;created_at:string};
export type EvidenceSourceDetail = {source:EvidenceSource;units:EvidenceUnit[];proposals:EvidenceProposal[];runs:EvidenceRun[]};
export type EvidenceRunDetail = {run:EvidenceRun;sources:Pick<EvidenceSource,'id'|'title'>[];units:EvidenceUnit[];proposals:EvidenceProposal[]};
export type EvidenceHistory = {runs:EvidenceRun[];nextCursor:string|null};

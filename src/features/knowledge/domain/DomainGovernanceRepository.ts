import type { DomainAssignment, DomainAssignmentCandidate, DomainProposal, KnowledgeDomain } from "./domainTypes";

export type DomainGovernanceState = {
  domains: KnowledgeDomain[];
  assignments: DomainAssignment[];
  candidates: DomainAssignmentCandidate[];
  proposals: DomainProposal[];
  revision: number;
};

export interface DomainGovernanceRepository {
  load(): DomainGovernanceState;
  save(state: DomainGovernanceState): void;
}

import { useSyncExternalStore } from "react";
import { applicationServices } from "../../services/applicationServices";
import type { DomainGovernanceState } from "./DomainGovernanceRepository";
import type {
  AcceptCandidateInput,
  AssignNodeDomainInput,
  AssignNodesToDomainInput,
  CreateDomainInput,
  EvaluateAutomaticDomainAssignmentInput,
  ReviewProposalInput,
  UpdateDomainInput
} from "./DomainGovernanceService";
import type { KnowledgeAccessContext } from "../repository/KnowledgeRepository";

export { assertGlobalDomainAdmin } from "./DomainGovernanceService";
export type { DomainGovernanceState } from "./DomainGovernanceRepository";

const service = applicationServices.domainGovernanceService;

export function getDomainGovernanceSnapshot() { return service.getSnapshot(); }
export function subscribeDomainGovernance(listener: () => void) { return service.subscribe(listener); }
export function useDomainGovernance() { return useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot); }
export function resolveNodeDomain(nodeId: string, snapshot?: DomainGovernanceState) { return service.resolveNodeDomain(nodeId, snapshot); }
export function assignNodeDomain(input: AssignNodeDomainInput) { return service.assignNodeDomain(input); }
export function assignNodesToDomain(input: AssignNodesToDomainInput) { return service.assignNodesToDomain(input); }
export function updateDomain(input: UpdateDomainInput) { return service.updateDomain(input); }
export function createDomain(input: CreateDomainInput) { return service.createDomain(input); }
export function acceptCandidate(input: AcceptCandidateInput) { return service.acceptCandidate(input); }
export function ignoreCandidate(input: { actor: AssignNodeDomainInput["actor"]; nodeId: string }) { return service.ignoreCandidate(input); }
export function evaluateAutomaticDomainAssignment(input: EvaluateAutomaticDomainAssignmentInput) { return service.evaluateAutomaticDomainAssignment(input); }
export function reviewProposal(input: ReviewProposalInput) { return service.reviewProposal(input); }
export function topologySignature(access: KnowledgeAccessContext) { return service.topologySignature(access); }

import type { DomainGovernanceState } from "./DomainGovernanceRepository";

export function resolveNodeDomain(nodeId: string, state: DomainGovernanceState) {
  const assignment = state.assignments.find((item) => item.nodeId === nodeId);
  return {
    assignment,
    domain: state.domains.find((item) => item.id === assignment?.domainId)
  };
}

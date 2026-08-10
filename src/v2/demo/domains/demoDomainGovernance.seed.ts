import { demoDomainDiscoveryService } from "./DemoDomainDiscoveryService";
import type { DomainAssignmentCandidate } from "../../knowledge/domain/domainTypes";
import type { DomainGovernanceState } from "../../knowledge/domain/DomainGovernanceRepository";
import { validateDomainGovernance } from "../../knowledge/domain/domainValidation";
import { knowledgeNodes } from "../../knowledge/graph";
import { demoPersonalKnowledgeGraph } from "../user/demoPersonalKnowledgeGraph.fixture";
import { demoDomainAssignments, DEMO_DOMAIN_ASSIGNMENT_TIME } from "./demoDomainAssignments.fixture";
import { demoKnowledgeDomains } from "./demoDomains.fixture";

const candidates: DomainAssignmentCandidate[] = [
  { nodeId: "BR01", domainId: "agentic-ai", score: 0.89, semanticScore: 0.82, structuralScore: 0.995, algorithmVersion: "domain-affinity-v1", generatedAt: DEMO_DOMAIN_ASSIGNMENT_TIME },
  { nodeId: "BR01", domainId: "python-engineering", score: 0.34, semanticScore: 0.31, structuralScore: 0.385, algorithmVersion: "domain-affinity-v1", generatedAt: DEMO_DOMAIN_ASSIGNMENT_TIME }
];

export function demoDomainGovernanceSeed(): DomainGovernanceState {
  const domains = demoKnowledgeDomains.map((domain) => ({ ...domain }));
  const state: DomainGovernanceState = {
    domains,
    assignments: demoDomainAssignments.map((assignment) => ({ ...assignment })),
    candidates,
    proposals: demoDomainDiscoveryService.discover(knowledgeNodes, domains),
    revision: 0
  };
  const errors = validateDomainGovernance(demoPersonalKnowledgeGraph, state);
  if (errors.length) throw new Error(`Invalid demo Domain governance fixture:\n${errors.join("\n")}`);
  return state;
}

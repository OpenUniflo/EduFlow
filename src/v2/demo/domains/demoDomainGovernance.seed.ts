import { demoDomainDiscoveryService } from "../../knowledge/domain/domainDiscovery";
import { initialKnowledgeDomains } from "../../knowledge/domain/domainData";
import type { DomainAssignment, DomainAssignmentCandidate } from "../../knowledge/domain/domainTypes";
import type { DomainGovernanceState } from "../../knowledge/domain/DomainGovernanceRepository";
import { knowledgeNodes } from "../../knowledge/graph";

const DEMO_TIME = "2026-08-08T00:00:00.000Z";
const AGENTIC_NODE_IDS = "AG01 H02 H03 P01 P02 P03 P05 A01 A02 R01 R10 R03 R04 R11 R06 R07 R08 R09 W01 W02 C01 C02 C03 C04 I01 I02 I05 I04 T11 T12 T03 T14 T15 T06 T07 T08 T09 T10 K01 K12 K13 K14 K15 K16 K04 K05 RT01 RT02 RT03 RT14 RT15 RT06 W13 W04 WF03 WF05 MA02 MA12 MA03 MA04 MA15 MA06 MA07 E12 E13 E14 E05 E06 E07 S01 S02 S03 S14 S15 S06 S07 S08".split(" ");
const PYTHON_NODE_IDS = "PY01 PY02 PY03 PY04 PY05 PY06 PY07 PY08 PY09 PY18 PY19 PY27 PY34 PY37 PY45 PY46 PY49 PY50 PY51 PY99 PY54 PY55 PY56 PY57 PY58 PY100 PY63 PY62 PY64 PY67 PY71 PY72 PY76 PY78 PY101 PY80 PY102 PY83 PY82 PY85 PY86 PY89 PY90 PY91 PY94 PY95 PY97 PY98".split(" ");

function assignmentsFor(ids: string[], domainId: string, pinnedId: string): DomainAssignment[] {
  return ids.map((nodeId) => ({ nodeId, domainId, source: nodeId === pinnedId ? "admin" : "auto", confidence: nodeId === pinnedId ? undefined : 0.92, pinned: nodeId === pinnedId, assignedBy: nodeId === pinnedId ? "global-admin-demo" : undefined, assignedAt: DEMO_TIME }));
}

const candidates: DomainAssignmentCandidate[] = [
  { nodeId: "BR01", domainId: "agentic-ai", score: 0.89, semanticScore: 0.82, structuralScore: 0.995, algorithmVersion: "domain-affinity-v1", generatedAt: DEMO_TIME },
  { nodeId: "BR01", domainId: "python-engineering", score: 0.34, semanticScore: 0.31, structuralScore: 0.385, algorithmVersion: "domain-affinity-v1", generatedAt: DEMO_TIME }
];

export function demoDomainGovernanceSeed(): DomainGovernanceState {
  const domains = initialKnowledgeDomains.map((domain) => ({ ...domain }));
  return {
    domains,
    assignments: [...assignmentsFor(AGENTIC_NODE_IDS, "agentic-ai", "R03"), ...assignmentsFor(PYTHON_NODE_IDS, "python-engineering", "PY01")],
    candidates,
    proposals: demoDomainDiscoveryService.discover(knowledgeNodes, domains),
    revision: 0
  };
}

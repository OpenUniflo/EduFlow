import { useSyncExternalStore } from "react";
import { knowledgeEdges, knowledgeNodes } from "../graph";
import { chooseMostDistinctUnusedColor, isValidDomainColor } from "./domainColors";
import { initialKnowledgeDomains } from "./domainData";
import { demoDomainDiscoveryService } from "./domainDiscovery";
import type { DomainAdminCapability, DomainAssignment, DomainAssignmentCandidate, DomainProposal, KnowledgeDomain, KnowledgeDomainScope } from "./domainTypes";
import { applyAutomaticAssignment, decideDomainAssignment, scoreNodeAgainstDomains } from "./domainScoring";
import { moveNodesToDomain } from "./domainAssignment";

export type DomainGovernanceState = {
  domains: KnowledgeDomain[];
  assignments: DomainAssignment[];
  candidates: DomainAssignmentCandidate[];
  proposals: DomainProposal[];
  revision: number;
};

const DEMO_TIME = "2026-08-08T00:00:00.000Z";
const listeners = new Set<() => void>();

function initialAssignments(): DomainAssignment[] {
  return knowledgeNodes.filter((node) => node.status === "active" && node.domainId && node.id !== "BR01").map((node) => ({
    nodeId: node.id,
    domainId: node.domainId!,
    source: node.id === "R03" || node.id === "PY01" ? "admin" : "auto",
    confidence: node.id === "R03" || node.id === "PY01" ? undefined : 0.92,
    pinned: node.id === "R03" || node.id === "PY01",
    assignedBy: node.id === "R03" || node.id === "PY01" ? "global-admin-demo" : undefined,
    assignedAt: DEMO_TIME
  }));
}

const initialCandidates: DomainAssignmentCandidate[] = [
  { nodeId: "BR01", domainId: "agentic-ai", score: 0.89, semanticScore: 0.82, structuralScore: 0.995, algorithmVersion: "domain-affinity-v1", generatedAt: DEMO_TIME },
  { nodeId: "BR01", domainId: "python-engineering", score: 0.34, semanticScore: 0.31, structuralScore: 0.385, algorithmVersion: "domain-affinity-v1", generatedAt: DEMO_TIME }
];

let state: DomainGovernanceState = {
  domains: initialKnowledgeDomains.map((item) => ({ ...item })),
  assignments: initialAssignments(),
  candidates: initialCandidates,
  proposals: demoDomainDiscoveryService.discover(knowledgeNodes, initialKnowledgeDomains),
  revision: 0
};

function publish(next: Omit<DomainGovernanceState, "revision">) {
  state = { ...next, revision: state.revision + 1 };
  listeners.forEach((listener) => listener());
}

function assertCapability(scope: KnowledgeDomainScope, capability: DomainAdminCapability) {
  if (scope === "global" && capability !== "global-domain-admin") throw new Error("Global Domain mutation requires Global Admin");
  if (scope === "tenant" && capability !== "tenant-domain-admin") throw new Error("Tenant Domain mutation requires Tenant Admin");
}

export function getDomainGovernanceSnapshot() { return state; }
export function subscribeDomainGovernance(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
export function useDomainGovernance() { return useSyncExternalStore(subscribeDomainGovernance, getDomainGovernanceSnapshot, getDomainGovernanceSnapshot); }

export function resolveNodeDomain(nodeId: string, snapshot = state) {
  const assignment = snapshot.assignments.find((item) => item.nodeId === nodeId);
  return { assignment, domain: snapshot.domains.find((item) => item.id === assignment?.domainId) };
}

export function assignNodeDomain(nodeId: string, domainId: string | null, capability: DomainAdminCapability = "global-domain-admin") {
  const domain = domainId ? state.domains.find((item) => item.id === domainId) : undefined;
  if (domain) assertCapability(domain.scope, capability);
  const assignments = domain ? moveNodesToDomain(state.assignments, [nodeId], domain.id) : state.assignments.filter((item) => item.nodeId !== nodeId);
  publish({ ...state, assignments });
}

export function assignNodesToDomain(nodeIds: string[], domainId: string, capability: DomainAdminCapability = "global-domain-admin") {
  const domain = state.domains.find((item) => item.id === domainId);
  if (!domain) throw new Error(`Unknown Domain ${domainId}`);
  assertCapability(domain.scope, capability);
  publish({ ...state, assignments: moveNodesToDomain(state.assignments, nodeIds, domain.id) });
}

export function updateDomain(domainId: string, changes: Partial<Pick<KnowledgeDomain, "name" | "description" | "canonicalColor" | "status">>, capability: DomainAdminCapability = "global-domain-admin") {
  const current = state.domains.find((item) => item.id === domainId);
  if (!current) throw new Error(`Unknown Domain ${domainId}`);
  assertCapability(current.scope, capability);
  if (changes.canonicalColor && !isValidDomainColor(changes.canonicalColor)) throw new Error("Domain color must be a six-digit HEX value");
  const domains = state.domains.map((item) => item.id === domainId ? { ...item, ...changes, updatedBy: "global-admin-demo", updatedAt: new Date().toISOString() } : item);
  publish({ ...state, domains });
}

export function createDomain(input: Pick<KnowledgeDomain, "name" | "description" | "scope"> & { canonicalColor?: string }, capability: DomainAdminCapability = "global-domain-admin") {
  assertCapability(input.scope, capability);
  const canonicalColor = input.canonicalColor || chooseMostDistinctUnusedColor(state.domains.map((item) => item.canonicalColor));
  if (!isValidDomainColor(canonicalColor)) throw new Error("Domain color must be a six-digit HEX value");
  const idBase = input.name.toLowerCase().trim().replace(/[^a-z0-9\p{Script=Han}]+/gu, "-").replace(/^-|-$/g, "") || "domain";
  let id = idBase;
  let suffix = 2;
  while (state.domains.some((item) => item.id === id)) id = `${idBase}-${suffix++}`;
  const now = new Date().toISOString();
  const domain: KnowledgeDomain = { id, ...input, canonicalColor, status: "active", createdBy: "global-admin-demo", createdAt: now, updatedBy: "global-admin-demo", updatedAt: now };
  publish({ ...state, domains: [...state.domains, domain] });
  return domain;
}

export function acceptCandidate(candidate: DomainAssignmentCandidate, domainId = candidate.domainId) {
  assignNodeDomain(candidate.nodeId, domainId);
  publish({ ...state, candidates: state.candidates.filter((item) => item.nodeId !== candidate.nodeId) });
}

export function ignoreCandidate(nodeId: string) {
  publish({ ...state, candidates: state.candidates.filter((item) => item.nodeId !== nodeId) });
}

export function evaluateAutomaticDomainAssignment(nodeId: string) {
  const node = knowledgeNodes.find((item) => item.id === nodeId);
  if (!node) throw new Error(`Unknown KnowledgeNode ${nodeId}`);
  const current = state.assignments.find((item) => item.nodeId === nodeId);
  if (current?.pinned) return { kind: "pinned" as const, assignment: current };
  const candidates = scoreNodeAgainstDomains(node, state.domains, knowledgeNodes, knowledgeEdges, state.assignments);
  const decision = decideDomainAssignment(candidates);
  const automatic = applyAutomaticAssignment(current, decision);
  const assignments = automatic ? [...state.assignments.filter((item) => item.nodeId !== nodeId), automatic] : state.assignments;
  const pending = decision.kind === "suggestion" ? candidates : [];
  publish({ ...state, assignments, candidates: [...state.candidates.filter((item) => item.nodeId !== nodeId), ...pending] });
  return decision;
}

export function reviewProposal(proposalId: string, status: "accepted" | "rejected") {
  publish({ ...state, proposals: state.proposals.map((item) => item.id === proposalId ? { ...item, status } : item) });
}

export function topologySignature() {
  return knowledgeEdges.map((edge) => `${edge.source}:${edge.relation}:${edge.target}`).sort().join("|");
}

import { useSyncExternalStore } from "react";
import { knowledgeEdges, knowledgeNodes } from "../graph";
import { chooseMostDistinctUnusedColor, isValidDomainColor } from "./domainColors";
import type { DomainActor, DomainAssignmentCandidate, DomainProposal, KnowledgeDomain, KnowledgeDomainScope } from "./domainTypes";
import { applyAutomaticAssignment, decideDomainAssignment, scoreNodeAgainstDomains } from "./domainScoring";
import { moveNodesToDomain } from "./domainAssignment";
import type { DomainGovernanceState } from "./DomainGovernanceRepository";
import { LocalStorageDomainGovernanceRepository } from "./LocalStorageDomainGovernanceRepository";
import { assertDomainAcceptsAssignment, assertDomainCanArchive } from "./domainValidation";

export type { DomainGovernanceState } from "./DomainGovernanceRepository";

const repository = new LocalStorageDomainGovernanceRepository();
const listeners = new Set<() => void>();
let state = repository.load();

function publish(next: Omit<DomainGovernanceState, "revision">) {
  state = { ...next, revision: state.revision + 1 };
  repository.save(state);
  listeners.forEach((listener) => listener());
}

function assertCapability(scope: KnowledgeDomainScope, actor: DomainActor) {
  const required = scope === "global" ? "global-domain-admin" : "tenant-domain-admin";
  if (!actor.capabilities.includes(required)) throw new Error(`${scope} Domain mutation requires ${required}`);
}

function requireActiveDomain(domainId: string, actor: DomainActor) {
  const domain = state.domains.find((item) => item.id === domainId);
  if (!domain) throw new Error(`Unknown Domain ${domainId}`);
  assertCapability(domain.scope, actor);
  assertDomainAcceptsAssignment(domain);
  return domain;
}

export function getDomainGovernanceSnapshot() { return state; }
export function subscribeDomainGovernance(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useDomainGovernance() { return useSyncExternalStore(subscribeDomainGovernance, getDomainGovernanceSnapshot, getDomainGovernanceSnapshot); }

export function resolveNodeDomain(nodeId: string, snapshot = state) {
  const assignment = snapshot.assignments.find((item) => item.nodeId === nodeId);
  return { assignment, domain: snapshot.domains.find((item) => item.id === assignment?.domainId) };
}

export function assignNodeDomain(input: { actor: DomainActor; nodeId: string; domainId: string | null }) {
  const domain = input.domainId ? requireActiveDomain(input.domainId, input.actor) : undefined;
  const assignments = domain ? moveNodesToDomain(state.assignments, [input.nodeId], domain.id, input.actor) : state.assignments.filter((item) => item.nodeId !== input.nodeId);
  publish({ ...state, assignments });
}

export function assignNodesToDomain(input: { actor: DomainActor; nodeIds: string[]; domainId: string }) {
  const domain = requireActiveDomain(input.domainId, input.actor);
  publish({ ...state, assignments: moveNodesToDomain(state.assignments, input.nodeIds, domain.id, input.actor) });
}

export function updateDomain(input: { actor: DomainActor; domainId: string; changes: Partial<Pick<KnowledgeDomain, "name" | "description" | "canonicalColor" | "status">> }) {
  const current = state.domains.find((item) => item.id === input.domainId);
  if (!current) throw new Error(`Unknown Domain ${input.domainId}`);
  assertCapability(current.scope, input.actor);
  if (input.changes.status === "archived") {
    assertDomainCanArchive(current.id, state.assignments);
  }
  if (input.changes.canonicalColor && !isValidDomainColor(input.changes.canonicalColor)) throw new Error("Domain color must be a six-digit HEX value");
  const domains = state.domains.map((item) => item.id === input.domainId ? { ...item, ...input.changes, updatedBy: input.actor.id, updatedAt: new Date().toISOString() } : item);
  publish({ ...state, domains });
}

export function createDomain(input: { actor: DomainActor; name: string; description?: string; scope: KnowledgeDomainScope; canonicalColor?: string }) {
  assertCapability(input.scope, input.actor);
  const canonicalColor = input.canonicalColor || chooseMostDistinctUnusedColor(state.domains.map((item) => item.canonicalColor));
  if (!isValidDomainColor(canonicalColor)) throw new Error("Domain color must be a six-digit HEX value");
  const idBase = input.name.toLowerCase().trim().replace(/[^a-z0-9\p{Script=Han}]+/gu, "-").replace(/^-|-$/g, "") || "domain";
  let id = idBase;
  let suffix = 2;
  while (state.domains.some((item) => item.id === id)) id = `${idBase}-${suffix++}`;
  const now = new Date().toISOString();
  const domain: KnowledgeDomain = { id, name: input.name, description: input.description, scope: input.scope, canonicalColor, status: "active", createdBy: input.actor.id, createdAt: now, updatedBy: input.actor.id, updatedAt: now };
  publish({ ...state, domains: [...state.domains, domain] });
  return domain;
}

export function acceptCandidate(input: { actor: DomainActor; candidate: DomainAssignmentCandidate; domainId?: string }) {
  assignNodeDomain({ actor: input.actor, nodeId: input.candidate.nodeId, domainId: input.domainId ?? input.candidate.domainId });
  publish({ ...state, candidates: state.candidates.filter((item) => item.nodeId !== input.candidate.nodeId) });
}

export function ignoreCandidate(input: { actor: DomainActor; nodeId: string }) {
  if (!input.actor.capabilities.length) throw new Error("Domain governance requires an admin capability");
  publish({ ...state, candidates: state.candidates.filter((item) => item.nodeId !== input.nodeId) });
}

export function evaluateAutomaticDomainAssignment(nodeId: string) {
  const node = knowledgeNodes.find((item) => item.id === nodeId);
  if (!node) throw new Error(`Unknown KnowledgeNode ${nodeId}`);
  const current = state.assignments.find((item) => item.nodeId === nodeId);
  if (current?.pinned) return { kind: "pinned" as const, assignment: current };
  const candidates = scoreNodeAgainstDomains(node, state.domains.filter((domain) => domain.status === "active"), knowledgeNodes, knowledgeEdges, state.assignments);
  const decision = decideDomainAssignment(candidates);
  const automatic = applyAutomaticAssignment(current, decision);
  const assignments = automatic ? [...state.assignments.filter((item) => item.nodeId !== nodeId), automatic] : state.assignments;
  publish({ ...state, assignments, candidates: [...state.candidates.filter((item) => item.nodeId !== nodeId), ...(decision.kind === "suggestion" ? candidates : [])] });
  return decision;
}

export function reviewProposal(input: { actor: DomainActor; proposalId: string; status: DomainProposal["status"] }) {
  if (!input.actor.capabilities.length) throw new Error("Domain governance requires an admin capability");
  publish({ ...state, proposals: state.proposals.map((item) => item.id === input.proposalId ? { ...item, status: input.status } : item) });
}

export function topologySignature() { return knowledgeEdges.map((edge) => `${edge.source}:${edge.relation}:${edge.target}`).sort().join("|"); }

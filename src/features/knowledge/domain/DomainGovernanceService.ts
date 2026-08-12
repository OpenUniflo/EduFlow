import type { KnowledgeAccessContext, KnowledgeRepository } from "../repository/KnowledgeRepository";
import { chooseMostDistinctUnusedColor, isValidDomainColor } from "./domainColors";
import { moveNodesToDomain } from "./domainAssignment";
import { applyAutomaticAssignment, decideDomainAssignment, scoreNodeAgainstDomains } from "./domainScoring";
import type { DomainActor, DomainAssignmentCandidate, DomainProposal, KnowledgeDomain } from "./domainTypes";
import type { DomainGovernanceRepository, DomainGovernanceState } from "./DomainGovernanceRepository";
import { resolveNodeDomain as resolveNodeDomainFromState } from "./domainResolution";
import { assertDomainAcceptsAssignment, assertDomainCanArchive } from "./domainValidation";

export type AssignNodeDomainInput = { actor: DomainActor; access: KnowledgeAccessContext; nodeId: string; domainId: string | null };
export type AssignNodesToDomainInput = { actor: DomainActor; access: KnowledgeAccessContext; nodeIds: string[]; domainId: string };
export type UpdateDomainInput = { actor: DomainActor; domainId: string; changes: Partial<Pick<KnowledgeDomain, "name" | "description" | "canonicalColor" | "status">> };
export type CreateDomainInput = { actor: DomainActor; name: string; description?: string; canonicalColor?: string };
export type AcceptCandidateInput = { actor: DomainActor; access: KnowledgeAccessContext; candidate: DomainAssignmentCandidate; domainId?: string };
export type ReviewProposalInput = { actor: DomainActor; proposalId: string; status: DomainProposal["status"] };
export type EvaluateAutomaticDomainAssignmentInput = { nodeId: string; access: KnowledgeAccessContext };

export function assertGlobalDomainAdmin(actor: DomainActor) {
  if (!actor.capabilities.includes("global-domain-admin")) throw new Error("Domain mutation requires global-domain-admin");
}

export class DomainGovernanceService {
  private state: DomainGovernanceState;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly knowledgeRepository: KnowledgeRepository, private readonly governanceRepository: DomainGovernanceRepository) {
    this.state = governanceRepository.load();
  }

  getSnapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(next: Omit<DomainGovernanceState, "revision">) {
    this.state = { ...next, revision: this.state.revision + 1 };
    this.governanceRepository.save(this.state);
    this.listeners.forEach((listener) => listener());
  }

  private requireActiveDomain(domainId: string, actor: DomainActor) {
    assertGlobalDomainAdmin(actor);
    const domain = this.state.domains.find((item) => item.id === domainId);
    if (!domain) throw new Error(`Unknown Domain ${domainId}`);
    assertDomainAcceptsAssignment(domain);
    return domain;
  }

  validateAssignmentTargets(nodeIds: string[], access: KnowledgeAccessContext) {
    const uniqueNodeIds = Array.from(new Set(nodeIds));
    const nodes = this.knowledgeRepository.getNodes(uniqueNodeIds, access);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    uniqueNodeIds.forEach((nodeId) => {
      const node = nodeById.get(nodeId);
      if (!node) throw new Error(`Unknown or invisible KnowledgeNode ${nodeId}`);
      if (node.status !== "active") throw new Error(`KnowledgeNode ${nodeId} is not active`);
    });
    return uniqueNodeIds;
  }

  resolveNodeDomain(nodeId: string, snapshot = this.state) {
    return resolveNodeDomainFromState(nodeId, snapshot);
  }

  assignNodeDomain(input: AssignNodeDomainInput) {
    assertGlobalDomainAdmin(input.actor);
    this.validateAssignmentTargets([input.nodeId], input.access);
    const currentAssignment = this.state.assignments.find((item) => item.nodeId === input.nodeId);
    const domain = input.domainId ? this.requireActiveDomain(input.domainId, input.actor) : undefined;
    if (!domain && !currentAssignment) return;
    const assignments = domain
      ? moveNodesToDomain(this.state.assignments, [input.nodeId], domain.id, input.actor)
      : this.state.assignments.filter((item) => item.nodeId !== input.nodeId);
    this.publish({ ...this.state, assignments });
  }

  assignNodesToDomain(input: AssignNodesToDomainInput) {
    const domain = this.requireActiveDomain(input.domainId, input.actor);
    const nodeIds = this.validateAssignmentTargets(input.nodeIds, input.access);
    this.publish({ ...this.state, assignments: moveNodesToDomain(this.state.assignments, nodeIds, domain.id, input.actor) });
  }

  updateDomain(input: UpdateDomainInput) {
    assertGlobalDomainAdmin(input.actor);
    const current = this.state.domains.find((item) => item.id === input.domainId);
    if (!current) throw new Error(`Unknown Domain ${input.domainId}`);
    if (input.changes.status === "archived") assertDomainCanArchive(current.id, this.state.assignments);
    if (input.changes.canonicalColor && !isValidDomainColor(input.changes.canonicalColor)) throw new Error("Domain color must be a six-digit HEX value");
    const domains = this.state.domains.map((item) => item.id === input.domainId
      ? { ...item, ...input.changes, updatedBy: input.actor.id, updatedAt: new Date().toISOString() }
      : item);
    this.publish({ ...this.state, domains });
  }

  createDomain(input: CreateDomainInput) {
    assertGlobalDomainAdmin(input.actor);
    const canonicalColor = input.canonicalColor || chooseMostDistinctUnusedColor(this.state.domains.map((item) => item.canonicalColor));
    if (!isValidDomainColor(canonicalColor)) throw new Error("Domain color must be a six-digit HEX value");
    const idBase = input.name.toLowerCase().trim().replace(/[^a-z0-9\p{Script=Han}]+/gu, "-").replace(/^-|-$/g, "") || "domain";
    let id = idBase;
    let suffix = 2;
    while (this.state.domains.some((item) => item.id === id)) id = `${idBase}-${suffix++}`;
    const now = new Date().toISOString();
    const domain: KnowledgeDomain = { id, name: input.name, description: input.description, canonicalColor, status: "active", createdBy: input.actor.id, createdAt: now, updatedBy: input.actor.id, updatedAt: now };
    this.publish({ ...this.state, domains: [...this.state.domains, domain] });
    return domain;
  }

  acceptCandidate(input: AcceptCandidateInput) {
    const domain = this.requireActiveDomain(input.domainId ?? input.candidate.domainId, input.actor);
    this.validateAssignmentTargets([input.candidate.nodeId], input.access);
    const assignments = moveNodesToDomain(this.state.assignments, [input.candidate.nodeId], domain.id, input.actor);
    this.publish({ ...this.state, assignments, candidates: this.state.candidates.filter((item) => item.nodeId !== input.candidate.nodeId) });
  }

  ignoreCandidate(input: { actor: DomainActor; nodeId: string }) {
    assertGlobalDomainAdmin(input.actor);
    this.publish({ ...this.state, candidates: this.state.candidates.filter((item) => item.nodeId !== input.nodeId) });
  }

  evaluateAutomaticDomainAssignment(input: EvaluateAutomaticDomainAssignmentInput) {
    const graph = this.knowledgeRepository.getVisibleGraph(input.access);
    const node = graph.nodes.find((item) => item.id === input.nodeId);
    if (!node) throw new Error(`Unknown KnowledgeNode ${input.nodeId}`);
    const current = this.state.assignments.find((item) => item.nodeId === input.nodeId);
    if (current?.pinned) return { kind: "pinned" as const, assignment: current };
    const candidates = scoreNodeAgainstDomains(node, this.state.domains.filter((domain) => domain.status === "active"), graph.nodes, graph.edges, this.state.assignments);
    const decision = decideDomainAssignment(candidates);
    const automatic = applyAutomaticAssignment(current, decision);
    const assignments = automatic ? [...this.state.assignments.filter((item) => item.nodeId !== input.nodeId), automatic] : this.state.assignments;
    this.publish({ ...this.state, assignments, candidates: [...this.state.candidates.filter((item) => item.nodeId !== input.nodeId), ...(decision.kind === "suggestion" ? candidates : [])] });
    return decision;
  }

  reviewProposal(input: ReviewProposalInput) {
    assertGlobalDomainAdmin(input.actor);
    if (!this.state.proposals.some((item) => item.id === input.proposalId)) throw new Error(`Unknown DomainProposal ${input.proposalId}`);
    this.publish({ ...this.state, proposals: this.state.proposals.map((item) => item.id === input.proposalId ? { ...item, status: input.status } : item) });
  }

  topologySignature(access: KnowledgeAccessContext) {
    return this.knowledgeRepository.getVisibleGraph(access).edges
      .map((edge) => `${edge.source}:${edge.relation}:${edge.target}`)
      .sort()
      .join("|");
  }
}

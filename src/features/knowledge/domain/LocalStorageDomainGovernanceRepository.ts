import type { DomainGovernanceRepository, DomainGovernanceState } from "./DomainGovernanceRepository";
import type { KnowledgeGraph } from "../types";
import { validateDomainGovernance } from "./domainValidation";

export const DOMAIN_GOVERNANCE_STORAGE_KEY = "eduflow:v2:domain-governance";
export const DOMAIN_GOVERNANCE_SCHEMA_VERSION = 2;
export const DOMAIN_GOVERNANCE_SEED_VERSION = "2026-08-10-global-domain-v2";

type PersistedDomainGovernanceEnvelope = {
  schemaVersion: number;
  seedVersion: string;
  seededDomainIds: string[];
  seededAssignmentNodeIds: string[];
  state: DomainGovernanceState;
};

function isGovernanceState(value: unknown): value is DomainGovernanceState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<DomainGovernanceState>;
  return Array.isArray(state.domains) && Array.isArray(state.assignments) && Array.isArray(state.candidates) && Array.isArray(state.proposals) && typeof state.revision === "number";
}

type LegacyScopedRecord = { scope?: unknown };

export function migrateDomainGovernanceStateToGlobalV1(state: DomainGovernanceState): DomainGovernanceState {
  const domains = state.domains.flatMap((domain) => {
    const legacy = domain as typeof domain & LegacyScopedRecord;
    if (legacy.scope === "tenant") return [];
    const { scope: _scope, ...globalDomain } = legacy;
    return [globalDomain];
  });
  const domainIds = new Set(domains.map((domain) => domain.id));
  const assignments = state.assignments.filter((assignment) => domainIds.has(assignment.domainId));
  const candidates = state.candidates.filter((candidate) => domainIds.has(candidate.domainId));
  const proposals = state.proposals.flatMap((proposal) => {
    const legacy = proposal as typeof proposal & LegacyScopedRecord;
    if (legacy.scope === "tenant") return [];
    const { scope: _scope, ...globalProposal } = legacy;
    return [globalProposal];
  });
  return { domains, assignments, candidates, proposals, revision: state.revision };
}

export function reconcileDomainGovernanceState(saved: DomainGovernanceState, seed: DomainGovernanceState, seededDomainIds: string[], seededAssignmentNodeIds: string[], graph: KnowledgeGraph) {
  saved = migrateDomainGovernanceStateToGlobalV1(saved);
  seed = migrateDomainGovernanceStateToGlobalV1(seed);
  const knownSeedDomains = new Set(seededDomainIds);
  const domains = saved.domains.map((domain) => ({ ...domain }));
  seed.domains.forEach((domain) => {
    if (!domains.some((item) => item.id === domain.id) && !knownSeedDomains.has(domain.id)) domains.push({ ...domain });
  });
  const activeDomainIds = new Set(domains.filter((domain) => domain.status === "active").map((domain) => domain.id));
  const activeNodeIds = new Set(graph.nodes.filter((node) => node.status === "active").map((node) => node.id));
  const assignments = saved.assignments.filter((assignment) => activeNodeIds.has(assignment.nodeId) && activeDomainIds.has(assignment.domainId)).map((assignment) => ({ ...assignment }));
  const previouslySeededNodes = new Set(seededAssignmentNodeIds);
  seed.assignments.forEach((assignment) => {
    if (!assignments.some((item) => item.nodeId === assignment.nodeId) && !previouslySeededNodes.has(assignment.nodeId) && activeNodeIds.has(assignment.nodeId) && activeDomainIds.has(assignment.domainId)) assignments.push({ ...assignment });
  });
  const assignmentNodeIds = new Set(assignments.map((assignment) => assignment.nodeId));
  const candidates = saved.candidates
    .filter((candidate) => activeNodeIds.has(candidate.nodeId) && activeDomainIds.has(candidate.domainId) && !assignmentNodeIds.has(candidate.nodeId))
    .map((candidate) => ({ ...candidate }));
  seed.candidates.forEach((candidate) => {
    if (!candidates.some((item) => item.nodeId === candidate.nodeId && item.domainId === candidate.domainId) && activeNodeIds.has(candidate.nodeId) && activeDomainIds.has(candidate.domainId) && !assignmentNodeIds.has(candidate.nodeId)) candidates.push({ ...candidate });
  });
  const proposals = saved.proposals.filter((proposal) => proposal.suggestedNodeIds.every((nodeId) => activeNodeIds.has(nodeId))).map((proposal) => ({ ...proposal, suggestedNodeIds: [...proposal.suggestedNodeIds] }));
  seed.proposals.forEach((proposal) => {
    if (!proposals.some((item) => item.id === proposal.id) && proposal.suggestedNodeIds.every((nodeId) => activeNodeIds.has(nodeId))) proposals.push({ ...proposal, suggestedNodeIds: [...proposal.suggestedNodeIds] });
  });
  return { domains, assignments, candidates, proposals, revision: Math.max(saved.revision, seed.revision) };
}

export class LocalStorageDomainGovernanceRepository implements DomainGovernanceRepository {
  constructor(private readonly graph: KnowledgeGraph, private readonly createSeed: () => DomainGovernanceState) {}

  load(): DomainGovernanceState {
    const seed = this.createSeed();
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(DOMAIN_GOVERNANCE_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<PersistedDomainGovernanceEnvelope> | DomainGovernanceState;
          let state: DomainGovernanceState | null = null;
          if ("state" in parsed && (parsed.schemaVersion === 1 || parsed.schemaVersion === DOMAIN_GOVERNANCE_SCHEMA_VERSION) && isGovernanceState(parsed.state)) {
            // Schema v1 allowed scoped Domains. Global records are stripped of scope; Tenant records and their references are discarded rather than promoted.
            state = reconcileDomainGovernanceState(migrateDomainGovernanceStateToGlobalV1(parsed.state), seed, parsed.seededDomainIds ?? [], parsed.seededAssignmentNodeIds ?? [], this.graph);
          } else if (isGovernanceState(parsed)) {
            // Legacy raw-state migration follows the same Global-only rule and preserves valid administrator changes.
            const migrated = migrateDomainGovernanceStateToGlobalV1(parsed);
            state = reconcileDomainGovernanceState(migrated, seed, migrated.domains.map((domain) => domain.id), migrated.assignments.map((assignment) => assignment.nodeId), this.graph);
          }
          if (state && !validateDomainGovernance(this.graph, state).length) {
            this.save(state);
            return state;
          }
        }
      } catch {
        // Invalid demo persistence falls back to the registered governance seed.
      }
    }
    const errors = validateDomainGovernance(this.graph, seed);
    if (errors.length) throw new Error(errors.join("\n"));
    return seed;
  }

  save(state: DomainGovernanceState) {
    const errors = validateDomainGovernance(this.graph, state);
    if (errors.length) throw new Error(errors.join("\n"));
    if (typeof window !== "undefined") {
      const seed = this.createSeed();
      const envelope: PersistedDomainGovernanceEnvelope = {
        schemaVersion: DOMAIN_GOVERNANCE_SCHEMA_VERSION,
        seedVersion: DOMAIN_GOVERNANCE_SEED_VERSION,
        seededDomainIds: seed.domains.map((domain) => domain.id),
        seededAssignmentNodeIds: seed.assignments.map((assignment) => assignment.nodeId),
        state
      };
      window.localStorage.setItem(DOMAIN_GOVERNANCE_STORAGE_KEY, JSON.stringify(envelope));
    }
  }
}

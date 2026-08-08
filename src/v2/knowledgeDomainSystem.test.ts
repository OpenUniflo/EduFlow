import { describe, expect, it } from "vitest";
import { knowledgeEdges, knowledgeNodes } from "./knowledge/graph";
import { buildGlobalAtlasProjection } from "./knowledge/projections/atlasProjections";
import { applyAutomaticAssignment, decideDomainAssignment, DEFAULT_DOMAIN_DISCOVERY_CONFIG, scoreNodeAgainstDomains } from "./knowledge/domain/domainScoring";
import { demoDomainDiscoveryService } from "./knowledge/domain/domainDiscovery";
import { initialKnowledgeDomains } from "./knowledge/domain/domainData";
import { getDomainGovernanceSnapshot } from "./knowledge/domain/domainStore";
import { validateDomainAssignments } from "./knowledge/domain/domainValidation";
import type { DomainAssignmentCandidate } from "./knowledge/domain/domainTypes";

function candidate(score: number): DomainAssignmentCandidate {
  return { nodeId: "new-node", domainId: "agentic-ai", score, semanticScore: score, structuralScore: score, algorithmVersion: "test", generatedAt: "2026-08-08T00:00:00.000Z" };
}

describe("Knowledge Domain invariants", () => {
  it("keeps exactly zero or one valid primary Domain and pins admin assignments", () => {
    const snapshot = getDomainGovernanceSnapshot();
    expect(validateDomainAssignments(snapshot.assignments, snapshot.domains, knowledgeNodes.map((node) => node.id))).toEqual([]);
    expect(snapshot.assignments.find((item) => item.nodeId === "R03")).toMatchObject({ domainId: "agentic-ai", source: "admin", pinned: true });
  });

  it("uses configurable auto, suggestion and Unclassified thresholds", () => {
    expect(decideDomainAssignment([candidate(0.85)]).kind).toBe("auto-assign");
    expect(decideDomainAssignment([candidate(0.72)]).kind).toBe("suggestion");
    expect(decideDomainAssignment([candidate(0.59)]).kind).toBe("unclassified");
    expect(decideDomainAssignment([candidate(0.7)], { ...DEFAULT_DOMAIN_DISCOVERY_CONFIG, autoAssignThreshold: 0.7 }).kind).toBe("auto-assign");
  });

  it("never overwrites an admin-pinned assignment automatically", () => {
    const pinned = { nodeId: "new-node", domainId: "python-engineering", source: "admin" as const, pinned: true, assignedAt: "now" };
    expect(applyAutomaticAssignment(pinned, { kind: "auto-assign", candidate: candidate(0.96) })).toBe(pinned);
  });

  it("scores existing Domains with semantic and factual structural evidence", () => {
    const snapshot = getDomainGovernanceSnapshot();
    const node = knowledgeNodes.find((item) => item.id === "BR01")!;
    const scored = scoreNodeAgainstDomains(node, snapshot.domains, knowledgeNodes, knowledgeEdges, snapshot.assignments);
    expect(scored.length).toBeGreaterThan(1);
    expect(scored.every((item) => item.score === DEFAULT_DOMAIN_DISCOVERY_CONFIG.semanticWeight * item.semanticScore + DEFAULT_DOMAIN_DISCOVERY_CONFIG.structuralWeight * item.structuralScore)).toBe(true);
    expect(scored[0].structuralScore).toBeGreaterThan(0);
  });

  it("Domain changes preserve topology and structural projection identity", () => {
    const snapshot = getDomainGovernanceSnapshot();
    const before = buildGlobalAtlasProjection(snapshot);
    const changed = {
      ...snapshot,
      assignments: [...snapshot.assignments.filter((item) => item.nodeId !== "PY46"), { nodeId: "PY46", domainId: "agentic-ai", source: "admin" as const, pinned: true, assignedAt: "now" }],
      revision: snapshot.revision + 1
    };
    const after = buildGlobalAtlasProjection(changed);
    const signature = (projection: typeof before) => ({ ids: projection.nodes.map((node) => node.id).sort(), edges: projection.edges.map((edge) => `${edge.source}:${edge.relation}:${edge.target}`).sort() });
    expect(signature(after)).toEqual(signature(before));
    expect(after.nodes.find((node) => node.id === "PY46")?.color).toBe(initialKnowledgeDomains.find((domain) => domain.id === "agentic-ai")?.canonicalColor);
  });

  it("discovery emits reviewable proposals rather than formal Domains", () => {
    const proposals = demoDomainDiscoveryService.discover(knowledgeNodes, initialKnowledgeDomains);
    expect(proposals[0]).toMatchObject({ status: "pending", scope: "global" });
    expect(initialKnowledgeDomains.some((domain) => domain.id === proposals[0].id)).toBe(false);
  });
});

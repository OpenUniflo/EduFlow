import { describe, expect, it } from "vitest";
import { knowledgeEdges, knowledgeNodes } from "./knowledge/graph";
import { buildGlobalAtlasProjection } from "./knowledge/projections/atlasProjections";
import { applyAutomaticAssignment, decideDomainAssignment, DEFAULT_DOMAIN_DISCOVERY_CONFIG, scoreNodeAgainstDomains } from "./knowledge/domain/domainScoring";
import { demoDomainDiscoveryService } from "./knowledge/domain/domainDiscovery";
import { initialKnowledgeDomains } from "./knowledge/domain/domainData";
import { assignNodeDomain, assertDomainScopeCapability, getDomainGovernanceSnapshot } from "./knowledge/domain/domainStore";
import { assertDomainAcceptsAssignment, assertDomainCanArchive, getDomainMembers, validateDomainAssignments } from "./knowledge/domain/domainValidation";
import { moveNodesToDomain } from "./knowledge/domain/domainAssignment";
import { atlasStructureKey, freezeAtlasNodePositions, resetAtlasCamera } from "./knowledge/atlasCamera";
import type { DomainAssignmentCandidate } from "./knowledge/domain/domainTypes";
import { canManageKnowledgeDomains } from "./session/capabilities";
import { applicationServices } from "./services/applicationServices";
import { globalKnowledgeAccess } from "./knowledge/repository/KnowledgeRepository";

const atlasGraph = applicationServices.knowledgeRepository.getVisibleGraph(globalKnowledgeAccess);
const runtimes = applicationServices.courseRepository.listCourseRuntimes();

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
    const before = buildGlobalAtlasProjection(atlasGraph, snapshot, runtimes);
    const changed = {
      ...snapshot,
      assignments: [...snapshot.assignments.filter((item) => item.nodeId !== "PY46"), { nodeId: "PY46", domainId: "agentic-ai", source: "admin" as const, pinned: true, assignedAt: "now" }],
      revision: snapshot.revision + 1
    };
    const after = buildGlobalAtlasProjection(atlasGraph, changed, runtimes);
    const signature = (projection: typeof before) => ({ ids: projection.nodes.map((node) => node.id).sort(), edges: projection.edges.map((edge) => `${edge.source}:${edge.relation}:${edge.target}`).sort() });
    expect(signature(after)).toEqual(signature(before));
    expect(after.nodes.find((node) => node.id === "PY46")?.color).toBe(initialKnowledgeDomains.find((domain) => domain.id === "agentic-ai")?.canonicalColor);
  });

  it("discovery emits reviewable proposals rather than formal Domains", () => {
    const proposals = demoDomainDiscoveryService.discover(knowledgeNodes, initialKnowledgeDomains);
    expect(proposals[0]).toMatchObject({ status: "pending", scope: "global" });
    expect(initialKnowledgeDomains.some((domain) => domain.id === proposals[0].id)).toBe(false);
  });

  it("treats nodes without DomainAssignment as manageable Unclassified members", () => {
    const snapshot = getDomainGovernanceSnapshot();
    const members = getDomainMembers(knowledgeNodes, snapshot.assignments, "");
    expect(members.map((node) => node.id)).toContain("BR01");
    expect(members.length).toBe(knowledgeNodes.filter((node) => node.status === "active" && !snapshot.assignments.some((assignment) => assignment.nodeId === node.id)).length);
  });

  it("moves Unclassified nodes with admin pinned precedence", () => {
    const snapshot = getDomainGovernanceSnapshot();
    const moved = moveNodesToDomain(snapshot.assignments, ["BR01"], "python-engineering", { id: "admin", capabilities: ["global-domain-admin"] }, "now");
    const assignment = moved.find((item) => item.nodeId === "BR01");
    expect(assignment).toMatchObject({ domainId: "python-engineering", source: "admin", pinned: true });
    expect(applyAutomaticAssignment(assignment, { kind: "auto-assign", candidate: candidate(0.99) })).toBe(assignment);
  });

  it("rejects archive while members exist and rejects assignments to archived Domains", () => {
    const snapshot = getDomainGovernanceSnapshot();
    expect(() => assertDomainCanArchive("agentic-ai", snapshot.assignments)).toThrow(/仍包含/);
    expect(() => assertDomainCanArchive("empty-domain", snapshot.assignments)).not.toThrow();
    expect(() => assertDomainAcceptsAssignment({ ...snapshot.domains[0], status: "archived" })).toThrow(/cannot accept assignments/);
  });

  it("keeps Atlas structure identity stable for color, status, and selection presentation", () => {
    const snapshot = getDomainGovernanceSnapshot();
    const projection = buildGlobalAtlasProjection(atlasGraph, snapshot, runtimes);
    const before = atlasStructureKey(projection.nodes, projection.edges, "global");
    const presented = projection.nodes.map((node, index) => ({ ...node, color: index ? node.color : "#667EDB", status: index ? node.status : "learning" as const }));
    expect(atlasStructureKey(presented, projection.edges, "global")).toBe(before);
  });

  it("freezes engine positions without a camera action and resets through one transition", () => {
    const nodes = [{ id: "a", x: 1, y: 2, z: 3 }];
    freezeAtlasNodePositions(nodes);
    expect(nodes[0]).toMatchObject({ fx: 1, fy: 2, fz: 3 });
    const calls: unknown[][] = [];
    resetAtlasCamera("global", (...args) => calls.push(args));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([{ x: 0, y: 0, z: 620 }, { x: 0, y: 0, z: 0 }, 500]);
  });

  it("exposes Domain governance only through runtime capabilities", () => {
    expect(canManageKnowledgeDomains({ capabilities: [] })).toBe(false);
    expect(canManageKnowledgeDomains({ capabilities: ["global-domain-admin"] })).toBe(true);
  });

  it("requires scope-appropriate permission for unassign and proposal review", () => {
    expect(() => assignNodeDomain({ actor: { id: "user", capabilities: [] }, nodeId: "R03", domainId: null })).toThrow(/global-domain-admin/);
    expect(() => assertDomainScopeCapability("global", { id: "tenant", capabilities: ["tenant-domain-admin"] })).toThrow(/global-domain-admin/);
    expect(() => assertDomainScopeCapability("global", { id: "global", capabilities: ["global-domain-admin"] })).not.toThrow();
    expect(() => assertDomainScopeCapability("tenant", { id: "tenant", capabilities: ["tenant-domain-admin"] })).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { validateGlobalKnowledgeGraph, validateKnowledgeGraph } from "@/features/knowledge/graph";
import { buildKnowledgeEdges, createKnowledgeEdgeId, type EdgeSeed } from "@/demo/knowledge/demoKnowledgeEdgeFactory.fixture";
import {
  demoGlobalKnowledgeGraph as globalKnowledgeGraph,
  demoKnowledgeEdges as knowledgeEdges,
  demoKnowledgeNodes as knowledgeNodes
} from "@/demo/knowledge/demoGlobalKnowledgeGraph.fixture";
import { buildGlobalAtlasProjection } from "@/features/knowledge/projections/atlasProjections";
import { applyAutomaticAssignment, decideDomainAssignment, DEFAULT_DOMAIN_DISCOVERY_CONFIG, scoreNodeAgainstDomains } from "@/features/knowledge/domain/domainScoring";
import { demoDomainDiscoveryService } from "@/demo/domains/DemoDomainDiscoveryService";
import { demoKnowledgeDomains } from "@/demo/domains/demoDomains.fixture";
import { demoDomainAssignments } from "@/demo/domains/demoDomainAssignments.fixture";
import { demoDomainGovernanceSeed } from "@/demo/domains/demoDomainGovernance.seed";
import { assignNodeDomain, assertGlobalDomainAdmin } from "@/features/knowledge/domain/domainStore";
import { assertDomainAcceptsAssignment, assertDomainCanArchive, getDomainMembers, validateDomainGovernance } from "@/features/knowledge/domain/domainValidation";
import { moveNodesToDomain } from "@/features/knowledge/domain/domainAssignment";
import { atlasStructureKey, freezeAtlasNodePositions, resetAtlasCamera } from "@/features/knowledge/atlasCamera";
import type { DomainAssignmentCandidate } from "@/features/knowledge/domain/domainTypes";
import { canManageKnowledgeDomains } from "@/features/auth/capabilities";
import { createDemoApplicationServices } from "@/demo/services/createDemoApplicationServices";
import { globalKnowledgeAccess, userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { auditDomainRelations, validateKnowledgeRelations } from "@/features/knowledge/relationAudit";
import type { KnowledgeEdge, KnowledgeGraph, KnowledgeNode } from "@/features/knowledge/types";
import { demoPersonalKnowledgeGraph } from "@/demo/users/demoPersonalKnowledgeGraph.fixture";
import { DOMAIN_GOVERNANCE_SCHEMA_VERSION, migrateDomainGovernanceStateToGlobalV1, reconcileDomainGovernanceState } from "@/features/knowledge/domain/LocalStorageDomainGovernanceRepository";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DomainGovernanceService } from "@/features/knowledge/domain/DomainGovernanceService";
import { InMemoryKnowledgeRepository } from "@/features/knowledge/repository/InMemoryKnowledgeRepository";
import type { DomainGovernanceRepository, DomainGovernanceState } from "@/features/knowledge/domain/DomainGovernanceRepository";

const applicationServices = createDemoApplicationServices();
const getDomainGovernanceSnapshot = applicationServices.domainGovernanceService.getSnapshot;
const atlasGraph = applicationServices.knowledgeRepository.getVisibleGraph(globalKnowledgeAccess);
const runtimes = applicationServices.courseRepository.listCourseRuntimes();

function candidate(score: number): DomainAssignmentCandidate {
  return { nodeId: "new-node", domainId: "agentic-ai", score, semanticScore: score, structuralScore: score, algorithmVersion: "test", generatedAt: "2026-08-08T00:00:00.000Z" };
}

describe("Knowledge Domain invariants", () => {
  it("keeps KnowledgeNode and KnowledgeGraph free of Domain authority", () => {
    expect(knowledgeNodes.every((node) => !("domainId" in node))).toBe(true);
    expect("domains" in globalKnowledgeGraph).toBe(false);
    expect("domains" in applicationServices.knowledgeRepository.getVisibleGraph(globalKnowledgeAccess)).toBe(false);
  });

  it("validates canonical relation endpoints, active status, uniqueness, strength, and reasons", () => {
    expect(validateKnowledgeRelations(atlasGraph)).toEqual([]);
  });

  it("keeps generic KnowledgeGraph validation scope-agnostic", () => {
    const node = (id: string, scope: KnowledgeNode["scope"], ownerId?: string): KnowledgeNode => ({
      id,
      title: id,
      description: id,
      type: "conceptual",
      masteryCriteria: [`Explain ${id}`],
      scope,
      ownerId,
      provenance: [{ sourceType: "manual", sourceId: id }],
      currentRevisionId: `${id}-r1`,
      status: "active"
    });
    const nodes = [node("GLOBAL", "global"), node("USER", "user", "user-1")];
    const graph: KnowledgeGraph = {
      nodes,
      revisions: nodes.map((item) => ({
        id: item.currentRevisionId,
        nodeId: item.id,
        version: 1,
        title: item.title,
        description: item.description,
        type: item.type,
        masteryCriteria: item.masteryCriteria,
        createdAt: "2026-08-11T00:00:00.000Z"
      })),
      edges: [{ id: "shared", source: "GLOBAL", target: "USER", relation: "related", strength: 1, reason: "The nodes share a concept." }]
    };

    expect(() => validateKnowledgeGraph(graph)).not.toThrow();
    expect(() => validateGlobalKnowledgeGraph(graph)).toThrow(/Global graph contains non-global node: USER/);
    expect(() => validateGlobalKnowledgeGraph({ nodes: [nodes[0]], revisions: [graph.revisions[0]], edges: [] })).not.toThrow();
    expect(() => validateGlobalKnowledgeGraph(globalKnowledgeGraph)).not.toThrow();
  });

  it("aligns KnowledgeEdge compile-time requirements with runtime invariants", () => {
    const validPrerequisite: KnowledgeEdge = { id: "p", source: "A", target: "B", relation: "prerequisite", strength: "hard", reason: "A grounds B." };
    const validRelated: KnowledgeEdge = { id: "r", source: "A", target: "B", relation: "related", strength: 0.7, reason: "A relates to B." };
    // @ts-expect-error reason is required
    const missingReason: KnowledgeEdge = { id: "bad-r", source: "A", target: "B", relation: "related", strength: 0.7 };
    // @ts-expect-error associative strength is required
    const missingStrength: KnowledgeEdge = { id: "bad-s", source: "A", target: "B", relation: "enables", reason: "A enables B." };
    expect([validPrerequisite, validRelated]).toHaveLength(2);
    void missingReason;
    void missingStrength;
  });

  it("reports malformed relation records as data-quality failures", () => {
    const node = (id: string, status: KnowledgeNode["status"] = "active"): KnowledgeNode => ({ id, title: id, description: id, type: "conceptual", masteryCriteria: [id], scope: "global", provenance: [{ sourceType: "manual", sourceId: id }], currentRevisionId: `${id}-r1`, status });
    const malformed = {
      revisions: [],
      nodes: [node("A"), node("B"), node("S", "superseded")],
      edges: [
        { id: "unknown", source: "A", target: "X", relation: "enables", strength: 0.8, reason: "Unknown target." },
        { id: "inactive", source: "A", target: "S", relation: "related", strength: 0.7, reason: "Inactive target." },
        { id: "self", source: "A", target: "A", relation: "related", strength: 0.5, reason: "Self." },
        { id: "duplicate-a", source: "A", target: "B", relation: "related", strength: 0.6, reason: "Duplicate." },
        { id: "duplicate-b", source: "B", target: "A", relation: "related", strength: 0.6, reason: "Reverse duplicate." },
        { id: "bad-strength", source: "A", target: "B", relation: "enables", strength: 2, reason: "Invalid strength." },
        { id: "missing-reason", source: "B", target: "A", relation: "enables", strength: 0.7 },
        { id: "cycle-a", source: "A", target: "B", relation: "prerequisite", strength: "hard", reason: "A before B." },
        { id: "cycle-b", source: "B", target: "A", relation: "prerequisite", strength: "soft", reason: "B before A." }
      ]
    } as KnowledgeGraph;
    const issues = validateKnowledgeRelations(malformed);
    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining("Unknown KnowledgeEdge endpoint"),
      expect.stringContaining("inactive"),
      expect.stringContaining("Self KnowledgeEdge"),
      expect.stringContaining("Duplicate KnowledgeEdge relation"),
      expect.stringContaining("Invalid associative strength"),
      expect.stringContaining("has no reason"),
      expect.stringContaining("Conflicting prerequisite directions"),
      expect.stringContaining("contains a cycle")
    ]));
  });

  it("audits Domain-internal undirected components without using cross-Domain edges", () => {
    const node = (id: string): KnowledgeNode => ({ id, title: `Node ${id}`, description: id, type: "conceptual", masteryCriteria: [id], scope: "global", provenance: [{ sourceType: "manual", sourceId: id }], currentRevisionId: `${id}-r1`, status: "active" });
    const graph: KnowledgeGraph = {
      nodes: ["A", "B", "C", "D", "X"].map(node),
      revisions: [],
      edges: [
        { id: "e1", source: "A", target: "B", relation: "prerequisite", strength: "hard", reason: "A grounds B." },
        { id: "e2", source: "B", target: "C", relation: "enables", strength: 0.8, reason: "B enables C." },
        { id: "e3", source: "D", target: "X", relation: "related", strength: 0.7, reason: "Cross-domain fact." }
      ]
    };
    const assignments = ["A", "B", "C", "D"].map((nodeId) => ({ nodeId, domainId: "domain-a", source: "auto" as const, confidence: 0.9, pinned: false, assignedAt: "now" }));
    assignments.push({ nodeId: "X", domainId: "domain-b", source: "auto", confidence: 0.9, pinned: false, assignedAt: "now" });
    expect(auditDomainRelations(graph, assignments, "domain-a")).toEqual({
      domainId: "domain-a",
      activeNodeCount: 4,
      edgeCount: 2,
      componentCount: 2,
      largestComponentSize: 3,
      largestComponentRatio: 0.75,
      isolatedNodeIds: ["D"],
      lowDegreeNodeIds: ["A", "C"]
    });
  });

  it("keeps exactly zero or one valid primary Domain and pins admin assignments", () => {
    const snapshot = getDomainGovernanceSnapshot();
    expect(validateDomainGovernance(demoPersonalKnowledgeGraph, snapshot)).toEqual([]);
    expect(snapshot.assignments.find((item) => item.nodeId === "R03")).toMatchObject({ domainId: "agentic-ai", source: "admin", pinned: true });
    expect(snapshot.assignments.find((item) => item.nodeId === "U-DEMO-01")).toMatchObject({ domainId: "agentic-ai" });
    expect(demoDomainAssignments.every((assignment) => demoPersonalKnowledgeGraph.nodes.some((node) => node.id === assignment.nodeId))).toBe(true);
  });

  it("keeps fixture location semantically inert and BR01 explicitly Unclassified", () => {
    expect(knowledgeNodes.some((node) => node.id === "BR01")).toBe(true);
    expect(demoDomainAssignments.some((assignment) => assignment.nodeId === "BR01")).toBe(false);
    expect(getDomainMembers(knowledgeNodes, demoDomainAssignments, "").map((node) => node.id)).toContain("BR01");
  });

  it("builds stable KnowledgeEdges from Demo EdgeSeed fixtures", () => {
    const seeds: EdgeSeed[] = [
      ["B", "A", "related", 0.7, "B relates to A."],
      ["A", "C", "enables", 0.8, "A enables C."]
    ];
    const forward = buildKnowledgeEdges([...seeds]);
    const reversed = buildKnowledgeEdges([...seeds].reverse());
    expect(forward[0]).toEqual({
      id: "knowledge-related-a-b",
      source: "B",
      target: "A",
      relation: "related",
      strength: 0.7,
      reason: "B relates to A."
    });
    expect(forward.map((edge) => edge.id).sort()).toEqual(reversed.map((edge) => edge.id).sort());
    expect(createKnowledgeEdgeId("B", "A", "related")).toBe(createKnowledgeEdgeId("A", "B", "related"));
    expect(new Set(knowledgeEdges.map((edge) => edge.id)).size).toBe(knowledgeEdges.length);
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
    expect(after.nodes.find((node) => node.id === "PY46")?.color).toBe(demoKnowledgeDomains.find((domain) => domain.id === "agentic-ai")?.canonicalColor);
  });

  it("discovery emits reviewable proposals rather than formal Domains", () => {
    const proposals = demoDomainDiscoveryService.discover(knowledgeNodes, demoKnowledgeDomains);
    expect(proposals[0]).toMatchObject({ status: "pending" });
    expect("scope" in proposals[0]).toBe(false);
    expect(demoKnowledgeDomains.some((domain) => domain.id === proposals[0].id)).toBe(false);
  });

  it("keeps Core Domain modules free of Demo and static graph dependencies", () => {
    const domainDir = join(process.cwd(), "src/features/knowledge/domain");
    const coreSource = readdirSync(domainDir).filter((file) => file.endsWith(".ts")).map((file) => readFileSync(join(domainDir, file), "utf8")).join("\n");
    expect(coreSource).not.toMatch(/from ["'][^"']*demo\//);
    expect(coreSource).not.toMatch(/from ["']\.\.\/graph["']/);
  });

  it("keeps V1 Domain types, permissions, and UI Global-only", () => {
    const files = [
      "src/features/knowledge/domain/domainTypes.ts",
      "src/features/knowledge/domain/DomainGovernanceService.ts",
      "src/features/knowledge/domain/domainStore.ts",
      "src/features/auth/capabilities.ts",
      "src/features/admin/domains/DomainManagementPage.tsx",
      "src/features/knowledge/pages/AtlasHome.tsx"
    ];
    const source = files.map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");
    expect(source).not.toMatch(/KnowledgeDomainScope|tenant-domain-admin|domain\.scope|proposal\.scope/);
    expect(canManageKnowledgeDomains({ capabilities: ["tenant-domain-admin"] as never[] })).toBe(false);
  });

  it("evaluates any repository-provided Global graph without Demo singleton changes", () => {
    const node = (id: string): KnowledgeNode => ({ id, title: "Shared semantics", description: "Shared semantics", type: "conceptual", masteryCriteria: ["Explain shared semantics"], scope: "global", provenance: [{ sourceType: "manual", sourceId: id }], currentRevisionId: `${id}-r1`, status: "active" });
    const graphFor = (left: string, right: string): KnowledgeGraph => ({ nodes: [node(left), node(right)], revisions: [], edges: [{ id: `edge-${left}`, source: left, target: right, relation: "related", strength: 1, reason: "Shared semantics connect the nodes." }] });
    const stateFor = (right: string): DomainGovernanceState => ({ domains: [{ id: "domain", name: "Domain", canonicalColor: "#123456", status: "active", createdBy: "test", createdAt: "now", updatedBy: "test", updatedAt: "now" }], assignments: [{ nodeId: right, domainId: "domain", source: "admin", pinned: true, assignedBy: "test", assignedAt: "now" }], candidates: [], proposals: [], revision: 0 });
    const serviceFor = (left: string, right: string) => {
      let stored = stateFor(right);
      const repository: DomainGovernanceRepository = { load: () => stored, save: (next) => { stored = next; } };
      return new DomainGovernanceService(new InMemoryKnowledgeRepository(graphFor(left, right)), repository);
    };
    expect(serviceFor("A1", "A2").evaluateAutomaticDomainAssignment({ nodeId: "A1", access: globalKnowledgeAccess })).toMatchObject({ kind: "auto-assign", candidate: { nodeId: "A1" } });
    expect(serviceFor("B1", "B2").evaluateAutomaticDomainAssignment({ nodeId: "B1", access: globalKnowledgeAccess })).toMatchObject({ kind: "auto-assign", candidate: { nodeId: "B1" } });
  });

  it("classifies Global and user-owned Knowledge according to explicit visibility", () => {
    const node = (id: string, scope: KnowledgeNode["scope"], ownerId?: string): KnowledgeNode => ({ id, title: "Shared semantics", description: "Shared semantics", type: "conceptual", masteryCriteria: ["Explain shared semantics"], scope, ownerId, provenance: [{ sourceType: "manual", sourceId: id }], currentRevisionId: `${id}-r1`, status: "active" });
    const graph: KnowledgeGraph = {
      nodes: [node("GLOBAL", "global"), node("USER", "user", "user-1")],
      revisions: [],
      edges: [{ id: "shared", source: "GLOBAL", target: "USER", relation: "related", strength: 1, reason: "Shared semantics connect the nodes." }]
    };
    const initial: DomainGovernanceState = {
      domains: [{ id: "domain", name: "Domain", canonicalColor: "#123456", status: "active", createdBy: "test", createdAt: "now", updatedBy: "test", updatedAt: "now" }],
      assignments: [{ nodeId: "GLOBAL", domainId: "domain", source: "admin", pinned: true, assignedBy: "test", assignedAt: "now" }],
      candidates: [], proposals: [], revision: 0
    };
    const createService = () => {
      let stored = initial;
      return new DomainGovernanceService(new InMemoryKnowledgeRepository(graph), { load: () => stored, save: (next) => { stored = next; } });
    };
    expect(createService().evaluateAutomaticDomainAssignment({ nodeId: "GLOBAL", access: globalKnowledgeAccess })).toMatchObject({ kind: "pinned" });
    expect(createService().evaluateAutomaticDomainAssignment({ nodeId: "USER", access: userKnowledgeAccess("user-1") })).toMatchObject({ kind: "auto-assign", candidate: { nodeId: "USER" } });
    expect(() => createService().evaluateAutomaticDomainAssignment({ nodeId: "USER", access: globalKnowledgeAccess })).toThrow(/Unknown KnowledgeNode USER/);
    expect(createService().topologySignature(globalKnowledgeAccess)).toBe("");
    expect(createService().topologySignature(userKnowledgeAccess("user-1"))).toBe("GLOBAL:related:USER");
  });

  it("revalidates manual and candidate Domain mutations against explicit visibility", () => {
    const node = (id: string, scope: KnowledgeNode["scope"], ownerId?: string, status: KnowledgeNode["status"] = "active"): KnowledgeNode => ({ id, title: id, description: id, type: "conceptual", masteryCriteria: [id], scope, ownerId, provenance: [{ sourceType: "manual", sourceId: id }], currentRevisionId: `${id}-r1`, status });
    const graph: KnowledgeGraph = { nodes: [node("GLOBAL", "global"), node("USER", "user", "user-1"), node("ARCHIVED", "global", undefined, "deprecated")], revisions: [], edges: [] };
    let stored: DomainGovernanceState = {
      domains: [{ id: "domain", name: "Domain", canonicalColor: "#123456", status: "active", createdBy: "test", createdAt: "now", updatedBy: "test", updatedAt: "now" }],
      assignments: [], candidates: [], proposals: [], revision: 0
    };
    const service = new DomainGovernanceService(new InMemoryKnowledgeRepository(graph), { load: () => stored, save: (next) => { stored = next; } });
    const actor = { id: "admin", capabilities: ["global-domain-admin" as const] };
    expect(() => service.assignNodeDomain({ actor, access: globalKnowledgeAccess, nodeId: "UNKNOWN", domainId: "domain" })).toThrow(/Unknown or invisible/);
    expect(() => service.assignNodeDomain({ actor, access: globalKnowledgeAccess, nodeId: "USER", domainId: "domain" })).toThrow(/Unknown or invisible/);
    expect(() => service.assignNodeDomain({ actor, access: globalKnowledgeAccess, nodeId: "ARCHIVED", domainId: "domain" })).toThrow(/not active/);
    service.assignNodeDomain({ actor, access: userKnowledgeAccess("user-1"), nodeId: "USER", domainId: "domain" });
    expect(stored.assignments).toContainEqual(expect.objectContaining({ nodeId: "USER", domainId: "domain", pinned: true }));
    expect(() => service.acceptCandidate({ actor, access: globalKnowledgeAccess, candidate: { ...candidate(0.9), nodeId: "UNKNOWN", domainId: "domain" } })).toThrow(/Unknown or invisible/);
  });

  it("audits membership only from DomainAssignment and discovers auditable Domains dynamically", () => {
    expect(auditDomainRelations(globalKnowledgeGraph, [], "agentic-ai").activeNodeCount).toBe(0);
    const script = readFileSync(join(process.cwd(), "scripts/audit-knowledge-relations.mjs"), "utf8");
    expect(script).toContain("auditableDomains");
    expect(script).not.toContain('[["agentic-ai", "Agentic AI"]');
  });

  it("reconciles seed upgrades while preserving valid governance edits and explicit unassignment", () => {
    const seed = demoDomainGovernanceSeed();
    const saved = {
      ...seed,
      domains: seed.domains.map((domain) => domain.id === "agentic-ai" ? { ...domain, name: "Renamed", canonicalColor: "#123456" } : domain),
      assignments: seed.assignments
        .filter((assignment) => assignment.nodeId !== "U-DEMO-01" && assignment.nodeId !== "PY46")
        .concat({ nodeId: "PY46", domainId: "agentic-ai", source: "admin", pinned: true, assignedBy: "admin", assignedAt: "now" }),
      revision: 9
    } as typeof seed;
    const reconciled = reconcileDomainGovernanceState(saved, seed, seed.domains.map((domain) => domain.id), seed.assignments.map((assignment) => assignment.nodeId), demoPersonalKnowledgeGraph);
    expect(reconciled.domains.find((domain) => domain.id === "agentic-ai")).toMatchObject({ name: "Renamed", canonicalColor: "#123456" });
    expect(reconciled.assignments.find((assignment) => assignment.nodeId === "PY46")).toMatchObject({ domainId: "agentic-ai", source: "admin", pinned: true });
    expect(reconciled.assignments.some((assignment) => assignment.nodeId === "U-DEMO-01")).toBe(false);
    expect(reconciled.revision).toBe(9);
  });

  it("migrates legacy Global records, discards Tenant records, and preserves pinned Global assignments", () => {
    const seed = demoDomainGovernanceSeed();
    const legacy = {
      ...seed,
      domains: [
        { ...seed.domains[0], scope: "global" },
        { ...seed.domains[1], id: "tenant-domain", scope: "tenant" }
      ],
      assignments: [
        { nodeId: "R03", domainId: seed.domains[0].id, source: "admin", pinned: true, assignedBy: "admin", assignedAt: "now" },
        { nodeId: "PY01", domainId: "tenant-domain", source: "admin", pinned: true, assignedBy: "tenant", assignedAt: "now" }
      ],
      candidates: [{ ...candidate(0.8), nodeId: "PY02", domainId: "tenant-domain" }],
      proposals: [{ ...seed.proposals[0], id: "tenant-proposal", scope: "tenant" }]
    } as unknown as DomainGovernanceState;
    const migrated = migrateDomainGovernanceStateToGlobalV1(legacy);
    expect(DOMAIN_GOVERNANCE_SCHEMA_VERSION).toBe(2);
    expect(migrated.domains.map((domain) => domain.id)).toEqual([seed.domains[0].id]);
    expect(migrated.domains.every((domain) => !("scope" in domain))).toBe(true);
    expect(migrated.assignments).toEqual([expect.objectContaining({ nodeId: "R03", source: "admin", pinned: true })]);
    expect(migrated.candidates).toEqual([]);
    expect(migrated.proposals).toEqual([]);
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

  it("requires one Global Domain authority for every manual mutation", () => {
    expect(() => assignNodeDomain({ actor: { id: "user", capabilities: [] }, access: globalKnowledgeAccess, nodeId: "R03", domainId: null })).toThrow(/global-domain-admin/);
    expect(() => assertGlobalDomainAdmin({ id: "user", capabilities: [] })).toThrow(/global-domain-admin/);
    expect(() => assertGlobalDomainAdmin({ id: "global", capabilities: ["global-domain-admin"] })).not.toThrow();
  });
});

import type { DomainAssignment, KnowledgeDomain } from "@/features/knowledge/domain/domainTypes";
import type { DomainGovernanceState } from "@/features/knowledge/domain/DomainGovernanceRepository";
import type { KnowledgeEdge, KnowledgeGraph, KnowledgeNode, KnowledgeNodeRevision } from "@/features/knowledge/types";

/** Minimal synthetic Knowledge Graph for rule tests. This is deliberately not product content. */
export const SYNTHETIC_TIME = "2026-01-01T00:00:00.000Z";

const definitions = [
  ["syn-a", "Synthetic Alpha", "A synthetic conceptual node used by tests."],
  ["syn-b", "Synthetic Beta", "A synthetic procedural node used by tests."],
  ["syn-c", "Synthetic Gamma", "A synthetic representational node used by tests."],
  ["syn-d", "Synthetic Delta", "A synthetic language node used by tests."],
  ["syn-e", "Synthetic Epsilon", "A synthetic meta node used by tests."],
  ["syn-f", "Synthetic Zeta", "A synthetic unclassified node used by tests."],
  ["syn-g", "Synthetic Eta", "A synthetic related node used by tests."],
  ["syn-h", "Synthetic Theta", "A synthetic isolated node used by tests."]
] as const;

const nodeTypes = ["conceptual", "procedural", "representational", "language", "meta", "conceptual", "procedural", "representational"] as const;

function node(id: string, title: string, description: string, index: number): KnowledgeNode {
  return {
    id,
    title,
    description,
    type: nodeTypes[index] ?? "conceptual",
    masteryCriteria: [`Explain ${title}`, `Apply ${title} in a synthetic exercise`],
    scope: "global",
    provenance: [{ sourceType: "manual", sourceId: `fixture-${id}` }],
    currentRevisionId: `${id}-r1`,
    status: "active",
    createdAt: SYNTHETIC_TIME,
    updatedAt: SYNTHETIC_TIME
  };
}

export const syntheticKnowledgeNodes: KnowledgeNode[] = definitions.map(([id, title, description], index) => node(id, title, description, index));
export const syntheticUserNode: KnowledgeNode = { ...node("syn-user", "Synthetic User Node", "A synthetic user-owned node used by tests.", 0), scope: "user", ownerId: "fixture-user" };
export const syntheticPersonalKnowledgeNodes = [...syntheticKnowledgeNodes, syntheticUserNode];

export const syntheticKnowledgeRevisions: KnowledgeNodeRevision[] = syntheticPersonalKnowledgeNodes.map((item) => ({
  id: item.currentRevisionId,
  nodeId: item.id,
  version: 1,
  title: item.title,
  description: item.description,
  type: item.type,
  masteryCriteria: item.masteryCriteria,
  createdBy: "fixture-author",
  createdAt: SYNTHETIC_TIME,
  changeReason: "Synthetic rule fixture"
}));

export const syntheticKnowledgeEdges: KnowledgeEdge[] = [
  { id: "edge-syn-a-b", source: "syn-a", target: "syn-b", relation: "prerequisite", strength: "hard", reason: "Alpha grounds Beta in the synthetic fixture." },
  { id: "edge-syn-b-c", source: "syn-b", target: "syn-c", relation: "enables", strength: 0.8, reason: "Beta enables Gamma in the synthetic fixture." },
  { id: "edge-syn-d-e", source: "syn-d", target: "syn-e", relation: "prerequisite", strength: "soft", reason: "Delta grounds Epsilon in the synthetic fixture." },
  { id: "edge-syn-e-f", source: "syn-e", target: "syn-f", relation: "enables", strength: 0.7, reason: "Epsilon enables Zeta in the synthetic fixture." },
  { id: "edge-syn-b-d", source: "syn-b", target: "syn-d", relation: "related", strength: 0.6, reason: "Beta and Delta share a synthetic context." },
  { id: "edge-syn-c-g", source: "syn-c", target: "syn-g", relation: "prerequisite", strength: "hard", reason: "Gamma grounds Eta in the synthetic fixture." },
  { id: "edge-syn-g-user", source: "syn-g", target: "syn-user", relation: "enables", strength: 0.5, reason: "Eta supports the synthetic user node." }
];

export const syntheticGlobalKnowledgeGraph: KnowledgeGraph = {
  nodes: syntheticKnowledgeNodes,
  revisions: syntheticKnowledgeRevisions.filter((revision) => syntheticKnowledgeNodes.some((item) => item.id === revision.nodeId)),
  edges: syntheticKnowledgeEdges.filter((edge) => syntheticKnowledgeNodes.some((item) => item.id === edge.source) && syntheticKnowledgeNodes.some((item) => item.id === edge.target))
};

export const syntheticPersonalKnowledgeGraph: KnowledgeGraph = {
  nodes: syntheticPersonalKnowledgeNodes,
  revisions: syntheticKnowledgeRevisions,
  edges: syntheticKnowledgeEdges
};

export const syntheticDomains: KnowledgeDomain[] = [
  { id: "fixture-domain-alpha", name: "Fixture Alpha", description: "Synthetic Domain Alpha.", canonicalColor: "#6F8FEA", status: "active", createdBy: "fixture-admin", createdAt: SYNTHETIC_TIME, updatedBy: "fixture-admin", updatedAt: SYNTHETIC_TIME },
  { id: "fixture-domain-beta", name: "Fixture Beta", description: "Synthetic Domain Beta.", canonicalColor: "#53B89A", status: "active", createdBy: "fixture-admin", createdAt: SYNTHETIC_TIME, updatedBy: "fixture-admin", updatedAt: SYNTHETIC_TIME }
];

export const syntheticDomainAssignments: DomainAssignment[] = [
  { nodeId: "syn-a", domainId: "fixture-domain-alpha", source: "admin", pinned: true, assignedBy: "fixture-admin", assignedAt: SYNTHETIC_TIME },
  { nodeId: "syn-b", domainId: "fixture-domain-alpha", source: "auto", confidence: 0.9, pinned: false, assignedAt: SYNTHETIC_TIME },
  { nodeId: "syn-c", domainId: "fixture-domain-alpha", source: "auto", confidence: 0.85, pinned: false, assignedAt: SYNTHETIC_TIME },
  { nodeId: "syn-d", domainId: "fixture-domain-beta", source: "admin", pinned: true, assignedBy: "fixture-admin", assignedAt: SYNTHETIC_TIME },
  { nodeId: "syn-e", domainId: "fixture-domain-beta", source: "auto", confidence: 0.8, pinned: false, assignedAt: SYNTHETIC_TIME },
  { nodeId: "syn-user", domainId: "fixture-domain-alpha", source: "admin", pinned: true, assignedBy: "fixture-admin", assignedAt: SYNTHETIC_TIME }
];

export function syntheticDomainGovernance(): DomainGovernanceState {
  return {
    domains: syntheticDomains.map((domain) => ({ ...domain })),
    assignments: syntheticDomainAssignments.map((assignment) => ({ ...assignment })),
    candidates: [],
    proposals: [],
    revision: 1
  };
}

export type EdgeSeed =
  | [string, string, "prerequisite", "hard" | "soft", string]
  | [string, string, "enables" | "related", number, string];

function edgeIdPart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function createKnowledgeEdgeId(source: string, target: string, relation: KnowledgeEdge["relation"]) {
  const endpoints = relation === "related" ? [source, target].sort((left, right) => left.localeCompare(right)) : [source, target];
  return `knowledge-${relation}-${edgeIdPart(endpoints[0])}-${edgeIdPart(endpoints[1])}`;
}

export function buildKnowledgeEdges(seeds: EdgeSeed[]): KnowledgeEdge[] {
  return seeds.map((seed) => {
    if (seed[2] === "prerequisite") {
      const [source, target, relation, strength, reason] = seed;
      return { id: createKnowledgeEdgeId(source, target, relation), source, target, relation, strength, reason };
    }
    const [source, target, relation, strength, reason] = seed;
    return { id: createKnowledgeEdgeId(source, target, relation), source, target, relation, strength, reason };
  });
}

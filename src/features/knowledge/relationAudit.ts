import type { DomainAssignment } from "./domain/domainTypes";
import { assertDirectedAcyclic, buildStructuralAdjacency, findConnectedComponents } from "./graphAlgorithms";
import type { KnowledgeEdge, KnowledgeGraph } from "./types";

export type DomainRelationAudit = {
  domainId: string;
  activeNodeCount: number;
  edgeCount: number;
  componentCount: number;
  largestComponentSize: number;
  largestComponentRatio: number;
  isolatedNodeIds: string[];
  lowDegreeNodeIds: string[];
};

export function auditDomainRelations(graph: KnowledgeGraph, assignments: DomainAssignment[], domainId: string): DomainRelationAudit {
  const assignedIds = new Set(assignments.filter((assignment) => assignment.domainId === domainId).map((assignment) => assignment.nodeId));
  const activeNodeIds = graph.nodes.filter((node) => node.status === "active" && assignedIds.has(node.id)).map((node) => node.id).sort();
  const activeNodeSet = new Set(activeNodeIds);
  const internalEdges = graph.edges.filter((edge) => activeNodeSet.has(edge.source) && activeNodeSet.has(edge.target));
  const adjacency = buildStructuralAdjacency(activeNodeIds, internalEdges);
  const components = findConnectedComponents(activeNodeIds, internalEdges);
  const largestComponentSize = components[0]?.length ?? 0;

  return {
    domainId,
    activeNodeCount: activeNodeIds.length,
    edgeCount: internalEdges.length,
    componentCount: components.length,
    largestComponentSize,
    largestComponentRatio: activeNodeIds.length ? largestComponentSize / activeNodeIds.length : 0,
    isolatedNodeIds: activeNodeIds.filter((nodeId) => adjacency.get(nodeId)?.size === 0),
    lowDegreeNodeIds: activeNodeIds.filter((nodeId) => adjacency.get(nodeId)?.size === 1)
  };
}

function relationKey(edge: KnowledgeEdge) {
  if (edge.relation !== "related") return `${edge.source}:${edge.relation}:${edge.target}`;
  const [left, right] = [edge.source, edge.target].sort();
  return `${left}:related:${right}`;
}

export function validateKnowledgeRelations(graph: KnowledgeGraph): string[] {
  const issues: string[] = [];
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const seenRelations = new Set<string>();
  const directedPrerequisites = new Set(graph.edges.filter((edge) => edge.relation === "prerequisite").map((edge) => `${edge.source}:${edge.target}`));

  graph.edges.forEach((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) issues.push(`Unknown KnowledgeEdge endpoint: ${edge.source} -> ${edge.target}`);
    if (source && source.status !== "active") issues.push(`KnowledgeEdge source is inactive: ${edge.source}`);
    if (target && target.status !== "active") issues.push(`KnowledgeEdge target is inactive: ${edge.target}`);
    if (edge.source === edge.target) issues.push(`Self KnowledgeEdge: ${edge.source}`);
    if (!edge.reason?.trim()) issues.push(`KnowledgeEdge has no reason: ${edge.id}`);

    const key = relationKey(edge);
    if (seenRelations.has(key)) issues.push(`Duplicate KnowledgeEdge relation: ${key}`);
    seenRelations.add(key);

    if (edge.relation === "prerequisite") {
      if (edge.strength !== "hard" && edge.strength !== "soft") issues.push(`Invalid prerequisite strength: ${edge.id}`);
      if (directedPrerequisites.has(`${edge.target}:${edge.source}`)) issues.push(`Conflicting prerequisite directions: ${edge.source} <-> ${edge.target}`);
    } else if (edge.relation === "enables" || edge.relation === "related") {
      if (typeof edge.strength !== "number" || !Number.isFinite(edge.strength) || edge.strength < 0 || edge.strength > 1) issues.push(`Invalid associative strength: ${edge.id}`);
    } else {
      issues.push(`Invalid KnowledgeEdge relation: ${(edge as KnowledgeEdge).relation}`);
    }
  });

  const prerequisiteEdges = graph.edges.filter((edge) => edge.relation === "prerequisite" && nodeById.has(edge.source) && nodeById.has(edge.target));
  try {
    assertDirectedAcyclic(graph.nodes.filter((node) => node.status === "active").map((node) => node.id), prerequisiteEdges);
  } catch {
    issues.push("Prerequisite KnowledgeEdge graph contains a cycle");
  }

  return Array.from(new Set(issues));
}

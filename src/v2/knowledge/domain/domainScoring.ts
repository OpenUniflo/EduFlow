import type { KnowledgeEdge, KnowledgeNode } from "../types";
import type { DomainAssignment, DomainAssignmentCandidate, DomainDiscoveryConfig, KnowledgeDomain } from "./domainTypes";

export const DEFAULT_DOMAIN_DISCOVERY_CONFIG: DomainDiscoveryConfig = {
  semanticWeight: 0.6,
  structuralWeight: 0.4,
  autoAssignThreshold: 0.85,
  suggestionThreshold: 0.6,
  algorithmVersion: "domain-affinity-v1"
};

export type DomainAssignmentDecision =
  | { kind: "auto-assign"; candidate: DomainAssignmentCandidate }
  | { kind: "suggestion"; candidate: DomainAssignmentCandidate }
  | { kind: "unclassified"; candidate?: DomainAssignmentCandidate };

function tokens(text: string) {
  const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  const cjk = [...normalized.replace(/[^\p{Script=Han}]/gu, "")];
  for (let index = 0; index < cjk.length - 1; index += 1) words.push(`${cjk[index]}${cjk[index + 1]}`);
  return new Set(words);
}

function semanticText(node: KnowledgeNode) {
  return [node.title, node.description, ...node.masteryCriteria].join(" ");
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  left.forEach((item) => { if (right.has(item)) intersection += 1; });
  return intersection / (left.size + right.size - intersection);
}

function relationWeight(edge: KnowledgeEdge) {
  return edge.relation === "related" ? 0.45 : edge.relation === "enables" ? 0.8 : 1;
}

export function scoreNodeAgainstDomains(
  node: KnowledgeNode,
  domains: KnowledgeDomain[],
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  assignments: DomainAssignment[],
  config = DEFAULT_DOMAIN_DISCOVERY_CONFIG,
  generatedAt = new Date().toISOString()
): DomainAssignmentCandidate[] {
  const nodeById = new Map(nodes.map((item) => [item.id, item]));
  const assignmentByNode = new Map(assignments.map((item) => [item.nodeId, item]));
  const incident = edges.filter((edge) => edge.source === node.id || edge.target === node.id);
  const adjacency = new Map<string, Set<string>>();
  nodes.forEach((item) => adjacency.set(item.id, new Set()));
  edges.forEach((edge) => { adjacency.get(edge.source)?.add(edge.target); adjacency.get(edge.target)?.add(edge.source); });
  const directNeighborIds = adjacency.get(node.id) ?? new Set<string>();
  const nodeTokens = tokens(semanticText(node));

  return domains.filter((domain) => domain.status === "active").map((domain) => {
    const anchors = assignments
      .filter((assignment) => assignment.domainId === domain.id)
      .sort((left, right) => Number(right.pinned) - Number(left.pinned))
      .map((assignment) => nodeById.get(assignment.nodeId))
      .filter((item): item is KnowledgeNode => Boolean(item));
    const semanticScore = anchors.length ? Math.max(...anchors.slice(0, 40).map((anchor) => jaccard(nodeTokens, tokens(semanticText(anchor))))) : 0;
    let domainWeight = 0;
    let totalWeight = 0;
    incident.forEach((edge) => {
      const otherId = edge.source === node.id ? edge.target : edge.source;
      const weight = relationWeight(edge);
      totalWeight += weight;
      if (assignmentByNode.get(otherId)?.domainId === domain.id) domainWeight += weight;
    });
    const directScore = totalWeight ? domainWeight / totalWeight : 0;
    const commonNeighborScore = anchors.length ? Math.max(...anchors.slice(0, 40).map((anchor) => {
      const anchorNeighbors = adjacency.get(anchor.id) ?? new Set<string>();
      if (!directNeighborIds.size || !anchorNeighbors.size) return 0;
      let common = 0;
      directNeighborIds.forEach((neighborId) => { if (anchorNeighbors.has(neighborId)) common += 1; });
      return common / (directNeighborIds.size + anchorNeighbors.size - common);
    })) : 0;
    const structuralScore = directScore * 0.75 + commonNeighborScore * 0.25;
    const score = config.semanticWeight * semanticScore + config.structuralWeight * structuralScore;
    return { nodeId: node.id, domainId: domain.id, score, semanticScore, structuralScore, algorithmVersion: config.algorithmVersion, generatedAt };
  }).sort((left, right) => right.score - left.score || left.domainId.localeCompare(right.domainId));
}

export function decideDomainAssignment(candidates: DomainAssignmentCandidate[], config = DEFAULT_DOMAIN_DISCOVERY_CONFIG): DomainAssignmentDecision {
  const candidate = candidates[0];
  if (!candidate || candidate.score < config.suggestionThreshold) return { kind: "unclassified", candidate };
  if (candidate.score >= config.autoAssignThreshold) return { kind: "auto-assign", candidate };
  return { kind: "suggestion", candidate };
}

export function applyAutomaticAssignment(current: DomainAssignment | undefined, decision: DomainAssignmentDecision, assignedAt = new Date().toISOString()) {
  if (current?.pinned) return current;
  if (decision.kind !== "auto-assign") return current;
  return { nodeId: decision.candidate.nodeId, domainId: decision.candidate.domainId, source: "auto" as const, confidence: decision.candidate.score, pinned: false, assignedAt };
}

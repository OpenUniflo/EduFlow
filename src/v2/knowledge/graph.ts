import type {
  KnowledgeEdge,
  KnowledgeGraph
} from "./types";
import { validateKnowledgeRelations } from "./relationAudit";

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

function assertUnique(label: string, ids: string[]) {
  const seen = new Set<string>();
  ids.forEach((id) => {
    if (seen.has(id)) throw new Error(`Duplicate ${label} id: ${id}`);
    seen.add(id);
  });
}

export function validateKnowledgeGraph(graph: KnowledgeGraph) {
  assertUnique("node", graph.nodes.map((item) => item.id));
  assertUnique("revision", graph.revisions.map((item) => item.id));
  assertUnique("edge", graph.edges.map((item) => item.id));
  const nodeIds = new Set(graph.nodes.map((item) => item.id));
  const nodeById = new Map(graph.nodes.map((item) => [item.id, item]));
  const revisionById = new Map(graph.revisions.map((item) => [item.id, item]));
  graph.nodes.forEach((node) => {
    if (node.scope !== "global") throw new Error(`Global graph contains non-global node: ${node.id}`);
    if (!node.masteryCriteria.length) throw new Error(`Knowledge node has no mastery criteria: ${node.id}`);
    if (revisionById.get(node.currentRevisionId)?.nodeId !== node.id) throw new Error(`Invalid current revision for node ${node.id}`);
  });
  graph.edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) throw new Error(`Invalid edge endpoints: ${edge.source} -> ${edge.target}`);
    if (nodeById.get(edge.source)?.status !== "active" || nodeById.get(edge.target)?.status !== "active") throw new Error(`KnowledgeEdge references inactive node: ${edge.source} -> ${edge.target}`);
    if (edge.relation !== "prerequisite" && (edge.strength < 0 || edge.strength > 1)) throw new Error(`Invalid relation strength: ${edge.id}`);
  });
  const relationIssues = validateKnowledgeRelations(graph);
  if (relationIssues.length) throw new Error(relationIssues.join("\n"));
}

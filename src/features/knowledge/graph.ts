import type { KnowledgeGraph } from "./types";
import { validateKnowledgeRelations } from "./relationAudit";

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

export function validateGlobalKnowledgeGraph(graph: KnowledgeGraph) {
  validateKnowledgeGraph(graph);
  graph.nodes.forEach((node) => {
    if (node.scope !== "global") throw new Error(`Global graph contains non-global node: ${node.id}`);
  });
}

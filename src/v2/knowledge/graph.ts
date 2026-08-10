import type {
  KnowledgeDomain,
  KnowledgeEdge,
  KnowledgeGraph,
  KnowledgeNode,
  KnowledgeNodeRevision
} from "./types";
import { initialKnowledgeDomains } from "./domain/domainData";
import { validateKnowledgeRelations } from "./relationAudit";
import { agenticAiEdgeSeeds, pythonEngineeringEdgeSeeds, sharedEdgeSeeds } from "./seeds";
import { agenticAiNodes } from "./seeds/agenticAiNodes";
import { DEMO_TIME } from "./seeds/nodeFactory";
import { pythonEngineeringNodes } from "./seeds/pythonEngineeringNodes";

export const knowledgeDomains: KnowledgeDomain[] = initialKnowledgeDomains;

export const knowledgeNodes: KnowledgeNode[] = [...agenticAiNodes, ...pythonEngineeringNodes];

export const knowledgeNodeRevisions: KnowledgeNodeRevision[] = knowledgeNodes.map((node) => ({
  id: node.currentRevisionId,
  nodeId: node.id,
  version: 1,
  title: node.title,
  description: node.description,
  type: node.type,
  masteryCriteria: node.masteryCriteria,
  createdBy: "global-admin-demo",
  createdAt: node.createdAt ?? DEMO_TIME,
  changeReason: "Knowledge Architecture v1 atomic ontology"
}));

const edgeSeeds = [...agenticAiEdgeSeeds, ...pythonEngineeringEdgeSeeds, ...sharedEdgeSeeds];

export const knowledgeEdges: KnowledgeEdge[] = edgeSeeds.map(([source, target, relation, strength, reason], index) => relation === "prerequisite"
  ? { id: `knowledge-edge-${String(index + 1).padStart(3, "0")}`, source, target, relation, strength: strength as "hard" | "soft", reason }
  : { id: `knowledge-edge-${String(index + 1).padStart(3, "0")}`, source, target, relation, strength: strength as number, reason });

function assertUnique(label: string, ids: string[]) {
  const seen = new Set<string>();
  ids.forEach((id) => {
    if (seen.has(id)) throw new Error(`Duplicate ${label} id: ${id}`);
    seen.add(id);
  });
}

function validateGraph(graph: KnowledgeGraph) {
  assertUnique("domain", graph.domains.map((item) => item.id));
  assertUnique("node", graph.nodes.map((item) => item.id));
  assertUnique("revision", graph.revisions.map((item) => item.id));
  assertUnique("edge", graph.edges.map((item) => item.id));
  const domainIds = new Set(graph.domains.map((item) => item.id));
  const nodeIds = new Set(graph.nodes.map((item) => item.id));
  const nodeById = new Map(graph.nodes.map((item) => [item.id, item]));
  const revisionById = new Map(graph.revisions.map((item) => [item.id, item]));
  graph.nodes.forEach((node) => {
    if (node.scope !== "global") throw new Error(`Global graph contains non-global node: ${node.id}`);
    if (!node.masteryCriteria.length) throw new Error(`Knowledge node has no mastery criteria: ${node.id}`);
    if (node.domainId && !domainIds.has(node.domainId)) throw new Error(`Unknown domain for node ${node.id}: ${node.domainId}`);
    if (revisionById.get(node.currentRevisionId)?.nodeId !== node.id) throw new Error(`Invalid current revision for node ${node.id}`);
  });
  graph.edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) throw new Error(`Invalid edge endpoints: ${edge.source} -> ${edge.target}`);
    if (nodeById.get(edge.source)?.status !== "active" || nodeById.get(edge.target)?.status !== "active") throw new Error(`KnowledgeEdge references inactive node: ${edge.source} -> ${edge.target}`);
    if (edge.relation !== "prerequisite" && edge.strength !== undefined && (edge.strength < 0 || edge.strength > 1)) throw new Error(`Invalid relation strength: ${edge.id}`);
  });
  const relationIssues = validateKnowledgeRelations(graph);
  if (relationIssues.length) throw new Error(relationIssues.join("\n"));
}

export const globalKnowledgeGraph: KnowledgeGraph = {
  domains: knowledgeDomains,
  nodes: knowledgeNodes,
  revisions: knowledgeNodeRevisions,
  edges: knowledgeEdges
};

validateGraph(globalKnowledgeGraph);

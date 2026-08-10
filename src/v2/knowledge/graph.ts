import type {
  KnowledgeEdge,
  KnowledgeGraph,
  KnowledgeNode,
  KnowledgeNodeRevision
} from "./types";
import { validateKnowledgeRelations } from "./relationAudit";
import { agenticAiEdgeSeeds, pythonEngineeringEdgeSeeds, sharedEdgeSeeds, type EdgeSeed } from "./seeds";
import { agenticAiNodes } from "./seeds/agenticAiNodes";
import { DEMO_TIME } from "./seeds/nodeFactory";
import { pythonEngineeringNodes } from "./seeds/pythonEngineeringNodes";

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

function edgeIdPart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function createKnowledgeEdgeId(source: string, target: string, relation: KnowledgeEdge["relation"]) {
  const endpoints = relation === "related" ? [source, target].sort((left, right) => left.localeCompare(right)) : [source, target];
  return `knowledge-${relation}-${edgeIdPart(endpoints[0])}-${edgeIdPart(endpoints[1])}`;
}

export function buildKnowledgeEdges(seeds: EdgeSeed[]): KnowledgeEdge[] {
  return seeds.map(([source, target, relation, strength, reason]) => relation === "prerequisite"
    ? { id: createKnowledgeEdgeId(source, target, relation), source, target, relation, strength: strength as "hard" | "soft", reason }
    : { id: createKnowledgeEdgeId(source, target, relation), source, target, relation, strength: strength as number, reason });
}

export const knowledgeEdges = buildKnowledgeEdges(edgeSeeds);

function assertUnique(label: string, ids: string[]) {
  const seen = new Set<string>();
  ids.forEach((id) => {
    if (seen.has(id)) throw new Error(`Duplicate ${label} id: ${id}`);
    seen.add(id);
  });
}

function validateGraph(graph: KnowledgeGraph) {
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
    if (edge.relation !== "prerequisite" && edge.strength !== undefined && (edge.strength < 0 || edge.strength > 1)) throw new Error(`Invalid relation strength: ${edge.id}`);
  });
  const relationIssues = validateKnowledgeRelations(graph);
  if (relationIssues.length) throw new Error(relationIssues.join("\n"));
}

export const globalKnowledgeGraph: KnowledgeGraph = {
  nodes: knowledgeNodes,
  revisions: knowledgeNodeRevisions,
  edges: knowledgeEdges
};

validateGraph(globalKnowledgeGraph);

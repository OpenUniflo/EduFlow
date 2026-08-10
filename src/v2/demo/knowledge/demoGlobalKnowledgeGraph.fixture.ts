import { validateGlobalKnowledgeGraph } from "../../knowledge/graph";
import type { KnowledgeGraph, KnowledgeNode, KnowledgeNodeRevision } from "../../knowledge/types";
import { agenticAiEdgeSeeds } from "./agenticAiEdges.fixture";
import { agenticAiNodes } from "./agenticAiNodes.fixture";
import { DEMO_TIME } from "./demoKnowledgeNodeFactory.fixture";
import { pythonEngineeringEdgeSeeds } from "./pythonEngineeringEdges.fixture";
import { pythonEngineeringNodes } from "./pythonEngineeringNodes.fixture";
import { sharedEdgeSeeds } from "./sharedKnowledgeEdges.fixture";
import { buildKnowledgeEdges } from "./demoKnowledgeEdgeFactory.fixture";

export const demoKnowledgeNodes: KnowledgeNode[] = [...agenticAiNodes, ...pythonEngineeringNodes];

export const demoKnowledgeNodeRevisions: KnowledgeNodeRevision[] = demoKnowledgeNodes.map((node) => ({
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

export const demoKnowledgeEdges = buildKnowledgeEdges([
  ...agenticAiEdgeSeeds,
  ...pythonEngineeringEdgeSeeds,
  ...sharedEdgeSeeds
]);

export const demoGlobalKnowledgeGraph: KnowledgeGraph = {
  nodes: demoKnowledgeNodes,
  revisions: demoKnowledgeNodeRevisions,
  edges: demoKnowledgeEdges
};

validateGlobalKnowledgeGraph(demoGlobalKnowledgeGraph);

import { runDeterministicForceLayout } from "./graphLayout";
import type { KnowledgeGraph } from "./types";

export function buildAtlasKnowledgeLayout(graph: KnowledgeGraph) {
  return runDeterministicForceLayout(
    graph.nodes.map((node) => node.id),
    graph.edges,
    {
      dimensions: 3,
      iterations: 340,
      width: 900,
      height: 560,
      depth: 350,
      repulsion: 4400,
      attraction: 0.0075,
      idealEdgeLength: 102,
      centerStrength: 0.0022,
      collisionRadius: 28
    }
  );
}

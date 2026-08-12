import { runDeterministicForceLayout } from "../knowledge/graphLayout";
import type { KnowledgeEdge, KnowledgeGraphLayout } from "../knowledge/types";

export const PERSONAL_WORLD_WIDTH = 1420;
export const PERSONAL_WORLD_HEIGHT = 880;

/** Personal Atlas is a single relation-driven force graph with no metadata anchors. */
/** @deprecated Production Atlas coordinates are owned by react-force-graph-3d. */
export function buildPersonalForceLayout(nodeIds: Iterable<string>, edges: KnowledgeEdge[]): KnowledgeGraphLayout {
  const centered = runDeterministicForceLayout(nodeIds, edges, {
    dimensions: 2,
    iterations: 420,
    width: PERSONAL_WORLD_WIDTH,
    height: PERSONAL_WORLD_HEIGHT,
    repulsion: 5200,
    attraction: 0.006,
    idealEdgeLength: 142,
    centerStrength: 0.0018,
    damping: 0.81,
    collisionRadius: 76
  });
  return Object.fromEntries(Object.entries(centered).map(([id, position]) => [id, {
    x: position.x + PERSONAL_WORLD_WIDTH / 2,
    y: position.y + PERSONAL_WORLD_HEIGHT / 2
  }]));
}

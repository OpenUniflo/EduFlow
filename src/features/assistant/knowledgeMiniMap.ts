import type { KnowledgeGraph } from "@/features/knowledge/types";

export type MiniMapNode = { id: string; title: string; x: number; y: number; center: boolean };
export type MiniMapEdge = { id: string; source: string; target: string; relation: string };
export type MiniMapLayout = { width: number; height: number; nodes: MiniMapNode[]; edges: MiniMapEdge[] };

/**
 * A small, deterministic projection over the shared KnowledgeGraph. It uses
 * only factual edges incident to one node and positions neighbours by sorted
 * stable ID, so learning-state changes never move the map.
 */
export function buildKnowledgeNeighborhood(graph: KnowledgeGraph, nodeId: string, width = 300, height = 168): MiniMapLayout {
  const active = new Map(graph.nodes.filter((node) => node.status === "active").map((node) => [node.id, node]));
  const center = active.get(nodeId);
  if (!center) return { width, height, nodes: [], edges: [] };
  const incident = graph.edges.filter((edge) => edge.source === nodeId || edge.target === nodeId);
  const neighbourIds = [...new Set(incident.map((edge) => edge.source === nodeId ? edge.target : edge.source))]
    .filter((id) => active.has(id))
    .sort((left, right) => left.localeCompare(right));
  const ids = new Set([nodeId, ...neighbourIds]);
  const radiusX = Math.max(44, width * 0.34);
  const radiusY = Math.max(36, height * 0.32);
  const cx = width / 2;
  const cy = height / 2;
  const nodes: MiniMapNode[] = [
    { id: center.id, title: center.title, x: cx, y: cy, center: true },
    ...neighbourIds.map((id, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(1, neighbourIds.length);
      return {
        id,
        title: active.get(id)?.title ?? id,
        x: Math.round((cx + Math.cos(angle) * radiusX) * 10) / 10,
        y: Math.round((cy + Math.sin(angle) * radiusY) * 10) / 10,
        center: false
      };
    })
  ];
  const edges = incident
    .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
    .map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, relation: edge.relation }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return { width, height, nodes, edges };
}

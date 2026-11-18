import type { KnowledgeGraph } from "@/features/knowledge/types";

export type MiniMapNode = {
  id: string;
  title: string;
  x: number;
  y: number;
  center: boolean;
  /** Visible label position; labels are part of the deterministic layout. */
  labelX: number;
  labelY: number;
  anchor: "start" | "middle" | "end";
  lines: string[];
};
export type MiniMapEdge = { id: string; source: string; target: string; relation: string };
export type MiniMapLayout = { width: number; height: number; nodes: MiniMapNode[]; edges: MiniMapEdge[] };

function labelLines(value: string, maxLines = 3, maxCharacters = 18): string[] {
  const text = value.trim();
  if (!text) return [value];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  if (words.length > 1) {
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxCharacters) { current = candidate; continue; }
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
    if (current && lines.length < maxLines) lines.push(current);
  } else {
    const characters = Array.from(text);
    for (let index = 0; index < characters.length && lines.length < maxLines; index += maxCharacters) {
      lines.push(characters.slice(index, index + maxCharacters).join(""));
    }
  }
  const consumed = lines.join(" ").length;
  if (consumed < text.length) {
    const last = lines[maxLines - 1] ?? "";
    lines[maxLines - 1] = `${last.slice(0, Math.max(1, maxCharacters - 1))}…`;
  }
  return lines.slice(0, maxLines);
}

/**
 * A small, deterministic projection over the shared KnowledgeGraph. It uses
 * only factual edges incident to one node and positions neighbours by sorted
 * stable ID, so learning-state changes never move the map. Every node gets a
 * label; the caller renders the relation legend from the same edge facts.
 */
export function buildKnowledgeNeighborhood(graph: KnowledgeGraph, nodeId: string, width = 640, height = 300): MiniMapLayout {
  const active = new Map(graph.nodes.filter((node) => node.status === "active").map((node) => [node.id, node]));
  const center = active.get(nodeId);
  if (!center) return { width, height, nodes: [], edges: [] };
  const incident = graph.edges.filter((edge) => edge.source === nodeId || edge.target === nodeId);
  const neighbourIds = [...new Set(incident.map((edge) => edge.source === nodeId ? edge.target : edge.source))]
    .filter((id) => active.has(id))
    .sort((left, right) => left.localeCompare(right));
  const ids = new Set([nodeId, ...neighbourIds]);
  const radiusX = Math.max(80, width * 0.36);
  const radiusY = Math.max(64, height * 0.30);
  const cx = width / 2;
  const cy = height / 2 - 8;
  const centerLines = labelLines(center.title, 2, 20);
  const nodes: MiniMapNode[] = [
    {
      id: center.id,
      title: center.title,
      x: cx,
      y: cy,
      center: true,
      labelX: cx,
      labelY: cy + 26,
      anchor: "middle",
      lines: centerLines
    },
    ...neighbourIds.map((id, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(1, neighbourIds.length);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const title = active.get(id)?.title ?? id;
      const anchor: MiniMapNode["anchor"] = cos > 0.25 ? "end" : cos < -0.25 ? "start" : "middle";
      return {
        id,
        title,
        x: Math.round((cx + cos * radiusX) * 10) / 10,
        y: Math.round((cy + sin * radiusY) * 10) / 10,
        center: false,
        labelX: Math.round((cx + cos * (radiusX + 18)) * 10) / 10,
        labelY: Math.round((cy + sin * (radiusY + 18) + (sin > 0 ? 10 : -4)) * 10) / 10,
        anchor,
        lines: labelLines(title)
      };
    })
  ];
  const edges = incident
    .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
    .map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, relation: edge.relation }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return { width, height, nodes, edges };
}

export const miniMapRelationLabel: Record<string, string> = {
  prerequisite: "前置",
  enables: "使能",
  related: "相关"
};

import type { KnowledgeGraph, KnowledgeGraphLayout } from "./types";

export const atlasDomainLayout: KnowledgeGraphLayout = {
  "agentic-ai": { x: -185, y: -70, z: 70 },
  "python-engineering": { x: 210, y: -35, z: -30 },
  "machine-learning": { x: 260, y: -235, z: 75 },
  "education-ai": { x: -55, y: 210, z: -80 },
  "language-learning": { x: -390, y: -215, z: 90 },
  "business-analysis": { x: 385, y: 145, z: -45 },
  "life-sciences": { x: 15, y: -335, z: 120 }
};

export function buildAtlasKnowledgeLayout(graph: KnowledgeGraph): KnowledgeGraphLayout {
  const layout: KnowledgeGraphLayout = {};
  graph.domains.forEach((domain) => {
    const center = atlasDomainLayout[domain.id] ?? { x: 0, y: 0, z: 0 };
    const nodes = graph.nodes.filter((node) => node.domainId === domain.id).sort((left, right) => left.id.localeCompare(right.id));
    const clusterIds = Array.from(new Set(nodes.map((node) => node.clusterId ?? "uncategorized")));
    nodes.forEach((node, index) => {
      const clusterIndex = clusterIds.indexOf(node.clusterId ?? "uncategorized");
      const clusterAngle = (clusterIndex / Math.max(1, clusterIds.length)) * Math.PI * 2;
      const localIndex = nodes.slice(0, index).filter((entry) => entry.clusterId === node.clusterId).length;
      const angle = clusterAngle + localIndex * 2.399963;
      const distance = 58 + Math.sqrt(localIndex + 1) * 24 + clusterIndex * 4;
      layout[node.id] = {
        x: center.x + Math.cos(angle) * distance,
        y: center.y + Math.sin(angle) * distance * 0.7,
        z: (center.z ?? 0) + ((index * 47) % 180) - 90
      };
    });
  });
  return layout;
}

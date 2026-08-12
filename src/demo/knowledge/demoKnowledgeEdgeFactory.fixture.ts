import type { KnowledgeEdge } from "@/features/knowledge/types";

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

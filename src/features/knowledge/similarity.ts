import type {
  KnowledgeGraph,
  SimilarityAnalysisRequest,
  SimilarKnowledgeCandidate
} from "./types";

function tokens(value: string) {
  return new Set(value.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
}

function overlap(left: Set<string>, right: Set<string>) {
  const union = new Set([...left, ...right]);
  if (!union.size) return 0;
  return [...left].filter((token) => right.has(token)).length / union.size;
}

/** Explicit command boundary. Course ingestion must never call this function. */
export function analyzeSimilarKnowledge(
  request: SimilarityAnalysisRequest,
  graph: KnowledgeGraph
): SimilarKnowledgeCandidate[] {
  if (!request.userTriggered) throw new Error("Similarity analysis requires an explicit user action.");
  const source = graph.nodes.find((node) => node.id === request.sourceNodeId);
  if (!source) throw new Error(`Unknown similarity source: ${request.sourceNodeId}`);
  const sourceTitle = tokens(source.title);
  const sourceDescription = tokens(source.description);
  const sourceNeighbors = new Set(graph.edges.flatMap((edge) => edge.source === source.id ? [edge.target] : edge.target === source.id ? [edge.source] : []));

  return graph.nodes
    .filter((candidate) => candidate.id !== source.id && request.targetScopes.includes(candidate.scope))
    .map((candidate) => {
      const titleScore = overlap(sourceTitle, tokens(candidate.title));
      const descriptionScore = overlap(sourceDescription, tokens(candidate.description));
      const candidateNeighbors = new Set(graph.edges.flatMap((edge) => edge.source === candidate.id ? [edge.target] : edge.target === candidate.id ? [edge.source] : []));
      const relationScore = overlap(sourceNeighbors, candidateNeighbors);
      const confidence = Math.min(1, titleScore * 0.5 + descriptionScore * 0.3 + relationScore * 0.2);
      const signals: SimilarKnowledgeCandidate["signals"] = [];
      if (titleScore) signals.push("title");
      if (descriptionScore) signals.push("description");
      if (relationScore) signals.push("relation-context");
      return { nodeId: candidate.id, confidence, signals };
    })
    .filter((candidate) => candidate.confidence > 0)
    .sort((left, right) => right.confidence - left.confidence || left.nodeId.localeCompare(right.nodeId))
    .slice(0, 12);
}

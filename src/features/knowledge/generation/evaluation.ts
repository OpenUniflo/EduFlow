import { assertDirectedAcyclic } from "../graphAlgorithms";
import { normalizeKnowledgeSurface } from "./normalization";
import type { KnowledgeGenerationResult } from "./types";

export type KnowledgeGold = {
  nodes: Array<{ id: string; canonicalTitle: string; aliases: string[]; description?: string; masteryCriteria?: string[] }>;
  relations: Array<{ from: string; to: string; type: "prerequisite" | "enables" | "related" }>;
  negativeCases: Array<{ text: string }>;
};

export type GoldMatchDecision = {
  goldId: string;
  predictedId?: string;
  goldTitle: string;
  predictedTitle?: string;
  score: number;
  signal: "exact-title-or-alias" | "surface-containment" | "character-bigram" | "description-bigram" | "embedding-cosine" | "unmatched";
};

function bigrams(value: string) {
  const compact = normalizeKnowledgeSurface(value).replace(/\s+/g, "");
  if (compact.length < 2) return new Set([compact]);
  return new Set(Array.from({ length: compact.length - 1 }, (_, index) => compact.slice(index, index + 2)));
}

function dice(left: string, right: string) {
  const leftSet = bigrams(left);
  const rightSet = bigrams(right);
  const intersection = Array.from(leftSet).filter((value) => rightSet.has(value)).length;
  return leftSet.size + rightSet.size ? (2 * intersection) / (leftSet.size + rightSet.size) : 0;
}

function surfaceScore(predicted: string[], gold: string[]) {
  let best = { score: 0, signal: "character-bigram" as GoldMatchDecision["signal"] };
  predicted.forEach((left) => gold.forEach((right) => {
    const normalizedLeft = normalizeKnowledgeSurface(left);
    const normalizedRight = normalizeKnowledgeSurface(right);
    const candidate = normalizedLeft === normalizedRight
      ? { score: 1, signal: "exact-title-or-alias" as const }
      : (normalizedLeft.length >= 4 && normalizedRight.length >= 4
          && Math.min(normalizedLeft.length, normalizedRight.length) / Math.max(normalizedLeft.length, normalizedRight.length) >= 0.6
          && (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)))
        ? { score: 0.9, signal: "surface-containment" as const }
        : { score: dice(left, right), signal: "character-bigram" as const };
    if (candidate.score > best.score) best = candidate;
  }));
  return best;
}

function ratio(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : 0;
}

export function evaluateKnowledgeGeneration(result: KnowledgeGenerationResult, gold: KnowledgeGold, semantic?: { scores: Map<string, number>; provider: string; model: string }) {
  const threshold = 0.68;
  const scoredPairs = gold.nodes.flatMap((node) => result.candidates.map((candidate) => {
    const titleMatch = surfaceScore([candidate.canonicalTitle, ...candidate.aliases], [node.canonicalTitle, ...node.aliases]);
    const descriptionSimilarity = node.description
      ? dice([candidate.description, ...candidate.masteryCriteria].join(" "), [node.description, ...(node.masteryCriteria ?? [])].join(" "))
      : 0;
    const descriptionMatch = descriptionSimilarity >= 0.34
      ? { score: Math.min(0.89, 0.68 + (descriptionSimilarity - 0.34) * 0.5), signal: "description-bigram" as const }
      : { score: 0, signal: "description-bigram" as const };
    const embeddingSimilarity = semantic?.scores.get(`${node.id}:${candidate.id}`) ?? 0;
    const embeddingMatch = embeddingSimilarity >= 0.7
      ? { score: Math.min(0.95, 0.68 + (embeddingSimilarity - 0.7) * 0.9), signal: "embedding-cosine" as const }
      : { score: 0, signal: "embedding-cosine" as const };
    const bestTextMatch = descriptionMatch.score > titleMatch.score ? descriptionMatch : titleMatch;
    return { gold: node, predicted: candidate, ...(embeddingMatch.score > bestTextMatch.score ? embeddingMatch : bestTextMatch) };
  })).sort((left, right) => right.score - left.score || left.gold.id.localeCompare(right.gold.id) || left.predicted.id.localeCompare(right.predicted.id));
  const usedGold = new Set<string>();
  const usedPredicted = new Set<string>();
  const matches = new Map<string, typeof scoredPairs[number]>();
  scoredPairs.forEach((pair) => {
    if (pair.score < threshold || usedGold.has(pair.gold.id) || usedPredicted.has(pair.predicted.id)) return;
    usedGold.add(pair.gold.id);
    usedPredicted.add(pair.predicted.id);
    matches.set(pair.gold.id, pair);
  });
  const matchDecisions: GoldMatchDecision[] = gold.nodes.map((node) => {
    const match = matches.get(node.id);
    return match ? { goldId: node.id, predictedId: match.predicted.id, goldTitle: node.canonicalTitle, predictedTitle: match.predicted.canonicalTitle, score: match.score, signal: match.signal }
      : { goldId: node.id, goldTitle: node.canonicalTitle, score: 0, signal: "unmatched" };
  });
  const predictedToGold = new Map(Array.from(matches.values(), (match) => [match.predicted.id, match.gold.id]));
  const relationMetrics = Object.fromEntries((["prerequisite", "enables", "related"] as const).map((type) => {
    const key = (source: string, target: string) => type === "related" ? [source, target].sort().join(":") : `${source}:${target}`;
    const expected = new Set(gold.relations.filter((relation) => relation.type === type).map((relation) => key(relation.from, relation.to)));
    const predicted = new Set(result.relations.filter((relation) => relation.relation === type).flatMap((relation) => {
      const source = predictedToGold.get(relation.sourceCandidateId);
      const target = predictedToGold.get(relation.targetCandidateId);
      return source && target ? [key(source, target)] : [];
    }));
    const correct = Array.from(predicted).filter((relation) => expected.has(relation)).length;
    return [type, { expected: expected.size, predicted: predicted.size, correct, precision: ratio(correct, predicted.size), recall: ratio(correct, expected.size) }];
  }));
  const candidateIds = new Set(result.candidates.map((candidate) => candidate.id));
  const relationKeys = new Set<string>();
  let invalidEdgeCount = 0;
  result.relations.forEach((relation) => {
    const key = relation.relation === "related" ? `${relation.relation}:${[relation.sourceCandidateId, relation.targetCandidateId].sort().join(":")}` : `${relation.relation}:${relation.sourceCandidateId}:${relation.targetCandidateId}`;
    if (!candidateIds.has(relation.sourceCandidateId) || !candidateIds.has(relation.targetCandidateId) || relation.sourceCandidateId === relation.targetCandidateId || relationKeys.has(key)) invalidEdgeCount += 1;
    relationKeys.add(key);
  });
  let cycleCount = 0;
  try {
    assertDirectedAcyclic(candidateIds, result.relations.filter((relation) => relation.relation === "prerequisite").map((relation) => ({ source: relation.sourceCandidateId, target: relation.targetCandidateId })));
  } catch {
    cycleCount = 1;
  }
  const negativeViolations = gold.negativeCases.flatMap((negative) => result.candidates.filter((candidate) => {
    const negativeSurface = normalizeKnowledgeSurface(negative.text);
    return [candidate.canonicalTitle, ...candidate.aliases].some((surface) => normalizeKnowledgeSurface(surface) === negativeSurface);
  }).map((candidate) => ({ text: negative.text, candidateId: candidate.id, candidateTitle: candidate.canonicalTitle })));
  const facts = result.candidates.length + result.relations.length;
  const factsWithProvenance = result.candidates.filter((candidate) => candidate.sourceRefs.length > 0).length + result.relations.filter((relation) => relation.sourceRefs.length > 0).length;
  const coveredCandidateIds = new Set(result.curriculum.chapters.flatMap((chapter) => chapter.lessons.flatMap((lesson) => lesson.coverages.map((coverage) => coverage.candidateId))));
  const normalizedCandidateSurfaces = result.candidates.map((candidate) => normalizeKnowledgeSurface(candidate.canonicalTitle));
  const duplicateCandidateCount = normalizedCandidateSurfaces.length - new Set(normalizedCandidateSurfaces).size;
  return {
    matching: { mode: "semantic_with_aliases", deterministicThreshold: threshold, ...(semantic ? { semanticEvaluator: { provider: semantic.provider, model: semantic.model, cosineThreshold: 0.7 } } : {}), decisions: matchDecisions },
    metrics: {
      expectedNodeRecall: ratio(matches.size, gold.nodes.length),
      spuriousNodeRate: ratio(result.candidates.length - usedPredicted.size, result.candidates.length),
      negativeCaseViolationCount: negativeViolations.length,
      duplicateRateAfterNormalization: ratio(duplicateCandidateCount, result.candidates.length),
      relations: relationMetrics,
      prerequisiteInvalidEdgeCount: invalidEdgeCount,
      prerequisiteCycleCount: cycleCount,
      provenanceCompleteness: ratio(factsWithProvenance, facts),
      curriculumKnowledgeCoverage: ratio(Array.from(candidateIds).filter((id) => coveredCandidateIds.has(id)).length, candidateIds.size)
    },
    mismatches: {
      missingGoldNodes: matchDecisions.filter((decision) => !decision.predictedId),
      spuriousCandidates: result.candidates.filter((candidate) => !usedPredicted.has(candidate.id)).map((candidate) => ({ id: candidate.id, title: candidate.canonicalTitle })),
      negativeViolations
    }
  };
}

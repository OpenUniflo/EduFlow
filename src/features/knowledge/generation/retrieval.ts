import type { CourseMaterial, StructuredMaterialChunk } from "@/features/material/parsing/types";
import type { CandidatePair, EmbeddingService, KnowledgeCandidate } from "./types";

/** Retrieval is deliberately permissive; semantic identity is decided by the scoped judge. */
export const SEMANTIC_DUPLICATE_RETRIEVAL_THRESHOLD = 0.72;
export const SEMANTIC_DUPLICATE_NEIGHBORS = 3;
export const RELATION_NEIGHBORS = 8;
export const COVERAGE_NEIGHBORS = 3;
export const ADMISSION_NEIGHBORS = 3;

export class RunLocalEmbeddingCache {
  private readonly cache = new Map<string, Promise<number[]>>();
  requestCount = 0;

  constructor(private readonly service: EmbeddingService) {}

  embed(text: string) {
    const normalized = text.normalize("NFKC").trim().replace(/[\s\u00a0]+/g, " ");
    if (!normalized) throw new Error("Embedding input must not be empty");
    let pending = this.cache.get(normalized);
    if (!pending) {
      this.requestCount += 1;
      pending = this.service.embed(normalized);
      this.cache.set(normalized, pending);
    }
    return pending;
  }
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) throw new Error("Embedding vectors must be non-empty and have equal dimensions");
  let dot = 0; let leftNorm = 0; let rightNorm = 0;
  left.forEach((value, index) => {
    if (!Number.isFinite(value) || !Number.isFinite(right[index])) throw new Error("Embedding vectors must contain finite numbers");
    dot += value * right[index]; leftNorm += value * value; rightNorm += right[index] * right[index];
  });
  if (!leftNorm || !rightNorm) throw new Error("Embedding vectors must have non-zero magnitude");
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function knowledgeCandidateEmbeddingText(candidate: KnowledgeCandidate) {
  return [candidate.canonicalTitle, candidate.aliases.join("；"), candidate.description, candidate.masteryCriteria.join("；")]
    .filter(Boolean).join("\n");
}

export function materialChunkEmbeddingText(chunk: StructuredMaterialChunk) {
  return [`路径：${chunk.sectionPath.join(" > ")}`, chunk.text.slice(0, 6_000)].join("\n");
}

export function unorderedCandidatePairId(leftId: string, rightId: string) {
  const [left, right] = [leftId, rightId].sort();
  return `candidate-pair:${left}:${right}`;
}

function pair(left: KnowledgeCandidate, right: KnowledgeCandidate, signals: CandidatePair["signals"], similarity?: number): CandidatePair {
  const [a, b] = [left.id, right.id].sort();
  return { id: unorderedCandidatePairId(a, b), leftCandidateId: a, rightCandidateId: b, ...(similarity === undefined ? {} : { similarity }), signals };
}

async function candidateVectors(candidates: KnowledgeCandidate[], cache: RunLocalEmbeddingCache) {
  return Promise.all(candidates.map((candidate) => cache.embed(knowledgeCandidateEmbeddingText(candidate))));
}

export async function retrieveSemanticDuplicatePairs(candidates: KnowledgeCandidate[], cache: RunLocalEmbeddingCache) {
  if (candidates.length < 2) return [];
  const vectors = await candidateVectors(candidates, cache);
  const byId = new Map<string, CandidatePair>();
  candidates.forEach((candidate, left) => {
    const neighbors = candidates.flatMap((other, right) => left === right ? [] : [{ other, similarity: cosineSimilarity(vectors[left], vectors[right]) }])
      .sort((a, b) => b.similarity - a.similarity || a.other.id.localeCompare(b.other.id))
      .slice(0, Math.min(SEMANTIC_DUPLICATE_NEIGHBORS, candidates.length - 1));
    neighbors.filter(({ similarity }) => similarity >= SEMANTIC_DUPLICATE_RETRIEVAL_THRESHOLD).forEach(({ other, similarity }) => {
      const candidatePair = pair(candidate, other, ["embedding-neighbor"], similarity);
      const existing = byId.get(candidatePair.id);
      if (!existing || (existing.similarity ?? -1) < similarity) byId.set(candidatePair.id, candidatePair);
    });
  });
  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function sourceKeys(candidate: KnowledgeCandidate) {
  return new Set(candidate.sourceRefs.flatMap((source) => [
    `block:${source.sourceMaterialId}:${source.rawBlockId}`,
    `section:${source.sourceMaterialId}:${source.sectionPath.join("\u001f")}`
  ]));
}

export async function retrieveRelationCandidatePairs(candidates: KnowledgeCandidate[], cache: RunLocalEmbeddingCache) {
  if (candidates.length < 2) return [];
  const vectors = await candidateVectors(candidates, cache);
  const sources = candidates.map(sourceKeys);
  const byId = new Map<string, CandidatePair>();
  candidates.forEach((candidate, left) => {
    candidates.flatMap((other, right) => left === right ? [] : [{ other, similarity: cosineSimilarity(vectors[left], vectors[right]) }])
      .sort((a, b) => b.similarity - a.similarity || a.other.id.localeCompare(b.other.id))
      .slice(0, Math.min(RELATION_NEIGHBORS, candidates.length - 1))
      .forEach(({ other, similarity }) => {
        const candidatePair = pair(candidate, other, ["embedding-neighbor"], similarity);
        const existing = byId.get(candidatePair.id);
        if (!existing || (existing.similarity ?? -1) < similarity) byId.set(candidatePair.id, candidatePair);
      });
    candidates.slice(left + 1).forEach((other, offset) => {
      const right = left + offset + 1;
      if (!Array.from(sources[left]).some((key) => sources[right].has(key))) return;
      const candidatePair = pair(candidate, other, ["shared-provenance"]);
      const existing = byId.get(candidatePair.id);
      byId.set(candidatePair.id, existing ? { ...existing, signals: Array.from(new Set([...existing.signals, "shared-provenance" as const])) } : candidatePair);
    });
  });
  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

export async function nearestCandidatesForAdmission(candidates: KnowledgeCandidate[], cache: RunLocalEmbeddingCache) {
  if (candidates.length < 2) return new Map<string, Array<{ candidate: KnowledgeCandidate; similarity: number }>>();
  const vectors = await candidateVectors(candidates, cache);
  return new Map(candidates.map((candidate, left) => [candidate.id, candidates.flatMap((other, right) => left === right ? [] : [{ candidate: other, similarity: cosineSimilarity(vectors[left], vectors[right]) }])
    .sort((a, b) => b.similarity - a.similarity || a.candidate.id.localeCompare(b.candidate.id))
    .slice(0, Math.min(ADMISSION_NEIGHBORS, candidates.length - 1))]));
}

export type CoverageUnit = { id: string; sectionPath: string[]; chunks: StructuredMaterialChunk[]; text: string };

export function buildCoverageUnits(material: CourseMaterial): CoverageUnit[] {
  const groups = new Map<string, StructuredMaterialChunk[]>();
  material.chunks.forEach((chunk) => {
    const key = chunk.sectionPath.join("\u001f") || `chunk:${chunk.id}`;
    groups.set(key, [...(groups.get(key) ?? []), chunk]);
  });
  return Array.from(groups.entries()).map(([key, chunks]) => ({
    id: `coverage:${encodeURIComponent((chunks[0]?.sectionPath ?? []).join("/"))}`, sectionPath: chunks[0]?.sectionPath ?? [], chunks,
    text: chunks.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map((chunk) => chunk.text).join("\n").slice(0, 6_000)
  })).filter((unit) => unit.text.trim().length >= 40);
}

export async function nearestCandidatesForCoverage(units: CoverageUnit[], candidates: KnowledgeCandidate[], cache: RunLocalEmbeddingCache) {
  const candidateEmbeddings = await candidateVectors(candidates, cache);
  return Promise.all(units.map(async (unit) => {
    const vector = await cache.embed([`路径：${unit.sectionPath.join(" > ")}`, unit.text].join("\n"));
    const nearest = candidates.map((candidate, index) => ({ candidate, similarity: cosineSimilarity(vector, candidateEmbeddings[index]) }))
      .sort((a, b) => b.similarity - a.similarity || a.candidate.id.localeCompare(b.candidate.id))
      .slice(0, Math.min(COVERAGE_NEIGHBORS, candidates.length));
    return { unit, nearest };
  }));
}

export function evidenceChunksForPair(pairValue: CandidatePair, candidates: KnowledgeCandidate[], chunks: StructuredMaterialChunk[]) {
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const evidenceKeys = new Set([pairValue.leftCandidateId, pairValue.rightCandidateId].flatMap((id) => candidateById.get(id)?.sourceRefs.flatMap((source) => [
    `block:${source.sourceMaterialId}:${source.rawBlockId}`, `section:${source.sourceMaterialId}:${source.sectionPath.join("\u001f")}`
  ]) ?? []));
  return chunks.filter((chunk) => chunk.sources.some((source) => evidenceKeys.has(`block:${source.sourceMaterialId}:${source.rawBlockId}`) || evidenceKeys.has(`section:${source.sourceMaterialId}:${source.sectionPath.join("\u001f")}`))).slice(0, 8);
}

export function evidenceChunksForCandidate(candidate: KnowledgeCandidate, chunks: StructuredMaterialChunk[]) {
  const evidenceKeys = new Set(candidate.sourceRefs.flatMap((source) => [
    `block:${source.sourceMaterialId}:${source.rawBlockId}`, `section:${source.sourceMaterialId}:${source.sectionPath.join("\u001f")}`
  ]));
  return chunks.filter((chunk) => chunk.sources.some((source) => evidenceKeys.has(`block:${source.sourceMaterialId}:${source.rawBlockId}`)
    || evidenceKeys.has(`section:${source.sourceMaterialId}:${source.sectionPath.join("\u001f")}`))).slice(0, 4);
}

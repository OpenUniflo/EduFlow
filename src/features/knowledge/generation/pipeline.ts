import type { SourceLocation, StructuredMaterialChunk } from "@/features/material/parsing/types";
import { deduplicateWithinIngestion } from "./normalization";
import { coverageAuditPrompt, curriculumPrompt, equivalencePrompt, extractionPrompt, KNOWLEDGE_GENERATION_PROMPT_VERSION, pairClassificationPrompt } from "./prompts";
import { parseCoverageOutput, parseCurriculumOutput, parseEquivalenceOutput, parseExtractionOutput, parsePairClassificationOutput } from "./schema";
import {
  buildCoverageUnits, evidenceChunksForPair, nearestCandidatesForCoverage, retrieveRelationCandidatePairs,
  retrieveSemanticDuplicatePairs, RunLocalEmbeddingCache
} from "./retrieval";
import type {
  CandidateKnowledgeRelation, CandidatePair, EmbeddingService, GeneratedCurriculum, KnowledgeCandidate,
  KnowledgeGenerationInput, KnowledgeGenerationResult, ModelExecutionMetadata, StructuredGenerationClient
} from "./types";
import { validateCandidateGraph, validateGeneratedCurriculum } from "./validation";

const EXTRACTION_SCHEMA_VERSION = "knowledge-candidates-v1";
const EQUIVALENCE_SCHEMA_VERSION = "knowledge-equivalence-v1";
const COVERAGE_SCHEMA_VERSION = "knowledge-coverage-v1";
const RELATION_SCHEMA_VERSION = "knowledge-pair-classification-v1";
const CURRICULUM_SCHEMA_VERSION = "generated-curriculum-v1";
const EXTRACTION_BATCH_CHARACTERS = 5_000;
// Local batches are high-recall retrieval inputs; this is an operational runaway guard, not a target or quota.
const MAX_GENERATED_CANDIDATES = 80;
export const MAX_EQUIVALENCE_PAIRS_PER_BATCH = 20;
export const MAX_RELATION_PAIRS_PER_BATCH = 8;
export const MAX_RELATION_BATCH_CHARACTERS = 20_000;
const MAX_COVERAGE_SECTIONS_PER_BATCH = 2;

function uniqueSources(values: SourceLocation[]) {
  const byKey = new Map(values.map((source) => [[source.sourceMaterialId, source.rawBlockId, source.ordinal].join(":"), source]));
  return Array.from(byKey.values());
}

function batches(chunks: StructuredMaterialChunk[]) {
  const result: StructuredMaterialChunk[][] = [];
  let current: StructuredMaterialChunk[] = [];
  let size = 0;
  chunks.forEach((chunk) => {
    if (current.length && size + chunk.text.length > EXTRACTION_BATCH_CHARACTERS) {
      result.push(current);
      current = [];
      size = 0;
    }
    current.push(chunk);
    size += chunk.text.length;
  });
  if (current.length) result.push(current);
  return result;
}

function candidateRelationId(type: string, source: string, target: string) {
  const endpoints = type === "related" ? [source, target].sort() : [source, target];
  return `candidate-edge:${type}:${endpoints[0]}:${endpoints[1]}`;
}

async function boundedStructuredGeneration<T>(
  client: StructuredGenerationClient,
  request: Parameters<StructuredGenerationClient["generateJson"]>[0],
  executions: ModelExecutionMetadata[],
  parse: (value: unknown) => T,
  onRetry: () => void
) {
  let correction = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const generation = await client.generateJson(correction ? { ...request, system: `${request.system}\nPrevious output failed validation or completion: ${correction}. Return every requested item exactly once.` } : request);
      executions.push(generation.metadata);
      return parse(generation.value);
    } catch (error) {
      correction = error instanceof Error ? error.message : "structured generation failure";
      onRetry();
      if (attempt === 2) throw error;
    }
  }
  throw new Error("Structured generation exhausted bounded retries");
}

export async function extractAtomicKnowledge(input: KnowledgeGenerationInput, client: StructuredGenerationClient) {
  const executions: ModelExecutionMetadata[] = [];
  const candidates: KnowledgeCandidate[] = [];
  let retryCount = 0;
  for (const [batchIndex, chunkBatch] of batches(input.material.chunks).entries()) {
    const prompt = extractionPrompt(chunkBatch);
    const chunkById = new Map(chunkBatch.map((chunk) => [chunk.id, chunk]));
    let parsed;
    try {
      parsed = await boundedStructuredGeneration(client, {
        stage: "extraction", promptVersion: KNOWLEDGE_GENERATION_PROMPT_VERSION,
        schemaVersion: EXTRACTION_SCHEMA_VERSION, ...prompt, maxTokens: 8_000, temperature: 0.1
      }, executions, (value) => {
        const output = parseExtractionOutput(value, 8);
        output.forEach((candidate) => candidate.sourceChunkIds.forEach((id) => {
          if (!chunkById.has(id)) throw new Error(`Unknown extraction source chunk reference: ${id}`);
        }));
        return output;
      }, () => { retryCount += 1; });
    } catch (error) {
      throw new Error(`Extraction batch ${batchIndex + 1} failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
    parsed.forEach((candidate) => {
      candidates.push({
        id: `batch-${batchIndex}:${candidate.id}`,
        canonicalTitle: candidate.canonicalTitle,
        description: candidate.description,
        type: candidate.type,
        aliases: candidate.aliases,
        masteryCriteria: candidate.masteryCriteria,
        sourceRefs: uniqueSources(candidate.sourceChunkIds.flatMap((id) => chunkById.get(id)?.sources ?? []))
      });
    });
  }
  if (!candidates.length) throw new Error("Knowledge extraction produced no valid candidates");
  return { candidates, executions, retryCount };
}

function mergeCandidatesByPairs(candidates: KnowledgeCandidate[], samePairs: CandidatePair[]) {
  const parent = new Map(candidates.map((candidate) => [candidate.id, candidate.id]));
  const find = (id: string): string => parent.get(id) === id ? id : (parent.set(id, find(parent.get(id) as string)), parent.get(id) as string);
  samePairs.forEach((pair) => {
    const left = find(pair.leftCandidateId); const right = find(pair.rightCandidateId);
    if (left !== right) parent.set([left, right].sort()[1], [left, right].sort()[0]);
  });
  const groups = new Map<string, KnowledgeCandidate[]>();
  candidates.forEach((candidate) => groups.set(find(candidate.id), [...(groups.get(find(candidate.id)) ?? []), candidate]));
  return deduplicateWithinIngestion(Array.from(groups.values()).map((group) => {
    const primary = group[0];
    return {
      ...primary,
      aliases: group.flatMap((candidate) => [...candidate.aliases, ...(candidate.id === primary.id ? [] : [candidate.canonicalTitle])]),
      masteryCriteria: group.flatMap((candidate) => candidate.masteryCriteria),
      sourceRefs: uniqueSources(group.flatMap((candidate) => candidate.sourceRefs))
    };
  })).candidates;
}

async function semanticDeduplicate(candidates: KnowledgeCandidate[], chunks: StructuredMaterialChunk[], client: StructuredGenerationClient, cache: RunLocalEmbeddingCache, retryCounter: { count: number }) {
  const candidatePairs = await retrieveSemanticDuplicatePairs(candidates, cache);
  const executions: ModelExecutionMetadata[] = [];
  const samePairs: CandidatePair[] = [];
  for (let index = 0; index < candidatePairs.length; index += MAX_EQUIVALENCE_PAIRS_PER_BATCH) {
    const batch = candidatePairs.slice(index, index + MAX_EQUIVALENCE_PAIRS_PER_BATCH);
    const evidence = new Map(batch.map((pair) => [pair.id, evidenceChunksForPair(pair, candidates, chunks)]));
    const prompt = equivalencePrompt(batch, candidates, evidence);
    const decisions = await boundedStructuredGeneration(client, { stage: "deduplication", promptVersion: KNOWLEDGE_GENERATION_PROMPT_VERSION,
      schemaVersion: EQUIVALENCE_SCHEMA_VERSION, ...prompt, maxTokens: 4_000, temperature: 0 }, executions,
    (value) => parseEquivalenceOutput(value, new Set(batch.map((pair) => pair.id))), () => { retryCounter.count += 1; });
    const byId = new Map(batch.map((pair) => [pair.id, pair]));
    decisions.filter((decision) => decision.decision === "same").forEach((decision) => samePairs.push(byId.get(decision.pairId) as CandidatePair));
  }
  return { candidates: mergeCandidatesByPairs(candidates, samePairs), candidatePairCount: candidatePairs.length, executions };
}

async function auditCoverage(input: KnowledgeGenerationInput, candidates: KnowledgeCandidate[], client: StructuredGenerationClient, cache: RunLocalEmbeddingCache, retryCounter: { count: number }) {
  const units = buildCoverageUnits(input.material);
  const nearest = await nearestCandidatesForCoverage(units, candidates, cache);
  const chunkById = new Map(input.material.chunks.map((chunk) => [chunk.id, chunk]));
  const additions: KnowledgeCandidate[] = [];
  const executions: ModelExecutionMetadata[] = [];
  let gaps = 0;
  for (let index = 0; index < nearest.length; index += MAX_COVERAGE_SECTIONS_PER_BATCH) {
    const batch = nearest.slice(index, index + MAX_COVERAGE_SECTIONS_PER_BATCH);
    const prompt = coverageAuditPrompt(batch);
    const decisions = await boundedStructuredGeneration(client, { stage: "coverage", promptVersion: KNOWLEDGE_GENERATION_PROMPT_VERSION,
      schemaVersion: COVERAGE_SCHEMA_VERSION, ...prompt, maxTokens: 5_000, temperature: 0 }, executions,
    (value) => parseCoverageOutput(value, new Set(batch.map(({ unit }) => unit.id)), new Set(chunkById.keys())), () => { retryCounter.count += 1; });
    decisions.forEach((decision) => {
      if (decision.status === "missing") gaps += 1;
      decision.missingCandidates.forEach((candidate) => additions.push({
        id: `coverage:${decision.sectionId}:${candidate.id}`, canonicalTitle: candidate.canonicalTitle,
        description: candidate.description, type: candidate.type, aliases: candidate.aliases,
        masteryCriteria: candidate.masteryCriteria,
        sourceRefs: uniqueSources(candidate.sourceChunkIds.flatMap((id) => chunkById.get(id)?.sources ?? []))
      }));
    });
  }
  return { additions, auditedSectionCount: units.length, gapCount: gaps, executions };
}

function relationPairBatches(pairs: CandidatePair[], evidence: Map<string, StructuredMaterialChunk[]>) {
  const result: CandidatePair[][] = []; let current: CandidatePair[] = []; let characters = 0;
  pairs.forEach((pair) => {
    const pairCharacters = Math.min(6_000, (evidence.get(pair.id) ?? []).reduce((sum, chunk) => sum + Math.min(2_000, chunk.text.length), 600));
    if (current.length && (current.length >= MAX_RELATION_PAIRS_PER_BATCH || characters + pairCharacters > MAX_RELATION_BATCH_CHARACTERS)) {
      result.push(current); current = []; characters = 0;
    }
    current.push(pair); characters += pairCharacters;
  });
  if (current.length) result.push(current);
  return result;
}

export async function classifyRelations(candidates: KnowledgeCandidate[], chunks: StructuredMaterialChunk[], candidatePairs: CandidatePair[], client: StructuredGenerationClient, retryCounter: { count: number } = { count: 0 }) {
  const executions: ModelExecutionMetadata[] = [];
  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const evidence = new Map(candidatePairs.map((pair) => [pair.id, evidenceChunksForPair(pair, candidates, chunks)]));
  const relations: CandidateKnowledgeRelation[] = [];
  const batches = relationPairBatches(candidatePairs, evidence);
  for (const batch of batches) {
    const prompt = pairClassificationPrompt(batch, candidates, evidence);
    const parsed = await boundedStructuredGeneration(client, { stage: "relations", promptVersion: KNOWLEDGE_GENERATION_PROMPT_VERSION,
      schemaVersion: RELATION_SCHEMA_VERSION, ...prompt, maxTokens: 6_000, temperature: 0 }, executions,
    (value) => parsePairClassificationOutput(value, new Set(batch.map((pair) => pair.id)), new Set(chunkById.keys())), () => { retryCounter.count += 1; });
        const pairById = new Map(batch.map((pair) => [pair.id, pair]));
        parsed.filter((result) => result.label !== "none").forEach((result) => {
          const pair = pairById.get(result.pairId) as CandidatePair;
          const reverse = result.label.startsWith("b_");
          const sourceCandidateId = reverse ? pair.rightCandidateId : pair.leftCandidateId;
          const targetCandidateId = reverse ? pair.leftCandidateId : pair.rightCandidateId;
          const relation = result.label === "related" ? "related" : result.label.includes("prerequisite") ? "prerequisite" : "enables";
          const source = relation === "related" ? [sourceCandidateId, targetCandidateId].sort()[0] : sourceCandidateId;
          const target = relation === "related" ? [sourceCandidateId, targetCandidateId].sort()[1] : targetCandidateId;
          const common = { id: candidateRelationId(relation, source, target), sourceCandidateId: source, targetCandidateId: target,
            reason: result.reason, sourceRefs: uniqueSources(result.evidenceChunkIds.flatMap((id) => chunkById.get(id)?.sources ?? [])) };
          relations.push(relation === "prerequisite" ? { ...common, relation, strength: result.strength as "hard" | "soft" }
            : { ...common, relation, strength: result.strength as number });
        });
  }
  validateCandidateGraph(candidates, relations);
  return { relations, executions, batchCount: batches.length };
}

export async function generateCurriculum(candidates: KnowledgeCandidate[], relations: CandidateKnowledgeRelation[], input: KnowledgeGenerationInput, client: StructuredGenerationClient) {
  const prompt = curriculumPrompt(candidates, relations, input.material.sections.map((section) => section.source.sectionPath));
  const request = {
    stage: "curriculum", promptVersion: KNOWLEDGE_GENERATION_PROMPT_VERSION,
    schemaVersion: CURRICULUM_SCHEMA_VERSION, ...prompt, maxTokens: 8_000, temperature: 0.1
  } as const;
  const executions: ModelExecutionMetadata[] = [];
  let correction = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const generation = await client.generateJson(correction ? { ...request, system: `${request.system}\nYour previous curriculum failed validation: ${correction}. Return a complete corrected curriculum with all candidates covered and every hard prerequisite earlier than its target.` } : request);
    executions.push(generation.metadata);
    try {
      const curriculum: GeneratedCurriculum = parseCurriculumOutput(generation.value, new Set(candidates.map((candidate) => candidate.id)));
      validateGeneratedCurriculum(candidates, relations, curriculum);
      return { curriculum, executions };
    } catch (error) {
      correction = error instanceof Error ? error.message : "curriculum validation violation";
      if (attempt === 2) {
        if (!/hard prerequisite order|directed graph contains a cycle|Generated Knowledge is not covered/i.test(correction)) throw error;
        const rank = new Map(candidates.map((candidate, index) => [candidate.id, index]));
        const sourceOrder = (id: string) => Math.min(...(candidates.find((candidate) => candidate.id === id)?.sourceRefs.map((source) => source.ordinal) ?? [Number.MAX_SAFE_INTEGER]));
        const outgoing = new Map(candidates.map((candidate) => [candidate.id, [] as string[]]));
        const indegree = new Map(candidates.map((candidate) => [candidate.id, 0]));
        relations.filter((relation) => relation.relation !== "related").forEach((relation) => {
          outgoing.get(relation.sourceCandidateId)?.push(relation.targetCandidateId);
          indegree.set(relation.targetCandidateId, (indegree.get(relation.targetCandidateId) ?? 0) + 1);
        });
        const compare = (left: string, right: string) => sourceOrder(left) - sourceOrder(right) || (rank.get(left) ?? 0) - (rank.get(right) ?? 0) || left.localeCompare(right);
        const queue = candidates.map((candidate) => candidate.id).filter((id) => indegree.get(id) === 0).sort(compare);
        const ordered: string[] = [];
        while (queue.length) {
          const id = queue.shift() as string;
          ordered.push(id);
          (outgoing.get(id) ?? []).forEach((targetId) => {
            indegree.set(targetId, (indegree.get(targetId) ?? 0) - 1);
            if (indegree.get(targetId) === 0) {
              queue.push(targetId);
              queue.sort(compare);
            }
          });
        }
        if (ordered.length !== candidates.length) throw error;
        const sourceCurriculum = parseCurriculumOutput(generation.value, new Set(candidates.map((candidate) => candidate.id)));
        const originalCoverage = new Map(sourceCurriculum.chapters.flatMap((chapter) => chapter.lessons.flatMap((lesson) => lesson.coverages.map((coverage) => [coverage.candidateId, coverage] as const))));
        const stageCount = ordered.length > 20 ? 3 : ordered.length > 8 ? 2 : 1;
        const chapters = Array.from({ length: stageCount }, (_, stageIndex) => {
          const start = Math.floor(stageIndex * ordered.length / stageCount);
          const end = Math.floor((stageIndex + 1) * ordered.length / stageCount);
          const ids = ordered.slice(start, end);
          const sourceChapter = sourceCurriculum.chapters[Math.min(sourceCurriculum.chapters.length - 1, Math.floor(stageIndex * sourceCurriculum.chapters.length / stageCount))];
          return {
            id: `normalized-stage-${stageIndex + 1}`,
            title: sourceChapter?.title ?? `学习阶段 ${stageIndex + 1}`,
            description: sourceChapter?.description ?? "按 Knowledge 依赖组织的学习阶段。",
            outcome: sourceChapter?.outcome ?? "完成本阶段覆盖的 Knowledge 学习。",
            lessons: [{ id: `normalized-lesson-${stageIndex + 1}`, title: sourceChapter?.title ?? `阶段 ${stageIndex + 1}`, coverages: ids.map((candidateId) => ({ candidateId, role: originalCoverage.get(candidateId)?.role ?? "introduce" as const })) }]
          };
        });
        const normalized: GeneratedCurriculum = { chapters };
        validateGeneratedCurriculum(candidates, relations, normalized);
        executions[executions.length - 1] = { ...executions[executions.length - 1], validationWarnings: [`Applied graph-driven CurriculumCoverage ordering after bounded retry: ${correction}`] };
        return { curriculum: normalized, executions };
      }
    }
  }
  throw new Error("Curriculum generation did not produce a valid projection");
}

export async function runKnowledgeGenerationPipeline(input: KnowledgeGenerationInput, client: StructuredGenerationClient, embeddingService: EmbeddingService): Promise<KnowledgeGenerationResult> {
  if (!input.ownerId.trim()) throw new Error("Authenticated owner identity is required");
  if (!input.material.chunks.length) throw new Error("CourseMaterial has no chunks to model");
  const embeddingCache = new RunLocalEmbeddingCache(embeddingService);
  const retryCounter = { count: 0 };
  const extraction = await extractAtomicKnowledge(input, client);
  const exact = deduplicateWithinIngestion(extraction.candidates);
  const semantic = await semanticDeduplicate(exact.candidates, input.material.chunks, client, embeddingCache, retryCounter);
  const coverage = await auditCoverage(input, semantic.candidates, client, embeddingCache, retryCounter);
  const recoveredExact = deduplicateWithinIngestion([...semantic.candidates, ...coverage.additions]);
  const recoveredSemantic = coverage.additions.length
    ? await semanticDeduplicate(recoveredExact.candidates, input.material.chunks, client, embeddingCache, retryCounter)
    : { candidates: recoveredExact.candidates, candidatePairCount: 0, executions: [] as ModelExecutionMetadata[] };
  if (recoveredSemantic.candidates.length > MAX_GENERATED_CANDIDATES) throw new Error(`Final Knowledge set exceeds the ${MAX_GENERATED_CANDIDATES}-candidate safety limit`);
  const candidates = recoveredSemantic.candidates.map((candidate, index) => ({ ...candidate, id: `candidate-${String(index + 1).padStart(3, "0")}` }));
  if (!candidates.length) throw new Error("Knowledge extraction produced no valid candidates");
  const relationCandidatePairs = await retrieveRelationCandidatePairs(candidates, embeddingCache);
  const relationExtraction = await classifyRelations(candidates, input.material.chunks, relationCandidatePairs, client, retryCounter);
  const curriculumGeneration = await generateCurriculum(candidates, relationExtraction.relations, input, client);
  const allRelationPairCount = candidates.length * (candidates.length - 1) / 2;
  return {
    courseId: input.courseId,
    ownerId: input.ownerId,
    sourceMaterialId: input.material.sourceMaterialId,
    candidates,
    duplicateCount: extraction.candidates.length + coverage.additions.length - candidates.length,
    relations: relationExtraction.relations,
    curriculum: curriculumGeneration.curriculum,
    executions: [...extraction.executions, ...semantic.executions, ...coverage.executions, ...recoveredSemantic.executions, ...relationExtraction.executions, ...curriculumGeneration.executions],
    relationCandidatePairs,
    diagnostics: {
      embeddingRequestCount: embeddingCache.requestCount,
      semanticDedupCandidatePairCount: semantic.candidatePairCount + recoveredSemantic.candidatePairCount,
      coverageAuditedSectionCount: coverage.auditedSectionCount,
      coverageGapCount: coverage.gapCount,
      allRelationPairCount,
      retrievedRelationPairCount: relationCandidatePairs.length,
      relationRetrievalReductionRatio: allRelationPairCount ? 1 - relationCandidatePairs.length / allRelationPairCount : 0,
      relationBatchCount: relationExtraction.batchCount,
      structuredRetryCount: extraction.retryCount + retryCounter.count + Math.max(0, curriculumGeneration.executions.length - 1)
    }
  };
}

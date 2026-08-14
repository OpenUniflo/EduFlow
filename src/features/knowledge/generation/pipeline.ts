import type { SourceLocation, StructuredMaterialChunk } from "@/features/material/parsing/types";
import { deduplicateWithinIngestion } from "./normalization";
import { atomicityAuditPrompt, candidateAdmissionPrompt, consolidationPrompt, curriculumPrompt, extractionPrompt, KNOWLEDGE_GENERATION_PROMPT_VERSION, relationPrompt } from "./prompts";
import { parseCurriculumOutput, parseExtractionOutput, parseRelationOutput } from "./schema";
import type {
  CandidateKnowledgeRelation, GeneratedCurriculum, KnowledgeCandidate, KnowledgeGenerationInput,
  KnowledgeGenerationResult, ModelExecutionMetadata, StructuredGenerationClient
} from "./types";
import { validateCandidateGraph, validateGeneratedCurriculum } from "./validation";

const EXTRACTION_SCHEMA_VERSION = "knowledge-candidates-v1";
const CONSOLIDATION_SCHEMA_VERSION = "knowledge-candidates-consolidated-v1";
const ATOMICITY_AUDIT_SCHEMA_VERSION = "knowledge-candidates-atomicity-audit-v1";
const CANDIDATE_ADMISSION_SCHEMA_VERSION = "knowledge-candidate-admission-v1";
const RELATION_SCHEMA_VERSION = "knowledge-relations-v1";
const CURRICULUM_SCHEMA_VERSION = "generated-curriculum-v1";
const EXTRACTION_BATCH_CHARACTERS = 5_000;

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

export async function extractAtomicKnowledge(input: KnowledgeGenerationInput, client: StructuredGenerationClient) {
  const executions: ModelExecutionMetadata[] = [];
  const candidates: KnowledgeCandidate[] = [];
  for (const [batchIndex, chunkBatch] of batches(input.material.chunks).entries()) {
    const prompt = extractionPrompt(chunkBatch);
    let generation;
    try {
      generation = await client.generateJson({
        stage: "extraction", promptVersion: KNOWLEDGE_GENERATION_PROMPT_VERSION,
        schemaVersion: EXTRACTION_SCHEMA_VERSION, ...prompt, maxTokens: 8_000, temperature: 0.1
      });
    } catch (error) {
      throw new Error(`Extraction batch ${batchIndex + 1} failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
    executions.push(generation.metadata);
    const chunkById = new Map(chunkBatch.map((chunk) => [chunk.id, chunk]));
    parseExtractionOutput(generation.value, 8).forEach((candidate) => {
      candidate.sourceChunkIds.forEach((id) => { if (!chunkById.has(id)) throw new Error(`Unknown extraction source chunk reference: ${id}`); });
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
  const evidenceCharacters = input.material.chunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
  const target = Math.min(36, Math.max(12, Math.round(evidenceCharacters / 1_050)));
  const expectedRange = evidenceCharacters < 10_000
    ? { min: 1, max: 40 }
    : { min: Math.max(16, target - 10), max: Math.min(40, target + 4) };
  const prompt = consolidationPrompt(candidates, input.material.chunks, expectedRange);
  const request = {
    stage: "extraction", promptVersion: KNOWLEDGE_GENERATION_PROMPT_VERSION,
    schemaVersion: CONSOLIDATION_SCHEMA_VERSION, ...prompt, maxTokens: 8_000, temperature: 0.1
  } as const;
  const chunkById = new Map(input.material.chunks.map((chunk) => [chunk.id, chunk]));
  let correction = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const generation = await client.generateJson(correction ? { ...request, system: `${request.system}\nYour previous consolidation failed validation: ${correction}. Re-read the full evidence and return a complete corrected object.` } : request);
    executions.push(generation.metadata);
    try {
      const parsed = parseExtractionOutput(generation.value, 40);
      if (parsed.length < expectedRange.min || parsed.length > expectedRange.max) throw new Error(`Expected ${expectedRange.min}-${expectedRange.max} consolidated candidates, received ${parsed.length}`);
      const consolidated = parsed.map((candidate) => {
        candidate.sourceChunkIds.forEach((id) => { if (!chunkById.has(id)) throw new Error(`Unknown consolidated source chunk reference: ${id}`); });
        return {
          id: `global:${candidate.id}`, canonicalTitle: candidate.canonicalTitle, description: candidate.description,
          type: candidate.type, aliases: candidate.aliases, masteryCriteria: candidate.masteryCriteria,
          sourceRefs: uniqueSources(candidate.sourceChunkIds.flatMap((id) => chunkById.get(id)?.sources ?? []))
        };
      });
      const auditPrompt = atomicityAuditPrompt(consolidated, candidates, input.material.chunks);
      const auditGeneration = await client.generateJson({
        stage: "extraction", promptVersion: KNOWLEDGE_GENERATION_PROMPT_VERSION,
        schemaVersion: ATOMICITY_AUDIT_SCHEMA_VERSION, ...auditPrompt, maxTokens: 6_000, temperature: 0.1
      });
      executions.push(auditGeneration.metadata);
      const additions = parseExtractionOutput(auditGeneration.value, 14).map((candidate) => {
        candidate.sourceChunkIds.forEach((id) => { if (!chunkById.has(id)) throw new Error(`Unknown atomicity-audit source chunk reference: ${id}`); });
        return {
          id: `audit:${candidate.id}`, canonicalTitle: candidate.canonicalTitle, description: candidate.description,
          type: candidate.type, aliases: candidate.aliases, masteryCriteria: candidate.masteryCriteria,
          sourceRefs: uniqueSources(candidate.sourceChunkIds.flatMap((id) => chunkById.get(id)?.sources ?? []))
        };
      });
      const audited = deduplicateWithinIngestion([...consolidated, ...additions, ...candidates]).candidates;
      const admissionRange = evidenceCharacters < 10_000 ? { min: 1, max: 40 } : { min: Math.max(20, target - 4), max: Math.min(36, target + 4) };
      const admissionPrompt = candidateAdmissionPrompt(audited, admissionRange);
      const admission = await client.generateJson({
        stage: "extraction", promptVersion: KNOWLEDGE_GENERATION_PROMPT_VERSION,
        schemaVersion: CANDIDATE_ADMISSION_SCHEMA_VERSION, ...admissionPrompt, maxTokens: 2_000, temperature: 0
      });
      executions.push(admission.metadata);
      if (!admission.value || typeof admission.value !== "object" || !Array.isArray((admission.value as { acceptedCandidateIds?: unknown }).acceptedCandidateIds)) throw new Error("Candidate admission output must contain acceptedCandidateIds");
      const admittedIds = (admission.value as { acceptedCandidateIds: unknown[] }).acceptedCandidateIds.map((id, index) => {
        if (typeof id !== "string" || !id.trim()) throw new Error(`acceptedCandidateIds[${index}] must be a non-empty string`);
        return id.trim();
      });
      if (new Set(admittedIds).size !== admittedIds.length) throw new Error("Candidate admission output contains duplicate IDs");
      const auditedById = new Map(audited.map((candidate) => [candidate.id, candidate]));
      admittedIds.forEach((id) => { if (!auditedById.has(id)) throw new Error(`Candidate admission references unknown ID: ${id}`); });
      const admitted = admittedIds.map((id) => auditedById.get(id) as KnowledgeCandidate);
      if (admitted.length < admissionRange.min || admitted.length > admissionRange.max) throw new Error(`Candidate admission must retain ${admissionRange.min}-${admissionRange.max} candidates, received ${admitted.length}`);
      return { candidates: admitted, executions };
    } catch (error) {
      correction = error instanceof Error ? error.message : "consolidation validation violation";
      if (attempt === 2) throw error;
    }
  }
  throw new Error("Global extraction consolidation did not produce a valid candidate set");
}

export async function extractRelations(candidates: KnowledgeCandidate[], chunks: StructuredMaterialChunk[], client: StructuredGenerationClient) {
  const prompt = relationPrompt(candidates, chunks);
  const request = {
    stage: "relations", promptVersion: KNOWLEDGE_GENERATION_PROMPT_VERSION,
    schemaVersion: RELATION_SCHEMA_VERSION, ...prompt, maxTokens: 8_000, temperature: 0.1
  } as const;
  const executions: ModelExecutionMetadata[] = [];
  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  let correction = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const generation = await client.generateJson(correction ? { ...request, system: `${request.system}\nYour previous JSON failed validation: ${correction}. Return a complete corrected JSON object; do not omit IDs or fields, and remove conflicting/cyclic directed relations.` } : request);
    executions.push(generation.metadata);
    try {
      const parsed = parseRelationOutput(generation.value, new Set(candidates.map((candidate) => candidate.id)), new Set(chunkById.keys()));
      const extracted: CandidateKnowledgeRelation[] = parsed.map((relation) => {
        const sourceCandidateId = relation.type === "related" ? [relation.sourceCandidateId, relation.targetCandidateId].sort()[0] : relation.sourceCandidateId;
        const targetCandidateId = relation.type === "related" ? [relation.sourceCandidateId, relation.targetCandidateId].sort()[1] : relation.targetCandidateId;
        const common = {
          id: candidateRelationId(relation.type, sourceCandidateId, targetCandidateId), sourceCandidateId, targetCandidateId,
          reason: relation.reason, sourceRefs: uniqueSources(relation.evidenceChunkIds.flatMap((id) => chunkById.get(id)?.sources ?? []))
        };
        return relation.type === "prerequisite"
          ? { ...common, relation: "prerequisite", strength: relation.strength as "hard" | "soft" }
          : { ...common, relation: relation.type, strength: relation.strength as number };
      });
      const bySemanticId = new Map<string, CandidateKnowledgeRelation>();
      extracted.forEach((relation) => {
        const existing = bySemanticId.get(relation.id);
        bySemanticId.set(relation.id, existing
          ? { ...existing, sourceRefs: uniqueSources([...existing.sourceRefs, ...relation.sourceRefs]) }
          : relation);
      });
      const relations = Array.from(bySemanticId.values());
      validateCandidateGraph(candidates, relations);
      return { relations, executions };
    } catch (error) {
      correction = error instanceof Error ? error.message : "relation validation violation";
      if (attempt === 2) throw error;
    }
  }
  throw new Error("Relation extraction did not produce a valid graph");
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
        if (!/hard prerequisite order|directed graph contains a cycle/i.test(correction)) throw error;
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

export async function runKnowledgeGenerationPipeline(input: KnowledgeGenerationInput, client: StructuredGenerationClient): Promise<KnowledgeGenerationResult> {
  if (!input.ownerId.trim()) throw new Error("Authenticated owner identity is required");
  if (!input.material.chunks.length) throw new Error("CourseMaterial has no chunks to model");
  const extraction = await extractAtomicKnowledge(input, client);
  const deduplicated = deduplicateWithinIngestion(extraction.candidates);
  const candidates = deduplicated.candidates.map((candidate, index) => ({ ...candidate, id: `candidate-${String(index + 1).padStart(3, "0")}` }));
  if (!candidates.length) throw new Error("Knowledge extraction produced no valid candidates");
  const relationExtraction = await extractRelations(candidates, input.material.chunks, client);
  const curriculumGeneration = await generateCurriculum(candidates, relationExtraction.relations, input, client);
  return {
    courseId: input.courseId,
    ownerId: input.ownerId,
    sourceMaterialId: input.material.sourceMaterialId,
    candidates,
    duplicateCount: deduplicated.duplicateCount,
    relations: relationExtraction.relations,
    curriculum: curriculumGeneration.curriculum,
    executions: [...extraction.executions, ...relationExtraction.executions, ...curriculumGeneration.executions]
  };
}

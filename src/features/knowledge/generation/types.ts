import type { CurriculumCoverageRole } from "@/features/course/types";
import type { CourseMaterial, SourceLocation } from "@/features/material/parsing/types";
import type { KnowledgeNodeType } from "../types";

export type KnowledgeCandidate = {
  id: string;
  canonicalTitle: string;
  description: string;
  type: KnowledgeNodeType;
  aliases: string[];
  masteryCriteria: string[];
  sourceRefs: SourceLocation[];
};

type CandidateKnowledgeRelationBase = {
  id: string;
  sourceCandidateId: string;
  targetCandidateId: string;
  reason: string;
  sourceRefs: SourceLocation[];
};

export type CandidateKnowledgeRelation = CandidateKnowledgeRelationBase & (
  | { relation: "prerequisite"; strength: "hard" | "soft" }
  | { relation: "enables" | "related"; strength: number }
);

export type GeneratedCurriculumCoverage = {
  candidateId: string;
  role: CurriculumCoverageRole;
};

export type GeneratedCurriculumLesson = {
  id: string;
  title: string;
  coverages: GeneratedCurriculumCoverage[];
};

export type GeneratedCurriculumChapter = {
  id: string;
  title: string;
  description: string;
  outcome: string;
  lessons: GeneratedCurriculumLesson[];
};

export type GeneratedCurriculum = {
  chapters: GeneratedCurriculumChapter[];
};

export type GenerationStage = "extraction" | "deduplication" | "coverage" | "relations" | "curriculum";

export interface EmbeddingService {
  embed(text: string): Promise<number[]>;
}

export type CandidatePair = {
  id: string;
  leftCandidateId: string;
  rightCandidateId: string;
  similarity?: number;
  signals: Array<"embedding-neighbor" | "shared-provenance">;
};

export type GenerationDiagnostics = {
  embeddingRequestCount: number;
  semanticDedupCandidatePairCount: number;
  coverageAuditedSectionCount: number;
  coverageGapCount: number;
  allRelationPairCount: number;
  retrievedRelationPairCount: number;
  relationRetrievalReductionRatio: number;
  relationBatchCount: number;
  structuredRetryCount: number;
};

export type ModelExecutionMetadata = {
  stage: GenerationStage;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  requestId: string;
  generatedAt: string;
  temperature?: number;
  maxTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  validationWarnings?: string[];
};

export type StructuredGenerationRequest = {
  stage: GenerationStage;
  promptVersion: string;
  schemaVersion: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
};

export type StructuredGenerationResult = {
  value: unknown;
  metadata: ModelExecutionMetadata;
};

export interface StructuredGenerationClient {
  generateJson(request: StructuredGenerationRequest): Promise<StructuredGenerationResult>;
}

export type KnowledgeGenerationInput = {
  courseId: string;
  ownerId: string;
  material: CourseMaterial;
};

export type KnowledgeGenerationResult = {
  courseId: string;
  ownerId: string;
  sourceMaterialId: string;
  candidates: KnowledgeCandidate[];
  duplicateCount: number;
  relations: CandidateKnowledgeRelation[];
  curriculum: GeneratedCurriculum;
  executions: ModelExecutionMetadata[];
  relationCandidatePairs: CandidatePair[];
  diagnostics: GenerationDiagnostics;
};

export type CourseMaterialScope = {
  pdfPages?: { start: number; end: number };
};

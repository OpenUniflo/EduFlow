import type { CurriculumCoverageRole } from "@/features/course/types";
import type { KnowledgeNodeType } from "../types";

type JsonObject = Record<string, unknown>;

const NODE_TYPES = new Set<KnowledgeNodeType>(["conceptual", "procedural", "representational", "language", "meta"]);
const COVERAGE_ROLES = new Set<CurriculumCoverageRole>(["introduce", "reinforce", "apply", "assess"]);

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonObject;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function strings(value: unknown, label: string, allowEmpty = false): string[] {
  const result = array(value, label).map((item, index) => string(item, `${label}[${index}]`));
  if (!allowEmpty && !result.length) throw new Error(`${label} must not be empty`);
  return result;
}

export type ExtractedCandidateDto = {
  id: string;
  canonicalTitle: string;
  description: string;
  type: KnowledgeNodeType;
  aliases: string[];
  masteryCriteria: string[];
  sourceChunkIds: string[];
};

export function parseExtractionOutput(value: unknown, maxCandidates = 40): ExtractedCandidateDto[] {
  const root = object(value, "extraction output");
  const ids = new Set<string>();
  const candidates = array(root.candidates, "candidates");
  if (candidates.length > maxCandidates) throw new Error(`Extraction output exceeds the ${maxCandidates}-candidate schema limit`);
  return candidates.map((item, index) => {
    const candidate = object(item, `candidates[${index}]`);
    const id = string(candidate.id, `candidates[${index}].id`);
    if (ids.has(id)) throw new Error(`Duplicate extraction candidate id: ${id}`);
    ids.add(id);
    const type = string(candidate.type, `candidates[${index}].type`) as KnowledgeNodeType;
    if (!NODE_TYPES.has(type)) throw new Error(`Unsupported KnowledgeNode type: ${type}`);
    const aliases = strings(candidate.aliases ?? [], `candidates[${index}].aliases`, true);
    const masteryCriteria = strings(candidate.masteryCriteria, `candidates[${index}].masteryCriteria`);
    if (aliases.length > 6) throw new Error(`candidates[${index}].aliases exceeds 6 items`);
    if (masteryCriteria.length > 2) throw new Error(`candidates[${index}].masteryCriteria exceeds 2 items`);
    return {
      id,
      canonicalTitle: string(candidate.canonicalTitle, `candidates[${index}].canonicalTitle`),
      description: string(candidate.description, `candidates[${index}].description`),
      type,
      aliases,
      masteryCriteria,
      sourceChunkIds: strings(candidate.sourceChunkIds, `candidates[${index}].sourceChunkIds`)
    };
  });
}

export type ExtractedRelationDto = {
  sourceCandidateId: string;
  targetCandidateId: string;
  type: "prerequisite" | "enables" | "related";
  strength: "hard" | "soft" | number;
  reason: string;
  evidenceChunkIds: string[];
};

export function parseRelationOutput(value: unknown, candidateIds: Set<string>, chunkIds: Set<string>): ExtractedRelationDto[] {
  const root = object(value, "relation output");
  return array(root.relations, "relations").map((item, index) => {
    const relation = object(item, `relations[${index}]`);
    const sourceCandidateId = string(relation.sourceCandidateId, `relations[${index}].sourceCandidateId`);
    const targetCandidateId = string(relation.targetCandidateId, `relations[${index}].targetCandidateId`);
    if (!candidateIds.has(sourceCandidateId) || !candidateIds.has(targetCandidateId)) {
      throw new Error(`Unknown candidate reference: ${sourceCandidateId} -> ${targetCandidateId}`);
    }
    if (sourceCandidateId === targetCandidateId) throw new Error(`Self relation is not allowed: ${sourceCandidateId}`);
    const type = string(relation.type, `relations[${index}].type`);
    if (type !== "prerequisite" && type !== "enables" && type !== "related") throw new Error(`Unsupported relation type: ${type}`);
    const strength = relation.strength;
    if (type === "prerequisite") {
      if (strength !== "hard" && strength !== "soft") throw new Error(`Invalid prerequisite strength at relations[${index}]`);
    } else if (typeof strength !== "number" || !Number.isFinite(strength) || strength < 0 || strength > 1) {
      throw new Error(`Invalid associative strength at relations[${index}]`);
    }
    const evidenceChunkIds = strings(relation.evidenceChunkIds, `relations[${index}].evidenceChunkIds`);
    evidenceChunkIds.forEach((id) => { if (!chunkIds.has(id)) throw new Error(`Unknown evidence chunk reference: ${id}`); });
    return { sourceCandidateId, targetCandidateId, type, strength: strength as "hard" | "soft" | number, reason: string(relation.reason, `relations[${index}].reason`), evidenceChunkIds };
  });
}

export type GeneratedCurriculumDto = {
  chapters: Array<{
    id: string;
    title: string;
    description: string;
    outcome: string;
    lessons: Array<{ id: string; title: string; coverages: Array<{ candidateId: string; role: CurriculumCoverageRole }> }>;
  }>;
};

export function parseCurriculumOutput(value: unknown, candidateIds: Set<string>): GeneratedCurriculumDto {
  const root = object(value, "curriculum output");
  const seenChapterIds = new Set<string>();
  const seenLessonIds = new Set<string>();
  const chapters = array(root.chapters, "chapters").map((item, chapterIndex) => {
    const chapter = object(item, `chapters[${chapterIndex}]`);
    const id = string(chapter.id, `chapters[${chapterIndex}].id`);
    if (seenChapterIds.has(id)) throw new Error(`Duplicate generated Chapter id: ${id}`);
    seenChapterIds.add(id);
    const lessons = array(chapter.lessons, `chapters[${chapterIndex}].lessons`).map((lessonItem, lessonIndex) => {
      const lesson = object(lessonItem, `chapters[${chapterIndex}].lessons[${lessonIndex}]`);
      const lessonId = string(lesson.id, `chapters[${chapterIndex}].lessons[${lessonIndex}].id`);
      if (seenLessonIds.has(lessonId)) throw new Error(`Duplicate generated Lesson id: ${lessonId}`);
      seenLessonIds.add(lessonId);
      const coverages = array(lesson.coverages, `lessons[${lessonIndex}].coverages`).map((coverageItem, coverageIndex) => {
        const coverage = object(coverageItem, `coverages[${coverageIndex}]`);
        const candidateId = string(coverage.candidateId, `coverages[${coverageIndex}].candidateId`);
        if (!candidateIds.has(candidateId)) throw new Error(`Unknown curriculum candidate reference: ${candidateId}`);
        const role = string(coverage.role, `coverages[${coverageIndex}].role`) as CurriculumCoverageRole;
        if (!COVERAGE_ROLES.has(role)) throw new Error(`Unsupported CurriculumCoverage role: ${role}`);
        return { candidateId, role };
      });
      if (!coverages.length) throw new Error(`Generated Lesson has no Knowledge coverage: ${lessonId}`);
      return { id: lessonId, title: string(lesson.title, `lessons[${lessonIndex}].title`), coverages };
    });
    if (!lessons.length) throw new Error(`Generated Chapter has no Lessons: ${id}`);
    return {
      id,
      title: string(chapter.title, `chapters[${chapterIndex}].title`),
      description: string(chapter.description, `chapters[${chapterIndex}].description`),
      outcome: string(chapter.outcome, `chapters[${chapterIndex}].outcome`),
      lessons
    };
  });
  if (!chapters.length) throw new Error("Generated curriculum must contain at least one Chapter");
  return { chapters };
}

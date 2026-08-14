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

export type EquivalenceDecisionDto = { pairId: string; decision: "same" | "distinct"; reason: string };

export function parseEquivalenceOutput(value: unknown, requestedPairIds: Set<string>): EquivalenceDecisionDto[] {
  const root = object(value, "equivalence output");
  const seen = new Set<string>();
  const pairs = array(root.pairs, "pairs").map((item, index) => {
    const decision = object(item, `pairs[${index}]`);
    const pairId = string(decision.pairId, `pairs[${index}].pairId`);
    if (!requestedPairIds.has(pairId)) throw new Error(`Unknown equivalence pair: ${pairId}`);
    if (seen.has(pairId)) throw new Error(`Duplicate equivalence pair result: ${pairId}`);
    seen.add(pairId);
    const classification = string(decision.decision, `pairs[${index}].decision`);
    if (classification !== "same" && classification !== "distinct") throw new Error(`Invalid equivalence decision: ${classification}`);
    return { pairId, decision: classification, reason: string(decision.reason, `pairs[${index}].reason`) } as EquivalenceDecisionDto;
  });
  requestedPairIds.forEach((id) => { if (!seen.has(id)) throw new Error(`Missing equivalence pair result: ${id}`); });
  return pairs;
}

export type CoverageDecisionDto = { sectionId: string; status: "covered" | "missing"; missingCandidates: ExtractedCandidateDto[] };

export function parseCoverageOutput(value: unknown, requestedSectionIds: Set<string>, knownChunkIds: Set<string>): CoverageDecisionDto[] {
  const root = object(value, "coverage output");
  const seen = new Set<string>();
  const sections = array(root.sections, "sections").map((item, index) => {
    const decision = object(item, `sections[${index}]`);
    const sectionId = string(decision.sectionId, `sections[${index}].sectionId`);
    if (!requestedSectionIds.has(sectionId)) throw new Error(`Unknown coverage section: ${sectionId}`);
    if (seen.has(sectionId)) throw new Error(`Duplicate coverage section result: ${sectionId}`);
    seen.add(sectionId);
    const status = string(decision.status, `sections[${index}].status`);
    if (status !== "covered" && status !== "missing") throw new Error(`Invalid coverage status: ${status}`);
    const missingCandidates = parseExtractionOutput({ candidates: decision.missingCandidates ?? [] }, 8);
    if (status === "covered" && missingCandidates.length) throw new Error(`Covered section must not return missing candidates: ${sectionId}`);
    if (status === "missing" && !missingCandidates.length) throw new Error(`Missing section must return at least one candidate: ${sectionId}`);
    missingCandidates.forEach((candidate) => candidate.sourceChunkIds.forEach((id) => {
      if (!knownChunkIds.has(id)) throw new Error(`Unknown coverage source chunk reference: ${id}`);
    }));
    return { sectionId, status, missingCandidates } as CoverageDecisionDto;
  });
  requestedSectionIds.forEach((id) => { if (!seen.has(id)) throw new Error(`Missing coverage section result: ${id}`); });
  return sections;
}

export type PairClassificationLabel = "none" | "related" | "a_prerequisite_b" | "b_prerequisite_a" | "a_enables_b" | "b_enables_a";
export type PairClassificationDto = { pairId: string; label: PairClassificationLabel; strength: "hard" | "soft" | number | null; reason: string; evidenceChunkIds: string[] };

export function parsePairClassificationOutput(value: unknown, requestedPairIds: Set<string>, knownChunkIds: Set<string>): PairClassificationDto[] {
  const root = object(value, "pair classification output");
  const seen = new Set<string>();
  const validLabels = new Set<PairClassificationLabel>(["none", "related", "a_prerequisite_b", "b_prerequisite_a", "a_enables_b", "b_enables_a"]);
  const pairs = array(root.pairs, "pairs").map((item, index) => {
    const result = object(item, `pairs[${index}]`);
    const pairId = string(result.pairId, `pairs[${index}].pairId`);
    if (!requestedPairIds.has(pairId)) throw new Error(`Unknown relation candidate pair: ${pairId}`);
    if (seen.has(pairId)) throw new Error(`Duplicate relation candidate pair result: ${pairId}`);
    seen.add(pairId);
    const label = string(result.label, `pairs[${index}].label`) as PairClassificationLabel;
    if (!validLabels.has(label)) throw new Error(`Invalid relation pair label: ${label}`);
    const strength = result.strength ?? null;
    if (label.includes("prerequisite")) {
      if (strength !== "hard" && strength !== "soft") throw new Error(`Invalid prerequisite strength for pair: ${pairId}`);
    } else if (label === "related" || label.includes("enables")) {
      if (typeof strength !== "number" || !Number.isFinite(strength) || strength < 0 || strength > 1) throw new Error(`Invalid associative strength for pair: ${pairId}`);
    } else if (strength !== null) throw new Error(`NONE pair strength must be null: ${pairId}`);
    const evidenceChunkIds = strings(result.evidenceChunkIds ?? [], `pairs[${index}].evidenceChunkIds`, label === "none");
    evidenceChunkIds.forEach((id) => { if (!knownChunkIds.has(id)) throw new Error(`Unknown relation evidence chunk reference: ${id}`); });
    return { pairId, label, strength: strength as PairClassificationDto["strength"], reason: string(result.reason, `pairs[${index}].reason`), evidenceChunkIds };
  });
  requestedPairIds.forEach((id) => { if (!seen.has(id)) throw new Error(`Missing relation candidate pair result: ${id}`); });
  return pairs;
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

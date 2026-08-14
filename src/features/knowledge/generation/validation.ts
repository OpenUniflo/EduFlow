import type { KnowledgeGraph } from "../types";
import { validateKnowledgeGraph } from "../graph";
import { assertDirectedAcyclic } from "../graphAlgorithms";
import type { CandidateKnowledgeRelation, GeneratedCurriculum, KnowledgeCandidate } from "./types";

export function validateCandidateGraph(candidates: KnowledgeCandidate[], relations: CandidateKnowledgeRelation[]) {
  const createdAt = "1970-01-01T00:00:00.000Z";
  const graph: KnowledgeGraph = {
    nodes: candidates.map((candidate) => ({
      id: candidate.id,
      title: candidate.canonicalTitle,
      description: candidate.description,
      type: candidate.type,
      masteryCriteria: candidate.masteryCriteria,
      scope: "user",
      ownerId: "validation-owner",
      provenance: [{ sourceType: "material", sourceId: candidate.sourceRefs[0]?.sourceMaterialId ?? "missing" }],
      currentRevisionId: `${candidate.id}-revision`,
      status: "active"
    })),
    revisions: candidates.map((candidate) => ({
      id: `${candidate.id}-revision`, nodeId: candidate.id, version: 1, title: candidate.canonicalTitle,
      description: candidate.description, type: candidate.type, masteryCriteria: candidate.masteryCriteria, createdAt
    })),
    edges: relations.map((relation) => {
      const base = { id: relation.id, source: relation.sourceCandidateId, target: relation.targetCandidateId, reason: relation.reason };
      return relation.relation === "prerequisite"
        ? { ...base, relation: "prerequisite", strength: relation.strength }
        : { ...base, relation: relation.relation, strength: relation.strength };
    })
  };
  candidates.forEach((candidate) => {
    if (!candidate.sourceRefs.length) throw new Error(`Knowledge candidate has no provenance: ${candidate.id}`);
  });
  relations.forEach((relation) => {
    if (!relation.sourceRefs.length) throw new Error(`Knowledge relation has no provenance: ${relation.id}`);
  });
  validateKnowledgeGraph(graph);
  assertDirectedAcyclic(candidates.map((candidate) => candidate.id), relations
    .filter((relation) => relation.relation !== "related")
    .map((relation) => ({ source: relation.sourceCandidateId, target: relation.targetCandidateId })));
  return true;
}

export function validateGeneratedCurriculum(candidates: KnowledgeCandidate[], relations: CandidateKnowledgeRelation[], curriculum: GeneratedCurriculum) {
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const positions = new Map<string, number>();
  const primaryChapterByCandidate = new Map<string, string>();
  const coveragePairs = new Set<string>();
  let order = 0;
  curriculum.chapters.forEach((chapter) => chapter.lessons.forEach((lesson) => lesson.coverages.forEach((coverage) => {
    if (!candidateIds.has(coverage.candidateId)) throw new Error(`Curriculum references unknown Knowledge candidate: ${coverage.candidateId}`);
    const pair = `${lesson.id}:${coverage.candidateId}`;
    if (coveragePairs.has(pair)) throw new Error(`Duplicate CurriculumCoverage: ${pair}`);
    coveragePairs.add(pair);
    if (!positions.has(coverage.candidateId)) positions.set(coverage.candidateId, order);
    if (!primaryChapterByCandidate.has(coverage.candidateId)) primaryChapterByCandidate.set(coverage.candidateId, chapter.id);
    order += 1;
  })));
  candidateIds.forEach((id) => { if (!positions.has(id)) throw new Error(`Generated Knowledge is not covered by curriculum: ${id}`); });
  relations.filter((relation) => relation.relation === "prerequisite" && relation.strength === "hard").forEach((relation) => {
    if ((positions.get(relation.sourceCandidateId) ?? Number.MAX_SAFE_INTEGER) >= (positions.get(relation.targetCandidateId) ?? -1)) {
      throw new Error(`Curriculum violates hard prerequisite order: ${relation.sourceCandidateId} -> ${relation.targetCandidateId}`);
    }
  });
  const chapterEdges = new Map<string, { source: string; target: string }>();
  relations.filter((relation) => relation.relation !== "related").forEach((relation) => {
    const source = primaryChapterByCandidate.get(relation.sourceCandidateId);
    const target = primaryChapterByCandidate.get(relation.targetCandidateId);
    if (source && target && source !== target) chapterEdges.set(`${source}:${target}`, { source, target });
  });
  assertDirectedAcyclic(curriculum.chapters.map((chapter) => chapter.id), Array.from(chapterEdges.values()));
  return true;
}

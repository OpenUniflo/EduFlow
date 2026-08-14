import { describe, expect, it } from "vitest";
import nodesJson from "../../../../fixtures/phase4-agentic-ai/gold/knowledge/chapter-01/knowledge-nodes.json";
import relationsJson from "../../../../fixtures/phase4-agentic-ai/gold/knowledge/chapter-01/knowledge-relations.json";
import negativeJson from "../../../../fixtures/phase4-agentic-ai/gold/knowledge/chapter-01/negative-cases.json";
import { evaluateKnowledgeGeneration, type KnowledgeGold } from "./evaluation";
import type { KnowledgeGenerationResult } from "./types";

const source = { sourceMaterialId: "material", sourceType: "pdf" as const, rawBlockId: "raw", ordinal: 1, sectionPath: ["chapter"], page: 15 };
const gold: KnowledgeGold = {
  nodes: nodesJson.nodes.map(({ id, canonicalTitle, aliases }) => ({ id, canonicalTitle, aliases })),
  relations: relationsJson.relations.map((relation) => ({ from: relation.from, to: relation.to, type: relation.type as "prerequisite" | "enables" | "related" })),
  negativeCases: negativeJson.negativeNodeCases.map(({ text }) => ({ text }))
};

function perfectResult(): KnowledgeGenerationResult {
  const candidates = nodesJson.nodes.map((node) => ({ id: node.id, canonicalTitle: node.canonicalTitle, description: node.description, type: node.type as "conceptual" | "procedural" | "representational" | "language" | "meta", aliases: node.aliases, masteryCriteria: node.masteryCriteria, sourceRefs: [source] }));
  const relations = relationsJson.relations.map((relation, index) => ({
    id: `e${index}`, sourceCandidateId: relation.from, targetCandidateId: relation.to, relation: relation.type,
    strength: relation.type === "prerequisite" ? relation.strength as "hard" | "soft" : relation.weight as number,
    reason: relation.rationale, sourceRefs: [source]
  })) as KnowledgeGenerationResult["relations"];
  return { courseId: "course", ownerId: "user", sourceMaterialId: "material", candidates, duplicateCount: 0, relations,
    curriculum: { chapters: [{ id: "c", title: "Chapter", description: "desc", outcome: "outcome", lessons: [{ id: "l", title: "Lesson", coverages: candidates.map((candidate) => ({ candidateId: candidate.id, role: "introduce" })) }] }] }, executions: [] };
}

describe("Phase 4.2 Gold evaluator", () => {
  it("reports every required component metric without an aggregate score", () => {
    const evaluation = evaluateKnowledgeGeneration(perfectResult(), gold);
    expect(evaluation.metrics).toMatchObject({ expectedNodeRecall: 1, spuriousNodeRate: 0, negativeCaseViolationCount: 0, duplicateRateAfterNormalization: 0, prerequisiteInvalidEdgeCount: 0, prerequisiteCycleCount: 0, provenanceCompleteness: 1, curriculumKnowledgeCoverage: 1 });
    expect(evaluation.metrics.relations).toMatchObject({ prerequisite: { precision: 1, recall: 1 }, enables: { precision: 1, recall: 1 }, related: { precision: 1, recall: 1 } });
    expect(evaluation).not.toHaveProperty("aggregateScore");
  });

  it("uses aliases/semantic surfaces and surfaces spurious and negative candidates", () => {
    const result = perfectResult();
    result.candidates[0] = { ...result.candidates[0], canonicalTitle: result.candidates[0].aliases[0], aliases: [] };
    result.candidates.push({ ...result.candidates[0], id: "negative", canonicalTitle: "思考题", aliases: [], sourceRefs: [source] });
    result.curriculum.chapters[0].lessons[0].coverages.push({ candidateId: "negative", role: "introduce" });
    const evaluation = evaluateKnowledgeGeneration(result, gold);
    expect(evaluation.matching.decisions[0].signal).toBe("exact-title-or-alias");
    expect(evaluation.metrics.spuriousNodeRate).toBeGreaterThan(0);
    expect(evaluation.metrics.negativeCaseViolationCount).toBe(1);
  });
});

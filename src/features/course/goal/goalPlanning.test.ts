import { describe, expect, it } from "vitest";
import { computePrerequisiteClosure, matchCoursesToGoal, resolveGoalToKnowledge, type MatchableCourse } from "./goalPlanning";
import type { KnowledgeEdge, KnowledgeNode } from "@/features/knowledge/types";

const node = (id: string, title: string, description = title): KnowledgeNode => ({ id, title, description, type: "conceptual", masteryCriteria: ["criterion"], scope: "global", provenance: [], currentRevisionId: `${id}:r1`, status: "active" });
const nodes = [node("AGENT", "LLM Agent Architecture"), node("RAG", "Retrieval"), node("RERANK", "Reranking"), node("CITE", "Citation"), node("TOOL", "Function Calling"), node("MEMORY", "Long-term Memory"), node("DEEP", "Deep Learning - Rule vs Learning"), node("DOCKER", "Docker")];

function runtime(id: string, covered: string[], title = id, _targetOutcome?: string): MatchableCourse {
  return { id, title, lifecycle: "published", courseType: "standard", coveredKnowledgeIds: covered };
}

describe("Goal resolution", () => {
  it("resolves the Golden Agent goal to existing Knowledge identities", () => {
    const result = resolveGoalToKnowledge({ goalText: "开发包含 RAG、Tool Calling 和 Memory 的 AI Agent", visibleNodes: nodes, suggestedKnowledgeIds: ["RAG", "RERANK", "CITE", "TOOL", "MEMORY", "AGENT"] });
    expect(result.status).toBe("ready");
    expect(result.targetKnowledge.map((item) => item.id)).toEqual(["RAG", "RERANK", "CITE", "TOOL", "MEMORY", "AGENT"]);
  });

  it("returns no_match for a missing validated identity instead of inventing Knowledge", () => {
    expect(resolveGoalToKnowledge({ goalText: "量子引力实验设计", visibleNodes: nodes })).toMatchObject({ status: "no_match", targetKnowledge: [] });
  });

  it("does not reinterpret prose lexically when no structured identities are supplied", () => {
    const result = resolveGoalToKnowledge({ goalText: "Graph", visibleNodes: [node("A", "Graph A"), node("B", "Graph B")] });
    expect(result).toMatchObject({ status: "no_match", candidates: [] });
  });

  it("rejects a language-adapter Knowledge identity that is not visible", () => {
    expect(resolveGoalToKnowledge({ goalText: "Agent", visibleNodes: nodes, suggestedKnowledgeIds: ["INVENTED"] })).toMatchObject({ status: "no_match", reason: expect.stringContaining("INVENTED") });
  });

  it("resolves a cross-course goal for the medium-match customization path", () => {
    expect(resolveGoalToKnowledge({ goalText: "学习 Docker 和 Deep Learning", visibleNodes: nodes, suggestedKnowledgeIds: ["DEEP", "DOCKER"] }).targetKnowledge.map((item) => item.id)).toEqual(["DEEP", "DOCKER"]);
  });
});

describe("Prerequisite closure", () => {
  const prerequisite = (id: string, source: string, target: string): KnowledgeEdge => ({ id, source, target, relation: "prerequisite", strength: "hard", reason: "test" });
  it("separates recursive prerequisites from the target and deduplicates paths", () => {
    const closure = computePrerequisiteClosure(["C"], [prerequisite("ab", "A", "B"), prerequisite("bc", "B", "C"), prerequisite("ac", "A", "C")]);
    expect(closure).toEqual({ prerequisiteKnowledgeIds: ["A", "B"], cycleDetected: false, cycleNodeIds: [] });
  });

  it("ignores enables and related edges", () => {
    const edges: KnowledgeEdge[] = [
      { id: "enable", source: "A", target: "C", relation: "enables", strength: 0.8, reason: "test" },
      { id: "related", source: "A", target: "C", relation: "related", strength: 0.8, reason: "test" }
    ];
    expect(computePrerequisiteClosure(["C"], edges).prerequisiteKnowledgeIds).toEqual([]);
  });

  it("terminates and reports a prerequisite cycle", () => {
    const result = computePrerequisiteClosure(["C"], [prerequisite("ab", "A", "B"), prerequisite("ba", "B", "A"), prerequisite("bc", "B", "C")]);
    expect(result.cycleDetected).toBe(true);
    expect(result.cycleNodeIds).toEqual(["A", "B"]);
  });
});

describe("Course matching", () => {
  it("uses Knowledge scope, exposes gaps, and ignores title/targetOutcome similarity", () => {
    const matches = matchCoursesToGoal({ targetKnowledgeIds: ["TOOL", "MEMORY"], prerequisiteKnowledgeIds: ["AGENT"], courses: [
      runtime("complete", ["TOOL", "MEMORY", "AGENT"], "Unrelated title"),
      runtime("partial", ["TOOL", "AGENT"]),
      runtime("title-only", ["OTHER"], "Tool Memory Agent", "Tool Memory Agent")
    ] });
    expect(matches.map((match) => match.level)).toEqual(["high", "medium", "low"]);
    expect(matches[0]).toMatchObject({ courseId: "complete", targetCoverage: 1, requiredCoverage: 1, missingTargetKnowledgeIds: [] });
    expect(matches[1].missingTargetKnowledgeIds).toEqual(["MEMORY"]);
    expect(matches[2]).toMatchObject({ targetCoverage: 0, requiredCoverage: 0 });
  });

  it("can rate a route-only Course with null targetOutcome as high", () => {
    expect(matchCoursesToGoal({ targetKnowledgeIds: ["TOOL"], prerequisiteKnowledgeIds: [], courses: [runtime("route", ["TOOL"], "Route", undefined)] })[0].level).toBe("high");
  });

  it("prefers the focused route and does not label a broad route as highly matched", () => {
    const broadExtras = Array.from({ length: 20 }, (_, index) => `EXTRA-${index}`);
    const matches = matchCoursesToGoal({ targetKnowledgeIds: ["TOOL"], prerequisiteKnowledgeIds: ["AGENT"], courses: [
      runtime("broad", ["TOOL", "AGENT", ...broadExtras]),
      runtime("focused", ["TOOL", "AGENT"])
    ] });
    expect(matches.map((match) => match.courseId)).toEqual(["focused", "broad"]);
    expect(matches[0]).toMatchObject({ level: "high", scopePrecision: 1 });
    expect(matches[1]).toMatchObject({ level: "medium", extraKnowledgeIds: [...broadExtras].sort() });
  });
});

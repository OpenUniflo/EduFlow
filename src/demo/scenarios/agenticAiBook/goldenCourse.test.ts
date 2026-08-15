import { describe, expect, it } from "vitest";
import { demoGlobalKnowledgeGraph } from "@/demo/knowledge/demoGlobalKnowledgeGraph.fixture";
import { demoWorkflowTemplates } from "@/demo/workflows/demoWorkflowTemplates";
import { InMemoryKnowledgeRepository } from "@/features/knowledge/repository/InMemoryKnowledgeRepository";
import { globalKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { validateCourseRuntime } from "@/features/course/runtime/courseRuntime";
import { goldenAgenticAiRuntime, validateGoldenAgenticAiRuntime } from "./goldenCourse.seed";

describe("Agentic AI Golden Course fixture", () => {
  it("keeps fixed statistics and generic runtime invariants", () => {
    expect(validateGoldenAgenticAiRuntime()).toBe(true);
    expect(() => validateCourseRuntime(goldenAgenticAiRuntime, new InMemoryKnowledgeRepository(demoGlobalKnowledgeGraph), globalKnowledgeAccess)).not.toThrow();
    expect(goldenAgenticAiRuntime.chapters).toHaveLength(6);
    expect(new Set(goldenAgenticAiRuntime.curriculumCoverages.map((item) => item.nodeId)).size).toBe(31);
    expect(goldenAgenticAiRuntime.assignments).toHaveLength(37);
  });
  it("resolves workflows and Final Project composition", () => {
    const templates = new Set(demoWorkflowTemplates.map((item) => item.id));
    expect(goldenAgenticAiRuntime.assignments.filter((item) => item.mode === "workflow").every((item) => item.workflowTemplateId && templates.has(item.workflowTemplateId))).toBe(true);
    expect(goldenAgenticAiRuntime.finalProjectOutcomeCompositions).toHaveLength(6);
  });
});

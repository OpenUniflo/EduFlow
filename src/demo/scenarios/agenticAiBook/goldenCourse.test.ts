import { describe, expect, it } from "vitest";
import { demoGlobalKnowledgeGraph } from "@/demo/knowledge/demoGlobalKnowledgeGraph.fixture";
import { demoWorkflowTemplates } from "@/demo/workflows/demoWorkflowTemplates";
import { InMemoryKnowledgeRepository } from "@/features/knowledge/repository/InMemoryKnowledgeRepository";
import { globalKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { validateCourseRuntime } from "@/features/course/runtime/courseRuntime";
import { auditCourseAssetCoverage, courseAssetCoverageLabel } from "@/features/course/runtime/courseAssetCoverage";
import { goldenAgenticAiRuntime, validateGoldenAgenticAiRuntime } from "./goldenCourse.seed";
import { demoUserCourseStateSeed } from "@/demo/users/demoUserCourseState.seed";

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
    expect(new Set(goldenAgenticAiRuntime.assignments.map((item) => item.experience?.type))).toEqual(new Set(["answer", "code", "trace", "workflow"]));
    expect(goldenAgenticAiRuntime.assignmentDependencies.some((item) => item.sourceAssignmentId === "golden-knowledge-assignment-WF03" && item.targetAssignmentId === "golden-knowledge-assignment-W13")).toBe(true);
  });
  it("reports real Golden asset coverage instead of a fixed completeness claim", () => {
    const audit = auditCourseAssetCoverage(goldenAgenticAiRuntime);
    expect(audit.assignments).toMatchObject({ coveredKnowledgeCount: 31, missingKnowledgeCount: 0 });
    expect(audit.materials).toMatchObject({ coveredKnowledgeCount: 5, missingKnowledgeCount: 26 });
    expect(courseAssetCoverageLabel(audit)).toBe("学习资产待补充");
  });
  it("injects late-project learning state without changing Course definitions", () => {
    const state = demoUserCourseStateSeed("student", goldenAgenticAiRuntime.course.id);
    expect([1,2,3,4,5].map((order) => state.assignmentStates[`golden-chapter-assignment-${order}`]?.status)).toEqual(["completed","completed","completed","completed","completed"]);
    expect(state.assignmentStates["golden-chapter-assignment-6"]?.status).toBe("in-progress");
    expect("progress" in goldenAgenticAiRuntime.chapters[0]).toBe(false);
  });
  it("rejects dangling, self-referencing, or cyclic Golden Assignment dependencies",()=>{
    const invalid=structuredClone(goldenAgenticAiRuntime);
    invalid.assignmentDependencies.push({id:"invalid-self",courseId:invalid.course.id,sourceAssignmentId:invalid.assignments[0].id,targetAssignmentId:invalid.assignments[0].id,strength:"hard"});
    expect(()=>validateGoldenAgenticAiRuntime(invalid)).toThrow(/invalid AssignmentDependency/);
    const cyclic=structuredClone(goldenAgenticAiRuntime);
    const existing=cyclic.assignmentDependencies.find((item)=>item.id==="golden-knowledge-dependency-applicability-team")!;
    cyclic.assignmentDependencies.push({id:"invalid-cycle",courseId:cyclic.course.id,sourceAssignmentId:existing.targetAssignmentId,targetAssignmentId:existing.sourceAssignmentId,strength:"hard"});
    expect(()=>validateGoldenAgenticAiRuntime(cyclic)).toThrow(/must be a DAG/);
  });
});

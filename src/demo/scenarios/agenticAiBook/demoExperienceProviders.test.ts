import { describe, expect, it } from "vitest";
import { demoLessonAssistantProvider } from "./lessonAssistantScripts";
import { goldenMaterials } from "./goldenCourse.seed";
import { demoWorkflowAssessmentProvider } from "./workflowAssessment";
import { demoCourseCreationScenarioResolver } from "./scenario";
import { agenticAiNativeMaterials } from "@/demo/courses/agenticAiRuntime.seed";

describe("Agentic AI Demo experience providers",()=>{
  it("prioritizes failure intent over the generic word 案例 and supports honest fallback",()=>{
    const material=goldenMaterials[0];
    expect(demoLessonAssistantProvider.resolveText(material,"增加一个 Worker 超时案例").mutation?.id).toBe("timeout");
    expect(demoLessonAssistantProvider.resolveText(material,"随便重写所有内容").fallback).toBe(true);
  });
  it("exposes Golden lesson scripts only to Golden Article materials",()=>{
    const goldenArticle=goldenMaterials[0];
    const oldAgenticArticle=agenticAiNativeMaterials.find((material)=>material.type==="article")!;
    expect(demoLessonAssistantProvider.listActions(goldenArticle)).not.toHaveLength(0);
    expect(demoLessonAssistantProvider.listActions(oldAgenticArticle)).toEqual([]);
    expect(demoLessonAssistantProvider.listActions({...goldenArticle,id:"other-article",courseId:"other-course"})).toEqual([]);
    expect(demoLessonAssistantProvider.listActions({...goldenArticle,id:"golden-pdf",type:"pdf"})).toEqual([]);
  });
  it("scopes the fixed assessment to the exact launch context",()=>{
    expect(demoWorkflowAssessmentProvider.resolve({courseId:"agentic-ai-golden",assignmentId:"golden-chapter-assignment-6",workflowTemplateId:"multi-agent-workflow"})?.score).toBe(86);
    expect(demoWorkflowAssessmentProvider.resolve({courseId:"another-course",assignmentId:"golden-chapter-assignment-6",workflowTemplateId:"multi-agent-workflow"})).toBeNull();
  });
  it("uses the documented filename fallback and rejects unrelated PDFs",async()=>{
    expect((await demoCourseCreationScenarioResolver.resolve([new File(["not-the-book"],"AI-Agents-in-Depth-zh-CN(2).pdf",{type:"application/pdf"})]))?.courseId).toBe("agentic-ai-golden");
    expect(await demoCourseCreationScenarioResolver.resolve([new File(["other"],"unrelated.pdf",{type:"application/pdf"})])).toBeNull();
  });
});

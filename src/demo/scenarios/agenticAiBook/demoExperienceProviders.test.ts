import { describe, expect, it } from "vitest";
import { demoLessonAssistantProvider } from "./lessonAssistantScripts";
import { goldenMaterials } from "./goldenCourse.seed";
import { demoWorkflowAssessmentProvider } from "./workflowAssessment";
import { demoCourseCreationScenarioResolver } from "./scenario";
import { agenticAiNativeMaterials } from "@/demo/courses/agenticAiRuntime.seed";
import { demoCourseDesignAssistantProvider } from "./courseDesignAssistantScripts";
import type { CourseDesignAssistantContext } from "@/features/course/courseDesignAssistant";

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
  it("scopes Course Design Assistant scripts to the Golden Course",()=>{
    const context:CourseDesignAssistantContext={
      kind:"knowledge",key:"knowledge:WF03",courseId:"agentic-ai-golden",courseTitle:"Golden",label:"Orchestrator-Worker Workflow",nodeId:"WF03",chapterTitle:"Multi-Agent Workflow",predecessors:["Agent Team","Agent Skill Contract"],successors:[],relatedMaterials:[{id:"golden-parallel-lesson",title:"并行执行与结果汇合"},{id:"golden-failure-lesson",title:"故障、验证与终止"}],relatedAssignments:["构建 Orchestrator-Worker"],materialCoverageCount:2
    };
    expect(demoCourseDesignAssistantProvider.getActions(context).map((action)=>action.label)).toContain("检查课件覆盖");
    const response=demoCourseDesignAssistantProvider.resolveAction(context,"material-coverage").message;
    expect(response).toContain("并行执行与结果汇合");
    expect(response).toContain("故障、验证与终止");
    expect(demoCourseDesignAssistantProvider.resolveText(context,"完全开放的问题").fallback).toBe(true);
    expect(demoCourseDesignAssistantProvider.getActions({...context,courseId:"agentic-ai"})).toEqual([]);
  });
});

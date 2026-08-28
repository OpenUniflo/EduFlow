import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { demoMicroLearningProvider } from "@/demo/learning/demoMicroLearningProvider";
import {
  canCompleteMicroLesson,
  createMicroLearningNavigation,
  isMicroInteractionCorrect,
  resolveMicroLearningReturnTarget,
  firstMicroReviewStep,
  nextMicroReviewStep,
  isMicroReviewSubmissionCorrect,
  type MicroLearningPath,
  type MicroStep
} from "./microLearning";

describe("Micro Learning navigation", () => {
  it("replays required steps locally without changing persisted completion", () => {
    const path:MicroLearningPath = { id:"path",knowledgeId:"knowledge",scope:"global",title:"Review",estimatedMinutes:2,mode:"learn",required:true,status:"published",units:[
      {id:"optional",pathId:"path",title:"Optional",position:0,estimatedMinutes:1,required:false,steps:[{id:"skip",kind:"summary",title:"Skip",body:"Skip"}]},
      {id:"required",pathId:"path",title:"Required",position:1,estimatedMinutes:1,required:true,steps:[{id:"first",kind:"interaction",title:"First",body:"First",interaction:{type:"choice",options:["yes","no"],correctIndex:0}},{id:"last",kind:"summary",title:"Last",body:"Last"}]}
    ]};
    expect(firstMicroReviewStep(path)).toEqual({unitId:"required",stepId:"first"});
    expect(nextMicroReviewStep(path,{unitId:"required",stepId:"first"})).toEqual({unitId:"required",stepId:"last"});
    expect(nextMicroReviewStep(path,{unitId:"required",stepId:"last"})).toBeNull();
    expect(isMicroReviewSubmissionCorrect(path.units[1].steps[0].interaction,"yes")).toBe(true);
    const completedH5p={kind:"h5p-result" as const,contentRef:"h5p/review",eventId:"review-1",result:{completed:true,success:false}};
    expect(isMicroReviewSubmissionCorrect({type:"h5p",contentRef:"h5p/review",completionPolicy:"completed"},completedH5p)).toBe(true);
    expect(isMicroReviewSubmissionCorrect({type:"h5p",contentRef:"h5p/review",completionPolicy:"passed"},completedH5p)).toBe(false);
    expect(isMicroReviewSubmissionCorrect({type:"h5p",contentRef:"h5p/other"},completedH5p)).toBe(false);
  });
  it("carries Learning Home as the explicit return target", () => {
    expect(createMicroLearningNavigation("AG01", { courseId: "agentic-ai", returnTo: "/" })).toEqual({
      to: "/learn/micro/AG01?courseId=agentic-ai",
      state: { returnTo: "/" }
    });
    const learningPage = readFileSync(join(process.cwd(), "src/features/learning/pages/LearningPage.tsx"), "utf8");
    expect(learningPage).toContain('createMicroLearningNavigation(current.knowledgeId,{courseId,returnTo:"/"})');
  });

  it("carries the current Course route as the explicit return target", () => {
    expect(createMicroLearningNavigation("AG01", { courseId: "agentic-ai", returnTo: "/courses/agentic-ai" })).toEqual({
      to: "/learn/micro/AG01?courseId=agentic-ai",
      state: { returnTo: "/courses/agentic-ai" }
    });
    expect(resolveMicroLearningReturnTarget({ returnTo: "/courses/agentic-ai/chapters/chapter-1?mode=knowledge" }, "agentic-ai"))
      .toBe("/courses/agentic-ai/chapters/chapter-1?mode=knowledge");
    const coursePage = readFileSync(join(process.cwd(), "src/features/course/pages/CourseGraphPage.tsx"), "utf8");
    expect(coursePage).toContain("returnTo:`${location.pathname}${location.search}`");
  });

  it("uses deterministic safe fallbacks for refreshes and rejects external targets", () => {
    expect(resolveMicroLearningReturnTarget(undefined, "agentic-ai")).toBe("/courses/agentic-ai");
    expect(resolveMicroLearningReturnTarget(undefined)).toBe("/");
    expect(resolveMicroLearningReturnTarget({ returnTo: "https://evil.example.com" }, "agentic-ai")).toBe("/courses/agentic-ai");
    expect(resolveMicroLearningReturnTarget({ returnTo: "//evil.example.com" })).toBe("/");
    expect(resolveMicroLearningReturnTarget({ returnTo: "/\\evil.example.com" })).toBe("/");
  });

  it("exposes executable Micro navigation only for Provider-supported knowledge", () => {
    expect(demoMicroLearningProvider.getLesson("AG01", { courseId: "agentic-ai-golden" })).not.toBeNull();
    expect(demoMicroLearningProvider.getLesson("CDS525-K056", { courseId: "cds525-deep-learning" })).toBeNull();

    const coursePage = readFileSync(join(process.cwd(), "src/features/course/pages/CourseGraphPage.tsx"), "utf8");
    expect(coursePage).toContain("selectedMicroLesson ? <button");
    expect(coursePage).toContain("microLearningProvider?.getLesson(nodeId,{courseId:runtime.course.id})");
  });

  it("renders an honest unsupported deep-link fallback inside the Micro page", () => {
    const source = readFileSync(join(process.cwd(), "src/features/learning/micro/MicroLearningExperience.tsx"), "utf8");
    expect(source).toContain('className="micro-unsupported"');
    expect(source).toContain("该知识暂不支持快速学习");
    expect(source).toContain("返回来源");
  });
});

describe("Micro Learning assessment integrity", () => {
  it("grades every supported interaction by its actual answer semantics", () => {
    expect(isMicroInteractionCorrect({ type: "choice", options: ["wrong", "right"], correctIndex: 1 }, "wrong")).toBe(false);
    expect(isMicroInteractionCorrect({ type: "choice", options: ["wrong", "right"], correctIndex: 1 }, "right")).toBe(true);
    expect(isMicroInteractionCorrect({ type: "multiple-choice", options: ["a", "b", "c"], correctIndexes: [0, 2] }, [2, 0])).toBe(true);
    expect(isMicroInteractionCorrect({ type: "multiple-choice", options: ["a", "b", "c"], correctIndexes: [0, 2] }, [0])).toBe(false);
    expect(isMicroInteractionCorrect({ type: "multiple-choice", options: ["a", "b", "c"], correctIndexes: [0, 2] }, [0, 1, 2])).toBe(false);
    expect(isMicroInteractionCorrect({ type: "fill-blank", answers: ["Tool Call"] }, " tool call ")).toBe(true);
    expect(isMicroInteractionCorrect({ type: "fill-blank", answers: ["Tool Call"], caseSensitive: true }, "tool call")).toBe(false);
    expect(isMicroInteractionCorrect({ type: "ordering", items: ["a", "b"], correctOrder: ["a", "b"] }, ["b", "a"])).toBe(false);
    expect(isMicroInteractionCorrect({ type: "ordering", items: ["a", "b"], correctOrder: ["a", "b"] }, ["a", "b"])).toBe(true);
    expect(isMicroInteractionCorrect({ type: "trace", steps: [{ id: "a", label: "A" }, { id: "b", label: "B" }], correctStepId: "b" }, "a")).toBe(false);
    expect(isMicroInteractionCorrect({ type: "trace", steps: [{ id: "a", label: "A" }, { id: "b", label: "B" }], correctStepId: "b" }, "b")).toBe(true);
    expect(isMicroInteractionCorrect({ type: "mini-workflow", nodes: ["a", "b"], correctOrder: ["a", "b"] }, ["b", "a"])).toBe(false);
    expect(isMicroInteractionCorrect({ type: "mini-workflow", nodes: ["a", "b"], correctOrder: ["a", "b"] }, ["a", "b"])).toBe(true);
  });

  it("permits lesson completion only after every required step completed", () => {
    const steps = [{ id: "one" }, { id: "two" }] as MicroStep[];
    expect(canCompleteMicroLesson(steps, new Set())).toBe(false);
    expect(canCompleteMicroLesson(steps, new Set(["one"]))).toBe(false);
    expect(canCompleteMicroLesson(steps, new Set(["one", "two"]))).toBe(true);
  });

  it("keeps Assistant actions separate from grading and persisted progress writes", () => {
    const source = readFileSync(join(process.cwd(), "src/features/learning/micro/MicroLearningExperience.tsx"), "utf8");
    const assistant = source.slice(source.indexOf("<EduFlowAssistant"));
    expect(assistant).toContain("microPathId:path.id");
    expect(assistant).toContain("microStepId:step.id");
    expect(assistant).not.toMatch(/setGradingFeedback|completeCurrent\(/);
    expect(source).toContain("repository.completeStep(path.id, unit.id, step.id");
    expect(source).toContain("refreshLearnerState(session.userId)");
  });

  it("keeps completed-path review local and leaves first completion persistence unchanged", () => {
    const source = readFileSync(join(process.cwd(), "src/features/learning/micro/MicroLearningExperience.tsx"), "utf8");
    const reviewBranch=source.slice(source.indexOf("if(reviewCursor)"),source.indexOf("setBusy(true)",source.indexOf("if(reviewCursor)")));
    expect(reviewBranch).toContain("isMicroReviewSubmissionCorrect");
    expect(reviewBranch).not.toContain("repository.completeStep");
    expect(reviewBranch).not.toContain("refreshLearnerState");
    expect(source).toContain("repository.completeStep(path.id, unit.id, step.id");
    expect(source).toContain("主动复习不会清空进度、重复完成证据或降低学习状态");
  });

  it("does not expose the deferred fake Matching interaction in Golden lessons", () => {
    const demoProvider = readFileSync(join(process.cwd(), "src/demo/learning/demoMicroLearningProvider.ts"), "utf8");
    expect(demoProvider).not.toMatch(/type:\s*["']matching["']/);
  });

  it("keeps the production Micro composition root database-backed without a Demo fallback", () => {
    const services = readFileSync(join(process.cwd(), "src/app/services/applicationServices.ts"), "utf8");
    const runtime = readFileSync(join(process.cwd(), "src/features/learning/micro/ApiMicroLearningRepository.ts"), "utf8");
    expect(services).toContain("new ApiMicroLearningRepository()");
    expect(services).not.toContain("demoMicroLearningProvider");
    expect(runtime).not.toMatch(/(?:@\/demo|src\/demo|demoMicroLearningProvider)/);
  });
});

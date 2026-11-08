import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { syntheticMicroProvider } from "../../../../tests/fixtures/micro";
import {
  canCompleteMicroLesson,
  createMicroLearningNavigation,
  isMicroInteractionCorrect,
  resolveMicroLearningReturnTarget,
  resolveDisplayedMicroStep,
  firstMicroReviewStep,
  previousMicroReviewStep,
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
    expect(previousMicroReviewStep(path,{unitId:"required",stepId:"first"})).toBeNull();
    expect(previousMicroReviewStep(path,{unitId:"required",stepId:"last"})).toEqual({unitId:"required",stepId:"first"});
    expect(firstMicroReviewStep(path)).toEqual({unitId:"required",stepId:"first"});
    expect(nextMicroReviewStep(path,{unitId:"required",stepId:"first"})).toEqual({unitId:"required",stepId:"last"});
    expect(nextMicroReviewStep(path,{unitId:"required",stepId:"last"})).toBeNull();
    expect(isMicroReviewSubmissionCorrect(path.units[1].steps[0].interaction,"yes")).toBe(true);
    const completedH5p={kind:"h5p-result" as const,contentRef:"h5p/review",eventId:"review-1",result:{completed:true,success:false}};
    expect(isMicroReviewSubmissionCorrect({type:"h5p",contentRef:"h5p/review",completionPolicy:"completed"},completedH5p)).toBe(true);
    expect(isMicroReviewSubmissionCorrect({type:"h5p",contentRef:"h5p/review",completionPolicy:"passed"},completedH5p)).toBe(false);
    expect(isMicroReviewSubmissionCorrect({type:"h5p",contentRef:"h5p/other"},completedH5p)).toBe(false);
  });
  it("keeps Learning Home as the return target and opens simple Micro in the conversation", () => {
    expect(createMicroLearningNavigation("syn-a", { courseId: "fixture-course-alpha", returnTo: "/" })).toEqual({
      to: "/learn/micro/syn-a?courseId=fixture-course-alpha",
      state: { returnTo: "/" }
    });
    const learningPage = readFileSync(join(process.cwd(), "src/features/learning/pages/LearningPage.tsx"), "utf8");
    expect(learningPage).toContain("microHost.open({\n      pathId: step.pathId");
    expect(learningPage).not.toContain('kind: "micro-opened"');
    expect(learningPage).not.toContain("recordAction");
  });

  it("carries the current Course route as the explicit return target", () => {
    expect(createMicroLearningNavigation("syn-a", { courseId: "fixture-course-alpha", returnTo: "/courses/fixture-course-alpha" })).toEqual({
      to: "/learn/micro/syn-a?courseId=fixture-course-alpha",
      state: { returnTo: "/courses/fixture-course-alpha" }
    });
    expect(resolveMicroLearningReturnTarget({ returnTo: "/courses/fixture-course-alpha/chapters/fixture-chapter?mode=knowledge" }, "fixture-course-alpha"))
      .toBe("/courses/fixture-course-alpha/chapters/fixture-chapter?mode=knowledge");
    const coursePage = readFileSync(join(process.cwd(), "src/features/course/immersive/CourseImmersivePage.tsx"), "utf8");
    expect(coursePage).toContain("returnTo: `${location.pathname}${location.search}`");
  });

  it("uses deterministic safe fallbacks for refreshes and rejects external targets", () => {
    expect(resolveMicroLearningReturnTarget(undefined, "fixture-course-alpha")).toBe("/courses/fixture-course-alpha");
    expect(resolveMicroLearningReturnTarget(undefined)).toBe("/");
    expect(resolveMicroLearningReturnTarget({ returnTo: "https://evil.example.com" }, "fixture-course-alpha")).toBe("/courses/fixture-course-alpha");
    expect(resolveMicroLearningReturnTarget({ returnTo: "//evil.example.com" })).toBe("/");
    expect(resolveMicroLearningReturnTarget({ returnTo: "/\\evil.example.com" })).toBe("/");
  });

  it("exposes executable Micro navigation only for Provider-supported knowledge", () => {
    expect(syntheticMicroProvider.getLesson("syn-a", { courseId: "fixture-course-alpha" })).not.toBeNull();
    expect(syntheticMicroProvider.getLesson("missing-node", { courseId: "fixture-course-alpha" })).toBeNull();

    const coursePage = readFileSync(join(process.cwd(), "src/features/course/immersive/CourseImmersivePage.tsx"), "utf8");
    expect(coursePage).toContain("selectedStageKnowledge && selectedMicro ? <button");
    expect(coursePage).toContain("microLearningProvider?.getLesson(selectedStageKnowledge.id, { courseId })");
  });

  it("renders an honest unsupported deep-link fallback inside the Micro page", () => {
    const source = readFileSync(join(process.cwd(), "src/features/learning/micro/MicroLearningExperience.tsx"), "utf8");
    expect(source).toContain('className="micro-unsupported"');
    expect(source).toContain("该知识暂不支持小练习");
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
    const assistant = source.slice(source.indexOf("<EduFlowAssistant"),source.indexOf("function MicroStepPanel"));
    expect(assistant).toMatch(/microPathId:\s*path\.id/);
    expect(assistant).toMatch(/microStepId:\s*step\.id/);
    expect(assistant).not.toMatch(/setGradingFeedback|completeCurrent\(/);
    expect(source).toContain("repository.completeStep(path.id,unitId,stepId");
    expect(source).toContain("refreshLearnerState(session.userId)");
  });

  it("keeps completed-path review local and leaves first completion persistence unchanged", () => {
    const source = readFileSync(join(process.cwd(), "src/features/learning/micro/MicroLearningExperience.tsx"), "utf8");
    const reviewBranch=source.slice(source.indexOf("if(review){"),source.indexOf("inFlight.current=true"));
    expect(reviewBranch).toContain("isMicroReviewSubmissionCorrect");
    expect(reviewBranch).not.toContain("repository.completeStep");
    expect(reviewBranch).not.toContain("refreshLearnerState");
    expect(source).toContain("repository.completeStep(path.id,unitId,stepId");
    expect(source).toContain("MicroStepList");
    expect(source).toContain("setReviewCursor({ unitId, stepId })");
    expect(source).not.toContain("micro-card micro-complete");
  });

  it("keeps the production Micro composition root database-backed without a Demo fallback", () => {
    const services = readFileSync(join(process.cwd(), "src/app/services/applicationServices.ts"), "utf8");
    const runtime = readFileSync(join(process.cwd(), "src/features/learning/micro/ApiMicroLearningRepository.ts"), "utf8");
    expect(services).toContain("new ApiMicroLearningRepository()");
    expect(services).not.toContain("demoMicroLearningProvider");
    expect(runtime).not.toMatch(/(?:@\/demo|src\/demo|demoMicroLearningProvider)/);
  });
});

describe("displayed step pinning", () => {
  const path: MicroLearningPath = { id: "path", knowledgeId: "knowledge", scope: "global", title: "Pin", estimatedMinutes: 2, mode: "learn", required: true, status: "published", units: [
    { id: "unit-1", pathId: "path", title: "One", position: 0, estimatedMinutes: 1, required: true, steps: [
      { id: "step-1", kind: "interaction", title: "One", body: "One" },
      { id: "step-2", kind: "interaction", title: "Two", body: "Two" }
    ] },
    { id: "unit-2", pathId: "path", title: "Two", position: 1, estimatedMinutes: 1, required: true, steps: [
      { id: "step-3", kind: "interaction", title: "Three", body: "Three" }
    ] }
  ] };
  it("keeps the submitted step while persisted progress has already advanced", () => {
    const displayed = resolveDisplayedMicroStep(path, path.units[1], path.units[1].steps[0], { unitId: "unit-1", stepId: "step-1" });
    expect(displayed.unit?.id).toBe("unit-1");
    expect(displayed.step?.id).toBe("step-1");
  });
  it("falls back to the resume step after continue or when the pin is stale", () => {
    expect(resolveDisplayedMicroStep(path, path.units[1], path.units[1].steps[0], null).step?.id).toBe("step-3");
    const stale = resolveDisplayedMicroStep(path, path.units[1], path.units[1].steps[0], { unitId: "unit-1", stepId: "missing" });
    expect(stale.unit?.id).toBe("unit-1");
    expect(stale.step).toBeUndefined();
  });
});

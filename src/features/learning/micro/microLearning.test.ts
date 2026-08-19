import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { demoMicroLearningProvider } from "@/demo/learning/demoMicroLearningProvider";
import {
  canCompleteMicroLesson,
  createMicroLearningNavigation,
  isMicroInteractionCorrect,
  resolveMicroLearningReturnTarget,
  type MicroStep
} from "./microLearning";

describe("Micro Learning navigation", () => {
  it("carries Learning Home as the explicit return target", () => {
    expect(createMicroLearningNavigation("AG01", { courseId: "agentic-ai", returnTo: "/" })).toEqual({
      to: "/learn/micro/AG01?courseId=agentic-ai",
      state: { returnTo: "/" }
    });
    const learningPage = readFileSync(join(process.cwd(), "src/features/learning/pages/LearningPage.tsx"), "utf8");
    expect(learningPage).toMatch(/createMicroLearningNavigation\(current\.knowledgeId,\{courseId:current\.courseId,returnTo:"\/"\}\)/);
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

  it("keeps Assistant actions separate from grading, advancement, and activity writes", () => {
    const source = readFileSync(join(process.cwd(), "src/features/learning/micro/MicroLearningExperience.tsx"), "utf8");
    const assistant = source.slice(source.indexOf("<EduFlowAssistant"));
    expect(assistant).toContain("setAssistantMessage");
    expect(assistant).not.toMatch(/setGradingFeedback|advance\(|recordMicroLearningActivity/);
    expect(source).toMatch(/canCompleteMicroLesson\(resolvedLesson\.steps,completedIds\).*recordMicroLearningActivity/s);
  });

  it("does not expose the deferred fake Matching interaction in Golden lessons", () => {
    const demoProvider = readFileSync(join(process.cwd(), "src/demo/learning/demoMicroLearningProvider.ts"), "utf8");
    expect(demoProvider).not.toMatch(/type:\s*["']matching["']/);
  });
});

import { describe, expect, it } from "vitest";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { NavigationDecision } from "@/shared/learning/navigation";
import { deriveHomeNavigation, deriveHomeView, resolveHomeNextStep, shouldShowStarter } from "./homeMainline";
import { applyMainlineNext } from "@/shared/learning/mainlineNext";

const runtime = {
  course: { id: "course-a", title: "课程 A" },
  assignments: [{ id: "task-r10", title: "跑通最小 ReAct 循环", estimatedMinutes: 15 }],
  materials: []
} as unknown as CourseRuntimeData;

const decision = {
  courseId: "course-a",
  decisionId: "d1",
  decidedAt: "2026-11-08T00:00:00.000Z",
  policyVersion: "course-rule-v6",
  skippedNodeIds: [],
  path: [{ nodeId: "R10", title: "ReAct（正式标题）", state: "underway", blockedBy: [] }],
  nextAction: { kind: "next", nodeId: "R10", resourceKind: "micro", resourceId: "path-r10", reasonCode: "continue", reason: "继续" }
} as NavigationDecision;

describe("home three states", () => {
  it("is fresh only without a conversation and learning record", () => {
    expect(deriveHomeView({ hasLearningRecord: false, hasConversation: false })).toBe("fresh");
  });
  it("is learning while a conversation is active or after Continue", () => {
    expect(deriveHomeView({ hasLearningRecord: false, hasConversation: true })).toBe("learning");
    expect(deriveHomeView({ hasLearningRecord: true, hasConversation: true, resumed: true })).toBe("learning");
  });
  it("is returning when learning records exist and the learner has not resumed", () => {
    expect(deriveHomeView({ hasLearningRecord: true, hasConversation: true })).toBe("returning");
    expect(deriveHomeView({ hasLearningRecord: true, hasConversation: false })).toBe("returning");
  });
});

describe("progressive navigation", () => {
  it("starts with Home only", () => {
    expect(deriveHomeNavigation({ isTeacher: false, isAdmin: false, signals: { hasLearningRecord: false, hasPracticeActivity: false, hasFirstSegmentComplete: false } })).toEqual(["home"]);
  });
  it("adds works, records and map from real signals in order", () => {
    expect(deriveHomeNavigation({ isTeacher: false, isAdmin: false, signals: { hasLearningRecord: false, hasPracticeActivity: true, hasFirstSegmentComplete: false } })).toEqual(["home", "works"]);
    expect(deriveHomeNavigation({ isTeacher: false, isAdmin: false, signals: { hasLearningRecord: true, hasPracticeActivity: true, hasFirstSegmentComplete: false } })).toEqual(["home", "works", "records"]);
    expect(deriveHomeNavigation({ isTeacher: false, isAdmin: false, signals: { hasLearningRecord: true, hasPracticeActivity: true, hasFirstSegmentComplete: true } })).toEqual(["home", "works", "records", "archive"]);
  });
  it("always shows the full set to teachers and admins", () => {
    expect(deriveHomeNavigation({ isTeacher: true, isAdmin: false, signals: { hasLearningRecord: false, hasPracticeActivity: false, hasFirstSegmentComplete: false } })).toEqual(["home", "archive", "works", "records", "teaching"]);
    expect(deriveHomeNavigation({ isTeacher: false, isAdmin: true, signals: { hasLearningRecord: false, hasPracticeActivity: false, hasFirstSegmentComplete: false } })).toEqual(["home", "archive", "works", "records", "teaching", "admin"]);
  });
});

describe("single next step source", () => {
  it("projects the navigation decision and never guesses a first pending item", () => {
    expect(resolveHomeNextStep({ decision: undefined, runtime })).toBeNull();
    expect(resolveHomeNextStep({ decision, runtime })).toMatchObject({ title: "ReAct（正式标题）", nodeId: "R10" });
    expect(resolveHomeNextStep({ decision: { ...decision, courseId: "other" }, runtime })).toBeNull();
    expect(resolveHomeNextStep({ decision, runtime, microTitle: "ReAct：结果怎样改变下一步", microMinutes: 7 })).toEqual({
      courseId: "course-a",
      courseTitle: "课程 A",
      kind: "micro",
      title: "ReAct：结果怎样改变下一步",
      minutes: 7,
      nodeId: "R10",
      knowledgeId: "R10",
      pathId: "path-r10"
    });
  });
  it("keeps the first segment's task ahead of a later navigation Micro", () => {
    const segment = {
      steps: [],
      completedCount: 3,
      totalMinutes: 34,
      started: true,
      complete: false,
      currentStep: { id: "practice:task-r10", kind: "practice" as const, nodeId: "R10", assignmentId: "task-r10", title: "跑通最小 ReAct 循环", minutes: 15, status: "now" as const }
    };
    const mainlineDecision = applyMainlineNext(decision, segment);
    expect(mainlineDecision.nextAction).toMatchObject({ resourceKind: "assignment", resourceId: "task-r10", nodeId: "R10" });
    expect(resolveHomeNextStep({ decision: mainlineDecision, runtime, microTitle: "Harness" })).toMatchObject({
      kind: "practice",
      title: "跑通最小 ReAct 循环",
      assignmentId: "task-r10",
      nodeId: "R10"
    });
    expect(resolveHomeNextStep({ decision: applyMainlineNext(decision, { ...segment, complete: true }), runtime, microTitle: "Harness" })).toMatchObject({
      kind: "micro",
      title: "Harness",
      pathId: "path-r10"
    });
  });
  it("maps an assignment decision to the real assignment title", () => {
    const assignmentDecision = { ...decision, nextAction: { kind: "next", nodeId: "R10", resourceKind: "assignment", resourceId: "task-r10", reasonCode: "continue", reason: "继续" } } as NavigationDecision;
    expect(resolveHomeNextStep({ decision: assignmentDecision, runtime })?.title).toBe("跑通最小 ReAct 循环");
    expect(resolveHomeNextStep({ decision: assignmentDecision, runtime })?.assignmentId).toBe("task-r10");
  });
});

describe("starter visibility", () => {
  it("requires both a configured Course and an unstarted segment", () => {
    expect(shouldShowStarter({ configuredCourseId: null, hasCourse: false, segmentStarted: false })).toBe(false);
    expect(shouldShowStarter({ configuredCourseId: "course-a", hasCourse: false, segmentStarted: false })).toBe(false);
    expect(shouldShowStarter({ configuredCourseId: "course-a", hasCourse: true, segmentStarted: true })).toBe(false);
    expect(shouldShowStarter({ configuredCourseId: "course-a", hasCourse: true, segmentStarted: false })).toBe(true);
  });
});

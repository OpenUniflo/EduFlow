import { describe, expect, it } from "vitest";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { NavigationDecision } from "@/shared/learning/navigation";
import { deriveHomeNavigation, deriveHomeView, resolveHomeNextStep, routeStripLabel, shouldShowStarter } from "./homeMainline";
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

describe("home two states", () => {
  it("is fresh only without a conversation and learning record", () => {
    expect(deriveHomeView({ hasLearningRecord: false, hasConversation: false })).toBe("fresh");
  });
  it("lands directly in the conversation whenever any history exists", () => {
    expect(deriveHomeView({ hasLearningRecord: false, hasConversation: true })).toBe("conversation");
    expect(deriveHomeView({ hasLearningRecord: true, hasConversation: true })).toBe("conversation");
  });
  it("starts a new conversation with the next step when records exist without a conversation", () => {
    expect(deriveHomeView({ hasLearningRecord: true, hasConversation: false })).toBe("conversation");
  });
});

describe("fixed navigation", () => {
  it("always shows the learner set in a fixed order, independent of learning state", () => {
    expect(deriveHomeNavigation({ isTeacher: false, isAdmin: false })).toEqual(["home", "works", "records", "archive"]);
  });
  it("keeps the learner set and appends role workspaces for teachers and admins", () => {
    expect(deriveHomeNavigation({ isTeacher: true, isAdmin: false })).toEqual(["home", "works", "records", "archive", "teaching"]);
    expect(deriveHomeNavigation({ isTeacher: false, isAdmin: true })).toEqual(["home", "works", "records", "archive", "teaching", "admin"]);
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

describe("route strip progress label", () => {
  it("keeps the first-segment denominator until the segment completes", () => {
    expect(routeStripLabel({ complete: false, completedCount: 3, steps: [1, 2, 3, 4] }, { learnedCount: 3, nodeIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] })).toBe("第一段 3/4");
  });

  it("switches to the course route after the first segment completes", () => {
    expect(routeStripLabel({ complete: true, completedCount: 4, steps: [1, 2, 3, 4] }, { learnedCount: 4, nodeIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] })).toBe("路线 4/10");
    expect(routeStripLabel({ complete: true, completedCount: 4, steps: [1, 2, 3, 4] }, null)).toBe("路线 4/4");
    expect(routeStripLabel(null)).toBe("");
  });
});

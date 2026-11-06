import { describe, expect, it } from "vitest";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import { NAVIGATION_POLICY_VERSION, type NavigationDecision } from "@/shared/learning/navigation";
import { nextLearningLabel, resolveNextLearningSummary } from "./nextLearning";

const runtime = {
  course: { id: "course" },
  assignments: [{ id: "assignment", estimatedMinutes: 20 }],
  materials: [{ id: "material", duration: "12 分钟" }]
} as unknown as CourseRuntimeData;
const decision: NavigationDecision = {
  decisionId: "d", decidedAt: "2026-01-01", policyVersion: NAVIGATION_POLICY_VERSION, courseId: "course",
  path: [{ nodeId: "node", title: "下一个知识", state: "eligible", blockedBy: [] }], skippedNodeIds: [],
  nextAction: { kind: "next", nodeId: "node", resourceKind: "micro", resourceId: "path", reasonCode: "begin_required_micro", reason: "" }
};

describe("next learning summary", () => {
  it("uses the navigation target title and real Micro duration", () => {
    const summary = resolveNextLearningSummary({ decision, runtime, microMinutes: () => 8 });
    expect(summary).toEqual({ title: "下一个知识", minutes: 8 });
    expect(nextLearningLabel(summary)).toBe("下一步「下一个知识」 · 约 8 分钟");
  });
  it("reads Assignment and Material durations from the selected resource", () => {
    expect(resolveNextLearningSummary({ decision: { ...decision, nextAction: { ...decision.nextAction, resourceKind: "assignment", resourceId: "assignment" } }, runtime })).toEqual({ title: "下一个知识", minutes: 20 });
    expect(resolveNextLearningSummary({ decision: { ...decision, nextAction: { ...decision.nextAction, resourceKind: "material", resourceId: "material" } }, runtime })).toEqual({ title: "下一个知识", minutes: 12 });
  });
  it("shows no label when the decision is missing, foreign, or has no knowledge", () => {
    expect(resolveNextLearningSummary({ decision: null, runtime })).toBeNull();
    expect(resolveNextLearningSummary({ decision: { ...decision, courseId: "other" }, runtime })).toBeNull();
    expect(resolveNextLearningSummary({ decision: { ...decision, nextAction: { ...decision.nextAction, nodeId: undefined, resourceKind: "course" } }, runtime })).toBeNull();
    expect(nextLearningLabel(null)).toBe("");
  });
  it("does not invent a duration or title", () => {
    expect(resolveNextLearningSummary({ decision, runtime, microMinutes: () => undefined })).toEqual({ title: "下一个知识" });
    expect(resolveNextLearningSummary({ decision: { ...decision, path: [] }, runtime })).toBeNull();
  });
});

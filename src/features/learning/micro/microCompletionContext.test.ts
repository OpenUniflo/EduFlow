import { describe, expect, it } from "vitest";
import { routeOnlyRuntime } from "@/features/course/runtime/courseFoundation.fixture";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import { NAVIGATION_POLICY_VERSION, type NavigationDecision } from "@/shared/learning/navigation";
import { resolveMicroCompletionContext } from "./microCompletionContext";
import { resolveMicroLearningReturnTarget } from "./microLearning";

const runtime: CourseRuntimeData = {
  ...routeOnlyRuntime,
  curriculumCoverages: [...routeOnlyRuntime.curriculumCoverages, { ...routeOnlyRuntime.curriculumCoverages[0], id: "next-coverage", nodeId: "next", order: 1 }],
  materials: [{ id: "book", courseId: routeOnlyRuntime.course.id, title: "Book", type: "pdf", order: 0, segments: [{ id: "page-1", order: 0 }, { id: "page-15", order: 1 }] }],
  materialKnowledgeCoverages: [
    { id: "example", materialId: "book", segmentId: "page-1", nodeId: "route-knowledge", role: "example" },
    { id: "intro", materialId: "book", segmentId: "page-15", nodeId: "route-knowledge", role: "introduce" }
  ],
  assignments: [{ id: "practice", courseId: routeOnlyRuntime.course.id, order: 0, title: "Practice", description: "", requirements: [], expectedOutput: "", acceptanceCriteria: [], mode: "instruction" }],
  assignmentCoverages: [{ id: "practice-coverage", assignmentId: "practice", nodeId: "route-knowledge", role: "apply", required: true }]
};
const decision: NavigationDecision = { decisionId: "decision", decidedAt: "2026-09-09", policyVersion: NAVIGATION_POLICY_VERSION, courseId: runtime.course.id, path: [{ nodeId: "next", title: "Next Knowledge", state: "eligible", blockedBy: [] }], skippedNodeIds: [], nextAction: { kind: "next", resourceKind: "micro", nodeId: "next", resourceId: "path-identity", reasonCode: "begin_required_micro", reason: "" } };
const input = { knowledgeId: "route-knowledge", runtime, decision, hasMicro: () => true };

describe("Micro optional completion context", () => {
  it("resolves exact role-prioritized Material, optional Practice and canonical next Knowledge", () => {
    expect(resolveMicroCompletionContext(input)).toEqual([
      { kind: "material", title: "Book", href: "/courses/route-only-course/materials/book?segment=page-15" },
      { kind: "practice", title: "Practice", href: "/courses/route-only-course/assignments/practice" },
      { kind: "next", title: "Next Knowledge", href: "/learn/micro/next?courseId=route-only-course" }
    ]);
  });
  it("has no fabricated context for standalone or an unrelated Course", () => {
    expect(resolveMicroCompletionContext({ ...input, runtime: undefined })).toEqual([]);
    expect(resolveMicroCompletionContext({ ...input, knowledgeId: "unrelated" })).toEqual([]);
  });
  it("continues into the exact Material Segment when Navigation selects Material teaching", () => {
    const materialRuntime = { ...runtime, materialKnowledgeCoverages: [...runtime.materialKnowledgeCoverages, { ...runtime.materialKnowledgeCoverages[1], id: "next-material", nodeId: "next" }] };
    const materialDecision = { ...decision, nextAction: { ...decision.nextAction, resourceKind: "material" as const, resourceId: "book" } };
    expect(resolveMicroCompletionContext({ ...input, runtime: materialRuntime, decision: materialDecision }).find((action) => action.kind === "next")).toEqual({ kind: "next", title: "Next Knowledge", href: "/courses/route-only-course/materials/book?segment=page-15" });
  });
  it("omits absent assets, unavailable Micro, and completed or foreign decisions", () => {
    expect(resolveMicroCompletionContext({ ...input, runtime: routeOnlyRuntime, decision: null })).toEqual([]);
    expect(resolveMicroCompletionContext({ ...input, hasMicro: () => false }).some((action) => action.kind === "next")).toBe(false);
    expect(resolveMicroCompletionContext({ ...input, decision: { ...decision, courseId: "other" } }).some((action) => action.kind === "next")).toBe(false);
    expect(resolveMicroCompletionContext({ ...input, decision: { ...decision, nextAction: { ...decision.nextAction, nodeId: undefined, resourceKind: "course" } } }).some((action) => action.kind === "next")).toBe(false);
  });
  it("returns to the same Micro and retains its own source without accepting external redirects", () => {
    const returnTo = "/learn/micro/route-knowledge?courseId=route-only-course";
    expect(resolveMicroLearningReturnTarget({ returnTo }, runtime.course.id)).toBe(returnTo);
    expect(resolveMicroLearningReturnTarget({ returnTo: "https://other.example" }, runtime.course.id)).toBe("/courses/route-only-course");
  });
});

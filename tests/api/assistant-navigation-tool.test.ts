import type { SupabaseClient, User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigationDecision = vi.hoisted(() => vi.fn());
vi.mock("../../api/_lib/navigationDecision.js", () => ({ readNavigationDecision: navigationDecision }));

import { createAssistantTools } from "../../api/_lib/assistantTools";
import { ApiError } from "../../api/_lib/http";

type Row = Record<string, unknown>;

const rows: Record<string, Row[]> = {
  profiles: [{ id: "learner-a", role: "student" }],
  courses: [
    { id: "visible-course", title: "Visible Course", lifecycle: "published" },
    { id: "draft-course", title: "Draft Course", lifecycle: "draft" }
  ],
  course_assignments: [{ id: "task-r10", course_id: "visible-course", title: "Run the ReAct loop" }]
};

function clientFor() {
  return {
    from(table: string) {
      let selected = [...(rows[table] ?? [])];
      const result = () => Promise.resolve({ data: selected, error: null });
      const builder = {
        select: () => builder,
        eq: (key: string, value: unknown) => { selected = selected.filter((row) => row[key] === value); return builder; },
        limit: () => builder,
        maybeSingle: () => result().then(({ data, error }) => ({ data: data[0] ?? null, error })),
        then: <TResult1 = { data: Row[] | null; error: null }, TResult2 = never>(onfulfilled?: ((value: { data: Row[] | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) => result().then(onfulfilled, onrejected)
      };
      return builder;
    }
  } as unknown as SupabaseClient;
}

const user = { id: "learner-a" } as User;
const decision = {
  decisionId: "decision-1",
  policyVersion: "course-rule-v6",
  nextAction: { kind: "next", nodeId: "K-A02", resourceKind: "micro", resourceId: "path-a02", reasonCode: "begin_required_micro", reason: "从该 Knowledge 的必修 Micro 开始。" },
  path: [{ nodeId: "K-A02", title: "A02", state: "eligible", blockedBy: [] }]
};

async function execute(context: Record<string, unknown>, input: unknown) {
  const candidate = createAssistantTools(clientFor(), user, context as never).getNavigationDecision as { execute: (input: unknown, options: unknown) => Promise<unknown> };
  return candidate.execute(input, { toolCallId: "test", messages: [] });
}

describe("Assistant Navigation Engine tool boundary", () => {
  beforeEach(() => {
    navigationDecision.mockReset();
    navigationDecision.mockResolvedValue(decision);
  });

  it("returns the deterministic decision for the authenticated learner and the page Course", async () => {
    expect(await execute({ workspace: "course", experienceMode: "learn", courseId: "visible-course" }, {})).toMatchObject({
      status: "ready",
      courseId: "visible-course",
      courseTitle: "Visible Course",
      decisionId: "decision-1",
      nextAction: decision.nextAction,
      authority: "deterministic-navigation-engine"
    });
    expect(navigationDecision).toHaveBeenCalledWith(expect.anything(), "learner-a", "visible-course");
  });

  it("reports the shared first-segment Assignment action with its real title", async () => {
    navigationDecision.mockResolvedValueOnce({
      ...decision,
      nextActionSource: "first_segment",
      nextAction: { kind: "practice", nodeId: "R10", resourceKind: "assignment", resourceId: "task-r10", reasonCode: "complete_required_assignment", reason: "要点已经学过，接下来动手做一次。" },
      path: [{ nodeId: "R10", title: "R10", state: "learned", blockedBy: [] }]
    });
    expect(await execute({ workspace: "learning", experienceMode: "learn", courseId: "visible-course" }, {})).toMatchObject({
      status: "ready",
      nextActionSource: "first_segment",
      nextAction: { kind: "practice", resourceKind: "assignment", resourceId: "task-r10", title: "Run the ReAct loop" }
    });
  });

  it("accepts an explicit server-validated courseId", async () => {
    expect(await execute({ workspace: "explore", experienceMode: "learn" }, { courseId: "visible-course" })).toMatchObject({ status: "ready" });
    expect(navigationDecision).toHaveBeenCalledWith(expect.anything(), "learner-a", "visible-course");
  });

  it("rejects an invisible Course instead of reading or inventing its next step", async () => {
    expect(await execute({ workspace: "explore", experienceMode: "learn" }, { courseId: "draft-course" })).toMatchObject({ status: "course_not_available", courseId: "draft-course" });
    expect(navigationDecision).not.toHaveBeenCalled();
  });

  it("rejects a Course whose navigation read is not permitted", async () => {
    navigationDecision.mockRejectedValueOnce(new ApiError(404, "published_course_not_found", "Published Course is unavailable"));
    expect(await execute({ workspace: "explore", experienceMode: "learn" }, { courseId: "visible-course" })).toMatchObject({ status: "course_not_available" });
  });

  it("without Course context, asks for one and offers only readable published Courses", async () => {
    expect(await execute({ workspace: "explore", experienceMode: "learn" }, {})).toMatchObject({
      status: "course_required",
      courses: [{ id: "visible-course", title: "Visible Course", lifecycle: "published" }]
    });
    expect(navigationDecision).not.toHaveBeenCalled();
  });
});

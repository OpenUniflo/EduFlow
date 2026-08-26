import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createUserSupabase = vi.hoisted(() => vi.fn());
const createServerSupabase = vi.hoisted(() => vi.fn());
const planLearningGoal = vi.hoisted(() => vi.fn());
const useExistingCourse = vi.hoisted(() => vi.fn());
const createPersonalCourse = vi.hoisted(() => vi.fn());
vi.mock("../../api/_lib/supabase.js", () => ({ createUserSupabase, createServerSupabase }));
vi.mock("../../api/_lib/goalPlanningService.js", () => ({
  planLearningGoal,
  useExistingCourse,
  createPersonalCourse,
  goalPlanSummary: () => "Structured Goal summary"
}));

import handler from "../../api/assistant";

const context = { workspace: "explore", experienceMode: "learn" };
const plan = { resolution: { status: "ready", goalText: "Agent", targetKnowledge: [{ id: "A", title: "Agent", description: "Agent" }], candidates: [] }, prerequisiteKnowledge: [], prerequisiteCycleDetected: false, matches: [] };

function client() {
  const writes: Array<{ table: string; value: unknown }> = [];
  return { writes, from(table: string) {
    let inserted: unknown;
    const builder = {
      insert: (value: unknown) => { inserted = value; writes.push({ table, value }); return builder; },
      select: () => builder,
      update: (value: unknown) => { writes.push({ table, value }); return builder; },
      eq: () => builder,
      single: async () => ({ data: table === "assistant_sessions" ? { id: "session-1", user_id: "learner" } : inserted, error: null }),
      then: <TResult1 = { data: null; error: null }>(onfulfilled?: ((value: { data: null; error: null }) => TResult1 | PromiseLike<TResult1>) | null) => Promise.resolve({ data: null, error: null }).then(onfulfilled)
    };
    return builder;
  } };
}

function recorder() {
  let status = 0; let body: unknown;
  const response = { status(code: number) { status = code; return response; }, json(value: unknown) { body = value; return response; }, setHeader: vi.fn() } as unknown as VercelResponse;
  return { response, status: () => status, body: () => body };
}

describe("Assistant structured Goal actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const database = client();
    createUserSupabase.mockResolvedValue({ client: database, user: { id: "learner" } });
    createServerSupabase.mockReturnValue({ rpc: vi.fn() });
    planLearningGoal.mockResolvedValue(plan);
    useExistingCourse.mockResolvedValue({ courseId: "standard-course", match: { courseTitle: "Standard Course" } });
    createPersonalCourse.mockResolvedValue({ courseId: "personal-course", plan });
  });

  it("returns a product-owned Goal plan through the existing Assistant endpoint", async () => {
    const result = recorder();
    await handler({ method: "POST", headers: {}, query: {}, body: { action: "plan-goal", goalText: "Agent", context } } as unknown as VercelRequest, result.response);
    expect(result.status()).toBe(200);
    expect(result.body()).toMatchObject({ sessionId: "session-1", plan: { resolution: { status: "ready" } } });
    expect(planLearningGoal).toHaveBeenCalledWith(expect.anything(), "Agent");
  });

  it("uses the same existing Course identity after explicit selection", async () => {
    const result = recorder();
    await handler({ method: "POST", headers: {}, query: {}, body: { action: "use-existing-course", goalText: "Agent", courseId: "standard-course", context } } as unknown as VercelRequest, result.response);
    expect(result.status()).toBe(200);
    expect(result.body()).toMatchObject({ courseId: "standard-course" });
  });

  it("creates a Personal Course only for the explicit confirmation action", async () => {
    const result = recorder();
    await handler({ method: "POST", headers: {}, query: {}, body: { action: "create-personal-course", goalText: "Agent", sourceCourseId: "standard-course", context } } as unknown as VercelRequest, result.response);
    expect(result.status()).toBe(201);
    expect(result.body()).toMatchObject({ courseId: "personal-course" });
    expect(createPersonalCourse).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ id: "learner" }), { goalText: "Agent", sourceCourseId: "standard-course" });
  });
});

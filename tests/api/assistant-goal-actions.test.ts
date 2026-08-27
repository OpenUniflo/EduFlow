import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createUserSupabase = vi.hoisted(() => vi.fn());
const planLearningGoal = vi.hoisted(() => vi.fn());
const useExistingCourse = vi.hoisted(() => vi.fn());
const resolveGoalLanguage = vi.hoisted(() => vi.fn());
vi.mock("../../api/_lib/supabase.js", () => ({ createUserSupabase }));
vi.mock("../../api/_lib/goalPlanningService.js", () => ({
  planLearningGoal, useExistingCourse, createPersonalCourse: vi.fn(), goalPlanSummary: () => "Structured Goal summary"
}));
vi.mock("../../api/_lib/goalLanguageAdapter.js", () => ({ resolveGoalLanguage }));

import handler from "../../api/assistant";

const context = { workspace: "explore", experienceMode: "learn" };
const plan = { resolution: { status: "ready", goalText: "Agent", targetKnowledge: [{ id: "A", title: "Agent", description: "Agent" }], candidates: [] }, prerequisiteKnowledge: [], prerequisiteCycleDetected: false, matches: [{ courseId: "standard-course", courseTitle: "Standard Course", courseType: "standard", targetCoverage: 1, requiredCoverage: 1, missingTargetKnowledgeIds: [], missingPrerequisiteKnowledgeIds: [], extraKnowledgeIds: [], level: "high", recommendation: "use_existing" }] };

function database() {
  const writes: Array<{ table: string; value: any }> = [];
  const sessions = new Map<string, any>([["session-1", { id: "session-1", user_id: "learner", title: "Goal", created_at: "2026-08-27T00:00:00Z", updated_at: "2026-08-27T00:00:00Z" }]]);
  const messages = new Map<string, any>();
  let sequence = 0;
  const db = { writes, sessions, messages, from(table: string) {
    let inserted: any; const filters = new Map<string, unknown>();
    const builder: any = {
      insert: (value: any) => { inserted = value; writes.push({ table, value }); return builder; },
      select: () => builder, update: (value: any) => { writes.push({ table, value }); return builder; },
      eq: (key: string, value: unknown) => { filters.set(key, value); return builder; }, order: () => builder, limit: () => builder,
      maybeSingle: async () => {
        if (table === "assistant_sessions") return { data: sessions.get(String(filters.get("id"))) ?? null, error: null };
        if (table === "assistant_messages") return { data: messages.get(String(filters.get("id"))) ?? null, error: null };
        return { data: null, error: null };
      },
      single: async () => {
        if (table === "assistant_sessions") return { data: sessions.get("session-1"), error: null };
        if (table === "assistant_messages") {
          const row = { id: `message-${++sequence}`, created_at: `2026-08-27T00:00:0${sequence}Z`, ...inserted };
          messages.set(row.id, row); return { data: row, error: null };
        }
        return { data: inserted, error: null };
      },
      then: <TResult1 = { data: any; error: null }>(onfulfilled?: ((value: { data: any; error: null }) => TResult1 | PromiseLike<TResult1>) | null) => {
        let data: any = null;
        if (table === "assistant_messages" && inserted == null) data = [];
        if (table === "assistant_messages" && Array.isArray(inserted)) {
          data = inserted.map((value) => { const row = { id: `message-${++sequence}`, created_at: `2026-08-27T00:00:${String(sequence).padStart(2, "0")}Z`, ...value }; messages.set(row.id, row); return row; });
        }
        return Promise.resolve({ data, error: null }).then(onfulfilled);
      }
    };
    return builder;
  } };
  return db;
}

function recorder() {
  let status = 0; let body: any;
  const response = { status(code: number) { status = code; return response; }, json(value: unknown) { body = value; return response; }, setHeader: vi.fn() } as unknown as VercelResponse;
  return { response, status: () => status, body: () => body };
}

async function request(db: ReturnType<typeof database>, body: Record<string, unknown>) {
  createUserSupabase.mockResolvedValue({ client: db, user: { id: "learner" } });
  const result = recorder();
  await handler({ method: "POST", headers: {}, query: {}, body: { context, ...body } } as unknown as VercelRequest, result.response);
  return result;
}

function seedPlanningMessage(db: ReturnType<typeof database>, id = "planning-message") {
  db.messages.set(id, { id, session_id: "session-1", role: "assistant", content: "plan", context_snapshot: context, created_at: "2026-08-27T00:00:00Z", structured_content: { type: "course_search", schemaVersion: 1, planningId: "planning-1", goalText: "Agent", intentSummary: "Build an agent", plan } });
  return id;
}

function structuredCards(db: ReturnType<typeof database>) {
  return db.writes
    .filter((write) => write.table === "assistant_messages")
    .flatMap((write) => Array.isArray(write.value) ? write.value : [write.value])
    .map((value) => value?.structured_content)
    .filter(Boolean);
}

describe("Assistant structured Goal actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveGoalLanguage.mockImplementation(async (_client, input: { goalText: string }) => ({ status: "ready", intentSummary: "Build an agent", primaryOutcome: input.goalText, refinementIntent: "preserve_outcome", candidateKnowledgeIds: ["A"], targetReasons: [{ knowledgeId: "A", reason: "Direct outcome" }] }));
    planLearningGoal.mockResolvedValue(plan);
    useExistingCourse.mockResolvedValue({ courseId: "standard-course", match: { courseTitle: "Standard Course" } });
  });

  it("uses LLM candidates only as input to product-owned revalidation and persists a Course Search card", async () => {
    const db = database(); const result = await request(db, { action: "plan-goal", goalText: "I want AI to do things for me" });
    expect(result.status()).toBe(200);
    expect(resolveGoalLanguage).toHaveBeenCalled();
    expect(planLearningGoal).toHaveBeenCalledWith(expect.anything(), "I want AI to do things for me", ["A"]);
    const card = structuredCards(db).find((value) => value.type === "course_search");
    expect(card).toMatchObject({ type: "course_search", schemaVersion: 1, goalText: "I want AI to do things for me", plan });
  });

  it("persists multiple independent planning cards in the same session", async () => {
    const db = database();
    await request(db, { action: "plan-goal", sessionId: "session-1", goalText: "Goal one" });
    await request(db, { action: "plan-goal", sessionId: "session-1", goalText: "Goal two" });
    const cards = structuredCards(db).filter((value) => value.type === "course_search");
    expect(cards).toHaveLength(2); expect(cards[0].planningId).not.toBe(cards[1].planningId); expect(cards.map((card) => card.goalText)).toEqual(["Goal one", "Goal two"]);
  });

  it("uses the selected card snapshot instead of a mutable current Goal", async () => {
    const db = database(); const planningMessageId = seedPlanningMessage(db);
    const result = await request(db, { action: "use-existing-course", planningMessageId, courseId: "standard-course" });
    expect(result.status()).toBe(200);
    expect(useExistingCourse).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "learner" }), { goalText: "Agent", courseId: "standard-course", candidateKnowledgeIds: ["A"] });
  });

  it("continues search by appending a refined card without overwriting the source", async () => {
    const db = database(); const planningMessageId = seedPlanningMessage(db);
    resolveGoalLanguage.mockResolvedValueOnce({ status: "ready", intentSummary: "Prefer practical projects", primaryOutcome: "Agent", refinementIntent: "preserve_outcome", candidateKnowledgeIds: ["A"], targetReasons: [{ knowledgeId: "A", reason: "Direct outcome" }] });
    const result = await request(db, { action: "refine-goal", planningMessageId, refinement: "Too theoretical" });
    expect(result.status()).toBe(200);
    expect(db.messages.get(planningMessageId)?.structured_content.refinement).toBeUndefined();
    const next = structuredCards(db).find((value) => value.refinedFromPlanningId);
    expect(next).toMatchObject({ refinement: "Too theoretical", refinedFromPlanningId: "planning-1" });
  });

  it("prepares a recoverable Brief with sourceCourseId and performs no Course write", async () => {
    const db = database(); const planningMessageId = seedPlanningMessage(db);
    const result = await request(db, { action: "prepare-course-brief", planningMessageId, sourceCourseId: "standard-course", requestedAdjustments: "More projects", referenceMaterialIntent: "none" });
    expect(result.status()).toBe(201);
    expect(result.body()).toMatchObject({ brief: { type: "course_creation_brief", sourceCourseId: "standard-course", planningMessageId, requestedAdjustments: "More projects", referenceMaterialIntent: "none" } });
    expect(db.writes.some((write) => write.table === "courses")).toBe(false);
  });
});

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
vi.mock("../../api/_lib/goalLanguageAdapter.js", () => ({ resolveGoalLanguage, isGoalLanguageProviderUnavailable: (error: unknown) => error instanceof TypeError }));

import handler from "../../api/assistant";

const context = { workspace: "explore", experienceMode: "learn" };
const plan = { resolution: { status: "ready", goalText: "Agent", targetKnowledge: [{ id: "A", title: "Agent", description: "Agent" }], candidates: [] }, prerequisiteKnowledge: [], prerequisiteCycleDetected: false, matches: [{ courseId: "standard-course", courseTitle: "Standard Course", courseType: "standard", targetCoverage: 1, requiredCoverage: 1, missingTargetKnowledgeIds: [], missingPrerequisiteKnowledgeIds: [], extraKnowledgeIds: [], level: "high", recommendation: "use_existing" }] };

function database() {
  const writes: Array<{ table: string; value: any }> = [];
  const sessions = new Map<string, any>([["session-1", { id: "session-1", user_id: "learner", title: "Goal", created_at: "2026-08-27T00:00:00Z", updated_at: "2026-08-27T00:00:00Z" }]]);
  const messages = new Map<string, any>();
  let sequence = 0;
  const db = { writes, sessions, messages, from(table: string) {
    let inserted: any; const filters = new Map<string, unknown>(); const upperBounds = new Map<string, number>();
    const builder: any = {
      insert: (value: any) => { inserted = value; writes.push({ table, value }); return builder; },
      select: () => builder, update: (value: any) => { writes.push({ table, value }); return builder; },
      eq: (key: string, value: unknown) => { filters.set(key, value); return builder; }, lte: (key: string, value: number) => { upperBounds.set(key, value); return builder; }, order: () => builder, limit: () => builder,
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
        if (table === "assistant_messages" && inserted == null) data = [...messages.values()].filter((row) => [...filters].every(([key, value]) => (key === "message_kind" ? (row[key] ?? "utterance") : row[key]) === value) && [...upperBounds].every(([key, value]) => Number(row[key]) <= value));
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
    resolveGoalLanguage.mockImplementation(async (_client, input: { goalText: string }) => ({ status: "ready", intentSummary: "Build an agent", primaryOutcome: input.goalText, refinementIntent: "preserve_outcome", practiceEmphasis: false, candidateKnowledgeIds: ["A"], targetReasons: [{ knowledgeId: "A", reason: "Direct outcome" }] }));
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

  it("returns a retryable 503 and persists no exchange when Goal provider networking fails", async () => {
    const db = database();
    resolveGoalLanguage.mockRejectedValueOnce(new TypeError("network error"));
    const result = await request(db, { action: "plan-goal", goalText: "Build an image model" });
    expect(result.status()).toBe(503);
    expect(structuredCards(db)).toEqual([]);
    expect([...db.messages.values()]).toEqual([]);
    expect(db.writes.some((write) => write.table === "assistant_sessions")).toBe(false);
  });

  it("treats invalid structured output as an error without creating an empty session", async () => {
    const db = database();
    resolveGoalLanguage.mockRejectedValueOnce(new Error("Goal candidate identities failed catalog validation"));
    const result = await request(db, { action: "plan-goal", goalText: "Build an image model" });
    expect(result.status()).toBe(422);
    expect(result.body()).toMatchObject({ error: { code: "invalid_goal_output" } });
    expect(db.writes.some((write) => write.table === "assistant_sessions" || write.table === "assistant_messages")).toBe(false);
  });

  it("persists a clear no-match Goal as a structured business result", async () => {
    const db = database();
    resolveGoalLanguage.mockResolvedValueOnce({ status: "no_match", intentSummary: "Build quantum hardware", primaryOutcome: "Build a quantum processor", practiceEmphasis: true, reason: "当前学习内容没有覆盖量子处理器" });
    const result = await request(db, { action: "plan-goal", goalText: "Build a quantum processor" });
    expect(result.status()).toBe(200);
    expect(result.body()).toMatchObject({ status: "no_match", goalStatus: "ready", catalogStatus: "no_match" });
    expect(structuredCards(db)).toContainEqual(expect.objectContaining({
      type: "course_search",
      goalText: "Build a quantum processor",
      plan: expect.objectContaining({ resolution: expect.objectContaining({ status: "no_match" }) })
    }));
    expect(planLearningGoal).not.toHaveBeenCalled();
  });

  it("keeps a fixed ten-Goal HTTP regression set in explicit business states", async () => {
    const cases = [
      { goal: "我要构建一个猫狗图片分类模型", expected: "ready" },
      { goal: "用文档问答做一个可引用来源的助手", expected: "ready" },
      { goal: "实作一个能调用工具完成任务的 Agent", expected: "ready" },
      { goal: "让 Agent 具备可恢复的长期记忆", expected: "ready" },
      { goal: "我想学 AI", expected: "needs_clarification" },
      { goal: "我想学编程", expected: "needs_clarification" },
      { goal: "构建量子处理器", expected: "no_match" },
      { goal: "设计火星载人生命维持系统", expected: "no_match" },
      { goal: "为 RAG 助手增加评估和可观测性", expected: "ready" },
      { goal: "做一个能分解任务并使用多个工具的助手", expected: "ready" }
    ] as const;
    resolveGoalLanguage.mockImplementation(async (_client, input: { goalText: string }) => {
      const item = cases.find((candidate) => candidate.goal === input.goalText)!;
      if (item.expected === "needs_clarification") return { status: "needs_clarification", intentSummary: input.goalText, clarificationQuestion: "你希望先做出什么具体成果？" };
      if (item.expected === "no_match") return { status: "no_match", intentSummary: input.goalText, primaryOutcome: input.goalText, practiceEmphasis: false, reason: "当前学习内容未覆盖该目标" };
      return { status: "ready", intentSummary: input.goalText, primaryOutcome: input.goalText, refinementIntent: "preserve_outcome", practiceEmphasis: input.goalText.includes("实作"), candidateKnowledgeIds: ["A"], targetReasons: [{ knowledgeId: "A", reason: "直接对应目标成果" }] };
    });

    for (const item of cases) {
      const result = await request(database(), { action: "plan-goal", goalText: item.goal });
      expect(result.status(), item.goal).toBe(200);
      expect(result.body().status, item.goal).toBe(item.expected);
      if (item.expected === "no_match") expect(result.body().goalStatus, item.goal).toBe("ready");
    }
  });

  it("keeps clarification state stable across repeated runs of three clear Goals", async () => {
    const goals = ["我要构建一个猫狗图片分类模型", "用文档问答做一个可引用来源的助手", "实作一个能调用工具完成任务的 Agent"];
    resolveGoalLanguage.mockImplementation(async (_client, input: { goalText: string }) => ({ status: "ready", intentSummary: input.goalText, primaryOutcome: input.goalText, refinementIntent: "preserve_outcome", practiceEmphasis: false, candidateKnowledgeIds: ["A"], targetReasons: [{ knowledgeId: "A", reason: "直接对应目标成果" }] }));
    for (const goal of goals) {
      const statuses = [];
      for (let attempt = 0; attempt < 5; attempt += 1) statuses.push((await request(database(), { action: "plan-goal", goalText: goal })).body().status);
      expect(statuses).toEqual(["ready", "ready", "ready", "ready", "ready"]);
    }
  });

  it("rejects blank and oversized Goal input before calling the adapter", async () => {
    for (const goalText of ["   ", "x".repeat(1001)]) {
      const result = await request(database(), { action: "plan-goal", goalText });
      expect(result.status()).toBe(400);
      expect(result.body()).toMatchObject({ error: { code: "invalid_goal" } });
    }
    expect(resolveGoalLanguage).not.toHaveBeenCalled();
  });

  it("persists multiple independent planning cards in the same session", async () => {
    const db = database();
    await request(db, { action: "plan-goal", sessionId: "session-1", goalText: "Goal one" });
    await request(db, { action: "plan-goal", sessionId: "session-1", goalText: "Goal two" });
    const cards = structuredCards(db).filter((value) => value.type === "course_search");
    expect(cards).toHaveLength(2); expect(cards[0].planningId).not.toBe(cards[1].planningId); expect(cards.map((card) => card.goalText)).toEqual(["Goal one", "Goal two"]);
  });

  it("treats history as clarification context only through an explicit message identity", async () => {
    const db = database();
    db.messages.set("goal-clarification", { id: "goal-clarification", session_id: "session-1", sequence: 2, role: "assistant", message_kind: "goal_clarification", content: "你想训练什么模型？" });
    db.messages.set("goal-user", { id: "goal-user", session_id: "session-1", sequence: 1, role: "user", message_kind: "utterance", content: "我想训练一个模型" });
    const result = await request(db, { action: "plan-goal", sessionId: "session-1", clarificationMessageId: "goal-clarification", goalText: "猫狗分类模型" });
    expect(result.status()).toBe(200);
    expect(resolveGoalLanguage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ conversationContext: [
      { role: "user", content: "我想训练一个模型" },
      { role: "assistant", content: "你想训练什么模型？" }
    ] }));
  });

  it("rejects an arbitrary Assistant utterance as clarification authority", async () => {
    const db = database();
    db.messages.set("plain-assistant", { id: "plain-assistant", session_id: "session-1", sequence: 1, role: "assistant", message_kind: "utterance", content: "普通回答" });
    const result = await request(db, { action: "plan-goal", sessionId: "session-1", clarificationMessageId: "plain-assistant", goalText: "新目标" });
    expect(result.status()).toBe(409);
    expect(resolveGoalLanguage).not.toHaveBeenCalled();
  });

  it("uses the selected card snapshot instead of a mutable current Goal", async () => {
    const db = database(); const planningMessageId = seedPlanningMessage(db);
    const result = await request(db, { action: "use-existing-course", planningMessageId, courseId: "standard-course" });
    expect(result.status()).toBe(200);
    expect(useExistingCourse).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "learner" }), { goalText: "Agent", courseId: "standard-course", candidateKnowledgeIds: ["A"] });
  });

  it("continues search by appending a refined card without overwriting the source", async () => {
    const db = database(); const planningMessageId = seedPlanningMessage(db);
    resolveGoalLanguage.mockResolvedValueOnce({ status: "ready", intentSummary: "Prefer practical projects", primaryOutcome: "Agent", refinementIntent: "preserve_outcome", practiceEmphasis: true, candidateKnowledgeIds: ["A"], targetReasons: [{ knowledgeId: "A", reason: "Direct outcome" }] });
    const result = await request(db, { action: "refine-goal", planningMessageId, refinement: "Too theoretical" });
    expect(result.status()).toBe(200);
    expect(db.messages.get(planningMessageId)?.structured_content.refinement).toBeUndefined();
    const next = structuredCards(db).find((value) => value.refinedFromPlanningId);
    expect(next).toMatchObject({ goalText: "Agent", refinement: "Too theoretical", refinedFromPlanningId: "planning-1" });
    expect(next.goalText).not.toContain("偏好调整");
    expect(planLearningGoal).toHaveBeenLastCalledWith(expect.anything(), "Agent", ["A"]);
  });

  it("prepares a recoverable Brief with sourceCourseId and performs no Course write", async () => {
    const db = database(); const planningMessageId = seedPlanningMessage(db);
    const result = await request(db, { action: "prepare-course-brief", planningMessageId, sourceCourseId: "standard-course", requestedAdjustments: "More projects", referenceMaterialIntent: "none" });
    expect(result.status()).toBe(201);
    expect(result.body()).toMatchObject({ brief: { type: "course_creation_brief", sourceCourseId: "standard-course", planningMessageId, requestedAdjustments: "More projects", referenceMaterialIntent: "none" } });
    expect(db.writes.find((write) => write.table === "assistant_messages" && Array.isArray(write.value))?.value[0]).toMatchObject({ role: "user", message_kind: "action" });
    expect(db.writes.some((write) => write.table === "courses")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { compactModelContent, ensureAttemptAssistantSession, insertAssistantRowOnce, recordButtonAction, recordEvaluationTimeline, timelineParts } from "./assistantTimeline";

type Row = Record<string, unknown>;

function fakeClient(state: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let order: { column: string; ascending: boolean } | undefined;
      let max: number | undefined;
      let inserted: Row | undefined;
      let updateValue: Row | undefined;
      const rows = () => (state[table] ??= []);
      const apply = () => {
        let result = rows().filter((row) => filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
        if (order) result = [...result].sort((left, right) => String(left[order!.column]).localeCompare(String(right[order!.column])) * (order!.ascending ? 1 : -1));
        if (max != null) result = result.slice(0, max);
        return result;
      };
      const query: any = {
        select() { return query; },
        eq(column: string, value: unknown) { filters.push([column, value]); return query; },
        is(column: string, value: unknown) { filters.push([column, value]); return query; },
        in(column: string, value: unknown[]) { filters.push([column, value]); return query; },
        order(column: string, options?: { ascending?: boolean }) { order = { column, ascending: options?.ascending !== false }; return query; },
        limit(value: number) { max = value; return query; },
        insert(value: Row) { inserted = value; return query; },
        update(value: Row) { updateValue = value; return query; },
        async maybeSingle() {
          if (inserted) return { data: store(inserted), error: null };
          return { data: apply()[0] ?? null, error: null };
        },
        async single() {
          if (inserted) return { data: store(inserted), error: null };
          return { data: apply()[0] ?? null, error: null };
        },
        then(resolve: (result: unknown) => unknown) {
          if (inserted) {
            const row = store(inserted);
            return Promise.resolve({ data: [row], error: null }).then(resolve);
          }
          if (updateValue) {
            for (const row of apply()) Object.assign(row, updateValue);
            return Promise.resolve({ data: null, error: null }).then(resolve);
          }
          return Promise.resolve({ data: apply(), error: null }).then(resolve);
        }
      };
      function store(row: Row) {
        const next = { id: `row-${rows().length + 1}`, sequence: rows().length + 1, ...row };
        rows().push(next);
        return next;
      }
      return query;
    }
  };
}

describe("assistant timeline persistence", () => {
  it("synthesizes ordered text parts for legacy messages and hides invalid rows", () => {
    expect(timelineParts({ role: "assistant", content: "旧回复", parts: null, invalid_reason: null })).toEqual([{ type: "text", text: "旧回复" }]);
    expect(timelineParts({ role: "assistant", content: "<|DSML| x", parts: null, invalid_reason: "protocol_leak" })).toEqual([{ type: "text", text: "这条回复格式异常，已隐藏" }]);
    expect(timelineParts({ role: "user", content: "问题", parts: null })).toEqual([{ type: "text", text: "问题" }]);
  });

  it("returns persisted card parts as references only", () => {
    const parts = timelineParts({
      role: "assistant", content: "回答",
      parts: [
        { type: "text", text: "回答" },
        { type: "tool-displayCard", toolCallId: "c1", state: "output-available", input: { cardType: "knowledge", nodeId: "n1" }, output: { card: { cardType: "knowledge", nodeId: "n1" } } }
      ]
    });
    expect(parts).toEqual([
      { type: "text", text: "回答" },
      { type: "tool-displayCard", toolCallId: "c1", state: "output-available", input: { cardType: "knowledge", nodeId: "n1" }, output: { card: { cardType: "knowledge", nodeId: "n1" } } }
    ]);
    expect(JSON.stringify(parts)).not.toContain('"display":');
  });

  it("keeps card labels, not card payloads, in model history", () => {
    const content = compactModelContent({
      content: "这是回答",
      parts: [
        { type: "text", text: "这是回答" },
        { type: "tool-displayCard", output: { card: { cardType: "micro", pathId: "p1", knowledgeId: "n1" } } },
        { type: "tool-displayCard", output: { card: { cardType: "micro", pathId: "p2", knowledgeId: "n2" } } }
      ]
    });
    expect(content).toContain("这是回答");
    expect(content).toContain("一个小练习");
    expect(content).not.toContain("p1");
    expect(content).not.toContain("n1");
  });

  it("inserts a template row once per dedupe key", async () => {
    const client = fakeClient({ assistant_messages: [] });
    const first = await insertAssistantRowOnce(client as never, { session_id: "s1", role: "assistant", content: "一次", dedupe_key: "k1" });
    const second = await insertAssistantRowOnce(client as never, { session_id: "s1", role: "assistant", content: "一次", dedupe_key: "k1" });
    expect(first?.id).toBe(second?.id);
    expect(client.from("assistant_messages")).toBeDefined();
  });

  it("writes one evaluation reply per Attempt + Result, owned by the server", async () => {
    const state: Record<string, Row[]> = {
      learning_attempts: [{ id: "attempt-1", user_id: "u1", assistant_session_id: "s1", attempt_number: 1 }],
      assistant_sessions: [{ id: "s1", user_id: "u1" }],
      course_assignments: [{ id: "assignment-1", course_id: "course-1", title: "最小循环" }],
      assistant_messages: []
    };
    const client = fakeClient(state);
    const input = { userId: "u1", courseId: "course-1", assignmentId: "assignment-1", attemptId: "attempt-1", resultId: "result-1", outcome: "passed" };
    const first = await recordEvaluationTimeline(client as never, input);
    const second = await recordEvaluationTimeline(client as never, input);
    expect(first?.id).toBe(second?.id);
    const rows = state.assistant_messages;
    expect(rows).toHaveLength(1);
    expect(rows[0].message_kind).toBe("action");
    expect(JSON.stringify(rows[0].parts)).toContain("evaluation");
    expect(JSON.stringify(rows[0].parts)).toContain("attempt-1");
  });

  it("does not attach a result to another learner's session", async () => {
    const client = fakeClient({
      learning_attempts: [{ id: "attempt-1", user_id: "u1", assistant_session_id: "s2", attempt_number: 1 }],
      assistant_sessions: [{ id: "s2", user_id: "u2" }],
      course_assignments: [{ id: "assignment-1", course_id: "course-1", title: "最小循环" }],
      assistant_messages: []
    });
    const result = await recordEvaluationTimeline(client as never, { userId: "u1", courseId: "course-1", assignmentId: "assignment-1", attemptId: "attempt-1", resultId: "result-1", outcome: "passed" });
    expect(result).toBeNull();
  });
});

describe("attempt assistant session fallback", () => {
  function state() {
    return {
      learning_attempts: [{ id: "attempt-1", user_id: "u1", assistant_session_id: null, course_id: "course-1", assignment_id: "assignment-1", attempt_number: 1 }],
      course_assignments: [{ id: "assignment-1", course_id: "course-1", title: "最小循环" }],
      assistant_sessions: [] as Row[],
      assistant_messages: [] as Row[]
    } as Record<string, Row[]>;
  }

  it("creates one owned session and one submitted event, idempotently by Attempt", async () => {
    const data = state();
    const client = fakeClient(data);
    const first = await ensureAttemptAssistantSession(client as never, "u1", { attemptId: "attempt-1", courseId: "course-1", assignmentId: "assignment-1" });
    const second = await ensureAttemptAssistantSession(client as never, "u1", { attemptId: "attempt-1", courseId: "course-1", assignmentId: "assignment-1" });
    expect(first).toBe(second);
    expect(data.assistant_sessions).toHaveLength(1);
    expect(data.assistant_sessions[0].user_id).toBe("u1");
    expect(data.learning_attempts[0].assistant_session_id).toBe(first);
    expect(data.assistant_messages).toHaveLength(2);
    expect(data.assistant_messages[0].dedupe_key).toContain("practice-submitted:attempt-1:user");
  });

  it("rejects a requested session owned by another learner and creates an owned one", async () => {
    const data = state();
    data.assistant_sessions = [{ id: "other-session", user_id: "u2", updated_at: "2026" }];
    const client = fakeClient(data);
    const sessionId = await ensureAttemptAssistantSession(client as never, "u1", { attemptId: "attempt-1", courseId: "course-1", assignmentId: "assignment-1", requestedSessionId: "other-session" });
    expect(sessionId).not.toBe("other-session");
    expect(data.assistant_sessions.find((row) => row.id === sessionId)?.user_id).toBe("u1");
    expect(data.learning_attempts[0].assistant_session_id).toBe(sessionId);
  });

  it("keeps an already linked owned session", async () => {
    const data = state();
    data.assistant_sessions = [{ id: "linked-session", user_id: "u1", updated_at: "2026" }];
    data.learning_attempts[0].assistant_session_id = "linked-session";
    const client = fakeClient(data);
    expect(await ensureAttemptAssistantSession(client as never, "u1", { attemptId: "attempt-1", courseId: "course-1", assignmentId: "assignment-1" })).toBe("linked-session");
    expect(data.assistant_sessions).toHaveLength(1);
  });
});

describe("explicit new conversation action", () => {
  it("creates a new owned thread even when a previous sessionId is supplied", async () => {
    const data: Record<string, Row[]> = {
      assistant_sessions: [{ id: "old-session", user_id: "u1", title: "旧", updated_at: "2026" }],
      course_assignments: [{ id: "assignment-1", course_id: "course-1", title: "最小循环" }],
      assistant_messages: []
    };
    const client = fakeClient(data);
    const result = await recordButtonAction(client as never, "u1", { kind: "practice-opened", sessionId: "old-session", createSession: true, courseId: "course-1", assignmentId: "assignment-1", context: {} });
    expect(result.sessionId).not.toBe("old-session");
    expect(data.assistant_sessions).toHaveLength(2);
    expect(data.assistant_messages).toHaveLength(1);
    expect(data.assistant_messages[0].session_id).toBe(result.sessionId);
  });
});

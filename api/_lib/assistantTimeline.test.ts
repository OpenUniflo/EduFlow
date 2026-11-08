import { describe, expect, it } from "vitest";
import { insertAssistantRowOnce, isVisibleTimelineRow, modelHistoryMessages, persistedParts, timelineParts } from "./assistantTimeline";

type Row = Record<string, unknown>;

function fakeClient(state: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let inserted: Row | undefined;
      const rows = () => (state[table] ??= []);
      const apply = () => rows().filter((row) => filters.every(([key, value]) => row[key] === value));
      const query: any = {
        select() { return query; },
        eq(column: string, value: unknown) { filters.push([column, value]); return query; },
        async maybeSingle() {
          if (inserted) return { data: store(inserted), error: null };
          return { data: apply()[0] ?? null, error: null };
        },
        async single() {
          if (inserted) return { data: store(inserted), error: null };
          return { data: apply()[0] ?? null, error: null };
        },
        insert(value: Row) { inserted = value; return query; }
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

  it("persists only compact tool progress and model-chosen follow-ups", () => {
    const parts = persistedParts([
      { type: "text", text: "回答" },
      { type: "tool-getCourseContext", state: "output-available", input: { courseId: "c" }, output: { secret: "large payload" } },
      { type: "tool-submitAssignment", state: "output-available", output: { status: "submitted" } },
      { type: "tool-suggestFollowUps", state: "output-available", output: { suggestions: ["看路线", "继续学习"] } },
      { type: "tool-displayCard", state: "output-available", input: { cardType: "practice", courseId: "c", assignmentId: "a" }, output: { card: { cardType: "practice", courseId: "c", assignmentId: "a" }, display: { title: "x" } } }
    ]);
    expect(parts).toEqual([
      { type: "text", text: "回答" },
      { type: "data-tool-progress", data: { toolName: "getCourseContext", label: "读取课程路线" } },
      { type: "data-tool-progress", data: { toolName: "submitAssignment", label: "提交动手任务" } },
      { type: "data-follow-ups", data: { items: [{ text: "看路线" }, { text: "继续学习" }] } },
      { type: "tool-displayCard", toolCallId: expect.any(String), state: "output-available", input: { cardType: "practice", courseId: "c", assignmentId: "a" }, output: { card: { cardType: "practice", courseId: "c", assignmentId: "a" } } }
    ]);
    expect(JSON.stringify(parts)).not.toContain("large payload");
  });

  it("round-trips tool progress, follow-ups and user attachment metadata without raw content", () => {
    const parts = timelineParts({
      role: "assistant", content: "回答",
      parts: [
        { type: "data-tool-progress", data: { toolName: "getAssignmentContext", label: "读取任务要求" } },
        { type: "data-follow-ups", data: { items: [{ text: "上传结果" }] } },
        { type: "text", text: "回答" }
      ]
    });
    expect(parts).toEqual([
      { type: "data-tool-progress", data: { toolName: "getAssignmentContext", label: "读取任务要求" } },
      { type: "data-follow-ups", data: { items: [{ text: "上传结果" }] } },
      { type: "text", text: "回答" }
    ]);
    expect(timelineParts({ role: "user", content: "看看", parts: [{ type: "data-attachment", data: { id: "a1", title: "run-log.md" } }] }))
      .toEqual([{ type: "data-attachment", data: { id: "a1", title: "run-log.md" } }]);
  });

  it("replays write results as standard tool results for the next model turn", () => {
    const messages = modelHistoryMessages({
      id: "row-write", role: "assistant", content: "已处理。",
      parts: [
        { type: "id", id: "x" },
        { type: "data-write-result", data: { id: "w1", toolName: "withdrawAssignmentSubmission", ok: true, title: "已撤回", detail: "第 3 次提交" } }
      ]
    });
    expect(messages).toHaveLength(2);
    expect(JSON.stringify(messages[0])).toContain("withdrawAssignmentSubmission");
    expect(messages[1].role).toBe("tool");
    expect(JSON.stringify(messages[1])).toContain("已撤回");
  });

  it("replays cards as standard tool calls and results with compact labels only", () => {
    const messages = modelHistoryMessages({
      id: "m1",
      role: "assistant",
      content: "这是回答",
      parts: [
        { type: "text", text: "这是回答" },
        { type: "tool-displayCard", output: { card: { cardType: "micro", pathId: "p1", knowledgeId: "n1" } } },
        { type: "tool-displayCard", output: { card: { cardType: "micro", pathId: "p2", knowledgeId: "n2" } } }
      ]
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "assistant" });
    expect(messages[1]).toMatchObject({ role: "tool" });
    const serialized = JSON.stringify(messages);
    expect(serialized).toContain("这是回答");
    expect(serialized).toContain("一个小练习");
    expect(serialized).toContain("tool-call");
    expect(serialized).toContain("tool-result");
    expect(serialized).not.toContain("此回复展示的卡片");
    expect(serialized).not.toContain("p1");
    expect(serialized).not.toContain("n1");
  });

  it("removes a legacy card-history marker from text and model history", () => {
    const legacy = "回答正文\n[此回复展示的卡片：一个动手任务]";
    expect(timelineParts({ role: "assistant", content: legacy, parts: null, invalid_reason: null })).toEqual([{ type: "text", text: "回答正文" }]);
    expect(JSON.stringify(modelHistoryMessages({ id: "m2", role: "assistant", content: legacy, parts: [] }))).not.toContain("此回复展示的卡片");
  });

  it("inserts a template row once per dedupe key", async () => {
    const client = fakeClient({ assistant_messages: [] });
    const first = await insertAssistantRowOnce(client as never, { session_id: "s1", role: "assistant", content: "一次", dedupe_key: "k1" });
    const second = await insertAssistantRowOnce(client as never, { session_id: "s1", role: "assistant", content: "一次", dedupe_key: "k1" });
    expect(first?.id).toBe(second?.id);
  });

  it("hides legacy operation rows but keeps structured planning results", () => {
    expect(isVisibleTimelineRow({ message_kind: "action", content: "动手任务已打开" })).toBe(false);
    expect(isVisibleTimelineRow({ message_kind: "action", content: "完成小练习：X" })).toBe(false);
    expect(isVisibleTimelineRow({ message_kind: "utterance", content: "正常回答" })).toBe(true);
    expect(isVisibleTimelineRow({ message_kind: "action", content: "课程匹配", structured_content: { type: "course_search" } })).toBe(true);
  });
});

describe("timeline data parts", () => {
  it("keeps stream-injected progress and follow-ups in the same order without generating duplicates", () => {
    const parts = persistedParts([
      { type: "start-step" },
      { type: "data-tool-progress", data: { toolName: "getAssignmentContext", label: "读取任务要求" } },
      { type: "text", text: "回答" },
      { type: "data-follow-ups", data: { items: [{ text: "打开任务要求" }] } }
    ]);
    expect(parts).toEqual([
      { type: "data-tool-progress", data: { toolName: "getAssignmentContext", label: "读取任务要求" } },
      { type: "text", text: "回答" },
      { type: "data-follow-ups", data: { items: [{ text: "打开任务要求" }] } }
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { createNodeV2 } from "./factory";
import {
  formatRunDuration,
  relativeRunTime,
  runEnvironmentLabel,
  runFieldRows,
  runInputSummary,
  internalIdentifierValue,
  internalValueKey,
  runStepDuration,
  runValueView,
  searchHitCount,
  summarizeNodeRun,
} from "./runSummary";

const step = (output: unknown, status = "completed") => ({ status, output: output as never });

describe("run bubbles", () => {
  it("summarizes real search results and turns zero hits amber", () => {
    expect(summarizeNodeRun(createNodeV2("core.tool", "search"), step({ result: { hits: [{}, {}, {}, {}, {}] } }))).toEqual({ tone: "ok", text: "搜到 5 条" });
    expect(summarizeNodeRun(createNodeV2("core.tool", "search"), step({ result: { hits: [] } }))).toEqual({ tone: "empty", text: "搜索没有结果 · 0 条" });
  });

  it("counts visible model text instead of raw JSON", () => {
    expect(summarizeNodeRun(createNodeV2("core.llm", "answer"), step({ text: "先检查提交记录，再逐步排查。" }))).toEqual({ tone: "ok", text: "回答 14 字" });
    expect(summarizeNodeRun(createNodeV2("core.llm", "answer"), step({ text: "   " }))).toEqual({ tone: "ok", text: "模型没有返回文本" });
  });

  it("names the router branch by its configured label", () => {
    const node = createNodeV2("core.router", "route");
    node.config = { ...node.config, cases: [{ id: "technical", label: "技术", priority: 1, predicate: {} }], defaultOutlet: "other", defaultLabel: "其他" };
    expect(summarizeNodeRun(node, step({ outlet: "technical" }))).toEqual({ tone: "ok", text: "判断为：技术" });
    expect(summarizeNodeRun(node, step({ outlet: "other" }))).toEqual({ tone: "ok", text: "判断为：其他" });
  });

  it("uses a plain Chinese failure sentence and preserves lifecycle states", () => {
    expect(summarizeNodeRun(createNodeV2("core.llm", "answer"), { status: "failed", error: { code: "MODEL_TIMEOUT", message: "x" } }, { errorMessage: "模型回复超时，请稍后重试。" }))
      .toEqual({ tone: "failed", text: "模型回复超时，请稍后重试。" });
    expect(summarizeNodeRun(createNodeV2("core.llm", "answer"), { status: "failed", error: { code: "MODEL_TIMEOUT", message: "x" } }).text).toBe("运行失败，请查看详情");
    expect(summarizeNodeRun(createNodeV2("core.llm", "answer"), { status: "cancelled" }).tone).toBe("cancelled");
    expect(summarizeNodeRun(createNodeV2("core.llm", "answer"), { status: "running" }).text).toBe("执行中…");
  });
});

describe("run values", () => {
  it("labels each value type without exposing raw JSON", () => {
    expect(runValueView("文本内容")).toMatchObject({ kind: "text", label: "文本", preview: "文本内容" });
    expect(runValueView(12)).toMatchObject({ kind: "number", label: "数字", preview: "12" });
    expect(runValueView(false)).toMatchObject({ kind: "boolean", label: "是/否", preview: "否" });
    expect(runValueView([1, 2, 3])).toMatchObject({ kind: "list", label: "列表", preview: "3 条", count: 3, expandable: true });
    expect(runValueView({ answer: "x", usage: { total: 1 } })).toMatchObject({ kind: "object", label: "对象", preview: "2 个字段", fieldCount: 2, expandable: true });
    expect(runValueView(undefined).kind).toBe("empty");
  });

  it("expands objects into named rows and keeps scalars in one row", () => {
    expect(runFieldRows({ question: "q", topics: ["a"] }).map(row => `${row.name}:${row.view.label}`)).toEqual(["question:文本", "topics:列表"]);
    expect(runFieldRows("hello", "输入")).toEqual([{ name: "输入", value: "hello", view: runValueView("hello") }]);
  });

  it("keeps internal execution identities out of value rows", () => {
    expect(internalValueKey("runId")).toBe(true);
    expect(internalValueKey("messageId")).toBe(true);
    expect(internalValueKey("question")).toBe(false);
    expect(internalIdentifierValue("01a16ea9-2d68-7592-b5b5-5323122b7cb4")).toBe(true);
    expect(internalIdentifierValue("lc_run--01a16ea9")).toBe(true);
    expect(internalIdentifierValue("技术")).toBe(false);
    expect(runFieldRows({ question: "q", id: "01a16ea9-2d68-7592-b5b5-5323122b7cb4", messageId: "x" }).map(row => row.name)).toEqual(["question"]);
  });

  it("finds hit arrays nested in a bounded result", () => {
    expect(searchHitCount({ result: { data: { hits: [1, 2] } } })).toBe(2);
    expect(searchHitCount({ result: { hits: "no" } })).toBeUndefined();
  });
});

describe("run timing and history labels", () => {
  it("formats compact durations", () => {
    expect(formatRunDuration(40)).toBe("40ms");
    expect(formatRunDuration(1200)).toBe("1.2s");
    expect(formatRunDuration(3400)).toBe("3.4s");
    expect(formatRunDuration(12_000)).toBe("12s");
    expect(formatRunDuration(65_000)).toBe("1m 5s");
    expect(formatRunDuration(undefined)).toBe("");
  });

  it("derives step duration from real timestamps and error timing", () => {
    expect(runStepDuration({ startedAt: "2026-01-02T03:04:05.000Z", finishedAt: "2026-01-02T03:04:08.400Z" })).toBe(3400);
    expect(runStepDuration({ error: { code: "NODE_TIMEOUT", message: "x", elapsedMs: 1000 } })).toBe(1000);
    expect(runStepDuration(undefined)).toBeUndefined();
  });

  it("uses relative history time, a 20-character input summary and environment tag", () => {
    const now = Date.parse("2026-01-02T04:04:05.000Z");
    expect(relativeRunTime("2026-01-02T04:03:35.000Z", now)).toBe("刚刚");
    expect(relativeRunTime("2026-01-02T03:52:05.000Z", now)).toBe("12 分钟前");
    expect(relativeRunTime("2026-01-02T03:04:05.000Z", now)).toBe("1 小时前");
    expect(relativeRunTime("2026-01-01T03:04:05.000Z", now)).toBe("昨天");
    expect(relativeRunTime("", now)).toBe("");
    expect(runInputSummary({ inputReuse: { fields: [{ pointer: "/question", value: "实训 3 提交后没有反馈，课程群也没有通知" }] } })).toBe("实训 3 提交后没有反馈，课程群也没有…");
    expect(runInputSummary({ inputReuse: { fields: [{ pointer: "/question", value: "课程视频加载很慢" }] } })).toBe("课程视频加载很慢");
    expect(runInputSummary(null)).toBe("未填写输入");
    expect(runEnvironmentLabel({ variableEnvironment: "开发" })).toBe("开发");
    expect(runEnvironmentLabel(null)).toBe("默认");
  });
});

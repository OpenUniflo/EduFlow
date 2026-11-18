import { describe, expect, it } from "vitest";
import {
  PROTOCOL_HIDDEN_MESSAGE,
  assistantProtocolLeakRule,
  cleanFinalAnswer,
  filterModelHistoryRows,
  hasAssistantProtocolLeak,
  historyWithoutUnansweredTail,
  heldCardHistorySuffixLength,
  stripCardHistoryMarkers,
  invalidReasonForRow,
  selectLoopFinalText,
  visibleAssistantContent
} from "./protocolGuard";

describe("assistant protocol leak detection", () => {
  it.each([
    '<｜｜DSML｜｜ calls>\n<｜｜DSML｜｜ invoke name="searchKnowledge">',
    '<||DSML|| calls>\n<||DSML|| invoke name="searchKnowledge">',
    '<｜|DSML|｜ calls>',
    '</｜｜DSML｜｜ calls>',
    'before <||DSML||> after'
  ])("detects a DSML marker anywhere: %s", (text) => {
    expect(hasAssistantProtocolLeak(text)).toBe(true);
  });

  it("detects a whole-reply bare invoke/parameter protocol block", () => {
    expect(hasAssistantProtocolLeak('<invoke name="x"><parameter name="y">1</parameter></invoke>')).toBe(true);
    expect(hasAssistantProtocolLeak('  <invoke name="x">\n<parameter name="y">1</parameter>\n</invoke>  ')).toBe(true);
    expect(hasAssistantProtocolLeak('<parameter name="y">1</parameter>')).toBe(true);
  });

  it("detects serialized tool_use / tool_call blocks", () => {
    expect(hasAssistantProtocolLeak('<tool_use name="searchKnowledge">')).toBe(true);
    expect(hasAssistantProtocolLeak('  <tool_call name="lookup">\n{"q":"x"}</tool_call>')).toBe(true);
    expect(hasAssistantProtocolLeak('回答前 <function_call name="x">')).toBe(true);
    expect(assistantProtocolLeakRule('<tool_use name="searchKnowledge">')).toBe("tool_tag");
  });

  it("detects provider safety metadata as protocol text", () => {
    expect(hasAssistantProtocolLeak('<ds_safety>[用户未成年]否 [分类]其他</ds_safety>')).toBe(true);
    expect(assistantProtocolLeakRule('<ds_safety>[判定]正常</ds_safety>')).toBe("tool_tag");
  });

  it("allows a fenced tool_use example", () => {
    expect(hasAssistantProtocolLeak('示例：\n```xml\n<tool_use name="search">\n```\n以上是协议。')).toBe(false);
  });

  it("does not flag normal discussion of tool-call syntax", () => {
    expect(hasAssistantProtocolLeak('工具调用的格式类似 `<invoke name="search">`，模型会……')).toBe(false);
    expect(hasAssistantProtocolLeak('参数写成 `parameter name="q"` 时，模型会把值放进标签。')).toBe(false);
    expect(hasAssistantProtocolLeak('<invoke name="x">这是解释正文</invoke>')).toBe(false);
    expect(hasAssistantProtocolLeak('<invoke name="x"></invoke> 这段是正文解释')).toBe(false);
  });

  it("does not flag a Markdown code example", () => {
    const answer = '工具调用协议通常长这样：\n\n```xml\n<invoke name="search">\n  <parameter name="q">EduFlow</parameter>\n</invoke>\n```\n\n模型会读取参数后返回结果。';
    expect(hasAssistantProtocolLeak(answer)).toBe(false);
    expect(hasAssistantProtocolLeak("```xml\n<invoke name=\"x\"><parameter name=\"y\">1</parameter></invoke>\n```")).toBe(false);
  });

  it("does not flag a normal discussion of the DSML word", () => {
    expect(hasAssistantProtocolLeak("什么是 DSML？它是一种标记语言。")).toBe(false);
    expect(hasAssistantProtocolLeak("什么是 DSML？它是 DeepSeek 的一种标记格式，但不是工具调用。")).toBe(false);
    expect(hasAssistantProtocolLeak("DSML 这个词在文档里出现过，但这里没有调用结构。")).toBe(false);
    expect(hasAssistantProtocolLeak("你可以搜索 DSML 标记的说明。")).toBe(false);
  });

  it("reports the matched rule without content", () => {
    expect(assistantProtocolLeakRule("<｜｜DSML｜｜ calls>")).toBe("dsml_tag");
    expect(assistantProtocolLeakRule('<invoke name="x"><parameter name="y">1</parameter></invoke>')).toBe("invoke_structure");
    expect(assistantProtocolLeakRule('<parameter name="y">1</parameter>')).toBe("parameter_structure");
    expect(assistantProtocolLeakRule('工具调用的格式类似 `<invoke name="search">`，模型会……')).toBeNull();
    expect(assistantProtocolLeakRule('invoke name="x"')).toBeNull();
    expect(assistantProtocolLeakRule("ordinary answer")).toBeNull();
  });
});

describe("final answer selection", () => {
  it("uses a natural stop with clean text without another model call", () => {
    expect(selectLoopFinalText({ text: "  这是最终回答。 ", finishReason: "stop" })).toBe("这是最终回答。");
  });

  it("rejects a capped tool loop, empty text, or protocol text", () => {
    expect(selectLoopFinalText({ text: "intermediate", finishReason: "tool-calls" })).toBeNull();
    expect(selectLoopFinalText({ text: "   ", finishReason: "stop" })).toBeNull();
    expect(selectLoopFinalText({ text: "<｜｜DSML｜｜ calls>", finishReason: "stop" })).toBeNull();
    expect(selectLoopFinalText({ text: '<invoke name="x"><parameter name="y">1</parameter></invoke>', finishReason: "stop" })).toBeNull();
    expect(selectLoopFinalText({ text: "truncated", finishReason: "length" })).toBeNull();
  });

  it("treats empty and protocol fallback text as unusable", () => {
    expect(cleanFinalAnswer("")).toBeNull();
    expect(cleanFinalAnswer("   ")).toBeNull();
    expect(cleanFinalAnswer("normal answer")).toBe("normal answer");
    expect(cleanFinalAnswer('<invoke name="x"><parameter name="y">1</parameter></invoke>')).toBeNull();
  });
});

describe("model history filtering", () => {
  const normalToolDiscussion = '工具调用的格式类似 `<invoke name="search">`，模型会读取参数后返回结果。';
  const rows = [
    { role: "user", content: "什么是 DSML？", message_kind: "utterance", invalid_reason: null },
    { role: "assistant", content: "DSML 是 DeepSeek 的标记格式。", message_kind: "utterance", invalid_reason: null },
    { role: "assistant", content: normalToolDiscussion, message_kind: "utterance", invalid_reason: null },
    { role: "assistant", content: "```xml\n<invoke name=\"x\"><parameter name=\"y\">1</parameter></invoke>\n```", message_kind: "utterance", invalid_reason: null },
    { role: "assistant", content: "<｜｜DSML｜｜ calls>", message_kind: "utterance", invalid_reason: null },
    { role: "assistant", content: "<｜｜DSML｜｜ calls>", message_kind: "utterance", invalid_reason: "protocol_leak" },
    { role: "assistant", content: "已记录。", message_kind: "action", invalid_reason: null }
  ];

  it("drops action rows, marked rows, and unmarked protocol rows", () => {
    expect(filterModelHistoryRows(rows)).toEqual([rows[0], rows[1], rows[2], rows[3]]);
  });

  it("hides a leaked row from the browser even before it is marked", () => {
    expect(visibleAssistantContent(rows[4])).toBe(PROTOCOL_HIDDEN_MESSAGE);
    expect(visibleAssistantContent(rows[5])).toBe(PROTOCOL_HIDDEN_MESSAGE);
    expect(visibleAssistantContent(rows[1])).toBe("DSML 是 DeepSeek 的标记格式。");
    expect(visibleAssistantContent(rows[2])).toBe(normalToolDiscussion);
    expect(invalidReasonForRow(rows[4])).toBe("protocol_leak");
    expect(invalidReasonForRow(rows[2])).toBeUndefined();
  });
});

describe("failed question history", () => {
  it("drops a trailing user turn that has no assistant reply", () => {
    const rows = [
      { role: "user", content: "Q0" },
      { role: "assistant", content: "A0" },
      { role: "user", content: "failed Q1" }
    ];
    expect(historyWithoutUnansweredTail(rows)).toEqual([rows[0], rows[1]]);
    expect(historyWithoutUnansweredTail([...rows, { role: "user", content: "Q2" }])).toEqual([rows[0], rows[1]]);
  });

  it("drops an earlier failed question after a later question is answered", () => {
    const rows = [
      { role: "user", content: "failed question" },
      { role: "user", content: "later question" },
      { role: "assistant", content: "later answer" }
    ];
    expect(historyWithoutUnansweredTail(rows)).toEqual([rows[1], rows[2]]);
  });

  it("keeps a complete exchange untouched", () => {
    const rows = [
      { role: "user", content: "Q0" },
      { role: "assistant", content: "A0" }
    ];
    expect(historyWithoutUnansweredTail(rows)).toEqual(rows);
  });
});

describe("card history marker guard", () => {
  it("strips a complete legacy marker but keeps the answer text", () => {
    expect(stripCardHistoryMarkers("正文\n[此回复展示的卡片：一个动手任务]")).toBe("正文\n");
    expect(stripCardHistoryMarkers("没有问题")).toBe("没有问题");
  });

  it("holds a partial marker across stream chunks", () => {
    expect(heldCardHistorySuffixLength("正文 [此回复展示的卡片")).toBeGreaterThan(0);
    expect(heldCardHistorySuffixLength("正文 [此回复展示的卡片：一个动手任务]")).toBe(0);
  });
});

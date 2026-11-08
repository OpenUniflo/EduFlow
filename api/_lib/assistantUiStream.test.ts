import { describe, expect, it } from "vitest";
import type { UIMessageChunk } from "ai";
import { createAssistantUiTimeline } from "./assistantUiStream";

const writeTools = {
  submitAssignment: { label: "提交动手任务", result: () => ({ ok: true, title: "提交已保存", card: { cardType: "practice" as const, courseId: "c", assignmentId: "a", compact: true } }) },
  withdrawAssignmentSubmission: { label: "撤回提交", result: () => ({ ok: true, title: "已撤回" }) }
};

async function run(chunks: UIMessageChunk[]) {
  const timeline = createAssistantUiTimeline({ writeTools });
  const writer = timeline.transform.writable.getWriter();
  const reader = timeline.transform.readable.getReader();
  const output: UIMessageChunk[] = [];
  const reading = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output.push(value);
    }
  })();
  for (const chunk of chunks) await writer.write(chunk);
  await writer.close();
  await reading;
  return { parts: timeline.recorder.parts, output };
}

const submitInput = { type: "tool-input-available", toolCallId: "submit-1", toolName: "submitAssignment", input: { courseId: "c", assignmentId: "a" } } as UIMessageChunk;
const submitOutput = { type: "tool-output-available", toolCallId: "submit-1", output: { status: "submitted", courseId: "c", assignmentId: "a", evaluatorKind: "ai" } } as UIMessageChunk;
const startStep = { type: "start-step" } as UIMessageChunk;
const finishStep = { type: "finish-step" } as UIMessageChunk;
const finish = { type: "finish" } as UIMessageChunk;

describe("assistant UI timeline keeps the actual order", () => {
  it("keeps the complete answer written before a business tool", async () => {
    const { parts, output } = await run([
      startStep,
      { type: "text-start", id: "t1" } as UIMessageChunk,
      { type: "text-delta", id: "t1", delta: "工作流是把多步工作组织起来的方法。" } as UIMessageChunk,
      { type: "text-end", id: "t1" } as UIMessageChunk,
      submitInput,
      submitOutput,
      finishStep,
      startStep,
      { type: "text-start", id: "t2" } as UIMessageChunk,
      { type: "text-delta", id: "t2", delta: "这也是它和一次对话的区别。" } as UIMessageChunk,
      { type: "text-end", id: "t2" } as UIMessageChunk,
      finishStep,
      finish
    ]);
    expect(parts.filter((part) => part.type === "text").map((part) => (part as { text: string }).text)).toEqual([
      "工作流是把多步工作组织起来的方法。",
      "这也是它和一次对话的区别。"
    ]);
    const kinds = parts.map((part) => part.type);
    expect(kinds.indexOf("text")).toBeLessThan(kinds.indexOf("data-tool-progress"));
    expect(kinds.lastIndexOf("text")).toBeGreaterThan(kinds.indexOf("data-write-result"));
    expect(output.some((chunk) => chunk.type === "reset-step" || chunk.type === "data-answer-correction")).toBe(false);
  });

  it("keeps prose written before a display card and keeps the card at that point", async () => {
    const { parts } = await run([
      startStep,
      { type: "text-start", id: "t1" } as UIMessageChunk,
      { type: "text-delta", id: "t1", delta: "先看这个知识点。" } as UIMessageChunk,
      { type: "text-end", id: "t1" } as UIMessageChunk,
      { type: "tool-input-available", toolCallId: "card-1", toolName: "displayCard", input: { cardType: "knowledge", nodeId: "k1" } } as UIMessageChunk,
      { type: "tool-output-available", toolCallId: "card-1", output: { card: { cardType: "knowledge", nodeId: "k1" } } } as UIMessageChunk,
      startStep,
      { type: "text-start", id: "t2" } as UIMessageChunk,
      { type: "text-delta", id: "t2", delta: "它和下一步的关系是这样。" } as UIMessageChunk,
      { type: "text-end", id: "t2" } as UIMessageChunk,
      finishStep,
      finish
    ]);
    expect(parts.map((part) => part.type)).toEqual(["text", "tool-displayCard", "text"]);
  });

  it("keeps adjacent text blocks exactly as they were written", async () => {
    const { parts } = await run([
      startStep,
      { type: "text-start", id: "t1" } as UIMessageChunk,
      { type: "text-delta", id: "t1", delta: "第一段。" } as UIMessageChunk,
      { type: "text-end", id: "t1" } as UIMessageChunk,
      { type: "text-start", id: "t2" } as UIMessageChunk,
      { type: "text-delta", id: "t2", delta: "第二段。" } as UIMessageChunk,
      { type: "text-end", id: "t2" } as UIMessageChunk,
      finishStep,
      finish
    ]);
    expect(parts.filter((part) => part.type === "text").map((part) => (part as { text: string }).text)).toEqual(["第一段。", "第二段。"]);
  });

  it("keeps the structured follow-up part after the answer text", async () => {
    const suggestions = ["打开任务要求", "看看学习路线"];
    const { parts } = await run([
      startStep,
      { type: "tool-input-available", toolCallId: "suggest-1", toolName: "suggestFollowUps", input: { suggestions } } as UIMessageChunk,
      { type: "tool-output-available", toolCallId: "suggest-1", output: { shown: true, suggestions } } as UIMessageChunk,
      { type: "text-start", id: "t1" } as UIMessageChunk,
      { type: "text-delta", id: "t1", delta: "回答。" } as UIMessageChunk,
      { type: "text-end", id: "t1" } as UIMessageChunk,
      finishStep,
      finish
    ]);
    const followUps = parts.find((part) => part.type === "data-follow-ups") as { type: string; data: { items: Array<{ text: string }> } };
    expect(followUps.data.items.map((item) => item.text)).toEqual(suggestions);
    expect(parts.indexOf(followUps)).toBeGreaterThan(parts.findIndex((part) => part.type === "text"));
  });
});

describe("write result parts", () => {
  it("does not emit a success result when the model only claims withdrawal", async () => {
    const { parts } = await run([
      startStep,
      { type: "text-start", id: "t1" } as UIMessageChunk,
      { type: "text-delta", id: "t1", delta: "刚才那次提交已经撤回了。" } as UIMessageChunk,
      { type: "text-end", id: "t1" } as UIMessageChunk,
      finishStep,
      finish
    ]);
    expect(parts.some((part) => part.type === "data-write-result")).toBe(false);
    expect(parts.filter((part) => part.type === "text").map((part) => (part as { text: string }).text)).toEqual(["刚才那次提交已经撤回了。"]);
  });

  it("emits a failed result from structured tool output", async () => {
    const timeline = createAssistantUiTimeline({ writeTools: {
      withdrawAssignmentSubmission: { label: "撤回提交", result: () => ({ ok: false, title: "撤回没有成功", detail: "没有可撤回的提交" }) }
    } });
    const writer = timeline.transform.writable.getWriter();
    const reader = timeline.transform.readable.getReader();
    const reading = (async () => { while (!(await reader.read()).done) { /* drain */ } })();
    await writer.write({ type: "tool-input-available", toolCallId: "w1", toolName: "withdrawAssignmentSubmission", input: {} } as UIMessageChunk);
    await writer.write({ type: "tool-output-available", toolCallId: "w1", output: { status: "attempt_not_found" } } as UIMessageChunk);
    await writer.write(finish);
    await writer.close();
    await reading;
    expect(timeline.recorder.parts.find((part) => part.type === "data-write-result")).toMatchObject({ data: { ok: false, title: "撤回没有成功" } });
  });
});

import { describe, expect, it } from "vitest";
import type { TextStreamPart, ToolSet } from "ai";
import { AssistantProtocolLeakError, createProtocolGuardTransform } from "./streamProtocolGuard";

type Part = TextStreamPart<ToolSet>;

function delta(text: string, id = "answer"): Part {
  return { type: "text-delta", id, text } as Part;
}

function startGuard() {
  const guard = createProtocolGuardTransform();
  const writer = guard.writable.getWriter();
  const reader = guard.readable.getReader();
  const chunks: string[] = [];
  const errors: unknown[] = [];
  const pump = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        if (value.type === "text-delta") chunks.push(value.text);
      }
    } catch (error) {
      errors.push(error);
    }
  })();
  return { writer, chunks, errors, pump };
}

describe("streaming protocol guard", () => {
  it("releases ordinary text immediately and keeps the tail that could start a marker", async () => {
    const guard = startGuard();
    await guard.writer.write(delta("这是一个正常的回答，内容足够长，可以立刻显示给用户。"));
    expect(guard.chunks.join("").length).toBeGreaterThan(10);
    await guard.writer.close();
    await guard.pump;
    expect(guard.chunks.join("")).toBe("这是一个正常的回答，内容足够长，可以立刻显示给用户。");
  });

  it("fails when a DSML marker arrives split across chunks", async () => {
    const guard = startGuard();
    await guard.writer.write(delta("正常内容 "));
    await guard.writer.write(delta("<|DS"));
    await expect(guard.writer.write(delta("ML| calls>"))).rejects.toBeInstanceOf(AssistantProtocolLeakError);
    await guard.pump;
    expect(guard.errors[0]).toBeInstanceOf(AssistantProtocolLeakError);
    expect(guard.chunks.join("")).not.toContain("DSML");
  });

  it("fails on a tool_use tag split across chunks", async () => {
    const guard = startGuard();
    await guard.writer.write(delta("先查一下 "));
    await guard.writer.write(delta("<tool_us"));
    await expect(guard.writer.write(delta('e name="searchKnowledge">'))).rejects.toBeInstanceOf(AssistantProtocolLeakError);
    await guard.pump;
    expect(guard.errors[0]).toBeInstanceOf(AssistantProtocolLeakError);
    expect(guard.chunks.join("")).not.toContain("tool_use");
  });

  it("fails on a bare invoke opener", async () => {
    const guard = startGuard();
    await guard.writer.write(delta("前一句\n"));
    await expect(guard.writer.write(delta("<invoke name=\"lookup\">"))).rejects.toBeInstanceOf(AssistantProtocolLeakError);
    await guard.pump;
    expect(guard.errors[0]).toBeInstanceOf(AssistantProtocolLeakError);
  });

  it("allows protocol text shown inside a fenced code block", async () => {
    const guard = startGuard();
    await guard.writer.write(delta("示例：\n```\n<|DSML| invoke name=\"lookup\">\n```\n结束"));
    await guard.writer.close();
    await guard.pump;
    const text = guard.chunks.join("");
    expect(text).toContain("<|DSML|");
    expect(text).toContain("结束");
    expect(guard.errors).toEqual([]);
  });
});

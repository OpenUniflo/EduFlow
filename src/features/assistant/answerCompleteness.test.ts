import { describe, expect, it } from "vitest";
import { looksIncompleteAnswer } from "./answerCompleteness";

describe("answer completeness", () => {
  it("accepts a finished Chinese sentence", () => {
    expect(looksIncompleteAnswer("Agent 会根据观察选择下一步。")).toBe(false);
    expect(looksIncompleteAnswer("可以！")).toBe(false);
    expect(looksIncompleteAnswer("先到这里。\n\n- 下一步：做小练习。")).toBe(false);
  });

  it("rejects a sentence cut mid-thought", () => {
    expect(looksIncompleteAnswer("它和普通循环的区别在于推理这一步被写出来并参与选动作，而纯行动的")).toBe(true);
    expect(looksIncompleteAnswer("这里还有三点：")).toBe(true);
    expect(looksIncompleteAnswer("先看这个例子，")).toBe(true);
    expect(looksIncompleteAnswer("这一步的关键：\n\n- **观察空间**：...\n- **动作空间**")).toBe(true);
    expect(looksIncompleteAnswer("你可以直接告诉我")).toBe(false);
    expect(looksIncompleteAnswer("我都可以帮你")).toBe(false);
  });

  it("rejects an unclosed code fence", () => {
    expect(looksIncompleteAnswer("```text\n示例")).toBe(true);
  });
});

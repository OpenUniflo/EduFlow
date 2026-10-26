import { describe, expect, it } from "vitest";
import type { Binding, LlmConfigV2 } from "./types";
import { promptParamUsage, renameParam, renderPromptPreview, renderPromptSegment, withRenamedNodeParams } from "./promptAuthoring";
import { createNodeV2 } from "./factory";

const binding = (pointer: string): Binding => ({ source: "state", pointer, onMissing: { mode: "error" } });

function config(prompt: LlmConfigV2["prompt"]): LlmConfigV2 {
  return { providerRef: "p4:owner:model:1", modelRef: "deepseek-flash", modelParameters: {}, allowedToolRefs: [], prompt };
}

function prompt(): LlmConfigV2["prompt"] {
  return {
    system: [
      { type: "text", text: "你是" },
      { type: "param", name: "role" },
      { type: "text", text: "。" },
    ],
    messages: [
      { role: "user", content: [{ type: "text", text: "问题：" }, { type: "param", name: "query" }] },
      { role: "assistant", content: [{ type: "text", text: "参考：" }, { type: "param", name: "context", format: "json" }] },
    ],
  };
}

describe("renderPromptSegment", () => {
  it("keeps strings verbatim and stringifies scalars for text segments", () => {
    expect(renderPromptSegment({ type: "text", text: "hello" }, {})).toBe("hello");
    expect(renderPromptSegment({ type: "param", name: "value" }, { value: "text" })).toBe("text");
    expect(renderPromptSegment({ type: "param", name: "value" }, { value: 3.5 })).toBe("3.5");
    expect(renderPromptSegment({ type: "param", name: "value" }, { value: true })).toBe("true");
    expect(renderPromptSegment({ type: "param", name: "value" }, { value: null })).toBe("null");
  });

  it("falls back to JSON for objects and arrays in text format", () => {
    expect(renderPromptSegment({ type: "param", name: "value" }, { value: { a: 1 } })).toBe('{"a":1}');
    expect(renderPromptSegment({ type: "param", name: "value" }, { value: [1, "二"] })).toBe('[1,"二"]');
  });

  it("always stringifies JSON segments", () => {
    expect(renderPromptSegment({ type: "param", name: "value", format: "json" }, { value: "text" })).toBe('"text"');
    expect(renderPromptSegment({ type: "param", name: "value", format: "json" }, { value: { a: 1 } })).toBe('{"a":1}');
    expect(renderPromptSegment({ type: "param", name: "value", format: "json" }, { value: 1 })).toBe("1");
  });

  it("renders missing parameters as empty text", () => {
    expect(renderPromptSegment({ type: "param", name: "missing" }, {})).toBe("");
  });
});

describe("renderPromptPreview", () => {
  it("renders the system message and every prompt message with its role", () => {
    const rendered = renderPromptPreview(prompt(), { role: "助手", query: "怎么学", context: { course: "EduFlow" } });
    expect(rendered).toEqual({
      system: "你是助手。",
      messages: [
        { role: "user", content: "问题：怎么学" },
        { role: "assistant", content: '参考：{"course":"EduFlow"}' },
      ],
    });
  });

  it("omits an empty system message but keeps message roles", () => {
    const rendered = renderPromptPreview({ system: [], messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }] }, {});
    expect(rendered).toEqual({ messages: [{ role: "user", content: "hi" }] });
  });

  it("supports an empty prompt definition without throwing", () => {
    expect(renderPromptPreview({ system: [], messages: [] }, {})).toEqual({ messages: [] });
    expect(renderPromptPreview(null as unknown as LlmConfigV2["prompt"], { value: 1 })).toEqual({ messages: [] });
  });

  it("renders missing parameters as empty text instead of undefined", () => {
    const rendered = renderPromptPreview({ system: [{ type: "param", name: "missing" }], messages: [{ role: "user", content: [{ type: "param", name: "missing" }] }] }, {});
    expect(rendered).toEqual({ messages: [{ role: "user", content: "" }] });
  });
});

describe("promptParamUsage", () => {
  it("collects referenced parameter names once across system and messages", () => {
    expect([...promptParamUsage(prompt())]).toEqual(["role", "query", "context"]);
    expect([...promptParamUsage({ system: [{ type: "param", name: "x" }], messages: [{ role: "user", content: [{ type: "param", name: "x" }, { type: "text", text: "x" }] }] })]).toEqual(["x"]);
  });

  it("returns an empty set for a prompt without parameters", () => {
    expect(promptParamUsage({ system: [], messages: [] }).size).toBe(0);
    expect(promptParamUsage(null as unknown as LlmConfigV2["prompt"]).size).toBe(0);
  });

  it("ignores malformed segments", () => {
    const malformed = { system: [null, { type: "param" }, { type: "text" }], messages: [{ role: "user", content: null }] } as unknown as LlmConfigV2["prompt"];
    expect(promptParamUsage(malformed).size).toBe(0);
  });
});

describe("renameParam", () => {
  function inputs(): Record<string, Binding> {
    return { role: binding("/role"), query: binding("/query"), context: binding("/context") };
  }

  it("renames the input key and every referencing prompt segment", () => {
    const original = config(prompt());
    const originalInputs = inputs();
    const result = renameParam(original, originalInputs, "query", "question");
    expect(Object.keys(result.inputs)).toEqual(["role", "question", "context"]);
    expect(result.inputs.question).toEqual(binding("/query"));
    expect(result.config.prompt.system).toEqual(original.prompt.system);
    expect(result.config.prompt.messages[0].content).toEqual([
      { type: "text", text: "问题：" },
      { type: "param", name: "question" },
    ]);
    expect(result.config.prompt.messages[1]).toEqual(original.prompt.messages[1]);
    expect(original.prompt.messages[0].content[1]).toEqual({ type: "param", name: "query" });
    expect(Object.keys(originalInputs)).toEqual(["role", "query", "context"]);
  });

  it("can rename a parameter that no segment references yet", () => {
    const result = renameParam(config({ system: [], messages: [{ role: "user", content: [] }] }), { unused: binding("/unused") }, "unused", "renamed");
    expect(Object.keys(result.inputs)).toEqual(["renamed"]);
    expect(result.config.prompt.messages[0].content).toEqual([]);
  });

  it("allows renaming a parameter to its current name", () => {
    const result = renameParam(config(prompt()), inputs(), "query", "query");
    expect(Object.keys(result.inputs)).toEqual(["role", "query", "context"]);
    expect(result.config.prompt.messages[0].content[1]).toEqual({ type: "param", name: "query" });
  });

  it("rejects an unknown source parameter", () => {
    expect(() => renameParam(config(prompt()), inputs(), "missing", "newName")).toThrow("参数「missing」不存在");
    expect(() => renameParam(config(prompt()), {}, "query", "newName")).toThrow("参数「query」不存在");
  });

  it("rejects collisions, reserved names and invalid identifiers", () => {
    expect(() => renameParam(config(prompt()), inputs(), "query", "role")).toThrow("已存在");
    expect(() => renameParam(config(prompt()), inputs(), "query", "history")).toThrow("不是合法的参数名");
    expect(() => renameParam(config(prompt()), inputs(), "query", "1query")).toThrow("不是合法的参数名");
    expect(() => renameParam(config(prompt()), inputs(), "query", "has-dash")).toThrow("不是合法的参数名");
    expect(() => renameParam(config(prompt()), inputs(), "query", "x".repeat(65))).toThrow("不是合法的参数名");
  });

  it("rejects a malformed prompt config instead of half-renaming", () => {
    expect(() => renameParam(null as unknown as LlmConfigV2, inputs(), "query", "question")).toThrow("提示词配置无效");
    expect(() => renameParam({ ...config(prompt()), prompt: { system: [], messages: null } } as unknown as LlmConfigV2, inputs(), "query", "question")).toThrow("提示词配置无效");
  });
});

describe("withRenamedNodeParams", () => {
  it("renames a model input and its prompt reference in one node edit", () => {
    const node = createNodeV2("core.llm", "model");
    node.config = config(prompt()) as unknown as Record<string, import("./types").JsonValue>;
    node.inputs = { role: binding("/role"), query: binding("/query"), context: binding("/context") };
    const next = withRenamedNodeParams(node, { role: binding("/role"), question: binding("/query"), context: binding("/context") });
    expect(Object.keys(next.inputs)).toEqual(["role", "question", "context"]);
    expect((next.config.prompt as LlmConfigV2["prompt"]).messages[0].content[1]).toEqual({ type: "param", name: "question" });
  });

  it("updates declared inputs without touching prompts for non-model nodes", () => {
    const node = createNodeV2("core.function", "fn");
    const next = withRenamedNodeParams(node, { input: binding("/value") });
    expect(next.inputs).toEqual({ input: binding("/value") });
    expect(next.config).toBe(node.config);
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { JsonSchema } from "../../domain/v2/types";
import { commitNewStateField, NodeOutputsTable, outputPointerFor, reducerLabel, stateFieldNameIssue } from "./NodeOutputsTable";

const stateSchema: JsonSchema = { type: "object", properties: { answer: { type: "string" }, mentions: { type: "array", items: { type: "string" } } } };

it("creates a State field and its output mapping in one onChangeWrites call", () => {
  const onCreateStateField = vi.fn();
  const onChangeWrites = vi.fn();
  commitNewStateField({ writes: { answer: "/text" }, stateField: "summary", outputPointer: "/result", onCreateStateField, onChangeWrites });
  expect(onCreateStateField).toHaveBeenCalledTimes(1);
  expect(onCreateStateField).toHaveBeenCalledWith("summary");
  expect(onChangeWrites).toHaveBeenCalledTimes(1);
  expect(onChangeWrites).toHaveBeenCalledWith({ answer: "/text", summary: "/result" });
  expect(outputPointerFor("a/b~c")).toBe("/a~1b~0c");
});

it("validates new State field names against existing fields and reserved keys", () => {
  expect(stateFieldNameIssue(stateSchema, "answer")).toContain("已存在");
  expect(stateFieldNameIssue(stateSchema, "__proto__")).toContain("保留名称");
  expect(stateFieldNameIssue(stateSchema, "   ")).toContain("不能为空");
  expect(stateFieldNameIssue(stateSchema, "fresh")).toBeUndefined();
});

it("renders State field rows with their output pointer, reducer and downstream readers", () => {
  const html = renderToStaticMarkup(createElement(NodeOutputsTable, {
    outputKeys: ["text", "messages"],
    writes: { answer: "/text" },
    onChangeWrites: vi.fn(),
    stateSchema,
    reducers: { answer: { name: "append" } },
    consumers: new Map([["answer", ["n2"]]]),
    nodeLabels: { n2: "整理社区问题" },
  }));
  expect(html).toContain("State · answer");
  expect(html).toContain("输出项 text");
  expect(html).toContain("/text");
  expect(html).toContain("追加");
  expect(html).toContain("下游读取 answer：整理社区问题");
  expect(html).toContain("不写入");
  // The unmapped output item stays available as a suggestion for a new mapping.
  expect(html).toContain("输出项 messages · 选择 State 字段");
});

it("keeps output editing read-only when requested", () => {
  const html = renderToStaticMarkup(createElement(NodeOutputsTable, {
    outputKeys: ["text"],
    writes: { answer: "/text" },
    onChangeWrites: vi.fn(),
    stateSchema,
    reducers: {},
    readOnly: true,
  }));
  expect(html).toContain('disabled=""');
  expect(html).not.toContain("新建字段");
  expect(html).not.toContain(">不写入</button>");
});

it("labels reducers with the StateFields wording", () => {
  expect(reducerLabel("replace")).toBe("覆盖");
  expect(reducerLabel("append")).toBe("追加");
  expect(reducerLabel("messages")).toBe("合并消息");
  expect(reducerLabel("custom.reducer")).toBe("custom.reducer");
});

describe("inferStateSchemaFromSample", () => {
  it("infers a new State field type from the observed output item", () => {
    expect(inferStateSchemaFromSample({ messages: [{ text: "hi" }] }, "/messages")).toEqual({ type: "array", items: { type: "object" } });
    expect(inferStateSchemaFromSample({ items: { count: 2 } }, "/items")).toEqual({ type: "object" });
    expect(inferStateSchemaFromSample({ total: 3 }, "/total")).toEqual({ type: "number" });
    expect(inferStateSchemaFromSample({ ok: true }, "/ok")).toEqual({ type: "boolean" });
    expect(inferStateSchemaFromSample(undefined, "/messages")).toEqual({ type: "string" });
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { JsonSchema } from "../../domain/v2/types";
import { createNodeV2, createWorkflowV2 } from "../../domain/v2/factory";
import { GRAPH_OUTPUT_NODE_ID } from "../../domain/v2/dataFlow";
import { withModelStructuredField } from "../../domain/v2/structuredOutput";
import { deleteWriteConfirmation, destinationChoices, NodeOutputsTable, outputFieldName, outputPointerFor, outputReaderNames, reducerLabel, safeOutputFieldName, structuredAnswerHint } from "./NodeOutputsTable";

const stateSchema: JsonSchema = { type: "object", properties: { answer: { type: "string" }, hits: { type: "array", items: { type: "object" } }, result: { type: "string" } } };

function modelNode() {
  const node = createNodeV2("core.llm", "model");
  node.writes = { answer: "/text" };
  return node;
}

it("keeps the small output helpers used by the panel", () => {
  expect(outputPointerFor("a/b~c")).toBe("/a~1b~0c");
  expect(outputFieldName("hits", { type: "object", properties: {} })).toBe("hits");
  expect(safeOutputFieldName("a b")).toBe("a_b");
  expect(reducerLabel("append")).toBe("追加");
});

it("offers a new auto-named field and disables incompatible existing fields with a reason", () => {
  const choices = destinationChoices({ item: { key: "hits", pointer: "/result/hits", type: "array" }, rowField: "hits", rowPointer: "/result/hits", writes: { hits: "/result/hits" }, stateSchema });
  expect(choices.auto.field).toBe("hits_2");
  expect(choices.auto.field).not.toBe("hits");
  expect(choices.existing.find(choice => choice.field === "hits")).toMatchObject({ compatible: true, selected: true });
  expect(choices.existing.find(choice => choice.field === "answer")).toMatchObject({ compatible: false, reason: "文本，类型不符" });
  expect(choices.existing.find(choice => choice.field === "result")).toMatchObject({ compatible: false, reason: "文本，类型不符" });
});

it("renders one row per write with its declared output type and no write switch", () => {
  const html = renderToStaticMarkup(createElement(NodeOutputsTable, {
    node: modelNode(),
    writes: { answer: "/text" },
    onChangeWrites: vi.fn(),
    stateSchema,
    nodeLabels: { n2: "整理社区问题" },
    consumers: new Map([["answer", ["n2"]]]),
  }));
  expect(html).toContain("输出项");
  expect(html).toContain("类型");
  expect(html).toContain("写入到");
  expect(html).toContain("回答");
  expect(html).toContain("文本");
  expect(html).toContain(">answer<");
  expect(html).not.toContain("aria-checked");
  expect(html).toContain("删除输出 answer");
  expect(html).toContain("下游读取 answer：整理社区问题");
});

it("uses the tool return structure for the add-output tree and hit types", () => {
  const node = createNodeV2("core.tool", "search");
  node.writes = { hits: "/result/hits" };
  const tool = { ref: "hn_search", name: "Hacker News 搜索", contractDigest: "d", inputSchema: { type: "object", properties: { query: { type: "string" } } }, outputSchema: { type: "object", properties: { hits: { type: "array", items: { type: "object", properties: { title: { type: "string" }, url: { type: "string" } } } } } } };
  const html = renderToStaticMarkup(createElement(NodeOutputsTable, { node, tool, writes: node.writes, onChangeWrites: vi.fn(), stateSchema, addOpen: true, onAddOutputs: vi.fn() }));
  expect(html).toContain("列表");
  expect(html).toContain("添加输出 hits");
  expect(html).toContain("hits › title");
  expect(html).toContain("hits › url");
  expect(html).toContain("来自 Hacker News 搜索的返回结构");
  expect(html).toContain("列表中的字段，请写入整组列表");
  expect(html).toMatch(/aria-label="添加输出 hits 的 title"[^>]*disabled=""/);
});

it("shows model structured fields with their user-defined type", () => {
  const base = createWorkflowV2();
  base.nodes.push(modelNode());
  const definition = withModelStructuredField(base, "model", { name: "keywords", type: "string", description: "搜索关键词" });
  const node = definition.nodes.find(item => item.id === "model")!;
  const html = renderToStaticMarkup(createElement(NodeOutputsTable, { node, writes: node.writes, onChangeWrites: vi.fn(), stateSchema: definition.state.schema, onRemoveStructuredField: vi.fn() }));
  expect(html).toContain("keywords");
  expect(html).toContain("结构化");
  expect(html).toContain("文本");
});

it("makes a structured field clickable for rename and offers a custom destination name", () => {
  const base = createWorkflowV2();
  base.nodes.push(modelNode());
  const definition = withModelStructuredField(base, "model", { name: "type", type: "string" });
  const node = definition.nodes.find(item => item.id === "model")!;
  const html = renderToStaticMarkup(createElement(NodeOutputsTable, {
    node,
    writes: node.writes,
    onChangeWrites: vi.fn(),
    stateSchema: definition.state.schema,
    producers: new Map([["type", ["model"]]]),
    onRenameStructuredField: vi.fn(),
    onRenameWriteField: vi.fn(),
    addOpen: true,
    onAddStructuredField: vi.fn(),
  }));
  expect(html).toContain('aria-label="重命名字段 type"');
  expect(html).toContain('aria-label="重命名写入字段 type"');
});

it("blocks direct field rename when more than one node writes the field and explains why", () => {
  const base = createWorkflowV2();
  base.nodes.push(modelNode());
  const definition = withModelStructuredField(base, "model", { name: "type", type: "string" });
  const node = definition.nodes.find(item => item.id === "model")!;
  const html = renderToStaticMarkup(createElement(NodeOutputsTable, {
    node,
    writes: node.writes,
    onChangeWrites: vi.fn(),
    stateSchema: definition.state.schema,
    producers: new Map([["type", ["model", "other"]]]),
    onRenameStructuredField: vi.fn(),
    onRenameWriteField: vi.fn(),
  }));
  expect(html).toContain("有 2 个节点写入此字段，不能直接改名");
  expect(html).not.toContain('aria-label="重命名写入字段 type"');
  expect(html).toMatch(/aria-label="重命名字段 type"[^>]*disabled=""/);
});

it("marks an already written output as checked, disabled and labelled", () => {
  const node = createNodeV2("core.tool", "search");
  node.writes = { hits: "/result/hits" };
  const tool = { ref: "hn_search", name: "Hacker News 搜索", contractDigest: "d", inputSchema: { type: "object", properties: {} }, outputSchema: { type: "object", properties: { hits: { type: "array", items: { type: "object", properties: { title: { type: "string" } } } } } } };
  const html = renderToStaticMarkup(createElement(NodeOutputsTable, { node, tool, writes: node.writes, onChangeWrites: vi.fn(), stateSchema, addOpen: true, onAddOutputs: vi.fn() }));
  expect(html).toMatch(/<input[^>]*aria-label="添加输出 hits"[^>]*checked=""/);
  expect(html).toMatch(/<input[^>]*aria-label="添加输出 hits"[^>]*disabled=""/);
  expect(html).toContain("已写入");
});

it("offers a one-click field type repair for a conflicting write", () => {
  const node = createNodeV2("core.tool", "search");
  node.writes = { hits: "/result/hits" };
  const tool = { ref: "hn_search", name: "Hacker News 搜索", contractDigest: "d", inputSchema: { type: "object", properties: {} }, outputSchema: { type: "object", properties: { hits: { type: "array", items: { type: "object" } } } } };
  const html = renderToStaticMarkup(createElement(NodeOutputsTable, { node, tool, writes: node.writes, onChangeWrites: vi.fn(), stateSchema: { type: "object", properties: { hits: { type: "string" } } }, onChangeFieldType: vi.fn() }));
  expect(html).toContain("文本，类型不符");
  expect(html).toContain("把字段改为列表");
});

it("keeps the plain hint for a retained raw answer when nothing downstream reads it", () => {
  const base = createWorkflowV2();
  const model = modelNode();
  const consumer = createNodeV2("core.function", "consumer");
  consumer.inputs = { input: { source: "state", pointer: "/answer", onMissing: { mode: "error" } } };
  base.nodes.push(model, consumer);
  const definition = withModelStructuredField(base, "model", { name: "keywords", type: "string" });
  const node = definition.nodes.find(item => item.id === "model")!;
  const html = renderToStaticMarkup(createElement(NodeOutputsTable, { node, writes: node.writes, onChangeWrites: vi.fn(), stateSchema: definition.state.schema }));
  expect(html).toContain("原始回答（JSON）");
  expect(html).toContain("已改用结构化字段，可删除这一行");
  expect(html).not.toContain("下游仍在读取");
});

it("warns with real downstream names when nodes or the workflow output still read the raw answer", () => {
  const base = createWorkflowV2();
  const model = modelNode();
  const consumer = createNodeV2("core.function", "consumer");
  consumer.inputs = { input: { source: "state", pointer: "/answer", onMissing: { mode: "error" } } };
  base.nodes.push(model, consumer);
  const definition = withModelStructuredField(base, "model", { name: "keywords", type: "string" });
  const node = definition.nodes.find(item => item.id === "model")!;
  const html = renderToStaticMarkup(createElement(NodeOutputsTable, {
    node,
    writes: node.writes,
    onChangeWrites: vi.fn(),
    stateSchema: definition.state.schema,
    consumers: new Map([["answer", ["consumer", GRAPH_OUTPUT_NODE_ID]]]),
    nodeLabels: { consumer: "整理社区问题" },
  }));
  expect(html).toContain("下游仍在读取（整理社区问题、工作流输出）");
  expect(html).toContain("回答现在是 JSON 文本");
  expect(html).toContain("请先修改下游");
  expect(html).not.toContain("已改用结构化字段，可删除这一行");
});

it("warns before the first structured field when the workflow output reads the answer", () => {
  const base = createWorkflowV2();
  base.nodes.push(modelNode());
  base.outputBindings = { answer: { source: "state", pointer: "/answer", onMissing: { mode: "error" } } };
  const node = base.nodes.find(item => item.id === "model")!;
  const html = renderToStaticMarkup(createElement(NodeOutputsTable, {
    node,
    writes: node.writes,
    onChangeWrites: vi.fn(),
    stateSchema: base.state.schema,
    consumers: new Map([["answer", [GRAPH_OUTPUT_NODE_ID]]]),
    addOpen: true,
    onAddStructuredField: vi.fn(),
  }));
  expect(html).toContain("开启后，这个模型的回答会变成 JSON，工作流最终输出也会是 JSON。");
});

it("names affected downstream readers in the delete confirmation", () => {
  expect(outputReaderNames(["consumer", GRAPH_OUTPUT_NODE_ID], { consumer: "整理社区问题" })).toEqual(["整理社区问题", "工作流输出"]);
  expect(structuredAnswerHint(["工作流输出"])).toContain("工作流输出");
  const confirmation = deleteWriteConfirmation("answer", ["整理社区问题", "工作流输出"]);
  expect(confirmation).toContain("整理社区问题、工作流输出");
  expect(confirmation).toContain("仍要删除吗");
  expect(deleteWriteConfirmation("answer", [])).toBeUndefined();
});

it("falls back to the latest run value and then to 任意, never to 文本", () => {
  const node = createNodeV2("core.function", "fn");
  node.config = { implementation: "code", language: "python", code: "" };
  node.writes = { result: "/result" };
  const fromRun = renderToStaticMarkup(createElement(NodeOutputsTable, { node, writes: node.writes, onChangeWrites: vi.fn(), stateSchema: { type: "object", properties: { result: { type: "object" } } }, lastOutput: { result: { ok: true } } }));
  expect(fromRun).toContain("对象");
  const unknown = renderToStaticMarkup(createElement(NodeOutputsTable, { node, writes: node.writes, onChangeWrites: vi.fn(), stateSchema: { type: "object", properties: { result: {} } } }));
  expect(unknown).toContain("任意");
});

it("keeps read-only tables free of delete and destination controls", () => {
  const html = renderToStaticMarkup(createElement(NodeOutputsTable, { node: modelNode(), writes: { answer: "/text" }, onChangeWrites: vi.fn(), stateSchema, readOnly: true }));
  expect(html).toContain('disabled=""');
  expect(html).not.toContain("删除输出");
  expect(html).not.toContain("wf-outputs-remove");
});

import { expect, it } from "vitest";
import { createNodeV2 } from "./factory";
import { destinationChoices } from "../../editor/v2/NodeOutputsTable";
import { nodeOutputItems, outputItemAt, outputSchemaItems, outputTypeMismatch, primaryToolOutput, schemaOutputType, structuredOutputFields, writeOutputType } from "./outputStructure";
import type { WorkflowTool } from "./types";

const tool: WorkflowTool = {
  ref: "hn_search", name: "Hacker News 搜索", contractDigest: "d",
  inputSchema: { type: "object", properties: { query: { type: "string" } } },
  outputSchema: { type: "object", properties: { hits: { type: "array", items: { type: "object", properties: { title: { type: "string" } } } } } },
};

it("maps schemas to the five Chinese output types and 任意", () => {
  expect(schemaOutputType({ type: "string" })).toBe("string");
  expect(schemaOutputType({ type: "integer" })).toBe("number");
  expect(schemaOutputType({ type: "array", items: {} })).toBe("array");
  expect(schemaOutputType({ type: "object", properties: {} })).toBe("object");
  expect(schemaOutputType(undefined)).toBe("any");
});

it("builds a tool output tree with /result pointers and primary default write", () => {
  const node = createNodeV2("core.tool", "search");
  const items = nodeOutputItems(node, tool);
  expect(items[0]).toMatchObject({ key: "hits", pointer: "/result/hits", type: "array" });
  expect(items[0].children?.[0]).toMatchObject({ key: "title", pointer: "/result/hits/0/title", type: "string" });
  expect(primaryToolOutput(tool)).toEqual({ name: "hits", pointer: "/result/hits", type: "array" });
  expect(outputItemAt(outputSchemaItems(tool.outputSchema, "/result"), "/result/hits")).toBeTruthy();
});

it("derives model answer, structured fields and advanced outputs from the contract", () => {
  const node = createNodeV2("core.llm", "model");
  node.config = { ...node.config, structuredOutput: { fields: [{ name: "keywords", type: "string", description: "关键词" }] } };
  expect(structuredOutputFields(node)).toEqual([{ name: "keywords", type: "string", description: "关键词" }]);
  expect(writeOutputType(node, "/text")).toBe("string");
  expect(writeOutputType(node, "/keywords")).toBe("string");
  expect(nodeOutputItems(node).find(item => item.pointer === "/messages")?.advanced).toBe(true);
});

it("compares output types with State field types, allowing any", () => {
  expect(outputTypeMismatch("array", { type: "array", items: {} })).toBeUndefined();
  expect(outputTypeMismatch("number", { type: "integer" })).toBeUndefined();
  expect(outputTypeMismatch("array", { type: "string" })).toBe("文本，类型不符");
  expect(outputTypeMismatch("any", { type: "string" })).toBeUndefined();
  expect(destinationChoices({ item: { key: "hits", pointer: "/result/hits", type: "array" }, rowField: "hits", rowPointer: "/result/hits", writes: { hits: "/result/hits" }, stateSchema: { type: "object", properties: { hits: { type: "array" }, answer: { type: "string" } } } }).existing.find(choice => choice.field === "answer")?.reason).toBe("文本，类型不符");
});

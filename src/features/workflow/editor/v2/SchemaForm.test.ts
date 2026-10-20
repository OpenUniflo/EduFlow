import { expect, it, vi } from "vitest";
import { putValue, valueAt, resolveFormSchema, SchemaForm } from "./SchemaForm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StateFields } from "./StateFields";
import { createWorkflowV2 } from "../../domain/v2/factory";
it("retains null, false and zero, supports escaped paths, and omits optional fields without defaults", () => {
  let value = putValue({}, "/a~1b/~0", false); value = putValue(value, "/count", 0); value = putValue(value, "/note", null);
  expect(valueAt(value, "/a~1b/~0")).toBe(false); expect(valueAt(value, "/count")).toBe(0); expect(valueAt(value, "/note")).toBe(null);
  expect(valueAt(putValue(value, "/note", undefined), "/note")).toBeUndefined();
  expect(putValue({}, "", null)).toBeNull();
});
it("uses local schema refs without applying default values and handles prototype-like field names as data", () => {
  const root = { $defs: { text: { type: "string", default: "suggestion" } } };
  expect(resolveFormSchema({ $ref: "#/$defs/text" }, root).type).toBe("string");
  const result = putValue({}, "/__proto__/test", "data"); expect(valueAt(result, "/__proto__/test")).toBe("data"); expect(({} as Record<string, unknown>).test).toBeUndefined();
  expect(valueAt({}, "/toString")).toBeUndefined();
});
it("does not report nested required fields for the observed valid nullable object", () => {
  const html = renderToStaticMarkup(createElement(SchemaForm, { schema: {type:"object",properties:{details:{type:["object","null"],properties:{tag:{type:"string"}},required:["tag"],additionalProperties:false}},additionalProperties:false},value:{details:null},label:"运行输入",onChange:()=>undefined }));
  expect(html).toContain("当前值：null"); expect(html).not.toContain("请检查tag"); expect(html).not.toContain('input:/details/tag');
});
it("shows a persisted null State initial value without inventing an empty array", () => {
  const definition = createWorkflowV2();
  definition.state.schema = { type: "object", properties: { values: { type: ["array", "null"], items: { type: "string" } } } };
  definition.state.initial = { values: null }; definition.state.reducers = { values: { name: "replace", version: 1 } };
  const html = renderToStaticMarkup(createElement(StateFields, { definition, onChange: () => undefined }));
  expect(html).toContain("当前值：null"); expect(html).not.toContain("当前未设置初值");
  expect(definition.state.initial.values).toBeNull();
});
it("renders a required recursive schema as an unsupported structure without recursing or changing the input", () => {
  const schema = { $defs: { node: { type: "object", properties: { next: { $ref: "#/$defs/node" } }, required: ["next"], additionalProperties: false } }, $ref: "#/$defs/node" };
  const value = { next: { note: "preserved" } };
  const before = JSON.stringify({ schema, value }); const onChange = vi.fn();
  const html = renderToStaticMarkup(createElement(SchemaForm, { schema, value, label: "运行输入", onChange }));
  expect(html).toContain("不支持递归 Schema"); expect(html).toContain("原输入已保留"); expect(html).toContain("高级 JSON");
  expect(html).not.toContain("input:/next"); expect(onChange).not.toHaveBeenCalled(); expect(JSON.stringify({ schema, value })).toBe(before);
});

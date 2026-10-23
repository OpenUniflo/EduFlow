import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { Binding, JsonSchema } from "../../domain/v2/types";
import { addDeclaredParam, applyDeclaredBinding, initialLiteralValue, NodeParamsTable, paramNameIssue, PARAM_NAME_RULES, renameDeclaredParam } from "./NodeParamsTable";

const stateBinding: Binding = { source: "state", pointer: "/answer", onMissing: { mode: "error" } };
const literal = (value: string | number | boolean): Binding => ({ source: "literal", value });

it("names new declared parameters with defaultParamName and keeps the node namespace unique", () => {
  expect(addDeclaredParam({})).toEqual({ inputs: { value: { source: "literal", value: "" } }, name: "value" });
  const first = addDeclaredParam({});
  const second = addDeclaredParam(first.inputs);
  expect(second.name).toBe("value_2");
  expect(Object.keys(second.inputs)).toEqual(["value", "value_2"]);
  const fromField = addDeclaredParam({}, stateBinding);
  expect(fromField.name).toBe("answer");
});

it("rejects duplicate, illegal and reserved parameter names without changing inputs", () => {
  const inputs = { answer: literal("a"), total: literal(1) };
  const duplicate = renameDeclaredParam(inputs, "answer", "total");
  expect(duplicate.renamed).toBe(false);
  expect(duplicate.reason).toContain("已被此节点的另一个参数使用");
  expect(duplicate.inputs).toBe(inputs);
  expect(renameDeclaredParam(inputs, "answer", "1bad").reason).toBe(PARAM_NAME_RULES);
  expect(renameDeclaredParam(inputs, "answer", "history").reason).toBe(PARAM_NAME_RULES);
  expect(renameDeclaredParam(inputs, "answer", "  ").reason).toBe("参数名不能为空。");
  expect(paramNameIssue(inputs, "answer", "total")).toContain("已被");
  expect(paramNameIssue(inputs, "answer", "answer")).toBeUndefined();
  const renamed = renameDeclaredParam(inputs, "answer", "result");
  expect(renamed.renamed).toBe(true);
  expect(Object.keys(renamed.inputs)).toEqual(["result", "total"]);
});

it("renames a still-default parameter to the picked field name but preserves a manual name", () => {
  const auto = applyDeclaredBinding({ value: literal("") }, "value", { source: "state", pointer: "/summary/topics", onMissing: { mode: "error" } });
  expect(auto.name).toBe("topics");
  expect(Object.keys(auto.inputs)).toEqual(["topics"]);
  const manual = applyDeclaredBinding({ query: literal("") }, "query", { source: "input", pointer: "/question", onMissing: { mode: "error" } });
  expect(manual.name).toBe("query");
  expect(manual.inputs.query).toMatchObject({ source: "input", pointer: "/question" });
  expect(applyDeclaredBinding({ value: literal(""), topics: literal("") }, "value", { source: "state", pointer: "/summary/topics", onMissing: { mode: "error" } }).name).toBe("topics_2");
});

it("renders fixed values as read-only controls when the table is read-only", () => {
  const html = renderToStaticMarkup(createElement(NodeParamsTable, {
    mode: "declared",
    inputs: { q: literal("已固定") },
    onChangeInputs: vi.fn(),
    inputSchema: { type: "object", properties: { q: { type: "string" } } },
    stateSchema: { type: "object" },
    readOnly: true,
  }));
  expect(html).toContain('aria-label="q 固定值"');
  expect(html).toContain('readOnly=""');
  expect(html).toContain('aria-pressed="true"');
  expect(html).not.toContain("新增参数");
  expect(html).not.toContain("删除参数");
});

it("renders Schema-mode rows read-only with title, description, type and a required-missing flag", () => {
  const inputSchema: JsonSchema = { type: "object", properties: { query: { type: "string", title: "查询", description: "要检索的词" } }, required: ["query"] };
  const html = renderToStaticMarkup(createElement(NodeParamsTable, {
    mode: "schema",
    inputs: { arguments: literal("{}") },
    onChangeInputs: vi.fn(),
    inputSchema,
    stateSchema: { type: "object" },
  }));
  expect(html).toContain("查询");
  expect(html).toContain("要检索的词");
  expect(html).toContain("类型：文本 · 必填");
  expect(html).toContain('data-required-missing="true"');
  expect(html).toContain("必填参数尚未填写");
  expect(html).toContain("当前输入不在工具的输入 Schema 中：arguments");
  expect(html).not.toContain("参数名 query");
  expect(html).not.toContain("新增参数");
});

it("renders literal controls by parameter type, including a collapsed SchemaForm for objects", () => {
  const inputSchema: JsonSchema = {
    type: "object",
    properties: {
      text: { type: "string" },
      count: { type: "number" },
      flag: { type: "boolean" },
      mode: { type: "string", enum: ["a", "b"] },
      obj: { type: "object", properties: { nested: { type: "string" } } },
    },
  };
  const html = renderToStaticMarkup(createElement(NodeParamsTable, {
    mode: "declared",
    inputs: { text: literal("hello"), count: literal(2), flag: literal(true), mode: literal("a"), obj: { source: "literal", value: { nested: "x" } } },
    onChangeInputs: vi.fn(),
    inputSchema,
    stateSchema: { type: "object" },
  }));
  expect(html).toContain('type="text"');
  expect(html).toContain('type="number"');
  expect(html).toContain('role="switch"');
  expect(html).toContain('aria-label="mode 固定值"');
  expect(html).toContain("对象固定值（表单）");
  expect(html).toContain('aria-label="obj 固定值"');
});

it("seeds initial literal values from the parameter sub-Schema", () => {
  expect(initialLiteralValue({ type: "string" })).toBe("");
  expect(initialLiteralValue({ type: "integer" })).toBe(0);
  expect(initialLiteralValue({ type: "boolean" })).toBe(false);
  expect(initialLiteralValue({ type: "object", properties: {} })).toEqual({});
  expect(initialLiteralValue({ type: "array", items: { type: "string" } })).toEqual([]);
  expect(initialLiteralValue({ type: "string", enum: ["x", "y"] })).toBe("x");
});

import { describe, expect, it } from "vitest";
import type { Binding, JsonSchema } from "./types";
import { assembleToolArguments, reconcileToolInputs, refreshToolContract, toolContractRefreshMessage, toolParamRows } from "./toolParams";

const literalBinding = (value: string | number | boolean): Binding => ({ source: "literal", value });
const stateBinding = (pointer: string): Binding => ({ source: "state", pointer, onMissing: { mode: "error" } });

const schema: JsonSchema = {
  type: "object",
  properties: {
    query: { type: "string", title: "查询", description: "检索关键词" },
    limit: { type: "number" },
  },
  required: ["limit"],
};

describe("toolParamRows", () => {
  it("builds rows in Schema property order with titles, descriptions and bindings", () => {
    const rows = toolParamRows(schema, { query: stateBinding("/question") });
    expect(rows).toEqual([
      { name: "query", title: "查询", description: "检索关键词", schema: { type: "string", title: "查询", description: "检索关键词" }, required: false, binding: stateBinding("/question") },
      { name: "limit", title: "limit", schema: { type: "number" }, required: true },
    ]);
    expect(rows.map(row => row.name)).toEqual(["query", "limit"]);
  });

  it("returns no rows for empty or malformed Schemas", () => {
    expect(toolParamRows(undefined, {})).toEqual([]);
    expect(toolParamRows({}, { a: stateBinding("/a") })).toEqual([]);
    expect(toolParamRows({ properties: null } as unknown as JsonSchema, {})).toEqual([]);
    expect(toolParamRows({ properties: [] } as unknown as JsonSchema, {})).toEqual([]);
    expect(toolParamRows(null as unknown as JsonSchema, {})).toEqual([]);
  });

  it("tolerates boolean property Schemas and non-string required entries", () => {
    const rows = toolParamRows({ properties: { any: true, never: false, plain: "text" }, required: [1, "any"] } as unknown as JsonSchema, {});
    expect(rows).toEqual([
      { name: "any", title: "any", schema: {}, required: true },
      { name: "never", title: "never", schema: {}, required: false },
      { name: "plain", title: "plain", schema: {}, required: false },
    ]);
  });

  it("ignores bindings for parameters that are not in the Schema", () => {
    const rows = toolParamRows(schema, { removed: stateBinding("/old") });
    expect(rows.every(row => row.binding === undefined)).toBe(true);
  });
});

describe("assembleToolArguments", () => {
  it("assembles declared inputs and omits missing optional values", () => {
    const inputs: Record<string, Binding> = {
      query: stateBinding("/question"),
      limit: literalBinding(10),
      optional: stateBinding("/maybe"),
    };
    expect(assembleToolArguments(inputs, { query: "hello", limit: 10, optional: undefined })).toEqual({ query: "hello", limit: 10 });
  });

  it("falls back to literal values when the resolved map omits them", () => {
    const inputs: Record<string, Binding> = { mode: literalBinding("fast"), count: literalBinding(0), flag: literalBinding(false) };
    expect(assembleToolArguments(inputs, {})).toEqual({ mode: "fast", count: 0, flag: false });
  });

  it("returns an empty object for empty or malformed inputs", () => {
    expect(assembleToolArguments({}, { a: 1 })).toEqual({});
    expect(assembleToolArguments(null as unknown as Record<string, Binding>, { a: 1 })).toEqual({});
    expect(assembleToolArguments({}, null as unknown as Record<string, never>)).toEqual({});
  });

  it("ignores values that the node did not declare as inputs", () => {
    expect(assembleToolArguments({ query: stateBinding("/q") }, { query: "x", injected: "ignored" })).toEqual({ query: "x" });
  });
});

describe("reconcileToolInputs", () => {
  const oldSchema: JsonSchema = { type: "object", properties: { a: { type: "string" }, b: { type: "string" } }, required: ["a"] };
  const newSchema: JsonSchema = { type: "object", properties: { a: { type: "string" }, c: { type: "string" } }, required: ["a", "c"] };

  it("keeps same-named bindings and reports added, removed and newly required parameters", () => {
    const inputs = { a: stateBinding("/a"), b: stateBinding("/b") };
    const result = reconcileToolInputs(oldSchema, newSchema, inputs);
    expect(result).toEqual({ inputs: { a: stateBinding("/a") }, added: ["c"], removed: ["b"], newlyRequired: ["c"] });
    expect(inputs).toEqual({ a: stateBinding("/a"), b: stateBinding("/b") });
  });

  it("reports an existing parameter that became required", () => {
    const result = reconcileToolInputs({ properties: { a: {} } }, { properties: { a: {} }, required: ["a"] }, { a: stateBinding("/a") });
    expect(result.newlyRequired).toEqual(["a"]);
    expect(result.inputs).toEqual({ a: stateBinding("/a") });
  });

  it("treats a missing old Schema as newly added properties", () => {
    const result = reconcileToolInputs(undefined, newSchema, { a: stateBinding("/a") });
    expect(result).toEqual({ inputs: { a: stateBinding("/a") }, added: ["a", "c"], removed: [], newlyRequired: ["a", "c"] });
  });

  it("drops every binding when the new Schema explicitly declares no properties", () => {
    const result = reconcileToolInputs(oldSchema, { type: "object", properties: {} }, { a: stateBinding("/a"), b: stateBinding("/b") });
    expect(result).toEqual({ inputs: {}, added: [], removed: ["a", "b"], newlyRequired: [] });
  });

  it("keeps bindings when the new Schema has no properties object", () => {
    const result = reconcileToolInputs(oldSchema, { type: "object" }, { a: stateBinding("/a") });
    expect(result).toEqual({ inputs: { a: stateBinding("/a") }, added: [], removed: [], newlyRequired: [] });
  });

  it("returns the inputs unchanged for a malformed new Schema", () => {
    for (const invalid of [null, "text", [1, 2]]) {
      const result = reconcileToolInputs(oldSchema, invalid as unknown as JsonSchema, { a: stateBinding("/a") });
      expect(result).toEqual({ inputs: { a: stateBinding("/a") }, added: [], removed: [], newlyRequired: [] });
    }
  });

  it("preserves input order when pruning removed parameters", () => {
    const result = reconcileToolInputs(
      { properties: { a: {}, b: {}, c: {} } },
      { properties: { a: {}, c: {} } },
      { c: stateBinding("/c"), b: stateBinding("/b"), a: stateBinding("/a") },
    );
    expect(Object.keys(result.inputs)).toEqual(["c", "a"]);
    expect(result.removed).toEqual(["b"]);
  });
});

describe("refreshToolContract", () => {
  const tool = {
    ref: "hn_search",
    contractDigest: "5ff7",
    inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query", "limit"] } satisfies JsonSchema,
  };

  it("updates only the digest and keeps same-named bindings, including sources and literals", () => {
    const inputs = {
      query: { source: "state", pointer: "/keywords", onMissing: { mode: "error" } } as Binding,
      limit: literalBinding(10),
    };
    const result = refreshToolContract({ config: { toolRef: "hn_search", contractDigest: "old", extra: "keep" }, inputs, tool });
    expect(result.config).toEqual({ toolRef: "hn_search", contractDigest: "5ff7", extra: "keep" });
    expect(result.inputs).toEqual(inputs);
    expect(result.removed).toEqual([]);
    expect(result.missingRequired).toEqual([]);
    expect(inputs).toEqual({ query: { source: "state", pointer: "/keywords", onMissing: { mode: "error" } }, limit: literalBinding(10) });
  });

  it("removes parameters that the current Schema no longer declares and reports them", () => {
    const result = refreshToolContract({
      config: { toolRef: "hn_search", contractDigest: "old" },
      inputs: { query: stateBinding("/keywords"), stale: literalBinding("x") },
      tool,
    });
    expect(result.inputs).toEqual({ query: stateBinding("/keywords") });
    expect(result.removed).toEqual(["stale"]);
    expect(result.missingRequired).toEqual(["limit"]);
  });

  it("reports required parameters that have no binding after the refresh", () => {
    const result = refreshToolContract({
      config: { toolRef: "hn_search", contractDigest: "old" },
      inputs: { query: stateBinding("/keywords") },
      tool: { contractDigest: "5ff7", inputSchema: { type: "object", properties: { query: { type: "string" }, fresh: { type: "string" } }, required: ["query", "fresh"] } },
    });
    expect(result.inputs).toEqual({ query: stateBinding("/keywords") });
    expect(result.missingRequired).toEqual(["fresh"]);
  });

  it("keeps every binding for an open Schema without properties", () => {
    const result = refreshToolContract({ config: { toolRef: "hn_search", contractDigest: "old" }, inputs: { query: stateBinding("/keywords") }, tool: { contractDigest: "5ff7", inputSchema: { type: "object" } } });
    expect(result.inputs).toEqual({ query: stateBinding("/keywords") });
    expect(result.removed).toEqual([]);
    expect(result.missingRequired).toEqual([]);
  });

  it("describes an unchanged wiring and lists removed and required parameters", () => {
    expect(toolContractRefreshMessage({ removed: [], missingRequired: [] })).toBe("已刷新，参数接线保持不变");
    expect(toolContractRefreshMessage({ removed: ["stale"], missingRequired: [] })).toBe("已刷新。已移除参数：stale。");
    expect(toolContractRefreshMessage({ removed: [], missingRequired: ["fresh"] })).toBe("已刷新。需补充的必填参数：fresh，请在参数表中接上。");
    expect(toolContractRefreshMessage({ removed: ["stale"], missingRequired: ["fresh"] })).toBe("已刷新。已移除参数：stale。需补充的必填参数：fresh，请在参数表中接上。");
  });
});

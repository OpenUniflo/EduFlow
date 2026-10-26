import { describe, expect, it } from "vitest";
import type { Binding, JsonSchema } from "../../domain/v2/types";
import { applyWorkbenchBinding, workbenchUseHint } from "./workbenchBinding";

const field: Binding = { source: "state", pointer: "/text", onMissing: { mode: "error" } };
const toolSchema: JsonSchema = {
  type: "object",
  properties: {
    query: { type: "string", title: "查询" },
    limit: { type: "number", title: "数量" },
  },
  required: ["query"],
};

describe("workbench tool bindings", () => {
  it("does not invent tool inputs when more than one parameter is unfilled", () => {
    const result = applyWorkbenchBinding({}, { mode: "schema", inputSchema: toolSchema, target: null, binding: field });
    expect(result.applied).toBe(false);
    expect(result.inputs).toEqual({});
    expect(result.message).toContain("拖到要使用的参数行上");
    expect(workbenchUseHint("schema", toolSchema, {})).toContain("拖到要使用的参数行上");
  });

  it("fills the only unfilled tool parameter instead of adding a new one", () => {
    const result = applyWorkbenchBinding({ limit: { source: "literal", value: 3 } }, { mode: "schema", inputSchema: toolSchema, target: null, binding: field });
    expect(result.applied).toBe(true);
    expect(result.inputs).toEqual({ limit: { source: "literal", value: 3 }, query: field });
    expect(Object.keys(result.inputs)).toEqual(["limit", "query"]);
    expect(workbenchUseHint("schema", toolSchema, { limit: { source: "literal", value: 3 } })).toBe("");
  });

  it("still adds parameters for declarative nodes and keeps an explicit row target", () => {
    const declared = applyWorkbenchBinding({}, { mode: "declared", inputSchema: { type: "object" }, target: null, binding: field, nodeLabel: "生成回答" });
    expect(declared.applied).toBe(true);
    expect(declared.inputs).toEqual({ text: field });
    expect(declared.message).toContain("生成回答");

    const targeted = applyWorkbenchBinding({}, { mode: "schema", inputSchema: toolSchema, target: "limit", binding: field });
    expect(targeted.applied).toBe(true);
    expect(targeted.inputs).toEqual({ limit: field });
  });
});

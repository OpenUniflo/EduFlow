import { describe, expect, it } from "vitest";
import { createNodeV2 } from "./factory";
import { functionOutputCount, nodeCardSummary, pointerFieldName, routerSummaryField } from "./nodeSummary";

function node(type: string, config: Record<string, unknown> = {}, id = type) {
  const created = createNodeV2(type, id);
  created.config = { ...created.config, ...config } as typeof created.config;
  return created;
}

describe("nodeCardSummary", () => {
  it("shows the configured model or an actionable choice, never an internal ref", () => {
    expect(nodeCardSummary(node("core.llm", { modelRef: "deepseek-flash" }), { modelName: "deepseek-flash" })).toEqual({ text: "deepseek-flash", mono: true });
    expect(nodeCardSummary(node("core.llm", { modelRef: "p4:user:abc:1" }))).toEqual({ text: "选择模型", mono: true });
    expect(nodeCardSummary(node("core.llm"))).toEqual({ text: "选择模型", mono: true });
  });

  it("uses the tool display name and hides unresolved connection identity", () => {
    expect(nodeCardSummary(node("core.tool", { toolRef: "hn_search" }), { toolName: "Hacker News 搜索" }).text).toBe("Hacker News 搜索");
    expect(nodeCardSummary(node("core.tool", { toolRef: "p4:owner:conn:2" })).text).toBe("工具已配置");
    expect(nodeCardSummary(node("core.tool")).text).toBe("选择工具");
  });

  it("summarizes a function as language plus output count", () => {
    const fn = node("core.function", { language: "python", outputSchema: { type: "object", properties: { summary: {}, topics: {} } } });
    expect(functionOutputCount(fn)).toBe(2);
    expect(nodeCardSummary(fn).text).toBe("Python · 2 个输出");
    expect(nodeCardSummary(node("core.function", { language: "javascript" })).text).toBe("JavaScript · 1 个输出");
  });

  it("summarizes a router by the field it tests", () => {
    const router = node("core.router", { cases: [{ id: "branch_1", priority: 1, predicate: { op: "eq", left: { source: "state", pointer: "/handling" }, right: { source: "literal", value: "reply" } } }] });
    expect(routerSummaryField(router)).toBe("handling");
    expect(nodeCardSummary(router).text).toBe("按「handling」判断");
    expect(nodeCardSummary(node("core.router")).text).toBe("按「pendingCalls」判断");
  });

  it("decodes escaped pointer tokens and falls back for malformed predicates", () => {
    expect(pointerFieldName("/a~1b~0c")).toBe("a/b~c");
    expect(pointerFieldName(42)).toBeUndefined();
    const router = node("core.router", { cases: [{ id: "x", priority: 1, predicate: { op: "nonEmpty", source: "state", pointer: "/topic count" } }] });
    expect(nodeCardSummary(router).text).toBe("按「topic count」判断");
  });
});

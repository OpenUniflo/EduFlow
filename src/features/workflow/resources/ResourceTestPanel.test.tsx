import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ConnectionTestResult } from "../domain/v2/types";
import { formatElapsed, ResourceTestPanel } from "./ResourceTestPanel";

describe("formatElapsed", () => {
  it("renders milliseconds and seconds", () => {
    expect(formatElapsed(820)).toBe("820 毫秒");
    expect(formatElapsed(1250)).toBe("1.25 秒");
  });

  it("hides missing or unusable durations", () => {
    expect(formatElapsed(undefined)).toBe("");
    expect(formatElapsed(Number.NaN)).toBe("");
    expect(formatElapsed(-1)).toBe("");
  });
});

describe("ResourceTestPanel", () => {
  it("shows a placeholder before a test", () => {
    const html = renderToStaticMarkup(createElement(ResourceTestPanel, { result: null }));
    expect(html).toContain("尚未测试连接");
  });

  it("shows model discovery results with status and duration", () => {
    const result: ConnectionTestResult = { ok: true, elapsedMs: 640, status: 200, models: ["deepseek-chat", "deepseek-reasoner"] };
    const html = renderToStaticMarkup(createElement(ResourceTestPanel, { result }));
    expect(html).toContain("测试成功");
    expect(html).toContain("HTTP 200");
    expect(html).toContain("640 毫秒");
    expect(html).toContain("可用模型（2）");
    expect(html).toContain("deepseek-reasoner");
  });

  it("shows discovered MCP tools and a sanitized preview", () => {
    const result: ConnectionTestResult = { ok: true, elapsedMs: 100, tools: [{ name: "search_docs", description: "搜索文档" }], preview: "{\"ok\":true}" };
    const html = renderToStaticMarkup(createElement(ResourceTestPanel, { result }));
    expect(html).toContain("可发现的工具（1）");
    expect(html).toContain("search_docs");
    expect(html).toContain("搜索文档");
    expect(html).toContain("响应预览（已脱敏，最多 4KB）");
  });

  it("shows worker errors without claiming success", () => {
    const result: ConnectionTestResult = { ok: false, error: { code: "CONNECTION_TEST_FAILED", message: "unreachable" } };
    const html = renderToStaticMarkup(createElement(ResourceTestPanel, { result }));
    expect(html).toContain("测试失败");
    expect(html).toContain("CONNECTION_TEST_FAILED · unreachable");
    expect(html).not.toContain("测试成功");
  });
});

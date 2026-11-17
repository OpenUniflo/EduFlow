import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { McpOAuthWindowResult } from "./McpOAuthWindowResult";

const noop = () => undefined;

describe("McpOAuthWindowResult", () => {
  it("announces the server result without claiming the connection is ready", () => {
    const html = renderToStaticMarkup(createElement(McpOAuthWindowResult, {
      result: { status: "pending", flowId: "flow_0123456789abcdef", ref: "qcc", tools: 3, message: "", popup: true },
      onClose: noop,
      onReturn: noop,
    }));
    expect(html).toContain("服务方授权已完成");
    expect(html).toContain("原页面会从服务端重新读取真实连接");
    expect(html).toContain("工具权限不会自动授予");
    expect(html).not.toContain("已连接 · 可用");
    expect(html).toContain("关闭此窗口");
    expect(html).toContain("返回 EduFlow");
    expect(html).toContain('data-oauth-window-result="pending"');
  });

  it("shows the real provider error and offers a retry path", () => {
    const html = renderToStaticMarkup(createElement(McpOAuthWindowResult, {
      result: { status: "error", flowId: "flow_0123456789abcdef", ref: "", tools: null, message: "授权被拒绝", popup: true },
      onClose: noop,
      onReturn: noop,
    }));
    expect(html).toContain("授权未完成");
    expect(html).toContain("授权被拒绝");
    expect(html).toContain("可以回到 EduFlow 重试");
    expect(html).toContain('data-oauth-window-result="error"');
  });
});

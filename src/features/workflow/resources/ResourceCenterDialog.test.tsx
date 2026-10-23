import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { JsonValue } from "../domain/v2/types";
import type { Extensions } from "../editor/v2/FunctionExecutionFields";
import { ResourceCenterDialog } from "./ResourceCenterDialog";

const catalog = vi.hoisted(() => ({
  data: {
    functions: [
      { ref: "calc_total", version: 1, name: "计算总额", language: "python", purpose: "node" },
      { ref: "calc_total", version: 2, name: "计算总额", language: "python", purpose: "node" },
      { ref: "on_error", version: 1, name: "错误处理", language: "javascript", purpose: "handler" },
    ],
    reducers: [],
    runtime: { available: {}, limits: {} },
    connections: [
      { connectionKey: "p4:o:price_api:1", ref: "price_api", version: 1, disabled: false, hasCredential: true, content: { type: "http", name: "价格服务", baseUrl: "https://api.example.com", path: "/price" } },
      { connectionKey: "p4:o:mcp_docs:1", ref: "mcp_docs", version: 1, disabled: false, hasCredential: false, content: { type: "mcp-http", name: "文档 MCP", url: "https://mcp.example.com" } },
      { connectionKey: "p4:o:my_deepseek:1", ref: "my_deepseek", version: 1, disabled: false, hasCredential: true, content: { type: "deepseek", name: "我的 DeepSeek", baseUrl: "https://api.deepseek.com", modelRefs: ["deepseek-chat"] } },
      { connectionKey: "p4:o:my_deepseek:2", ref: "my_deepseek", version: 2, disabled: false, hasCredential: true, content: { type: "deepseek", name: "我的 DeepSeek", baseUrl: "https://api.deepseek.com", modelRefs: ["deepseek-chat", "deepseek-reasoner"] } },
    ],
  } as unknown as Extensions,
  error: "",
  refresh: () => undefined,
}));

vi.mock("../editor/v2/FunctionExecutionFields", () => ({ useExtensions: () => catalog }));

const props = { open: true, environmentRef: "local", onClose: () => undefined };

describe("ResourceCenterDialog", () => {
  it("renders the L3 dialog shell with five counted categories and a close action", () => {
    const html = renderToStaticMarkup(createElement(ResourceCenterDialog, props));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("资源中心");
    expect(html).toContain('aria-label="关闭资源中心"');
    for (const label of ["模型供应商", "API", "MCP 服务", "函数", "变量"]) expect(html).toContain(label);
    expect(html).toContain('data-resource-section="providers" data-resource-count="1"');
    expect(html).toContain('data-resource-section="apis" data-resource-count="1"');
    expect(html).toContain('data-resource-section="mcp" data-resource-count="1"');
    expect(html).toContain('data-resource-section="functions" data-resource-count="2"');
  });

  it("never mentions the platform runtime environment", () => {
    for (const initialSection of ["providers", "apis", "mcp", "functions", "variables"] as const) {
      const html = renderToStaticMarkup(createElement(ResourceCenterDialog, { ...props, initialSection }));
      expect(html).not.toContain("运行环境");
    }
  });

  it("honors the initial section and the create intent", () => {
    const variables = renderToStaticMarkup(createElement(ResourceCenterDialog, { ...props, initialSection: "variables" }));
    expect(variables).toContain('data-resource-section="variables" aria-pressed="true"');
    expect(variables).toContain("正在读取变量");

    const intent = renderToStaticMarkup(createElement(ResourceCenterDialog, {
      ...props,
      intent: { kind: "create", section: "providers", onCreated: (_ref: string, _version: number, _content?: Record<string, JsonValue>) => undefined },
    }));
    expect(intent).toContain("正在为节点新建资源");
    expect(intent).toContain("添加模型");
    expect(intent).toContain("选择预设");

    const variableIntent = renderToStaticMarkup(createElement(ResourceCenterDialog, {
      ...props,
      intent: { kind: "create", section: "variables", onCreated: () => undefined },
    }));
    expect(variableIntent).toContain("正在为节点新建资源");
  });

  it("renders nothing while closed", () => {
    expect(renderToStaticMarkup(createElement(ResourceCenterDialog, { ...props, open: false }))).toBe("");
  });
});

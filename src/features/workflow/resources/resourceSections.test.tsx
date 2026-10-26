import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Extensions } from "../editor/v2/FunctionExecutionFields";
import type { WorkflowTool } from "../domain/v2/types";

const catalog = vi.hoisted(() => ({
  data: {
    functions: [
      { ref: "calc_total", version: 1, name: "计算总额", language: "python", purpose: "node", disabled: true },
      { ref: "calc_total", version: 2, name: "计算总额", language: "python", purpose: "node" },
      { ref: "on_error", version: 1, name: "错误处理", language: "javascript", purpose: "handler" },
    ],
    reducers: [],
    runtime: { available: {}, limits: {} },
    connections: [
      { connectionKey: "p4:o:price_api:1", ref: "price_api", version: 1, disabled: false, hasCredential: true, content: { type: "http", name: "价格服务", baseUrl: "https://api.example.com", path: "/price", method: "GET", sideEffect: "read" } },
      { connectionKey: "p4:o:mcp_docs:1", ref: "mcp_docs", version: 1, disabled: false, hasCredential: false, content: { type: "mcp-http", name: "文档 MCP", url: "https://mcp.example.com" } },
      { connectionKey: "p4:o:my_deepseek:1", ref: "my_deepseek", version: 1, disabled: false, hasCredential: true, content: { type: "deepseek", name: "我的 DeepSeek", baseUrl: "https://api.deepseek.com", modelRefs: ["deepseek-chat"] } },
      { connectionKey: "p4:o:my_deepseek:2", ref: "my_deepseek", version: 2, disabled: false, hasCredential: true, content: { type: "deepseek", name: "我的 DeepSeek", baseUrl: "https://api.deepseek.com", modelRefs: ["deepseek-chat", "deepseek-reasoner"] } },
    ],
  } as unknown as Extensions,
  error: "",
  refresh: () => undefined,
}));

vi.mock("../editor/v2/FunctionExecutionFields", () => ({ useExtensions: () => catalog }));

import { ApiResource } from "./ApiResource";
import { FunctionResource } from "./FunctionResource";
import { McpResource } from "./McpResource";
import { ProviderResource } from "./ProviderResource";

describe("ApiResource", () => {
  it("lists HTTP connections with test, references and disable actions", () => {
    const html = renderToStaticMarkup(createElement(ApiResource, { environmentRef: "local" }));
    expect(html).toContain("价格服务");
    expect(html).toContain("API 连接 · v1");
    expect(html).toContain("https://api.example.com/price");
    expect(html).toContain("测试连接");
    expect(html).toContain("引用");
    expect(html).toContain("停用连接");
    expect(html).toContain("添加 API 连接");
    expect(html).not.toContain("运行环境");
  });

  it("opens the create form directly for a create intent", () => {
    const html = renderToStaticMarkup(createElement(ApiResource, { environmentRef: "local", create: true }));
    expect(html).toContain("新建 API 连接");
    expect(html).toContain("保存连接 v1");
  });
});

describe("McpResource", () => {
  it("shows discovered tools supplied by the caller", () => {
    const tools: WorkflowTool[] = [{ ref: "p4:o:mcp_docs:1", name: "search_docs", description: "搜索文档", contractDigest: "digest", inputSchema: { type: "object" }, origin: "user", connectionRef: "mcp_docs" }];
    const html = renderToStaticMarkup(createElement(McpResource, { environmentRef: "local", tools }));
    expect(html).toContain("文档 MCP");
    expect(html).toContain("已发现 1 个工具");
    expect(html).toContain("search_docs");
    expect(html).toContain("添加 MCP 服务");
  });

  it("renders the MCP creation form for an intent", () => {
    const html = renderToStaticMarkup(createElement(McpResource, { environmentRef: "local", create: true, tools: [] }));
    expect(html).toContain("新建 MCP 服务连接");
    expect(html).toContain("MCP HTTP 地址");
  });
});

describe("FunctionResource", () => {
  it("browses function versions with purpose, language and disable state", () => {
    const html = renderToStaticMarkup(createElement(FunctionResource, { environmentRef: "local" }));
    expect(html).toContain("计算总额");
    expect(html).toContain("calc_total");
    expect(html).toContain("Python");
    expect(html).toContain("普通节点函数");
    expect(html).toContain("错误处理函数");
    expect(html).toContain("已停用");
    expect(html).toContain("函数在节点中编写并发布");
  });
});

describe("ProviderResource", () => {
  it("shows the provider overview with the newest version and its models", () => {
    const html = renderToStaticMarkup(createElement(ProviderResource, { environmentRef: "local" }));
    expect(html).toContain("我的 DeepSeek");
    expect(html).toContain("deepseek-reasoner");
    expect(html).toContain("测试连接");
    expect(html).toContain("编辑");
    expect(html).not.toContain("运行环境");
  });

  it("opens the add-model dialog for a create intent", () => {
    const html = renderToStaticMarkup(createElement(ProviderResource, { environmentRef: "local", create: true }));
    expect(html).toContain("添加模型");
    expect(html).toContain("选择供应商");
    expect(html).toContain("保存后会出现在节点的模型下拉里");
  });
});

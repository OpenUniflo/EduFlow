import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { JsonValue } from "../domain/v2/types";
import type { CatalogConnection } from "./resourceModel";
import { ProviderOverview, type ProviderOverviewProps } from "./ProviderOverview";

const connection = (ref: string, version: number, content: Record<string, JsonValue>, extra: Partial<CatalogConnection> = {}): CatalogConnection => ({
  connectionKey: `p4:owner:${ref}:${version}`, ref, version, disabled: false, hasCredential: true, content, ...extra,
});

const connections = [
  connection("local_openai", 1, { type: "openai-compatible", name: "本地网关", baseUrl: "http://127.0.0.1:18080/v1", modelRefs: ["fake-openai-chat"] }),
  connection("local_openai", 2, { type: "openai-compatible", name: "本地网关", baseUrl: "http://127.0.0.1:18080/v1", modelRefs: ["fake-openai-chat", "fake-openai-reasoner"] }),
  connection("team_gateway", 3, { type: "openai-compatible", name: "团队网关", baseUrl: "https://models.example/v1", modelRefs: ["gateway-a"] }),
  connection("retired_gateway", 1, { type: "deepseek", name: "旧供应商", baseUrl: "https://api.deepseek.com", modelRefs: ["deepseek-chat"] }, { disabled: true }),
  connection("probe__hidden", 1, { type: "openai-compatible", name: "连接测试", baseUrl: "http://127.0.0.1:18080/v1", modelRefs: ["probe"] }),
];

const platformProviders = [{ ref: "platform_deepseek", name: "DeepSeek", modelRefs: ["deepseek-flash"] }];

const props = (overrides: Partial<ProviderOverviewProps> = {}): ProviderOverviewProps => ({
  environmentRef: "local",
  connections,
  platformProviders,
  onRequestAdd: vi.fn(),
  onRequestEdit: vi.fn(),
  onOpenReference: vi.fn(),
  onResourcesChanged: vi.fn(),
  ...overrides,
});

describe("ProviderOverview", () => {
  it("renders one card per provider with models, local badge and read-only platform cards", () => {
    const html = renderToStaticMarkup(createElement(ProviderOverview, props()));
    expect(html).toContain("模型供应商总览");
    expect(html).toContain("+ 添加模型");
    expect(html).toContain('aria-label="搜索模型供应商"');
    expect(html).toContain("本地网关");
    expect(html).toContain("团队网关");
    expect(html).toContain("OpenAI 兼容 · v2");
    expect(html).toContain("fake-openai-reasoner");
    expect(html).toContain("仅本地开发可用");
    expect(html).toContain("已配置加密凭据");
    expect(html).toContain("测试连接");
    expect(html).toContain("编辑");
    expect(html).toContain("版本历史");
    expect(html).toContain("平台提供的供应商");
    expect(html).toContain("由平台管理凭据");
    expect(html).toContain("deepseek-flash");
    expect(html).toContain("不可编辑、测试、停用或引用");
  });

  it("hides probe connections and marks the disabled provider", () => {
    const html = renderToStaticMarkup(createElement(ProviderOverview, props()));
    expect(html).not.toContain("probe__hidden");
    expect(html).not.toContain("连接测试");
    expect(html).toContain("旧供应商");
    expect(html).toContain("已停用");
    expect(html.match(/data-provider-ref=/g)?.length).toBe(3);
  });

  it("keeps the platform runtime environment out of the UI", () => {
    expect(renderToStaticMarkup(createElement(ProviderOverview, props()))).not.toContain("运行环境");
  });

  it("renders loading, error and empty states", () => {
    expect(renderToStaticMarkup(createElement(ProviderOverview, props({ connections: [], platformProviders: [], loading: true })))).toContain("正在读取模型供应商");
    expect(renderToStaticMarkup(createElement(ProviderOverview, props({ connections: [], platformProviders: [], error: "网络错误" })))).toContain("模型供应商暂时无法读取：网络错误");
    expect(renderToStaticMarkup(createElement(ProviderOverview, props({ connections: [], platformProviders: [] })))).toContain("还没有模型供应商");
  });
});

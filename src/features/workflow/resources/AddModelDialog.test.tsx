import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { JsonValue } from "../domain/v2/types";
import type { CatalogConnection } from "./resourceModel";
import { AddModelDialog, type AddModelDialogProps } from "./AddModelDialog";

const connection = (ref: string, version: number, content: Record<string, JsonValue>, extra: Partial<CatalogConnection> = {}): CatalogConnection => ({
  connectionKey: `p4:owner:${ref}:${version}`, ref, version, disabled: false, hasCredential: true, content, ...extra,
});

const remoteProvider = connection("remote_gateway", 2, { type: "openai-compatible", name: "远程网关", baseUrl: "https://models.example/v1", modelRefs: ["gateway-a", "gateway-b"] });
const disabledProvider = connection("retired", 1, { type: "deepseek", name: "已停用供应商", baseUrl: "https://api.deepseek.com", modelRefs: ["deepseek-chat"] }, { disabled: true });

const props = (overrides: Partial<AddModelDialogProps> = {}): AddModelDialogProps => ({
  environmentRef: "local", providers: [remoteProvider, disabledProvider], onClose: vi.fn(), onCreated: vi.fn(), ...overrides,
});

describe("AddModelDialog", () => {
  it("shows the supplier list with DeepSeek selected and a disabled save state", () => {
    const html = renderToStaticMarkup(createElement(AddModelDialog, props()));
    expect(html).toContain('role="dialog"');
    expect(html).toContain("添加模型");
    expect(html).toContain('aria-label="模型 API Key"');
    expect(html).toContain("去哪里获取");
    for (const label of ["DeepSeek", "OpenAI", "通义千问", "Kimi", "智谱", "OpenAI 兼容自定义"]) expect(html).toContain(label);
    expect(html).toContain("保存后会出现在节点的模型下拉里");
    expect(html).toContain('data-action="save"');
    expect(html).toContain("disabled");
    expect(html).not.toContain("运行环境");
    expect(html).not.toContain("本地 Ollama");
  });

  it("prefills the chosen supplier and keeps the API address under Advanced", () => {
    const html = renderToStaticMarkup(createElement(AddModelDialog, props({ initialPresetId: "openai" })));
    expect(html).toContain(">OpenAI<");
    expect(html).toContain('aria-label="模型 API Key"');
    expect(html).toContain("高级");
    expect(html).toContain("https://api.openai.com/v1");
    expect(html).toContain("测试连接");
    expect(html).toContain("选择要启用的模型");
  });

  it("keeps the official DeepSeek base URL fixed", () => {
    const html = renderToStaticMarkup(createElement(AddModelDialog, props({ initialPresetId: "deepseek" })));
    expect(html).toContain("固定使用官方地址 https://api.deepseek.com");
    expect(html).not.toContain('aria-label="模型 Base URL"');
  });

  it("shows a connected supplier's models and asks for a fresh key", () => {
    const html = renderToStaticMarkup(createElement(AddModelDialog, props({ initialMode: "existing", initialProviderRef: "remote_gateway" })));
    expect(html).toContain("远程网关");
    expect(html).toContain("已连接");
    expect(html).toContain('aria-label="启用模型 gateway-a"');
    expect(html).toContain('aria-label="启用模型 gateway-b"');
    expect(html).toContain("checked");
    expect(html).toContain("重新输入 Key 才能保存新版本");
    expect(html).not.toContain("已停用供应商");
  });

  it("lists several connected suppliers in the left navigation", () => {
    const second = connection("team_gateway", 1, { type: "openai-compatible", name: "团队网关", baseUrl: "https://team.example/v1", modelRefs: ["team-a"] });
    const html = renderToStaticMarkup(createElement(AddModelDialog, props({ providers: [remoteProvider, second], initialMode: "existing", initialProviderRef: "remote_gateway" })));
    expect(html).toContain("团队网关");
    expect(html).toContain("已连接");
  });
});

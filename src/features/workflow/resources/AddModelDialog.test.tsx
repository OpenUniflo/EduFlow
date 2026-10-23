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
  it("shows the preset grid and a disabled save state before a preset is chosen", () => {
    const html = renderToStaticMarkup(createElement(AddModelDialog, props()));
    expect(html).toContain('role="dialog"');
    expect(html).toContain("添加模型");
    expect(html).toContain("选择预设");
    for (const label of ["DeepSeek", "OpenAI", "通义千问", "Kimi", "本地 Ollama", "自定义 OpenAI 兼容"]) expect(html).toContain(label);
    expect(html).toContain("将创建供应商「未命名供应商」v1，启用 0 个模型");
    expect(html).toContain('data-action="save"');
    expect(html).toContain("disabled");
    expect(html).not.toContain("运行环境");
  });

  it("shows the local Ollama preset only in local development", () => {
    expect(renderToStaticMarkup(createElement(AddModelDialog, props({ localEnvironment: true })))).toContain("本地 Ollama");
    expect(renderToStaticMarkup(createElement(AddModelDialog, props({ localEnvironment: false })))).not.toContain("本地 Ollama");
  });

  it("prefills the OpenAI-compatible preset and requires a first model", () => {
    const html = renderToStaticMarkup(createElement(AddModelDialog, props({ initialPresetId: "openai" })));
    expect(html).toContain('aria-label="供应商名称"');
    expect(html).toContain("value=\"OpenAI\"");
    expect(html).toContain('aria-label="供应商标识"');
    expect(html).toContain("value=\"openai\"");
    expect(html).toContain("value=\"https://api.openai.com/v1\"");
    expect(html).toContain('aria-label="模型 API Key"');
    expect(html).toContain("将创建供应商「OpenAI」v1，启用 0 个模型");
    expect(html).toContain("至少启用一个模型才能保存");
    expect(html).toContain("测试连接");
    expect(html).toContain("首次测试会发布一个隐藏的临时版本");
  });

  it("keeps the official DeepSeek base URL fixed", () => {
    const html = renderToStaticMarkup(createElement(AddModelDialog, props({ initialPresetId: "deepseek" })));
    expect(html).toContain("固定使用官方地址 https://api.deepseek.com");
    expect(html).not.toContain('aria-label="模型 Base URL"');
    expect(html).toContain("将创建供应商「DeepSeek」v1，启用 0 个模型");
  });

  it("adds models to an existing provider and summarizes the new version", () => {
    const html = renderToStaticMarkup(createElement(AddModelDialog, props({ initialMode: "existing", initialProviderRef: "remote_gateway" })));
    expect(html).toContain("远程网关");
    expect(html).toContain("v2");
    expect(html).toContain("将发布「远程网关」v3，新增 0 个模型");
    expect(html).toContain('aria-label="启用模型 gateway-a"');
    expect(html).toContain('aria-label="启用模型 gateway-b"');
    expect(html).toContain("checked");
    expect(html).toContain("保存为 v3");
    expect(html).toContain("API Key 只写不读；发布新版本需要重新输入。");
    expect(html).not.toContain("已停用供应商");
  });

  it("offers a provider selector when several suppliers exist", () => {
    const second = connection("team_gateway", 1, { type: "openai-compatible", name: "团队网关", baseUrl: "https://team.example/v1", modelRefs: ["team-a"] });
    const html = renderToStaticMarkup(createElement(AddModelDialog, props({ providers: [remoteProvider, second], initialMode: "existing", initialProviderRef: "remote_gateway" })));
    expect(html).toContain('aria-label="添加到已有供应商"');
    expect(html).toContain("团队网关");
  });
});

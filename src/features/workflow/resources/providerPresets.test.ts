import { describe, expect, it } from "vitest";
import {
  credentialRequiredFor, findProviderPreset, isLocalBaseUrl, modelRefIssue, normalizeBaseUrl, PROVIDER_PRESETS,
  providerRefFromPreset, providerRefIssue, uniqueProviderRef, visibleProviderPresets,
} from "./providerPresets";

describe("provider presets", () => {
  it("documents the supported supplier endpoints", () => {
    const byId = Object.fromEntries(PROVIDER_PRESETS.map(preset => [preset.id, preset]));
    expect(byId.deepseek).toMatchObject({ type: "deepseek", baseUrl: "https://api.deepseek.com" });
    expect(byId.openai.baseUrl).toBe("https://api.openai.com/v1");
    expect(byId.dashscope.baseUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
    expect(byId.kimi.baseUrl).toBe("https://api.moonshot.cn/v1");
    expect(byId.zhipu.baseUrl).toBe("https://open.bigmodel.cn/api/paas/v4");
    expect(byId["custom-openai"].baseUrl).toBe("");
    for (const preset of PROVIDER_PRESETS) expect(preset).toHaveProperty("hint");
  });

  it("shows every preset in every environment", () => {
    expect(visibleProviderPresets(true).map(preset => preset.id)).toEqual(PROVIDER_PRESETS.map(preset => preset.id));
    expect(visibleProviderPresets(false).map(preset => preset.id)).toEqual(PROVIDER_PRESETS.map(preset => preset.id));
    expect(visibleProviderPresets(false).map(preset => preset.id)).not.toContain("ollama");
  });

  it("finds a preset by id", () => {
    expect(findProviderPreset("kimi")?.label).toBe("Kimi");
    expect(findProviderPreset("missing")).toBeUndefined();
  });
});

describe("provider references", () => {
  it("derives a worker-safe reference from a preset id", () => {
    expect(providerRefFromPreset("custom-openai")).toBe("custom_openai");
    expect(providerRefFromPreset("openai")).toBe("openai");
    expect(/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(providerRefFromPreset("custom-openai"))).toBe(true);
  });

  it("adds numeric suffixes for duplicates", () => {
    expect(uniqueProviderRef("openai", [])).toBe("openai");
    expect(uniqueProviderRef("openai", ["openai"])).toBe("openai_2");
    expect(uniqueProviderRef("openai", ["openai", "openai_2"])).toBe("openai_3");
  });

  it("validates provider references against the worker pattern", () => {
    expect(providerRefIssue("openai", [])).toBe("");
    expect(providerRefIssue("my-provider_2", [])).toBe("");
    expect(providerRefIssue("1bad", [])).toContain("字母开头");
    expect(providerRefIssue("probe__x", [])).toContain("probe__");
    expect(providerRefIssue("openai", ["openai"])).toContain("已存在");
    expect(providerRefIssue("", [])).toContain("请填写");
  });
});

describe("model names and urls", () => {
  it("accepts worker model-reference patterns", () => {
    expect(modelRefIssue("gpt-4o-mini")).toBe("");
    expect(modelRefIssue("qwen2.5:7b")).toBe("");
    expect(modelRefIssue("deepseek-chat")).toBe("");
    expect(modelRefIssue("bad model")).toContain("只能包含");
    expect(modelRefIssue("模型")).toContain("只能包含");
    expect(modelRefIssue("a".repeat(201))).toContain("200");
    expect(modelRefIssue("")).toContain("请填写");
  });

  it("detects plain-HTTP loopback addresses", () => {
    expect(isLocalBaseUrl("http://localhost:11434/v1")).toBe(true);
    expect(isLocalBaseUrl("http://127.0.0.1:18080/v1")).toBe(true);
    expect(isLocalBaseUrl("https://localhost/v1")).toBe(false);
    expect(isLocalBaseUrl("https://models.example/v1")).toBe(false);
    expect(isLocalBaseUrl("not a url")).toBe(false);
  });

  it("requires credentials for DeepSeek and remote compatible providers", () => {
    expect(credentialRequiredFor("deepseek", "https://api.deepseek.com")).toBe(true);
    expect(credentialRequiredFor("openai-compatible", "https://models.example/v1")).toBe(true);
    expect(credentialRequiredFor("openai-compatible", "http://127.0.0.1:18080/v1")).toBe(false);
    expect(credentialRequiredFor("openai-compatible", "http://localhost:11434/v1")).toBe(false);
    expect(credentialRequiredFor("http", "https://api.example.com")).toBe(true);
  });

  it("normalizes base urls for the worker", () => {
    expect(normalizeBaseUrl(" https://models.example/v1/// ")).toBe("https://models.example/v1");
    expect(normalizeBaseUrl("http://127.0.0.1:18080/v1/")).toBe("http://127.0.0.1:18080/v1");
  });
});

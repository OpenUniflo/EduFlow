import { describe, expect, it } from "vitest";
import type { JsonValue, ResourceReferenceRow } from "../domain/v2/types";
import type { CatalogConnection } from "./resourceModel";
import {
  addModelSummary, canSaveModelDraft, draftModelsFor, filterProviderCards, isProbeConnection, isLocalProvider,
  latestVisibleProviders, mergeModelSelection, modelRowsFor, modelSelectionDirty, modelSourceLabel, modelUsageCount,
  nextProviderVersion, probeConnectionContent, probeConnectionRef, providerDraftIssue, providerPublishRequest,
  providerTestIssue, providerTestStatusLabel, providerUsageCount, providerVersions, stagedModelChanges,
  stagedProviderSummary, toggleDraftModel, firstUserModelProvider, userModelProviders,
} from "./providerModel";

const connection = (ref: string, version: number, content: Record<string, JsonValue>, extra: Partial<CatalogConnection> = {}): CatalogConnection => ({
  connectionKey: `p4:owner:${ref}:${version}`, ref, version, disabled: false, hasCredential: true, content, ...extra,
});
const openai = (overrides: Record<string, JsonValue> = {}) => ({ type: "openai-compatible", name: "团队网关", baseUrl: "https://models.example/v1", modelRefs: ["model-a", "model-b"], ...overrides });
const referenceRow = (workflowId: string, modelRef: string, nodeId = "model"): ResourceReferenceRow => ({
  workflowId, workflowName: workflowId, revision: 1, graphPath: [], nodeId, nodeLabel: nodeId, modelRef,
});

describe("provider catalog selection", () => {
  it("keeps one card per provider and hides test probes", () => {
    const providers = latestVisibleProviders([
      connection("gateway", 1, openai()),
      connection("gateway", 2, openai({ modelRefs: ["model-b", "model-c"] })),
      connection("probe__abc", 1, openai()),
      connection("price_api", 1, { type: "http", name: "API" }),
      connection("old", 1, openai(), { disabled: true }),
    ]);
    expect(providers.map(entry => `${entry.ref}@${entry.version}`)).toEqual(["gateway@2", "old@1"]);
    expect(providers[0].content.modelRefs).toEqual(["model-b", "model-c"]);
    expect(isProbeConnection("probe__abc")).toBe(true);
    expect(isProbeConnection("gateway")).toBe(false);
  });

  it("lists versions newest first for the history panel", () => {
    const versions = providerVersions([connection("gateway", 1, openai()), connection("gateway", 3, openai()), connection("gateway", 2, openai())], "gateway");
    expect(versions.map(entry => entry.version)).toEqual([3, 2, 1]);
    expect(providerVersions([], "gateway")).toEqual([]);
  });

  it("labels local providers from their address", () => {
    expect(isLocalProvider(connection("local", 1, openai({ baseUrl: "http://127.0.0.1:18080/v1" })))).toBe(true);
    expect(isLocalProvider(connection("remote", 1, openai()))).toBe(false);
  });
});

describe("staged model switches", () => {
  it("toggles models without mutating the caller's array", () => {
    const current = ["model-a"];
    expect(toggleDraftModel(current, "model-b", true)).toEqual(["model-a", "model-b"]);
    expect(toggleDraftModel(current, "model-a", false)).toEqual([]);
    expect(current).toEqual(["model-a"]);
  });

  it("computes added, removed and dirty state", () => {
    expect(stagedModelChanges(["a", "b"], ["b", "c"])).toEqual({ added: ["c"], removed: ["a"], dirty: true });
    expect(stagedModelChanges(["a"], ["a"])).toEqual({ added: [], removed: [], dirty: false });
    expect(modelSelectionDirty(["a", "b"], ["b", "a"])).toBe(false);
    expect(canSaveModelDraft([])).toBe(false);
    expect(canSaveModelDraft(["a"])).toBe(true);
  });

  it("falls back to the provider's current version when nothing is staged", () => {
    expect(draftModelsFor(connection("gateway", 2, openai()), {})).toEqual(["model-a", "model-b"]);
    expect(draftModelsFor(connection("gateway", 2, openai()), { gateway: ["model-c"] })).toEqual(["model-c"]);
  });

  it("rows keep current order, then staged additions, then test discoveries", () => {
    const entry = connection("gateway", 2, openai());
    expect(modelRowsFor(entry, ["model-b", "model-new"], ["discovered-model", "model-b"])).toEqual(["model-a", "model-b", "model-new", "discovered-model"]);
  });

  it("explains where each model row came from", () => {
    const entry = connection("gateway", 2, openai());
    expect(modelSourceLabel(entry, "model-a", ["model-a"], [])).toBe("已启用");
    expect(modelSourceLabel(entry, "model-a", ["model-a"], ["model-a", "extra"])).toBe("从 /models 拉取");
    expect(modelSourceLabel(entry, "model-a", ["model-a"], ["extra"])).toBe("手动添加");
    expect(modelSourceLabel(entry, "new-model", ["model-a"], ["new-model"])).toBe("新发现");
    expect(modelSourceLabel(entry, "model-a", ["model-b"], [])).toBe("已停用");
  });

  it("merges newly enabled models without disturbing the existing order", () => {
    expect(mergeModelSelection(["a", "b"], ["c", "a"])).toEqual(["a", "b", "c"]);
  });
});

describe("references and publish payloads", () => {
  it("counts workflows once and counts nodes per model", () => {
    const rows = [referenceRow("wf-1", "model-a", "model"), referenceRow("wf-1", "model-a", "other"), referenceRow("wf-2", "model-b")];
    expect(providerUsageCount(rows)).toBe(2);
    expect(modelUsageCount(rows, "model-a")).toBe(2);
    expect(modelUsageCount(rows, "missing")).toBe(0);
  });

  it("builds a publish request for a new immutable version", () => {
    const entry = connection("gateway", 2, { ...openai(), description: "团队网关", secretRef: "stripped-before-ui" });
    const request = providerPublishRequest(entry, ["model-b", "model-c"], "test-key");
    expect(request).toMatchObject({ action: "publish", kind: "connection", ref: "gateway", version: 3, credential: "test-key" });
    expect(request.content).toMatchObject({ name: "团队网关", type: "openai-compatible", baseUrl: "https://models.example/v1", description: "团队网关", modelRefs: ["model-b", "model-c"] });
    expect(nextProviderVersion(entry)).toBe(3);
    expect(stagedProviderSummary(entry)).toContain("v3");
    expect(stagedProviderSummary(entry)).toContain("v2 的节点不受影响");
  });

  it("summarizes the test state for the card header", () => {
    expect(providerTestStatusLabel(undefined)).toBe("尚未测试");
    expect(providerTestStatusLabel({ result: { ok: true, elapsedMs: 820 }, at: 1 })).toContain("成功");
    expect(providerTestStatusLabel({ result: { ok: true, elapsedMs: 820 }, at: 1 })).toContain("820 毫秒");
    expect(providerTestStatusLabel({ result: { ok: false, error: { code: "X", message: "bad" } }, at: 1 })).toBe("上次测试：失败");
  });
});

describe("search filtering", () => {
  const providers = [connection("gateway", 1, openai()), connection("local_openai", 1, openai({ name: "本地网关", baseUrl: "http://127.0.0.1:18080/v1", modelRefs: ["fake-model"] }))];
  const platforms = [{ ref: "platform_deepseek", name: "DeepSeek", modelRefs: ["deepseek-flash"] }];

  it("matches provider names, refs, types and model names", () => {
    expect(filterProviderCards(providers, platforms, "").providers).toHaveLength(2);
    expect(filterProviderCards(providers, platforms, "fake-model").providers.map(entry => entry.ref)).toEqual(["local_openai"]);
    expect(filterProviderCards(providers, platforms, "团队").providers.map(entry => entry.ref)).toEqual(["gateway"]);
    expect(filterProviderCards(providers, platforms, "openai 兼容").providers).toHaveLength(2);
  });

  it("filters platform cards by name and model", () => {
    expect(filterProviderCards(providers, platforms, "deepseek-flash").platformProviders.map(provider => provider.ref)).toEqual(["platform_deepseek"]);
    expect(filterProviderCards(providers, platforms, "missing")).toEqual({ providers: [], platformProviders: [] });
  });
});

describe("dialog validation", () => {
  const base = {
    mode: "create" as const, type: "openai-compatible", name: "本地网关", ref: "local_gateway",
    baseUrl: "http://127.0.0.1:18080/v1", credential: "", models: ["fake-openai-chat"],
    existingRefs: [] as string[], localEnvironment: true,
  };

  it("accepts a credential-free local provider", () => {
    expect(providerDraftIssue(base)).toBe("");
    expect(providerTestIssue(base)).toBe("");
  });

  it("requires a credential for remote providers", () => {
    const remote = { ...base, baseUrl: "https://models.example/v1" };
    expect(providerDraftIssue(remote)).toContain("API Key");
    expect(providerDraftIssue({ ...remote, credential: "test-key" })).toBe("");
  });

  it("rejects plain HTTP outside local development", () => {
    expect(providerDraftIssue({ ...base, localEnvironment: false })).toContain("仅本地开发");
  });

  it("requires at least one model for saving but not for testing", () => {
    expect(providerDraftIssue({ ...base, models: [] })).toContain("至少启用一个模型");
    expect(providerTestIssue({ ...base, models: [] })).toBe("");
  });

  it("checks names, references and base urls", () => {
    expect(providerDraftIssue({ ...base, name: "" })).toContain("名称");
    expect(providerDraftIssue({ ...base, ref: "1bad" })).toContain("字母开头");
    expect(providerDraftIssue({ ...base, ref: "taken", existingRefs: ["taken"] })).toContain("已存在");
    expect(providerDraftIssue({ ...base, baseUrl: "" })).toContain("API 地址");
    expect(providerDraftIssue({ ...base, baseUrl: "ftp://models.example/v1" })).toContain("https");
    expect(providerDraftIssue({ ...base, models: ["bad model"] })).toContain("只能包含");
  });

  it("honours an explicit credential requirement for versions that would drop a stored secret", () => {
    expect(providerDraftIssue({ ...base, credentialRequired: true })).toContain("API Key");
    expect(providerDraftIssue({ ...base, credentialRequired: false })).toBe("");
  });

  it("requires a credential for DeepSeek", () => {
    expect(providerDraftIssue({ ...base, type: "deepseek", name: "DeepSeek", ref: "my_deepseek", baseUrl: "https://api.deepseek.com", models: ["deepseek-chat"] })).toContain("API Key");
  });
});

describe("dialog helpers", () => {
  it("summarizes create and add-to-existing outcomes", () => {
    expect(addModelSummary({ mode: "create", name: "通义千问", version: 0, enabledCount: 2, addedCount: 0 })).toBe("将创建供应商「通义千问」v1，启用 2 个模型");
    expect(addModelSummary({ mode: "existing", name: "团队网关", version: 3, enabledCount: 4, addedCount: 2 })).toBe("将发布「团队网关」v4，新增 2 个模型");
    expect(addModelSummary({ mode: "create", name: "", version: 0, enabledCount: 0, addedCount: 0 })).toContain("未命名供应商");
  });

  it("builds hidden probe content that passes the worker's model-ref pattern", () => {
    expect(probeConnectionContent({ type: "deepseek", baseUrl: "https://api.deepseek.com" })).toMatchObject({ type: "deepseek", baseUrl: "https://api.deepseek.com", modelRefs: ["probe"] });
    expect(probeConnectionContent({ type: "openai-compatible", baseUrl: "http://127.0.0.1:18080/v1///" })).toMatchObject({ type: "openai-compatible", baseUrl: "http://127.0.0.1:18080/v1", modelRefs: ["probe"] });
    const ref = probeConnectionRef();
    expect(isProbeConnection(ref)).toBe(true);
    expect(/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(ref)).toBe(true);
  });
});

describe("user model provider selection", () => {
  const provider = (ref: string, origin: "environment" | "user", modelRefs = ["deepseek-flash"]) => ({ ref, name: ref, origin, modelRefs });
  it("never auto-binds environment models and skips fake endpoints", () => {
    const providers = [provider("deepseek", "environment"), provider("fake_openai", "user"), provider("local-env-deepseek", "user")];
    expect(userModelProviders(providers).map(item => item.ref)).toEqual(["local-env-deepseek"]);
    expect(firstUserModelProvider(providers)?.ref).toBe("local-env-deepseek");
    expect(firstUserModelProvider([provider("deepseek", "environment")])).toBeUndefined();
  });
});

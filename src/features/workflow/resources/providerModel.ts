import type { ConnectionTestResult, JsonValue, ResourceReferenceRow, WorkflowEnvironment } from "../domain/v2/types";
import { connectionTypeLabel, groupCatalogByRef, isProviderConnection, latestConnectionsOfType, modelRefsOf, type CatalogConnection } from "./resourceModel";
import { DEEPSEEK_BASE_URL, credentialRequiredFor, isLocalBaseUrl, modelRefIssue, normalizeBaseUrl, providerRefIssue } from "./providerPresets";

export const PROBE_REF_PREFIX = "probe__";

export type ProviderConnection = CatalogConnection;
export type PlatformProvider = WorkflowEnvironment["providers"][number];
export type ProviderTestState = { result: ConnectionTestResult; at: number };

/** Test probes are visible to the catalog but never to the resource-center UI. */
export function isProbeConnection(ref: string): boolean {
  return ref.startsWith(PROBE_REF_PREFIX);
}

export function providerDisplayName(entry: { ref: string; content: Record<string, JsonValue> }): string {
  const name = typeof entry.content.name === "string" ? entry.content.name.trim() : "";
  return name || entry.ref;
}

export function providerAddress(entry: { content: Record<string, JsonValue> }): string {
  return typeof entry.content.baseUrl === "string" ? entry.content.baseUrl : "";
}

export function providerModelRefs(entry: { content: Record<string, JsonValue> }): string[] {
  return modelRefsOf(entry.content);
}

export function providerTypeLabel(entry: { content: Record<string, JsonValue> }): string {
  return connectionTypeLabel(typeof entry.content.type === "string" ? entry.content.type : "");
}

export function isLocalProvider(entry: { content: Record<string, JsonValue> }): boolean {
  return isLocalBaseUrl(providerAddress(entry));
}

export function visibleProviderConnections(connections: readonly CatalogConnection[]): CatalogConnection[] {
  return connections.filter(entry => isProviderConnection(entry) && !isProbeConnection(entry.ref));
}

/** One card per provider (its newest version), sorted by reference. */
export function latestVisibleProviders(connections: readonly CatalogConnection[]): CatalogConnection[] {
  return latestConnectionsOfType(visibleProviderConnections(connections), "provider");
}

export function providerVersions(connections: readonly CatalogConnection[], ref: string): CatalogConnection[] {
  return groupCatalogByRef(visibleProviderConnections(connections).filter(entry => entry.ref === ref)).find(group => group.ref === ref)?.versions ?? [];
}

export function credentialRequiredForConnection(entry: { content: Record<string, JsonValue> }): boolean {
  return credentialRequiredFor(typeof entry.content.type === "string" ? entry.content.type : "", providerAddress(entry));
}

/** Distinct workflows that reference this provider; the API reference scan returns one row per node. */
export function providerUsageCount(rows: readonly ResourceReferenceRow[]): number {
  return new Set(rows.map(row => row.workflowId)).size;
}

export function modelUsageCount(rows: readonly ResourceReferenceRow[], model: string): number {
  return rows.filter(row => row.modelRef === model).length;
}

export function nextProviderVersion(entry: { version: number }): number {
  return entry.version + 1;
}

export function providerPublishContent(entry: ProviderConnection, models: readonly string[]): Record<string, JsonValue> {
  return { ...entry.content, modelRefs: [...models] };
}

export function providerPublishRequest(entry: ProviderConnection, models: readonly string[], credential: string) {
  return {
    action: "publish", kind: "connection", ref: entry.ref, version: nextProviderVersion(entry),
    content: providerPublishContent(entry, models), credential,
  };
}

export function toggleDraftModel(current: readonly string[], model: string, enabled: boolean): string[] {
  if (enabled) return current.includes(model) ? [...current] : [...current, model];
  return current.filter(item => item !== model);
}

export function draftModelsFor(entry: ProviderConnection, drafts: Readonly<Record<string, readonly string[]>>): string[] {
  return [...(drafts[entry.ref] ?? providerModelRefs(entry))];
}

export function modelSelectionDirty(current: readonly string[], draft: readonly string[]): boolean {
  if (current.length !== draft.length) return true;
  const currentSet = new Set(current);
  return draft.some(model => !currentSet.has(model));
}

export function stagedModelChanges(current: readonly string[], draft: readonly string[]) {
  const currentSet = new Set(current);
  const draftSet = new Set(draft);
  return {
    added: draft.filter(model => !currentSet.has(model)),
    removed: current.filter(model => !draftSet.has(model)),
    dirty: modelSelectionDirty(current, draft),
  };
}

export function canSaveModelDraft(draft: readonly string[]): boolean {
  return draft.length > 0;
}

/** Models shown in one provider card: current version order, then staged additions, then test discoveries. */
export function modelRowsFor(entry: ProviderConnection, draft: readonly string[], testModels: readonly string[]): string[] {
  const rows: string[] = [];
  for (const model of [...providerModelRefs(entry), ...draft, ...testModels]) {
    if (!rows.includes(model)) rows.push(model);
  }
  return rows;
}

export function modelSourceLabel(entry: ProviderConnection, model: string, draft: readonly string[], testModels: readonly string[]): string {
  const current = providerModelRefs(entry);
  const enabled = draft.includes(model);
  if (!enabled && current.includes(model)) return "已停用";
  if (!enabled) return "新发现";
  if (testModels.includes(model)) return "从 /models 拉取";
  if (testModels.length) return "手动添加";
  return "已启用";
}

export function testModelsOf(test: ProviderTestState | undefined): string[] {
  return test?.result.ok ? test.result.models ?? [] : [];
}

export function providerTestStatusLabel(test: ProviderTestState | undefined): string {
  if (!test) return "尚未测试";
  if (!test.result.ok) return "上次测试：失败";
  const elapsed = typeof test.result.elapsedMs === "number" ? ` · ${test.result.elapsedMs} 毫秒` : "";
  return `上次测试：成功${elapsed}`;
}

export function filterProviderCards(
  providers: readonly ProviderConnection[],
  platformProviders: readonly PlatformProvider[],
  search: string,
): { providers: ProviderConnection[]; platformProviders: PlatformProvider[] } {
  const query = search.trim().toLowerCase();
  if (!query) return { providers: [...providers], platformProviders: [...platformProviders] };
  const matches = (values: readonly string[]) => values.some(value => value.toLowerCase().includes(query));
  return {
    providers: providers.filter(entry => matches([providerDisplayName(entry), entry.ref, providerTypeLabel(entry), ...providerModelRefs(entry)])),
    platformProviders: platformProviders.filter(provider => matches([provider.name ?? provider.ref, provider.ref, ...provider.modelRefs])),
  };
}

export function platformProviderName(provider: PlatformProvider): string {
  return provider.name || provider.ref;
}

export function stagedProviderSummary(entry: ProviderConnection): string {
  return `将发布 v${nextProviderVersion(entry)}，正在使用 v${entry.version} 的节点不受影响。`;
}

export function mergeModelSelection(current: readonly string[], selected: readonly string[]): string[] {
  const merged = [...current];
  for (const model of selected) if (!merged.includes(model)) merged.push(model);
  return merged;
}

export function addModelSummary(input: { mode: "create" | "existing"; name: string; version: number; enabledCount: number; addedCount: number }): string {
  if (input.mode === "create") return `将创建供应商「${input.name || "未命名供应商"}」v1，启用 ${input.enabledCount} 个模型`;
  return `将发布「${input.name || "未命名供应商"}」v${input.version + 1}，新增 ${input.addedCount} 个模型`;
}

export function providerBaseUrlIssue(type: string, baseUrl: string, localEnvironment: boolean): string {
  if (type === "deepseek") return "";
  const value = baseUrl.trim();
  if (!value) return "请填写 Base URL。";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "Base URL 格式有误，请填写完整地址。";
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) return "Base URL 不能包含账号、密码、查询参数或片段。";
  if (parsed.protocol === "https:") return "";
  if (parsed.protocol === "http:" && isLocalBaseUrl(value)) {
    return localEnvironment ? "" : "明文 HTTP 地址仅本地开发可用。";
  }
  return "Base URL 必须使用 https；仅本地开发允许 http://localhost 或 http://127.0.0.1。";
}

export type ProviderDraftInput = {
  mode: "create" | "existing";
  type: string;
  name: string;
  ref: string;
  baseUrl: string;
  credential: string;
  models: readonly string[];
  existingRefs: readonly string[];
  localEnvironment: boolean;
  /** A new version has no inherited secret, so local providers with a stored credential still need a fresh key. */
  credentialRequired?: boolean;
};

function providerConnectionTargetIssue(input: ProviderDraftInput, requireModels: boolean): string {
  if (input.mode === "create") {
    const name = input.name.trim();
    if (!name || name.length > 120) return "名称应为 1–120 个字符。";
    const refIssue = providerRefIssue(input.ref, input.existingRefs);
    if (refIssue) return refIssue;
    const baseUrlIssue = providerBaseUrlIssue(input.type, input.baseUrl, input.localEnvironment);
    if (baseUrlIssue) return baseUrlIssue;
  }
  if ((input.credentialRequired ?? credentialRequiredFor(input.type, input.baseUrl)) && !input.credential.trim()) return "请填写 API Key。";
  if (requireModels && !input.models.length) return "请至少启用一个模型。";
  for (const model of input.models) {
    const issue = modelRefIssue(model);
    if (issue) return issue;
  }
  return "";
}

/** Save-time validation for the add-model dialog. */
export function providerDraftIssue(input: ProviderDraftInput): string {
  return providerConnectionTargetIssue(input, true);
}

/** The Worker can only test saved connections, so the dialog uses a hidden probe version; field checks are shared. */
export function providerTestIssue(input: ProviderDraftInput): string {
  return providerConnectionTargetIssue(input, false);
}

/** Probe content published only to exercise `GET /models`; the probe is disabled right after the test. */
export function probeConnectionContent(input: { type: string; baseUrl: string }): Record<string, JsonValue> {
  if (input.type === "deepseek") return { type: "deepseek", name: "连接测试", baseUrl: DEEPSEEK_BASE_URL, modelRefs: ["probe"] };
  return { type: "openai-compatible", name: "连接测试", baseUrl: normalizeBaseUrl(input.baseUrl), modelRefs: ["probe"] };
}

export function probeConnectionRef(): string {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${PROBE_REF_PREFIX}${suffix}`;
}

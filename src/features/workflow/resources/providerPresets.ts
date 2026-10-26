/** Provider presets for the add-model dialog. They only prefill fields; they never persist anything. */
export type ProviderPresetType = "deepseek" | "openai-compatible";

export type ProviderPreset = {
  id: string;
  label: string;
  type: ProviderPresetType;
  baseUrl: string;
  hint: string;
  docsUrl: string;
};

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  { id: "deepseek", label: "DeepSeek", type: "deepseek", baseUrl: DEEPSEEK_BASE_URL, hint: "官方地址，需要 DeepSeek API Key。", docsUrl: "https://platform.deepseek.com/api_keys" },
  { id: "openai", label: "OpenAI", type: "openai-compatible", baseUrl: "https://api.openai.com/v1", hint: "OpenAI 官方兼容端点，保留 /v1 路径。", docsUrl: "https://platform.openai.com/api-keys" },
  { id: "dashscope", label: "通义千问", type: "openai-compatible", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", hint: "阿里云百炼的 OpenAI 兼容模式地址。", docsUrl: "https://help.aliyun.com/zh/model-studio/get-api-key" },
  { id: "kimi", label: "Kimi", type: "openai-compatible", baseUrl: "https://api.moonshot.cn/v1", hint: "Moonshot Kimi 的 OpenAI 兼容端点。", docsUrl: "https://platform.moonshot.cn/console/api-keys" },
  { id: "zhipu", label: "智谱", type: "openai-compatible", baseUrl: "https://open.bigmodel.cn/api/paas/v4", hint: "智谱开放平台的 OpenAI 兼容地址。", docsUrl: "https://bigmodel.cn/usercenter/apikeys" },
  { id: "custom-openai", label: "OpenAI 兼容自定义", type: "openai-compatible", baseUrl: "", hint: "填写任意兼容 OpenAI /v1 的服务地址。", docsUrl: "" },
];

/** Every preset is usable in every environment; the parameter is kept for API compatibility. */
export function visibleProviderPresets(_localEnvironment = true): ProviderPreset[] {
  return [...PROVIDER_PRESETS];
}

export function findProviderPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find(preset => preset.id === id);
}

/** Stable connection reference suggested by a preset id (`custom-openai` → `custom_openai`). */
export function providerRefFromPreset(id: string): string {
  const normalized = id.replace(/[^A-Za-z0-9_.]/g, "_");
  return /^[A-Za-z]/.test(normalized) ? normalized : `provider_${normalized}`;
}

/** Appends `_2`, `_3`… when the suggested reference is already taken. */
export function uniqueProviderRef(base: string, existing: readonly string[]): string {
  if (!existing.includes(base)) return base;
  let suffix = 2;
  while (existing.includes(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

export function isLocalBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl.trim());
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

/** Mirrors the Worker rule: DeepSeek and remote OpenAI-compatible providers need a credential; local HTTP does not. */
export function credentialRequiredFor(type: string, baseUrl: string): boolean {
  if (type === "deepseek") return true;
  if (type === "openai-compatible") return !isLocalBaseUrl(baseUrl);
  return true;
}

/** Worker model-reference pattern (ASCII); one model name per entry. */
export function modelRefIssue(model: string): string {
  const value = model.trim();
  if (!value) return "请填写模型名称。";
  if (value.length > 200) return "模型名称最长 200 个字符。";
  if (!/^[\w.:/-]+$/.test(value)) return "模型名称只能包含字母、数字、下划线、点、冒号、斜杠和连字符。";
  return "";
}

/** Worker connection reference pattern plus the reserved test-probe prefix. */
export function providerRefIssue(ref: string, existingRefs: readonly string[]): string {
  const value = ref.trim();
  if (!value) return "请填写供应商标识。";
  if (!/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(value)) return "供应商标识以字母开头，只能包含字母、数字、下划线、点和连字符，最长 80 个字符。";
  if (value.startsWith("probe__")) return "供应商标识不能以 probe__ 开头。";
  if (existingRefs.includes(value)) return "供应商标识已存在。";
  return "";
}

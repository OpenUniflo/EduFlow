import type { JsonValue } from "../domain/v2/types";

/** Shared, serializable shape of one generic HTTP connection version. */
export type ApiParamSource = "node" | "fixed" | "variable";
export type ApiParam = { name: string; source: ApiParamSource; value: string; required: boolean; description: string };
export type ApiHeader = { name: string; value: string };
export type ApiBodyMode = "none" | "json" | "form-data" | "x-www-form-urlencoded" | "raw";
export type ApiBody = { mode: ApiBodyMode; text: string };
export type ApiAuthType = "none" | "api-key-header" | "api-key-query" | "bearer" | "basic";
export type ApiAuth = { type: ApiAuthType; name: string };
export type ApiSettings = { timeoutMs: number; retries: number; resultPath: string };
export type ApiOutputField = { name: string; path: string; type: string };
export type ApiDraft = {
  name: string;
  description: string;
  method: string;
  url: string;
  params: ApiParam[];
  headers: ApiHeader[];
  body: ApiBody;
  auth: ApiAuth;
  settings: ApiSettings;
  outputMap: ApiOutputField[];
  credential: string;
};

export const API_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export const API_BODY_MODES: readonly { id: ApiBodyMode; label: string }[] = [
  { id: "none", label: "none" },
  { id: "json", label: "JSON" },
  { id: "form-data", label: "form-data" },
  { id: "x-www-form-urlencoded", label: "x-www-form-urlencoded" },
  { id: "raw", label: "raw" },
];
export const API_AUTH_TYPES: readonly { id: ApiAuthType; label: string }[] = [
  { id: "none", label: "无认证" },
  { id: "api-key-header", label: "API Key · Header" },
  { id: "api-key-query", label: "API Key · Query" },
  { id: "bearer", label: "Bearer Token" },
  { id: "basic", label: "Basic Auth" },
];
export const API_PARAM_SOURCES: readonly { id: ApiParamSource; label: string }[] = [
  { id: "node", label: "节点传入" },
  { id: "fixed", label: "固定值" },
  { id: "variable", label: "变量" },
];

export function emptyApiDraft(): ApiDraft {
  return {
    name: "", description: "", method: "GET", url: "", params: [], headers: [], body: { mode: "none", text: "" },
    auth: { type: "none", name: "" }, settings: { timeoutMs: 15000, retries: 0, resultPath: "" }, outputMap: [], credential: "",
  };
}

function stringValue(value: JsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function objectValue(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, JsonValue> : {};
}

/** Splits a full request URL into the Worker's base URL + path pair without dropping `{{variables}}`. */
export function splitRequestUrl(url: string): { baseUrl: string; path: string } {
  const trimmed = url.trim();
  const scheme = /^(https?:\/\/)/i.exec(trimmed);
  if (!scheme) return { baseUrl: "", path: "" };
  const rest = trimmed.slice(scheme[1].length);
  const slash = rest.indexOf("/");
  const question = rest.indexOf("?");
  if (slash === -1 && question === -1) return { baseUrl: trimmed, path: "/" };
  if (slash === -1 || (question !== -1 && question < slash)) return { baseUrl: `${scheme[1]}${rest.slice(0, question)}`, path: `/${rest.slice(question)}` };
  return { baseUrl: `${scheme[1]}${rest.slice(0, slash)}`, path: rest.slice(slash) || "/" };
}

/** Rejoins the immutable connection pair for display and editing. */
export function joinRequestUrl(baseUrl: string, path: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!base) return path.trim();
  const suffix = path.trim() || "/";
  return `${base}${suffix.startsWith("/") ? "" : "/"}${suffix}`;
}

export function apiDraftFromContent(content: Record<string, JsonValue>): ApiDraft {
  const body = objectValue(content.body);
  const auth = objectValue(content.auth);
  const settings = objectValue(content.settings);
  const params = Array.isArray(content.params) ? content.params.map(row => {
    const value = objectValue(row);
    return { name: stringValue(value.name), source: (stringValue(value.source) || "node") as ApiParamSource, value: stringValue(value.value), required: value.required !== false, description: stringValue(value.description) };
  }) : [];
  const headers = Array.isArray(content.headers) ? content.headers.map(row => {
    const value = objectValue(row);
    return { name: stringValue(value.name), value: stringValue(value.value) };
  }) : [];
  const outputMap = Array.isArray(content.outputMap) ? content.outputMap.map(row => {
    const value = objectValue(row);
    return { name: stringValue(value.name), path: stringValue(value.path), type: stringValue(value.type) };
  }) : [];
  return {
    name: stringValue(content.name), description: stringValue(content.description),
    method: stringValue(content.method) || "GET",
    url: joinRequestUrl(stringValue(content.baseUrl), stringValue(content.path) || "/"),
    params, headers,
    body: { mode: (stringValue(body.mode) || "none") as ApiBodyMode, text: stringValue(body.text) },
    auth: { type: (stringValue(auth.type) || "none") as ApiAuthType, name: stringValue(auth.name) },
    settings: { timeoutMs: typeof settings.timeoutMs === "number" ? settings.timeoutMs : 15000, retries: typeof settings.retries === "number" ? settings.retries : 0, resultPath: stringValue(settings.resultPath) },
    outputMap, credential: "",
  };
}

export const API_DEFAULT_URL_HINT = "完整 URL，支持 {{参数}} 路径变量，发送时替换为实际值";

export function apiDraftIssue(draft: ApiDraft): string {
  if (!draft.name.trim()) return "请填写名称。";
  if (draft.name.trim().length > 120) return "名称最长 120 个字符。";
  if (draft.description.length > 500) return "说明最长 500 个字符。";
  if (!API_METHODS.includes(draft.method as typeof API_METHODS[number])) return "请选择请求方法。";
  const { baseUrl, path } = splitRequestUrl(draft.url);
  if (!baseUrl) return "请填写完整 URL，例如 https://api.example.com/v1/items。";
  try {
    const parsed = new URL(baseUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) return "URL 必须使用 http 或 https。";
    if (parsed.username || parsed.password) return "URL 不能包含账号或密码。";
  } catch {
    return "URL 格式有误，请填写完整地址。";
  }
  if (!path.startsWith("/")) return "URL 路径必须以 / 开头。";
  const names = new Set<string>();
  for (const param of draft.params) {
    if (!param.name.trim()) return "参数名不能为空。";
    if (names.has(param.name.trim())) return `参数名 ${param.name.trim()} 重复。`;
    names.add(param.name.trim());
    if (param.source !== "node" && !param.value.trim()) return `参数 ${param.name.trim()} 需要填写值。`;
  }
  const headerNames = new Set<string>();
  for (const header of draft.headers) {
    if (!header.name.trim()) return "请求头名称不能为空。";
    if (headerNames.has(header.name.trim().toLowerCase())) return `请求头 ${header.name.trim()} 重复。`;
    headerNames.add(header.name.trim().toLowerCase());
  }
  if ((draft.auth.type === "api-key-header" || draft.auth.type === "api-key-query") && !draft.auth.name.trim()) return "请填写 API Key 的名称。";
  if (draft.body.mode !== "none" && draft.method === "GET") return "GET 请求不能携带 Body。";
  if (draft.body.mode === "json" && draft.body.text.trim()) {
    try { JSON.parse(draft.body.text); } catch { return "Body 不是有效的 JSON。"; }
  }
  if (draft.settings.timeoutMs < 1000 || draft.settings.timeoutMs > 120000) return "超时应在 1–120 秒之间。";
  if (draft.settings.retries < 0 || draft.settings.retries > 3) return "重试次数应为 0–3。";
  return "";
}

/** Publishes only immutable configuration; the credential travels in the separate protected field. */
export function apiContentFromDraft(draft: ApiDraft): Record<string, JsonValue> {
  const { baseUrl, path } = splitRequestUrl(draft.url);
  const properties: Record<string, JsonValue> = {};
  const required: JsonValue[] = [];
  for (const param of draft.params) {
    if (!param.name.trim() || param.source !== "node") continue;
    properties[param.name.trim()] = { type: "string", title: param.name.trim(), description: param.description };
    if (param.required) required.push(param.name.trim());
  }
  const outputProperties: Record<string, JsonValue> = {};
  for (const field of draft.outputMap) {
    if (!field.name.trim()) continue;
    outputProperties[field.name.trim()] = field.type === "array" ? { type: "array", items: {} } : field.type === "number" ? { type: "number" } : field.type === "boolean" ? { type: "boolean" } : { type: "string" };
  }
  return {
    type: "http",
    name: draft.name.trim(),
    description: draft.description.trim(),
    baseUrl, path,
    method: draft.method,
    sideEffect: draft.method === "GET" ? "read" : "write",
    params: draft.params.filter(param => param.name.trim()).map(param => ({ name: param.name.trim(), source: param.source, value: param.value, required: param.required, description: param.description })),
    headers: draft.headers.filter(header => header.name.trim()).map(header => ({ name: header.name.trim(), value: header.value })),
    body: { mode: draft.body.mode, text: draft.body.text },
    auth: { type: draft.auth.type, ...(draft.auth.type === "api-key-header" || draft.auth.type === "api-key-query" ? { name: draft.auth.name.trim() } : {}) },
    settings: { timeoutMs: draft.settings.timeoutMs, retries: draft.settings.retries, ...(draft.settings.resultPath.trim() ? { resultPath: draft.settings.resultPath.trim() } : {}) },
    outputMap: draft.outputMap.filter(field => field.name.trim()).map(field => ({ name: field.name.trim(), path: field.path.trim(), type: field.type })),
    inputSchema: { type: "object", properties, ...(required.length ? { required } : {}) },
    outputSchema: Object.keys(outputProperties).length ? { type: "object", properties: outputProperties } : { type: "object" },
  };
}

/** Compact one-line URL for the resource center rows: `GET host/path · N 个参数`. */
export function apiDisplayUrl(content: Record<string, JsonValue>): string {
  const { baseUrl, path } = splitRequestUrl(joinRequestUrl(stringValue(content.baseUrl), stringValue(content.path) || "/"));
  const host = baseUrl.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const paramCount = Array.isArray(content.params) ? content.params.length : 0;
  return `${stringValue(content.method) || "GET"} ${host}${path || "/"} · ${paramCount} 个参数`;
}

/** Node-sourced parameters become test inputs; fixed and variable values stay server-side. */
export function apiTestArguments(draft: ApiDraft, values: Record<string, string>): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  for (const param of draft.params) {
    if (param.source !== "node" || !param.name.trim()) continue;
    result[param.name.trim()] = values[param.name.trim()] ?? "";
  }
  return result;
}

export function requestHeadersForDisplay(content: Record<string, JsonValue>, credentialConfigured: boolean): { name: string; value: string }[] {
  const rows: { name: string; value: string }[] = [];
  for (const row of Array.isArray(content.headers) ? content.headers : []) {
    const header = objectValue(row);
    rows.push({ name: stringValue(header.name), value: stringValue(header.value) });
  }
  const auth = objectValue(content.auth);
  const type = stringValue(auth.type) || "none";
  if (type === "bearer") rows.push({ name: "Authorization", value: credentialConfigured ? "Bearer ••••••" : "未设置" });
  else if (type === "basic") rows.push({ name: "Authorization", value: credentialConfigured ? "Basic ••••••" : "未设置" });
  else if (type === "api-key-header") rows.push({ name: stringValue(auth.name) || "X-API-Key", value: credentialConfigured ? "••••••" : "未设置" });
  else if (type === "api-key-query") rows.push({ name: stringValue(auth.name) || "api_key", value: credentialConfigured ? "••••••（查询参数）" : "未设置" });
  return rows;
}

/** Default configuration used when a platform-provided tool is edited into a user copy. */
export function platformToolDraft(tool: { name: string; description?: string }): ApiDraft {
  return {
    ...emptyApiDraft(),
    name: tool.name,
    description: tool.description ?? "",
    method: "GET",
    url: "https://hn.algolia.com/api/v1/search?optionalWords={{query}}",
    params: [
      { name: "query", source: "node", value: "", required: true, description: "搜索关键词" },
      { name: "tags", source: "fixed", value: "story", required: false, description: "只搜帖子" },
      { name: "hitsPerPage", source: "fixed", value: "5", required: false, description: "返回条数，可改" },
      { name: "typoTolerance", source: "fixed", value: "false", required: false, description: "不允许拼写近似，避免无关结果" },
    ],
    outputMap: [
      { name: "hits", path: "hits", type: "array" },
      { name: "total", path: "nbHits", type: "number" },
    ],
  };
}

export function uniqueConnectionRef(base: string, existing: readonly string[], fallback = "api_connection"): string {
  const normalized = base.trim().replace(/[^A-Za-z0-9_.-]/g, "_").replace(/^[^A-Za-z]+/, "") || fallback;
  const safe = normalized.slice(0, 72);
  if (!existing.includes(safe)) return safe;
  let suffix = 2;
  while (existing.includes(`${safe}_${suffix}`)) suffix += 1;
  return `${safe}_${suffix}`;
}

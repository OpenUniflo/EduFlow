import type { JsonValue, McpMarketItem, WorkflowTool } from "../domain/v2/types";
import { latestConnectionsOfType, latestVersion, type CatalogConnection } from "./resourceModel";

export type McpTab = "market" | "connected" | "tools";
export type McpDraftAuth = "none" | "bearer" | "api-key" | "oauth" | "legacy";

export function mcpConnectionErrorMessage(code?: string): string {
  const messages: Record<string, string> = {
    MCP_AUTH_REQUIRED: "凭据无效或权限不足。请检查密钥后重试；OAuth 连接请重新授权。",
    SECRET_REVOKED: "凭据已失效或已被撤销，请重新填写凭据或重新授权。",
    MCP_CONNECTION_FAILED: "MCP 服务不可达或拒绝了连接。请检查服务地址与网络后重试。",
    MCP_CONNECTION_TIMEOUT: "连接超时，请检查服务地址和网络后重试。",
    MCP_CONNECTION_DISABLED: "此 MCP 连接已断开，请重新连接或重新授权。",
    CONNECTOR_FORBIDDEN: "此 MCP 连接已不可用，请回到“已连接”检查连接状态后重试。",
    CONNECTOR_UNAVAILABLE: "此 MCP 连接版本已不可用，请重新选择连接后重试。",
    INVALID_CONNECTION: "连接配置无效，请检查地址、鉴权方式和凭据请求头。",
    MCP_TOOL_NOT_ALLOWED: "该工具未被允许，请先在连接配置中勾选允许范围。",
    MCP_OAUTH_STATE: "OAuth 授权已过期或已使用，请重新发起授权。",
    MCP_OAUTH_DENIED: "OAuth 授权未完成，请重试。",
    MCP_OAUTH_TOKEN: "OAuth 授权码换取令牌失败，请重新授权。",
    MCP_OAUTH_UNSUPPORTED: "此服务未提供可用的 OAuth 配置，请改用 API Key 或 Bearer。",
    MCP_OAUTH_SCOPE_REQUIRED: "请选择本次连接需要的授权范围。",
    MCP_OAUTH_SCOPE: "授权范围不被服务支持，请重新选择。",
    MCP_OAUTH_DISCOVERY_FAILED: "无法读取服务的 OAuth 配置，请检查地址或改用 API Key/Bearer。",
    CONNECTION_TEST_TIMEOUT: "连接超时，请检查服务地址和网络后重试。",
    CATALOG_PAYLOAD_TOO_LARGE: "已允许工具的完整定义超过单条发现目录容量，未允许工具已只保留名称。请减少允许工具后重试。",
    CATALOG_QUOTA_EXCEEDED: "共享发现目录的连接数量已满。请先清理不再使用的连接版本后重试。",
  };
  return messages[code ?? ""] ?? "读取工具失败，请检查连接配置后重试。";
}
export function mcpAuthLabel(value: string | undefined): string {
  return ({ none: "无需鉴权", bearer: "Bearer 令牌", "api-key": "API Key", oauth: "OAuth", legacy: "旧版凭据" } as Record<string, string>)[value ?? ""] ?? "鉴权方式待确认";
}
export function mcpAuthHintLabel(value: string | undefined): string {
  return ({ none: "公开访问", bearer: "Bearer", "api-key": "API Key", oauth: "OAuth", unknown: "鉴权待确认" } as Record<string, string>)[value ?? ""] ?? "鉴权待确认";
}
export function mcpTransportLabel(value: string | undefined): string {
  return value === "sse" ? "SSE" : "Streamable HTTP";
}
export function mcpSourceLabel(source: McpMarketItem["source"], detailed = false): string {
  if (source === "platform") return "平台内置";
  if (source === "admin") return "管理员补充";
  return detailed ? "官方 MCP Registry" : "官方 Registry";
}
export function mcpAuthTypeOf(content: Record<string, JsonValue>, hasCredential = false): McpDraftAuth {
  const value = typeof content.authType === "string" ? content.authType : content.secretRef || hasCredential ? "legacy" : "none";
  return value === "bearer" || value === "api-key" || value === "oauth" || value === "legacy" ? value : value === "none" ? "none" : "legacy";
}
export function latestMcpConnections(connections: readonly CatalogConnection[]): CatalogConnection[] {
  return latestConnectionsOfType(connections, "mcp-http");
}
/** URL comparison for catalog/connection association; a trailing slash is not an identity. */
export function normalizeMcpUrl(value: unknown): string {
  return String(value ?? "").trim().replace(/\/+$/, "");
}
export type McpRecommendationAction = "config" | "quick" | "login";
/**
 * A featured catalog row is only a direct action when an administrator chose a
 * compatible recommendation mode. Existing featured rows stay on the ordinary
 * configuration path by default, so `featured` alone never grants free connect.
 * A platform-owned login row may have no preset scopes: it then asks the
 * provider without a scope parameter and the server still checks discovery.
 * Administrator rows keep requiring an explicitly verified scope list.
 */
export function mcpRecommendationAction(item: Pick<McpMarketItem, "source" | "connectMode" | "authHint" | "oauthScopes">): McpRecommendationAction {
  if (item.connectMode === "quick" && item.authHint === "none") return "quick";
  if (item.connectMode === "login" && item.authHint === "oauth" && (item.oauthScopes.length > 0 || item.source === "platform")) return "login";
  return "config";
}
function preferredMarketRow(left: McpMarketItem, right: McpMarketItem): McpMarketItem {
  // Platform metadata is the product-owned source of truth for its endpoint.
  // Every other source keeps the original featured-then-administrator priority.
  if (left.source !== right.source) {
    if (left.source === "platform") return left;
    if (right.source === "platform") return right;
  }
  if (left.featured !== right.featured) return left.featured ? left : right;
  if (left.source !== right.source) return left.source === "admin" ? left : right;
  return left;
}
/** Collapse duplicate endpoint rows, preferring platform metadata; other sources keep the original featured-then-administrator priority. */
export function dedupeMcpMarketItems(items: readonly McpMarketItem[]): McpMarketItem[] {
  const byUrl = new Map<string, McpMarketItem>();
  for (const item of items) {
    const key = normalizeMcpUrl(item.url);
    if (!key) continue;
    const existing = byUrl.get(key);
    byUrl.set(key, existing ? preferredMarketRow(existing, item) : item);
  }
  return [...byUrl.values()];
}
/**
 * Recommendation cards come from the API's featured/platform rows
 * (`recommendedIds`). Collapse duplicate URLs, preferring platform metadata;
 * other sources keep the original featured-then-administrator priority, so
 * reviewed display and connect metadata win only where that order allows.
 */
export function resolveRecommendedMcpServers(items: readonly McpMarketItem[], recommendedIds: readonly string[] = []): McpMarketItem[] {
  const recommended = new Set(recommendedIds);
  return dedupeMcpMarketItems(items.filter(item => recommended.has(item.id) || item.recommended))
    .map(item => item.recommended ? item : { ...item, recommended: true });
}
export function mcpConnectionFor(server: { sourceId: string; url: string; suggestedRef: string }, connections: readonly CatalogConnection[]): CatalogConnection | undefined {
  const normalized = normalizeMcpUrl(server.url);
  // The endpoint owns the association. A reused ID must not route a market card
  // to a different endpoint, for example a local test double.
  return normalized ? latestMcpConnections(connections).find(entry => normalizeMcpUrl(entry.content.url) === normalized) : undefined;
}
export function uniqueMcpRef(base: string, existing: readonly string[]): string {
  const fallback = (base || "mcp_service").toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").replace(/^[^a-z]+|_+$/g, "").slice(0, 70) || "mcp_service";
  if (!existing.includes(fallback)) return fallback;
  for (let index = 2; index < 1000; index += 1) {
    const suffix = `_${index}`;
    const candidate = `${fallback.slice(0, 80 - suffix.length)}${suffix}`;
    if (!existing.includes(candidate)) return candidate;
  }
  return `${fallback.slice(0, 70)}_${Date.now().toString(36)}`;
}
export type McpToolState = {
  /** Tools the owner explicitly allowed in the current connection version. */
  allowed: number;
  /** `null` means the service tools were never observed; never render that as zero. */
  discovered: number | null;
  /** Allowed tools present in the latest discovery. `null` while discovery is unknown. */
  usable: number | null;
  known: boolean;
};

/**
 * Keeps three separate facts: configured permission, server discovery and tools
 * that are both allowed and actually returned. Discovery never grants access,
 * and a missing tool list is not proof that the owner configured zero tools.
 */
export function mcpToolState(entry: CatalogConnection, tools: readonly WorkflowTool[], discoveredNames?: readonly string[] | null): McpToolState {
  const allowedNames = new Set(mcpAllowedToolNames(entry));
  // Catalog tools belong to one connector version. Never let a previous
  // version's cached tools inflate this version's discovered/usable count.
  const currentTools = tools.filter(tool => tool.connectionRef === entry.ref
    && (typeof tool.connectorRef !== "string" || !tool.connectorRef || tool.connectorRef.endsWith(`:${entry.version}`)));
  // Discovery is a separate full tools/list observation. Never infer it from
  // the allow-filtered execution catalog; absent evidence stays unknown.
  const discovered = discoveredNames === undefined || discoveredNames === null ? null : [...new Set(discoveredNames)];
  // A disconnected connection has a definite usable count of zero. Allowed
  // configuration and the last known discovery remain independent facts.
  const usable = entry.disabled ? 0 : discovered
    ? currentTools.filter(tool => discovered.includes(tool.name) && allowedNames.has(tool.name) && tool.available !== false).length
    : null;
  return { allowed: allowedNames.size, discovered: discovered?.length ?? null, usable, known: discovered !== null };
}

export function mcpConnectionStatus(entry: CatalogConnection, state: McpToolState): { label: string; tone: "ok" | "warn" | "quiet" | "error" } {
  if (entry.disabled) return { label: "已断开 · 不可调用", tone: "error" };
  if (state.discovered === null) {
    if (state.allowed > 0) return { label: "已允许 · 工具尚未发现", tone: "warn" };
    return { label: entry.hasCredential ? "已授权 · 待发现工具" : "待验证", tone: "warn" };
  }
  if (state.usable && state.usable > 0) return { label: `已连接 · 可用 ${state.usable} 个工具`, tone: "ok" };
  if (state.allowed === 0 && (state.discovered ?? 0) > 0) return { label: "已发现工具 · 尚未允许", tone: "warn" };
  if (state.allowed > 0 && (state.discovered ?? 0) === 0) return { label: "已允许 · 服务未返回工具", tone: "warn" };
  if (state.allowed > 0) return { label: "已允许的工具当前不可用", tone: "error" };
  return { label: "待验证", tone: "quiet" };
}

export function mcpToolCountLabels(state: McpToolState, options: { disabled?: boolean } = {}): { allowed: string; discovered: string; usable: string } {
  return {
    allowed: `已允许 ${state.allowed} 个`,
    discovered: state.discovered === null ? (options.disabled ? "发现未记录" : "发现待刷新") : `已发现 ${state.discovered} 个`,
    usable: options.disabled || state.usable !== null ? `可用 ${state.usable ?? 0} 个` : "可用待确认",
  };
}
export function mcpConnectionTitle(entry: CatalogConnection): string {
  return String(entry.content.serverTitle ?? entry.content.name ?? entry.ref);
}
export function mcpConnectionAuth(entry: CatalogConnection): string {
  return mcpAuthLabel(mcpAuthTypeOf(entry.content, entry.hasCredential));
}
export function mcpAllowedToolNames(entry: CatalogConnection): string[] {
  return Array.isArray(entry.content.allowedToolNames) ? entry.content.allowedToolNames.filter((name): name is string => typeof name === "string") : [];
}
export function mcpConnectionRefFor(server: { suggestedRef: string }, connections: readonly CatalogConnection[]): string {
  return uniqueMcpRef(server.suggestedRef, connections.map(entry => entry.ref));
}
/** One-click guest connection content. Tool permission is deliberately empty until the owner allows it. */
export function mcpQuickConnectDraft(item: Pick<McpMarketItem, "source" | "sourceId" | "title" | "url" | "transport" | "authHint" | "suggestedRef" | "connectMode" | "oauthScopes">, connections: readonly CatalogConnection[]): { ref: string; version: number; content: Record<string, JsonValue> } {
  if (mcpRecommendationAction(item) !== "quick") throw new Error("此服务需要登录授权或连接配置，不能免配置直接连接。");
  const ref = mcpConnectionRefFor(item, connections);
  const version = latestVersion(connections, ref) + 1;
  return {
    ref,
    version,
    content: {
      type: "mcp-http",
      name: item.title,
      url: item.url,
      transport: item.transport,
      authType: "none",
      allowedToolNames: [],
      serverTitle: item.title,
      ...(item.source === "registry" && item.sourceId ? { registryServerId: item.sourceId } : {}),
    },
  };
}
export function mcpServerInitials(title: string): string {
  const compact = title.trim().replace(/\s+/g, " ");
  if (!compact) return "M";
  const words = compact.split(" ");
  if (words.length > 1) return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  return [...compact].slice(0, 2).join("").toUpperCase();
}
export function mcpAuthFromHint(value: string | undefined): McpDraftAuth {
  if (value === "none") return "none";
  if (value === "oauth") return "oauth";
  if (value === "api-key") return "api-key";
  if (value === "bearer") return "bearer";
  return "none";
}
export function mcpHeaderForHint(value: string | undefined, hints: readonly { name: string }[]): string {
  const hint = hints.find(item => item.name)?.name;
  if (hint) return hint;
  if (value === "api-key") return "X-API-Key";
  return "Authorization";
}
export function mcpSyncLabel(sync: { status: string; lastSuccessAt: string | null; error: string | null; serverCount: number; hasMore: boolean; pageCount?: number; fullSyncCompleted?: boolean }): string {
  if (sync.status === "running") return "正在同步官方目录…";
  if (sync.status === "error") return `目录同步失败，显示上次缓存${sync.error ? `：${sync.error}` : ""}`;
  if (sync.hasMore) return `已同步 ${sync.pageCount ?? 0} 页，缓存 ${sync.serverCount} 个远程服务，可继续同步`;
  if (sync.lastSuccessAt) {
    const time = new Date(sync.lastSuccessAt);
    if (!Number.isNaN(time.getTime())) return `目录已完整同步 ${sync.serverCount} 个远程服务 · ${time.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
  }
  return sync.serverCount ? `已缓存 ${sync.serverCount} 个远程服务` : "目录尚未同步";
}
export function mcpCategoryGroups<T extends { category: string; categoryLabel: string }>(items: readonly T[]): { key: string; label: string; items: T[] }[] {
  const groups = new Map<string, { key: string; label: string; items: T[] }>();
  for (const item of items) {
    const group = groups.get(item.category) ?? { key: item.category, label: item.categoryLabel, items: [] };
    group.items.push(item);
    groups.set(item.category, group);
  }
  return [...groups.values()];
}
export function mcpToolMatchesQuery(tool: { name: string; description?: string }, query: string): boolean {
  const value = query.trim().toLocaleLowerCase();
  return !value || `${tool.name} ${tool.description ?? ""}`.toLocaleLowerCase().includes(value);
}

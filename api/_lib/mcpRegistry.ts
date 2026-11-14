import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "./supabase.js";
import { ApiError } from "./http.js";
import { assertPublicDestination, publicHttpUrl } from "./outbound.js";

const REGISTRY_URL = "https://registry.modelcontextprotocol.io/v0.1/servers";
const REGISTRY_PAGE_SIZE = 100;
const SYNC_TTL_MS = 60 * 60 * 1000;
const SYNC_LEASE_MS = 90 * 1000;

/** Bumped when classification rules change so cached catalog rows are re-evaluated. */
export const MCP_CLASSIFIER_VERSION = 2;

export const MCP_MARKET_CATEGORIES = [
  { key: "productivity", label: "办公协作", keywords: ["office", "productivity", "calendar", "email", "document", "notion", "slack", "teams", "workspace", "文档", "日历", "邮件", "协作", "办公", "wiki", "knowledge base", "project management"] },
  { key: "research", label: "调研分析", keywords: ["search", "research", "academic", "paper", "wikipedia", "news", "web", "crawl", "scrape", "browser", "调研", "搜索", "论文", "资讯", "检索", "arxiv", "scholar"] },
  { key: "data", label: "数据服务", keywords: ["database", "sql", "analytics", "data", "dataset", "census", "statistics", "数据", "统计", "分析", "数据库", "bigquery", "snowflake", "postgres", "warehouse"] },
  { key: "developer", label: "开发工具", keywords: ["github", "gitlab", "code", "developer", "repository", "docker", "kubernetes", "api", "开发", "代码", "仓库", "部署", "ai gateway", "model gateway", "llm gateway", "llm", "inference", "model api", "models", "sdk", "devops"] },
  { key: "finance", label: "金融投资", keywords: ["finance", "financial", "stock", "market", "bank", "trading", "crypto", "金融", "股票", "银行", "投资", "行情", "investment", "investing", "fund", "portfolio", "payment", "filings", "fintech"] },
  { key: "communication", label: "沟通协作", keywords: ["chat", "message", "meeting", "voice", "sms", "discord", "telegram", "沟通", "消息", "会议", "语音", "messaging", "whatsapp", "wechat", "chatbot", "conversation", "email"] },
  { key: "creative", label: "内容创作", keywords: ["image", "video", "audio", "design", "creative", "music", "art", "媒体", "生成", "创作", "图片", "视频", "marketing", "campaign", "brand", "content", "template", "营销", "广告", "模板", "案例", "互动", "generation", "podcast", "social", "ads", "advertising", "publish", "animation", "photo", "3d"] },
  { key: "education", label: "学习研究", keywords: ["learn", "course", "education", "tutor", "school", "study", "学习", "课程", "教育", "知识"] },
  { key: "other", label: "其他", keywords: [] },
] as const;

export type McpMarketCategory = typeof MCP_MARKET_CATEGORIES[number]["key"];
const CATEGORY_KEYS = new Set(MCP_MARKET_CATEGORIES.map((item) => item.key));
const CATEGORY_LABELS = new Map(MCP_MARKET_CATEGORIES.map((item) => [item.key, item.label]));

export type McpMarketServerRow = {
  id: string; source: "registry" | "admin"; source_id: string; name: string; title: string;
  description: string; version: string; url: string; transport: "streamable-http" | "sse";
  auth_hint: "none" | "oauth" | "api-key" | "bearer" | "unknown";
  header_hints: unknown; category: string; icon_url: string | null; website_url: string | null;
  repository_url: string | null; featured: boolean; registry_status: string | null;
  published_at: string | null; updated_at: string | null; last_seen_at: string; created_at: string;
};

export type McpMarketItem = {
  id: string; source: "registry" | "admin"; sourceId: string; name: string; title: string;
  description: string; version: string; url: string; transport: "streamable-http" | "sse";
  authHint: string; headerHints: { name: string; description?: string; isSecret?: boolean; isRequired?: boolean }[];
  category: McpMarketCategory; categoryLabel: string; iconUrl?: string; websiteUrl?: string;
  repositoryUrl?: string; featured: boolean; registryStatus?: string; publishedAt?: string; updatedAt?: string;
  suggestedRef: string; recommended: boolean;
};

type SyncRow = { id: number; status: "idle" | "running" | "ok" | "error"; cursor: string | null; full_sync_completed: boolean; page_count: number; server_count: number; last_attempt_at: string | null; last_success_at: string | null; last_error: string | null; classifier_version: number; updated_at: string };

function text(value: unknown, max = 2000) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
}
function httpsUrl(value: unknown, max = 2048) {
  if (typeof value !== "string" || value.length > max) return undefined;
  const url = publicHttpUrl(value);
  if (!url || url.protocol !== "https:") return undefined;
  return url.toString();
}
function officialMeta(entry: Record<string, unknown>) {
  const meta = entry._meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const value = (meta as Record<string, unknown>)["io.modelcontextprotocol.registry/official"];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function remoteUrl(server: Record<string, unknown>) {
  const remotes = Array.isArray(server.remotes) ? server.remotes : [];
  for (const remote of remotes) {
    if (!remote || typeof remote !== "object" || Array.isArray(remote)) continue;
    const item = remote as Record<string, unknown>;
    if (item.type !== "streamable-http" && item.type !== "sse") continue;
    const raw = typeof item.url === "string" ? item.url : "";
    // Registry URL templates without values cannot be connected safely.
    if (!raw || raw.includes("{") || raw.includes("}")) continue;
    const url = httpsUrl(raw);
    if (!url) continue;
    return { url, transport: item.type as "streamable-http" | "sse", headers: Array.isArray(item.headers) ? item.headers : [] };
  }
  return null;
}
function headerHints(value: unknown[]) {
  const rows: { name: string; description?: string; isSecret?: boolean; isRequired?: boolean }[] = [];
  for (const raw of value.slice(0, 20)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const name = text(item.name, 80);
    if (!name) continue;
    rows.push({ name, ...(text(item.description, 200) ? { description: text(item.description, 200) } : {}), ...(item.isSecret === true ? { isSecret: true } : {}), ...(item.isRequired === true ? { isRequired: true } : {}) });
  }
  return rows;
}
function authHint(description: string, headers: { name: string; description?: string; isSecret?: boolean }[]) {
  const lower = description.toLowerCase();
  if (lower.includes("oauth") || headers.some((header) => /oauth/i.test(`${header.name} ${header.description ?? ""}`))) return "oauth" as const;
  const secret = headers.find((header) => header.isSecret);
  if (!secret) return "unknown" as const;
  if (/x-api-key|api[-_ ]?key/i.test(`${secret.name} ${secret.description ?? ""}`)) return "api-key" as const;
  if (/authorization|bearer/i.test(`${secret.name} ${secret.description ?? ""}`)) return "bearer" as const;
  return "api-key" as const;
}
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * ASCII category terms match complete words (including a simple plural), not
 * fragments: `market` must not match `marketing`, and `chat` must not match
 * `ChatGPT`. Chinese terms have no word separators and use substring matching.
 */
function keywordOccurrences(text: string, keyword: string) {
  const lower = text.toLowerCase();
  if (!/^[a-z0-9 ]+$/.test(keyword)) return lower.split(keyword).length - 1;
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword)}(?:s|es)?([^a-z0-9]|$)`, "g");
  return [...lower.matchAll(pattern)].length;
}

export function classifyMcpServer(name: string, title: string, description: string): McpMarketCategory {
  // Names and titles carry more signal than a long description; phrases carry
  // more than a generic one-word mention. Ties keep the declared category order.
  const heading = `${name} ${title}`.toLowerCase();
  const body = description.toLowerCase();
  let best: { key: McpMarketCategory; score: number } = { key: "other", score: 0 };
  for (const category of MCP_MARKET_CATEGORIES) {
    let score = 0;
    for (const keyword of category.keywords) {
      if (!keyword) continue;
      const weight = keyword.includes(" ") ? 4 : 2;
      score += keywordOccurrences(heading, keyword) * weight * 2;
      score += keywordOccurrences(body, keyword) * weight;
    }
    if (score > best.score) best = { key: category.key, score };
  }
  return best.key;
}
export function suggestedConnectionRef(sourceId: string) {
  const base = sourceId.toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").replace(/^[^a-z]+/, "").slice(0, 56) || "mcp_server";
  const hash = createHash("sha1").update(sourceId).digest("hex").slice(0, 8);
  return `${base}_${hash}`.slice(0, 80);
}
export function normalizeRegistryServer(entry: unknown): Omit<McpMarketServerRow, "id" | "created_at" | "last_seen_at"> | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const outer = entry as Record<string, unknown>;
  const server = outer.server;
  if (!server || typeof server !== "object" || Array.isArray(server)) return null;
  const value = server as Record<string, unknown>;
  const meta = officialMeta(outer);
  if (meta && (meta.status !== "active" || meta.isLatest === false)) return null;
  const name = text(value.name, 200);
  if (!/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/.test(name)) return null;
  const remote = remoteUrl(value);
  if (!remote) return null;
  const title = text(value.title, 100) || name.split("/").pop() || name;
  const description = text(value.description, 100);
  const headers = headerHints(remote.headers);
  const icon = Array.isArray(value.icons) && value.icons[0] && typeof value.icons[0] === "object" && !Array.isArray(value.icons[0]) ? (value.icons[0] as Record<string, unknown>) : null;
  const iconUrl = icon && text(icon.mimeType, 40) !== "image/svg+xml" ? httpsUrl(icon.src) : undefined;
  const repository = value.repository && typeof value.repository === "object" && !Array.isArray(value.repository) ? (value.repository as Record<string, unknown>) : null;
  const publishedAt = meta && typeof meta.publishedAt === "string" && !Number.isNaN(Date.parse(meta.publishedAt)) ? new Date(meta.publishedAt).toISOString() : null;
  const updatedAt = meta && typeof meta.updatedAt === "string" && !Number.isNaN(Date.parse(meta.updatedAt)) ? new Date(meta.updatedAt).toISOString() : null;
  return {
    source: "registry", source_id: name, name, title, description, version: text(value.version, 255), url: remote.url,
    transport: remote.transport, auth_hint: authHint(description, headers), header_hints: headers,
    category: classifyMcpServer(name, title, description), icon_url: iconUrl ?? null,
    website_url: httpsUrl(value.websiteUrl) ?? null, repository_url: repository ? httpsUrl(repository.url) ?? null : null,
    featured: false, registry_status: meta ? text(meta.status, 40) || null : null, published_at: publishedAt, updated_at: updatedAt,
  };
}

function sanitizeSyncError(value: unknown) {
  const message = value instanceof Error ? value.message : "Registry sync failed";
  return message.replace(/(?:api[_-]?key|token|secret)\s*[=:]\s*\S+/gi, "[REDACTED]").slice(0, 500);
}
function syncClient() { return createServerSupabase(); }

function searchTerm(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase().replace(/[(),%_\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}
function marketQuery(client: SupabaseClient, term: string, category: string, options: { count?: "exact"; head?: boolean } = {}) {
  let query = client.from("mcp_market_servers").select("*", options.count === "exact" ? { count: "exact", head: options.head === true } : undefined);
  if (term) {
    const escaped = term.replace(/[%_]/g, "");
    query = query.or(["title", "name", "description", "source_id"].map((column) => `${column}.ilike.%${escaped}%`).join(","));
  }
  if (category) query = query.eq("category", category);
  return query;
}

async function readSyncState(client: SupabaseClient): Promise<SyncRow> {
  const { data, error } = await client.from("mcp_market_sync").select("*").eq("id", 1).maybeSingle();
  if (error) throw new ApiError(503, "MCP_MARKET_UNAVAILABLE", "MCP 目录暂时不可用");
  if (data) return data as SyncRow;
  return { id: 1, status: "idle", cursor: null, full_sync_completed: false, page_count: 0, server_count: 0, last_attempt_at: null, last_success_at: null, last_error: null, classifier_version: 0, updated_at: new Date(0).toISOString() };
}
async function registryPage(cursor: string | null) {
  const params = new URLSearchParams({ limit: String(REGISTRY_PAGE_SIZE), version: "latest" });
  if (cursor) params.set("cursor", cursor);
  const url = `${REGISTRY_URL}?${params}`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "EduFlow-MCP/1.0" }, redirect: "error", signal: AbortSignal.timeout(20000), cache: "no-store" });
      if (!response.ok) throw new Error(`Registry returned HTTP ${response.status}`);
      const payload = await response.json() as { servers?: unknown[]; metadata?: { nextCursor?: unknown; count?: unknown } };
      if (!Array.isArray(payload.servers)) throw new Error("Registry returned an invalid response");
      return { servers: payload.servers, nextCursor: typeof payload.metadata?.nextCursor === "string" ? payload.metadata.nextCursor : null };
    } catch (reason) {
      lastError = reason;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Registry request failed");
}
async function claimSync(client: SupabaseClient, state: SyncRow) {
  const lastAttempt = state.last_attempt_at ? Date.parse(state.last_attempt_at) : 0;
  if (state.status === "running" && Date.now() - lastAttempt < SYNC_LEASE_MS) return null;
  const stale = !state.last_success_at || Date.now() - Date.parse(state.last_success_at) > SYNC_TTL_MS;
  // Resume an interrupted cursor; only a completed catalog starts over.
  const reset = stale && state.full_sync_completed;
  const cursor = reset ? null : state.cursor;
  const fullSyncCompleted = reset ? false : state.full_sync_completed;
  const now = new Date().toISOString();
  // last_attempt_at doubles as the lease owner. Comparing it (not just status)
  // makes two simultaneous claims/updates unable to both proceed, including
  // an expired running lease.
  let update = client.from("mcp_market_sync").update({
    status: "running", cursor, full_sync_completed: fullSyncCompleted, last_attempt_at: now, last_error: null, updated_at: now,
  }).eq("id", 1).eq("status", state.status);
  update = state.last_attempt_at ? update.eq("last_attempt_at", state.last_attempt_at) : update.is("last_attempt_at", null);
  const { data, error } = await update.select("id");
  if (error) throw new ApiError(503, "MCP_MARKET_UNAVAILABLE", "MCP 目录同步状态不可用");
  if (!data?.length) return null;
  return { cursor, fullSyncCompleted, lease: now };
}

export async function syncMcpMarket(options: { maxPages?: number } = {}) {
  const client = syncClient();
  const state = await readSyncState(client);
  const claimed = await claimSync(client, state);
  if (!claimed) return state;
  const maxPages = Math.max(1, Math.min(options.maxPages ?? 4, 20));
  const syncStarted = new Date().toISOString();
  let cursor = claimed.cursor;
  let fullSyncCompleted = claimed.fullSyncCompleted;
  let pageCount = state.page_count;
  let pagesFetched = 0;
  let observed = 0;
  const commit = async (values: Record<string, unknown>) => {
    const now = new Date().toISOString();
    const { data, error } = await client.from("mcp_market_sync")
      .update({ ...values, updated_at: now })
      .eq("id", 1).eq("last_attempt_at", claimed.lease).eq("status", "running").select("id");
    if (error) throw new Error(`Catalog sync state write failed: ${error.message}`);
    if (!data?.length) throw new Error("Catalog sync lease was lost");
  };
  try {
    for (let page = 0; page < maxPages; page += 1) {
      const result = await registryPage(cursor);
      const rows = result.servers.map(normalizeRegistryServer).filter((row): row is Omit<McpMarketServerRow, "id" | "created_at" | "last_seen_at"> => row !== null);
      observed += rows.length;
      pagesFetched += 1;
      if (rows.length) {
        for (let index = 0; index < rows.length; index += 100) {
          const { error } = await client.from("mcp_market_servers").upsert(rows.slice(index, index + 100).map((row) => ({ ...row, last_seen_at: new Date().toISOString() })), { onConflict: "source,source_id" });
          if (error) throw new Error(`Catalog cache write failed: ${error.message}`);
        }
      }
      pageCount += 1;
      cursor = result.nextCursor;
      fullSyncCompleted = !cursor;
      await commit({ cursor, full_sync_completed: fullSyncCompleted, page_count: pageCount, status: "running" });
      if (!cursor) break;
    }
    const now = new Date().toISOString();
    if (fullSyncCompleted && pagesFetched > 0 && observed > 0) {
      // A complete successful refresh removes services no longer active in the
      // registry. A failed/partial sync never touches the existing cache.
      const { error } = await client.from("mcp_market_servers").delete().eq("source", "registry").lt("last_seen_at", syncStarted);
      if (error) throw new Error(`Catalog stale cleanup failed: ${error.message}`);
    }
    const { count } = await client.from("mcp_market_servers").select("id", { count: "exact", head: true }).eq("source", "registry");
    await commit({
      status: "ok", server_count: count ?? 0, last_success_at: fullSyncCompleted ? now : state.last_success_at, last_error: null,
      ...(fullSyncCompleted ? { cursor: null } : {}),
    });
    return readSyncState(client);
  } catch (reason) {
    const lastError = sanitizeSyncError(reason);
    try {
      await client.from("mcp_market_sync").update({ status: "error", last_error: lastError, cursor, updated_at: new Date().toISOString() })
        .eq("id", 1).eq("last_attempt_at", claimed.lease);
    } catch { /* the lease may already belong to a newer sync */ }
    return readSyncState(client);
  }
}

async function reclassifyCachedMarket(client: SupabaseClient, state: SyncRow) {
  if ((state.classifier_version ?? 0) >= MCP_CLASSIFIER_VERSION) return state;
  const updates: { id: string; category: McpMarketCategory }[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await client.from("mcp_market_servers")
      .select("id,name,title,description,category")
      .eq("source", "registry")
      .order("id", { ascending: true })
      .range(start, start + 999);
    if (error) throw new ApiError(503, "MCP_MARKET_UNAVAILABLE", "MCP 目录暂时不可用");
    const rows = (data ?? []) as Pick<McpMarketServerRow, "id" | "name" | "title" | "description" | "category">[];
    for (const row of rows) {
      const category = classifyMcpServer(row.name, row.title, row.description);
      if (category !== row.category) updates.push({ id: row.id, category });
    }
    if (rows.length < 1000) break;
  }
  // One RPC per bounded batch keeps cached rows consistent with the current
  // classifier, not just rows imported by the next registry sync.
  for (let index = 0; index < updates.length; index += 500) {
    const { error } = await client.rpc("mcp_market_reclassify", { p_updates: updates.slice(index, index + 500) });
    if (error) throw new ApiError(503, "MCP_MARKET_UNAVAILABLE", "MCP 目录分类更新失败");
  }
  const { error } = await client.from("mcp_market_sync")
    .update({ classifier_version: MCP_CLASSIFIER_VERSION, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw new ApiError(503, "MCP_MARKET_UNAVAILABLE", "MCP 目录分类版本更新失败");
  return { ...state, classifier_version: MCP_CLASSIFIER_VERSION };
}

function marketDto(row: McpMarketServerRow, recommended: Set<string>): McpMarketItem {
  const category = CATEGORY_KEYS.has(row.category as McpMarketCategory) ? row.category as McpMarketCategory : "other";
  return {
    id: row.id, source: row.source, sourceId: row.source_id, name: row.name, title: row.title,
    description: row.description, version: row.version, url: row.url, transport: row.transport,
    authHint: row.auth_hint, headerHints: Array.isArray(row.header_hints) ? row.header_hints as McpMarketItem["headerHints"] : [],
    category, categoryLabel: CATEGORY_LABELS.get(category) ?? "其他", iconUrl: row.icon_url ?? undefined,
    websiteUrl: row.website_url ?? undefined, repositoryUrl: row.repository_url ?? undefined,
    featured: row.featured, registryStatus: row.registry_status ?? undefined, publishedAt: row.published_at ?? undefined,
    updatedAt: row.updated_at ?? undefined, suggestedRef: suggestedConnectionRef(row.source_id),
    recommended: row.featured,
  };
}

export async function readMcpMarket(input: { query?: string; category?: string; page?: number; limit?: number; sync?: boolean } = {}) {
  const client = syncClient();
  let state = await readSyncState(client);
  state = await reclassifyCachedMarket(client, state);
  const stale = !state.last_success_at || Date.now() - Date.parse(state.last_success_at) > SYNC_TTL_MS;
  const resumable = Boolean(state.cursor) && !state.full_sync_completed;
  const retryThrottled = state.status === "error" && state.last_attempt_at && Date.now() - Date.parse(state.last_attempt_at) < 2 * 60 * 1000;
  // A partial sync keeps its cursor for an explicit "继续同步"; page views do
  // not silently consume the rest of a large registry.
  if (input.sync !== false && !resumable && (stale || state.status === "idle") && state.status !== "running" && !retryThrottled) {
    state = await syncMcpMarket({ maxPages: 4 });
  }
  const query = searchTerm(input.query);
  const categoryFilter = input.category && CATEGORY_KEYS.has(input.category as McpMarketCategory) ? input.category : "";
  const page = Math.max(1, Math.min(input.page ?? 1, 10000));
  const limit = Math.max(1, Math.min(input.limit ?? 120, 200));
  const start = (page - 1) * limit;
  const countResult = await marketQuery(client, query, categoryFilter, { count: "exact", head: true });
  if (countResult.error) throw new ApiError(503, "MCP_MARKET_UNAVAILABLE", "MCP 目录暂时不可用");
  const total = countResult.count ?? 0;
  const rowsResult = await marketQuery(client, query, categoryFilter)
    .order("featured", { ascending: false })
    .order("title", { ascending: true })
    .order("id", { ascending: true })
    .range(start, start + limit - 1);
  if (rowsResult.error) throw new ApiError(503, "MCP_MARKET_UNAVAILABLE", "MCP 目录暂时不可用");
  const pageRows = (rowsResult.data ?? []) as McpMarketServerRow[];
  const categories = await Promise.all(MCP_MARKET_CATEGORIES.map(async (item) => {
    const result = await marketQuery(client, query, item.key, { count: "exact", head: true });
    if (result.error) throw new ApiError(503, "MCP_MARKET_UNAVAILABLE", "MCP 目录暂时不可用");
    return { key: item.key, label: item.label, count: result.count ?? 0 };
  }));
  const recommended = new Set(pageRows.filter((row) => row.featured).map((row) => row.id));
  const items = pageRows.map((row) => marketDto(row, recommended));
  return {
    items, page, limit, total, hasMore: start + items.length < total, categories,
    recommendedIds: items.filter((item) => item.recommended).map((item) => item.id),
    sync: {
      status: state.status, cursor: state.cursor, hasMore: Boolean(state.cursor) && !state.full_sync_completed,
      pageCount: state.page_count, serverCount: state.server_count, fullSyncCompleted: state.full_sync_completed,
      lastSuccessAt: state.last_success_at, lastAttemptAt: state.last_attempt_at, error: state.last_error,
    },
    canAdmin: false,
  };
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^[^a-z0-9]+|[-_.]+$/g, "").slice(0, 120);
}
export async function supplementMcpMarketServer(input: Record<string, unknown>) {
  const title = text(input.title, 160);
  const name = text(input.name, 220) || title;
  const description = text(input.description, 2000);
  const rawUrl = typeof input.url === "string" ? input.url : "";
  const url = publicHttpUrl(rawUrl);
  if (!title) throw new ApiError(400, "INVALID_MARKET_SERVER", "请填写名称");
  if (!url || url.protocol !== "https:") throw new ApiError(400, "INVALID_MARKET_SERVER", "服务地址必须使用 HTTPS");
  await assertPublicDestination(url.toString(), "服务地址").catch((reason) => { throw new ApiError(400, "INVALID_MARKET_SERVER", reason instanceof Error ? reason.message : "服务地址不可用"); });
  const category = text(input.category, 40);
  if (!CATEGORY_KEYS.has(category as McpMarketCategory)) throw new ApiError(400, "INVALID_MARKET_SERVER", "分类无效");
  const transport = input.transport === "sse" ? "sse" : "streamable-http";
  const authHint = ["none", "oauth", "api-key", "bearer", "unknown"].includes(String(input.authHint)) ? String(input.authHint) : "unknown";
  const sourceId = slug(text(input.sourceId, 120) || title);
  if (!sourceId) throw new ApiError(400, "INVALID_MARKET_SERVER", "目录标识无效");
  const client = syncClient();
  const { data, error } = await client.from("mcp_market_servers").upsert({
    source: "admin", source_id: sourceId, name, title, description, version: text(input.version, 255),
    url: url.toString(), transport, auth_hint: authHint, header_hints: [],
    category, icon_url: httpsUrl(input.iconUrl) ?? null, website_url: httpsUrl(input.websiteUrl) ?? null,
    repository_url: httpsUrl(input.repositoryUrl) ?? null, featured: input.featured === true,
    registry_status: "admin", published_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "source,source_id" }).select("*").single();
  if (error || !data) throw new ApiError(503, "MCP_MARKET_UNAVAILABLE", "补充目录保存失败");
  return marketDto(data as McpMarketServerRow, new Set());
}
export async function removeAdminMarketServer(id: string) {
  const client = syncClient();
  const { error } = await client.from("mcp_market_servers").delete().eq("id", id).eq("source", "admin");
  if (error) throw new ApiError(503, "MCP_MARKET_UNAVAILABLE", "补充目录删除失败");
}
export async function marketSyncStatus() {
  return readSyncState(syncClient());
}

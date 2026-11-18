import { describe, expect, it } from "vitest";
import type { McpMarketItem } from "../domain/v2/types";
import type { CatalogConnection } from "./resourceModel";
import {
  dedupeMcpMarketItems, latestMcpConnections, mcpAuthLabel, mcpAuthTypeOf, mcpCategoryGroups, mcpConnectionErrorMessage, mcpConnectionFor,
  mcpConnectionStatus, mcpQuickConnectDraft, mcpRecommendationAction, mcpSourceLabel, mcpSyncLabel, mcpToolCountLabels, mcpToolMatchesQuery, mcpToolState,
  resolveRecommendedMcpServers, uniqueMcpRef,
} from "./mcpMarketModel";

const entry = (ref: string, version: number, content: Record<string, unknown>): CatalogConnection => ({ connectionKey: `p4:o:${ref}:${version}`, ref, version, disabled: false, hasCredential: false, content: content as CatalogConnection["content"] });

describe("MCP market model", () => {
  it("uses the latest connection version and matches market rows by registry id or URL", () => {
    const connections = [
      entry("docs", 1, { type: "mcp-http", url: "https://mcp.example.com/mcp", registryServerId: "io.example/docs", allowedToolNames: [] }),
      entry("docs", 2, { type: "mcp-http", url: "https://mcp.example.com/mcp", registryServerId: "io.example/docs", allowedToolNames: ["search"] }),
    ];
    expect(latestMcpConnections(connections).map(item => item.version)).toEqual([2]);
    expect(mcpConnectionFor({ sourceId: "io.example/docs", url: "https://mcp.example.com/mcp", suggestedRef: "x" }, connections)?.version).toBe(2);
    expect(mcpConnectionFor({ sourceId: "other", url: "https://mcp.example.com/mcp/", suggestedRef: "x" }, connections)?.version).toBe(2);
  });

  it("keeps configured permission, discovery and usable tools separate", () => {
    const noTools = entry("docs", 1, { type: "mcp-http", url: "https://mcp.example.com/mcp", allowedToolNames: [], authType: "oauth" });
    expect(mcpConnectionStatus({ ...noTools, hasCredential: true }, mcpToolState({ ...noTools, hasCredential: true }, []))).toEqual({ label: "已授权 · 待发现工具", tone: "warn" });
    expect(mcpToolState(noTools, [])).toMatchObject({ allowed: 0, discovered: null, usable: null });
    const allowedNoDiscovery = entry("deepwiki", 1, { type: "mcp-http", url: "https://mcp.example.com/mcp", allowedToolNames: ["read_wiki_structure", "ask_question"] });
    expect(mcpToolState(allowedNoDiscovery, [])).toMatchObject({ allowed: 2, discovered: null, usable: null });
    expect(mcpConnectionStatus(allowedNoDiscovery, mcpToolState(allowedNoDiscovery, []))).toEqual({ label: "已允许 · 工具尚未发现", tone: "warn" });
    expect(mcpToolCountLabels(mcpToolState(allowedNoDiscovery, []))).toEqual({ allowed: "已允许 2 个", discovered: "发现待刷新", usable: "可用待确认" });
    const catalog = [
      { ref: "p4:o:deepwiki:1:read_wiki_structure", name: "read_wiki_structure", contractDigest: "d", inputSchema: {}, connectionRef: "deepwiki" },
      { ref: "p4:o:deepwiki:1:ask_question", name: "ask_question", contractDigest: "d", inputSchema: {}, connectionRef: "deepwiki" },
    ];
    expect(mcpToolState(allowedNoDiscovery, catalog)).toMatchObject({ allowed: 2, discovered: null, usable: null });
    expect(mcpToolState(allowedNoDiscovery, catalog, ["read_wiki_structure", "ask_question"])).toMatchObject({ allowed: 2, discovered: 2, usable: 2 });
    expect(mcpConnectionStatus(allowedNoDiscovery, mcpToolState(allowedNoDiscovery, catalog, ["read_wiki_structure", "ask_question"]))).toEqual({ label: "已连接 · 可用 2 个工具", tone: "ok" });
    const discoveredNotAllowed = entry("deepwiki", 1, { type: "mcp-http", url: "https://mcp.example.com/mcp", allowedToolNames: [] });
    expect(mcpConnectionStatus(discoveredNotAllowed, mcpToolState(discoveredNotAllowed, catalog, ["read_wiki_structure"]))).toEqual({ label: "已发现工具 · 尚未允许", tone: "warn" });
    const partial = entry("deepwiki", 1, { type: "mcp-http", url: "https://mcp.example.com/mcp", allowedToolNames: ["read_wiki_structure"] });
    expect(mcpToolState(partial, catalog, ["read_wiki_structure", "read_wiki_contents", "ask_question"])).toMatchObject({ allowed: 1, discovered: 3, usable: 1 });
    const disabledTools = { ...noTools, disabled: true };
    expect(mcpToolState(disabledTools, [])).toMatchObject({ allowed: 0, discovered: null, usable: 0 });
    expect(mcpConnectionStatus(disabledTools, mcpToolState(disabledTools, catalog))).toEqual({ label: "已断开 · 不可调用", tone: "error" });
    expect(mcpToolCountLabels(mcpToolState({ ...allowedNoDiscovery, disabled: true }, []), { disabled: true })).toEqual({ allowed: "已允许 2 个", discovered: "发现未记录", usable: "可用 0 个" });
    expect(mcpAuthTypeOf({ type: "mcp-http" }, true)).toBe("legacy");
    expect(mcpAuthTypeOf({ type: "mcp-http", authType: "api-key" })).toBe("api-key");
    expect(mcpAuthLabel("oauth")).toBe("OAuth");
  });

  it("never counts tools from an older connection version", () => {
    const current = entry("docs", 2, { type: "mcp-http", url: "https://mcp.example.com/mcp", allowedToolNames: ["search"] });
    const oldTools = [{ ref: "p4:o:docs:1:search", name: "search", contractDigest: "d", inputSchema: {}, connectionRef: "docs", connectorRef: "p4:o:docs:1" }];
    expect(mcpToolState(current, oldTools)).toMatchObject({ allowed: 1, discovered: null, usable: null });
  });

  it("generates unique stable connection refs and groups categories", () => {
    expect(uniqueMcpRef("io.github.demo/docs", [])).toMatch(/^io\.github\.demo_docs/);
    expect(uniqueMcpRef("docs", ["docs"])).toBe("docs_2");
    expect(mcpCategoryGroups([{ category: "research", categoryLabel: "调研分析" }, { category: "research", categoryLabel: "调研分析" }, { category: "data", categoryLabel: "数据服务" }]).map(group => [group.key, group.items.length])).toEqual([["research", 2], ["data", 1]]);
    expect(mcpToolMatchesQuery({ name: "search", description: "find docs" }, "DOCS")).toBe(true);
    expect(mcpToolMatchesQuery({ name: "search" }, "other")).toBe(false);
  });

  it("maps MCP failures to actionable Chinese without echoing transport text", () => {
    expect(mcpConnectionErrorMessage("MCP_AUTH_REQUIRED")).toContain("凭据无效");
    expect(mcpConnectionErrorMessage("MCP_AUTH_REQUIRED")).not.toContain("MCP service rejected");
    expect(mcpConnectionErrorMessage("MCP_CONNECTION_FAILED")).toContain("不可达");
    expect(mcpConnectionErrorMessage("MCP_OAUTH_TOKEN")).toContain("重新授权");
    expect(mcpConnectionErrorMessage("CATALOG_PAYLOAD_TOO_LARGE")).toContain("完整定义超过单条发现目录容量");
    expect(mcpConnectionErrorMessage("CATALOG_PAYLOAD_TOO_LARGE")).toContain("减少允许工具");
    expect(mcpConnectionErrorMessage("CATALOG_QUOTA_EXCEEDED")).toContain("连接数量已满");
    expect(mcpConnectionErrorMessage("CATALOG_QUOTA_EXCEEDED")).not.toContain("完整定义");
    expect(mcpConnectionErrorMessage(undefined)).toBe("读取工具失败，请检查连接配置后重试。");
  });

  it("reports cache and error state without inventing a successful sync", () => {
    expect(mcpSyncLabel({ status: "error", lastSuccessAt: null, error: "registry down", serverCount: 12, hasMore: false })).toContain("显示上次缓存");
    expect(mcpSyncLabel({ status: "ok", lastSuccessAt: "2026-01-01T00:00:00Z", error: null, serverCount: 12, hasMore: true })).toContain("可继续同步");
  });
});

const marketItem = (overrides: Partial<McpMarketItem>): McpMarketItem => ({
  id: "fixture-admin",
  source: "admin",
  sourceId: "fixture",
  name: "fixture.example",
  title: "Synthetic Fixture",
  description: "Obviously synthetic test fixture.",
  version: "1",
  url: "https://fixture.example/mcp",
  transport: "streamable-http",
  authHint: "none",
  headerHints: [],
  category: "data",
  categoryLabel: "数据服务",
  featured: true,
  suggestedRef: "synthetic_fixture",
  recommended: true,
  connectMode: "config",
  oauthScopes: [],
  ...overrides,
});

describe("API-driven MCP recommendations", () => {
  it("only treats an explicit compatible mode as a direct action", () => {
    expect(mcpRecommendationAction(marketItem({ connectMode: "quick", authHint: "none" }))).toBe("quick");
    expect(mcpRecommendationAction(marketItem({ connectMode: "login", authHint: "oauth", oauthScopes: ["fixture:read"] }))).toBe("login");
    expect(mcpRecommendationAction(marketItem({ connectMode: "config" }))).toBe("config");
    expect(mcpRecommendationAction(marketItem({ connectMode: "quick", authHint: "oauth" }))).toBe("config");
    expect(mcpRecommendationAction(marketItem({ connectMode: "login", authHint: "oauth", oauthScopes: [] }))).toBe("config");
    // Platform login may rely on server-side discovery instead of a preset
    // scope list, while an administrator recommendation still needs one.
    expect(mcpRecommendationAction(marketItem({ source: "platform", connectMode: "login", authHint: "oauth", oauthScopes: [] }))).toBe("login");
  });

  it("dedupes by URL, keeps API order, and prefers platform metadata without changing other sources' priority", () => {
    const registry = marketItem({
      id: "registry-1", source: "registry", sourceId: "io.example/fixture", title: "Registry Fixture",
      url: "https://fixture.example/mcp/", featured: false, recommended: false,
    });
    const admin = marketItem({ id: "admin-1", title: "Admin Fixture", featured: false, recommended: false });
    expect(dedupeMcpMarketItems([registry, admin]).map(item => item.id)).toEqual(["admin-1"]);

    const registryFeatured = marketItem({ id: "registry-2", source: "registry", sourceId: "io.example/two", featured: true, recommended: true });
    const adminFeatured = marketItem({ id: "admin-2", featured: true, recommended: true });
    expect(dedupeMcpMarketItems([registryFeatured, adminFeatured]).map(item => item.id)).toEqual(["admin-2"]);
    expect(resolveRecommendedMcpServers([registry, adminFeatured], ["admin-2"]).map(item => item.id)).toEqual(["admin-2"]);

    const platform = marketItem({ id: "platform-1", source: "platform", title: "Platform Fixture", featured: true, recommended: true });
    expect(dedupeMcpMarketItems([adminFeatured, platform]).map(item => item.id)).toEqual(["platform-1"]);
    expect(dedupeMcpMarketItems([platform, adminFeatured]).map(item => item.id)).toEqual(["platform-1"]);
    expect(mcpSourceLabel("platform")).toBe("平台内置");
    expect(mcpSourceLabel("admin")).toBe("管理员补充");
    expect(mcpSourceLabel("registry", true)).toBe("官方 MCP Registry");
  });

  it("keeps platform priority but restores featured before administrator for other sources", () => {
    const registryFeatured = marketItem({ id: "registry-featured", source: "registry", sourceId: "io.example/featured", featured: true, recommended: false });
    const adminPlain = marketItem({ id: "admin-plain", featured: false, recommended: false });
    expect(dedupeMcpMarketItems([adminPlain, registryFeatured]).map(item => item.id)).toEqual(["registry-featured"]);
    expect(dedupeMcpMarketItems([registryFeatured, adminPlain]).map(item => item.id)).toEqual(["registry-featured"]);

    const platformPlain = marketItem({ id: "platform-plain", source: "platform", featured: false, recommended: false });
    expect(dedupeMcpMarketItems([registryFeatured, platformPlain]).map(item => item.id)).toEqual(["platform-plain"]);
  });

  it("falls back to the row's recommended flag when the page omits recommendedIds", () => {
    const first = marketItem({ id: "first" });
    const second = marketItem({ id: "second", url: "https://second.example/mcp" });
    expect(resolveRecommendedMcpServers([first, second]).map(item => item.id)).toEqual(["first", "second"]);
  });

  it("drafts a guest connection with no implicit tool permission and a collision-safe ref", () => {
    const quick = marketItem({ id: "quick-1", suggestedRef: "synthetic_quick", connectMode: "quick" });
    const draft = mcpQuickConnectDraft(quick, []);
    expect(draft.ref).toBe("synthetic_quick");
    expect(draft.version).toBe(1);
    expect(draft.content).toMatchObject({
      type: "mcp-http", name: "Synthetic Fixture", url: "https://fixture.example/mcp",
      transport: "streamable-http", authType: "none", allowedToolNames: [],
    });
    expect(draft.content).not.toHaveProperty("registryServerId");

    const unrelated = entry("another_ref", 3, { type: "mcp-http", url: "https://another.example/mcp" });
    expect(mcpQuickConnectDraft(quick, [unrelated])).toMatchObject({ ref: "synthetic_quick", version: 1 });
    const sameRef = entry("synthetic_quick", 3, { type: "mcp-http", url: "https://fixture.example/mcp/" });
    expect(mcpQuickConnectDraft(quick, [sameRef])).toMatchObject({ ref: "synthetic_quick_2", version: 1 });
    expect(() => mcpQuickConnectDraft(marketItem({ connectMode: "login", authHint: "oauth", oauthScopes: ["read"] }), [])).toThrow(/登录授权或连接配置/);
    expect(() => mcpQuickConnectDraft(marketItem({ connectMode: "config" }), [])).toThrow(/登录授权或连接配置/);
  });

  it("keeps a registry id only for registry rows, never for an administrator supplement", () => {
    const registry = marketItem({ id: "registry-1", source: "registry", sourceId: "io.example/fixture", connectMode: "quick" });
    expect(mcpQuickConnectDraft(registry, []).content).toMatchObject({ registryServerId: "io.example/fixture" });
    const admin = marketItem({ id: "admin-1", source: "admin", sourceId: "fixture", connectMode: "quick" });
    expect(mcpQuickConnectDraft(admin, []).content).not.toHaveProperty("registryServerId");
  });
});

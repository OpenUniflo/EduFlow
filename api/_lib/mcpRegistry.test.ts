import { describe, expect, it } from "vitest";
import {
  classifyMcpServer, marketSourceId, mergePlatformMarketPage, normalizeMcpConnectMode, normalizeMcpOauthScopes, normalizeRegistryServer,
  platformCatalogPageWindow, platformMarketItemsForQuery, platformMcpMarketItems,
  suggestedConnectionRef, validateMcpRecommendation, type McpMarketItem,
} from "./mcpRegistry";
import { PLATFORM_MCP_SERVICES } from "./platformMcpCatalog";

const latest = (server: Record<string, unknown>) => ({ server, _meta: { "io.modelcontextprotocol.registry/official": { status: "active", isLatest: true } } });

describe("official MCP Registry normalization", () => {
  it("keeps only active latest remote servers with a usable HTTPS streamable endpoint", () => {
    const row = normalizeRegistryServer(latest({ name: "io.example/docs", title: "Docs", description: "Search documentation", version: "1.0.0", remotes: [{ type: "streamable-http", url: "https://mcp.example.com/mcp" }] }));
    expect(row?.source).toBe("registry");
    expect(row?.source_id).toBe("io.example/docs");
    expect(row?.transport).toBe("streamable-http");
    expect(row?.category).toBeDefined();
  });

  it("drops local packages, URL templates, plain HTTP, and deprecated versions", () => {
    expect(normalizeRegistryServer(latest({ name: "io.example/local", description: "local", version: "1.0.0", packages: [{ registryType: "npm", identifier: "pkg" }] }))).toBeNull();
    expect(normalizeRegistryServer(latest({ name: "io.example/template", description: "template", version: "1.0.0", remotes: [{ type: "streamable-http", url: "https://example.com/{tenant}/mcp" }] }))).toBeNull();
    expect(normalizeRegistryServer(latest({ name: "io.example/http", description: "plain", version: "1.0.0", remotes: [{ type: "streamable-http", url: "http://example.com/mcp" }] }))).toBeNull();
    expect(normalizeRegistryServer({ server: { name: "io.example/old", description: "old", version: "1.0.0", remotes: [{ type: "streamable-http", url: "https://example.com/mcp" }] }, _meta: { "io.modelcontextprotocol.registry/official": { status: "deprecated", isLatest: true } } })).toBeNull();
  });

  it("accepts SSE remote transports and records only sanitized header hints", () => {
    const row = normalizeRegistryServer(latest({ name: "io.example/sse", title: "SSE", description: "OAuth remote", version: "2", remotes: [{ type: "sse", url: "https://mcp.example.com/sse", headers: [{ name: "Authorization", description: "OAuth token", isSecret: true }] }] }));
    expect(row?.transport).toBe("sse");
    expect(row?.auth_hint).toBe("oauth");
    expect(row?.header_hints).toEqual([{ name: "Authorization", description: "OAuth token", isSecret: true }]);
  });

  it("deduplicates by registry name and builds a stable suggested connection ref", () => {
    const payload = latest({ name: "io.example/docs", description: "Docs", version: "1.0.0", remotes: [{ type: "streamable-http", url: "https://mcp.example.com/mcp" }] });
    expect(normalizeRegistryServer(payload)?.source_id).toBe(normalizeRegistryServer(payload)?.source_id);
    expect(suggestedConnectionRef("io.example/docs")).toBe(suggestedConnectionRef("io.example/docs"));
    expect(suggestedConnectionRef("io.example/docs")).toMatch(/^[a-z0-9_.-]+_[0-9a-f]{8}$/);
  });

  it("classifies common descriptions deterministically", () => {
    expect(classifyMcpServer("io.example/search", "Search", "search papers and academic research")).toBe("research");
    expect(classifyMcpServer("io.example/finance", "Market", "stock market and banking data")).toBe("finance");
    expect(classifyMcpServer("io.example/unknown", "Mystery", "something else")).toBe("other");
  });

  it("does not classify marketing as finance or an AI model gateway as chat", () => {
    expect(classifyMcpServer(
      "com.24haowan/marketing",
      "24好玩 · 互动营销模板与案例库",
      "检索 24好玩 H5 互动营销平台的活动模板库、客户案例库与帮助知识库。匿名只读，无需 API Key。",
    )).toBe("creative");
    expect(classifyMcpServer(
      "ai.router/ai-gateway",
      "370.ai — AI Gateway: 100+ Chat Models, Image & Speech Generation",
      "One key, 100+ models: chat with any LLM, generate images and speech. Live model list. Free trial.",
    )).toBe("developer");
  });

  it("matches complete words and simple plurals rather than arbitrary substrings", () => {
    expect(classifyMcpServer("io.example/pages", "LivePage", "Turn work into a shareable web page for WeChat.")).not.toBe("finance");
    expect(classifyMcpServer("io.example/markets", "Markets", "Live market quotes for public companies")).toBe("finance");
    expect(classifyMcpServer("io.example/images", "Images", "Generate images and videos for social posts")).toBe("creative");
  });
});

describe("administrator recommendation metadata", () => {
  it("defaults unknown modes to config and sanitizes exact OAuth scopes", () => {
    expect(normalizeMcpConnectMode(undefined)).toBe("config");
    expect(normalizeMcpConnectMode("unknown")).toBe("config");
    expect(normalizeMcpConnectMode("quick")).toBe("quick");
    expect(normalizeMcpOauthScopes([" read ", "read", "", 42, "write"])).toEqual(["read", "write"]);
    expect(normalizeMcpOauthScopes("read")).toEqual([]);
  });

  it("rejects direct modes that are not featured or do not match the auth hint", () => {
    expect(() => validateMcpRecommendation({ connectMode: "quick", authHint: "none", oauthScopes: [], featured: false })).toThrow(/推荐位/);
    expect(() => validateMcpRecommendation({ connectMode: "quick", authHint: "oauth", oauthScopes: [], featured: true })).toThrow(/无需鉴权/);
    expect(() => validateMcpRecommendation({ connectMode: "login", authHint: "none", oauthScopes: ["read"], featured: true })).toThrow(/OAuth/);
    expect(() => validateMcpRecommendation({ connectMode: "login", authHint: "oauth", oauthScopes: [], featured: true })).toThrow(/授权范围/);
    expect(() => validateMcpRecommendation({ connectMode: "config", authHint: "oauth", oauthScopes: [], featured: false })).not.toThrow();
  });

  it("creates a stable ASCII source id for a Chinese title", () => {
    const url = new URL("https://agent.example/mcp/company/stream");
    expect(marketSourceId("合成测试服务", url)).toBe("agent.example-mcp-company-stream");
    expect(marketSourceId("Synthetic", url)).toBe("synthetic");
    expect(marketSourceId("合成测试服务", url)).toBe(marketSourceId("合成测试服务", url));
  });
});

const dbMarketItem = (overrides: Partial<McpMarketItem>): McpMarketItem => ({
  id: "db-1",
  source: "admin",
  sourceId: "db-fixture",
  name: "db.example",
  title: "DB Fixture",
  description: "Synthetic database row.",
  version: "1",
  url: "https://db.example/mcp",
  transport: "streamable-http",
  authHint: "oauth",
  headerHints: [],
  category: "finance",
  categoryLabel: "金融投资",
  featured: false,
  suggestedRef: "db_fixture",
  recommended: false,
  connectMode: "config",
  oauthScopes: [],
  ...overrides,
});

describe("platform-owned MCP catalog", () => {
  it("keeps the real Qichacha row and adds nine verified OAuth login cards", () => {
    expect(PLATFORM_MCP_SERVICES).toHaveLength(10);
    expect(PLATFORM_MCP_SERVICES[0]).toMatchObject({
      id: "platform-qichacha-company",
      url: "https://agent.qcc.com/mcp/company/stream",
      transport: "streamable-http",
      authHint: "oauth",
      category: "data",
      featured: true,
      connectMode: "login",
      oauthScopes: ["mcp:tools"],
    });

    const byId = new Map(PLATFORM_MCP_SERVICES.map((service) => [service.id, service]));
    const expected = [
      ["platform-linear", "https://mcp.linear.app/mcp", ["read"], "productivity"],
      ["platform-notion", "https://mcp.notion.com/mcp", ["default"], "productivity"],
      ["platform-cloudbase-cn", "https://tcb-api.cloud.tencent.com/mcp/v1", ["mcp:full"], "developer"],
      ["platform-cloudbase-intl", "https://tcb-api.tencentcloud.com/mcp/v1", ["mcp:full"], "developer"],
      ["platform-aliyun-yunxiao", "https://openapi-rdc.aliyuncs.com/ai/mcp", [], "developer"],
      ["platform-atlassian-rovo", "https://mcp.atlassian.com/v2/mcp", [
        "read:me", "read:account", "read:jira:agent-interface", "search:jira:agent-interface",
        "read:confluence:agent-interface", "search:confluence:agent-interface",
      ], "productivity"],
      ["platform-sentry", "https://mcp.sentry.dev/mcp", ["org:read"], "developer"],
      ["platform-canva", "https://mcp.canva.com/mcp", ["profile:read", "design:meta:read", "design:content:read"], "creative"],
      ["platform-globalentity", "https://www.globalentityapi.com/mcp", ["company:read"], "data"],
    ] as const;
    for (const [id, url, oauthScopes, category] of expected) {
      expect(byId.get(id)).toMatchObject({ url, oauthScopes, category, featured: true, connectMode: "login", authHint: "oauth" });
    }
    expect(byId.get("platform-cloudbase-cn")?.title).toContain("国内站");
    expect(byId.get("platform-cloudbase-intl")?.title).toContain("国际站");
    expect(new Set(PLATFORM_MCP_SERVICES.map((service) => service.id)).size).toBe(10);
    expect(new Set(PLATFORM_MCP_SERVICES.map((service) => service.url)).size).toBe(10);

    expect(platformMcpMarketItems()).toHaveLength(10);
    expect(platformMcpMarketItems()[0]).toMatchObject({
      id: "platform-qichacha-company",
      source: "platform",
      sourceId: "qichacha-company",
      title: "企查查企业工商",
      category: "data",
      categoryLabel: "数据服务",
      featured: true,
      recommended: true,
      connectMode: "login",
      suggestedRef: "qichacha_company",
    });
  });

  it("matches platform services by Chinese name, English name, host, and category", () => {
    const ids = (query = "", category = "") => platformMarketItemsForQuery(query, category).map((item) => item.id);
    expect(ids("企查查")).toEqual(["platform-qichacha-company"]);
    expect(ids("Qichacha")).toEqual(["platform-qichacha-company"]);
    expect(ids("agent.qcc.com")).toEqual(["platform-qichacha-company"]);
    expect(ids("qcc.com")).toEqual(["platform-qichacha-company"]);
    expect(ids("云效")).toEqual(["platform-aliyun-yunxiao"]);
    expect(ids("Linear")).toEqual(["platform-linear"]);
    expect(ids("cloudbase")).toEqual(["platform-cloudbase-cn", "platform-cloudbase-intl"]);
    expect(ids("国际站")).toEqual(["platform-cloudbase-intl"]);
    expect(ids("", "data")).toEqual(["platform-qichacha-company", "platform-globalentity"]);
    expect(ids("", "productivity")).toEqual(["platform-linear", "platform-notion", "platform-atlassian-rovo"]);
    expect(ids("", "developer")).toEqual([
      "platform-cloudbase-cn", "platform-cloudbase-intl", "platform-aliyun-yunxiao", "platform-sentry",
    ]);
    expect(ids("", "creative")).toEqual(["platform-canva"]);
    expect(ids("", "finance")).toEqual([]);
    expect(ids("unrelated")).toEqual([]);
  });

  it("reserves platform slots before the bounded database page and merges counts once", () => {
    expect(platformCatalogPageWindow(1, 1, 2)).toEqual({ start: 0, platformOnPage: 1, dbStart: 0, dbLimit: 1 });
    expect(platformCatalogPageWindow(1, 2, 2)).toEqual({ start: 2, platformOnPage: 0, dbStart: 1, dbLimit: 2 });
    expect(platformCatalogPageWindow(0, 1, 2)).toEqual({ start: 0, platformOnPage: 0, dbStart: 0, dbLimit: 2 });
    expect(platformCatalogPageWindow(10, 1, 12)).toEqual({ start: 0, platformOnPage: 10, dbStart: 0, dbLimit: 2 });
    expect(platformCatalogPageWindow(10, 2, 6)).toEqual({ start: 6, platformOnPage: 4, dbStart: 0, dbLimit: 2 });

    const platform = platformMcpMarketItems()[0];
    const categories = [
      { key: "data", label: "数据服务", count: 9 },
      { key: "finance", label: "金融投资", count: 2 },
    ];
    const first = mergePlatformMarketPage({
      platformItems: [platform],
      dbItems: [dbMarketItem({ id: "db-1" })],
      dbTotal: 11,
      dbCategories: categories,
      page: 1,
      limit: 2,
    });
    expect(first.items.map((item) => item.id)).toEqual([platform.id, "db-1"]);
    expect(first.total).toBe(12);
    expect(first.hasMore).toBe(true);
    expect(first.recommendedIds).toEqual([platform.id]);
    expect(first.categories).toEqual([
      { key: "data", label: "数据服务", count: 10 },
      { key: "finance", label: "金融投资", count: 2 },
    ]);

    const second = mergePlatformMarketPage({
      platformItems: [platform],
      dbItems: [dbMarketItem({ id: "db-2" }), dbMarketItem({ id: "db-3" })],
      dbTotal: 11,
      dbCategories: categories,
      page: 2,
      limit: 2,
    });
    expect(second.items.map((item) => item.id)).toEqual(["db-2", "db-3"]);
    expect(second.total).toBe(12);
    expect(second.hasMore).toBe(true);
    expect(second.categories[0].count).toBe(10);
  });
});

import { describe, expect, it } from "vitest";
import {
  classifyMcpServer, marketSourceId, normalizeMcpConnectMode, normalizeMcpOauthScopes, normalizeRegistryServer,
  suggestedConnectionRef, validateMcpRecommendation,
} from "./mcpRegistry";

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

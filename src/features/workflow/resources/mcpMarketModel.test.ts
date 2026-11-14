import { describe, expect, it } from "vitest";
import type { CatalogConnection } from "./resourceModel";
import { latestMcpConnections, mcpAuthLabel, mcpAuthTypeOf, mcpCategoryGroups, mcpConnectionErrorMessage, mcpConnectionFor, mcpConnectionStatus, mcpSyncLabel, mcpToolCountLabels, mcpToolMatchesQuery, mcpToolState, uniqueMcpRef } from "./mcpMarketModel";

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
    expect(mcpConnectionErrorMessage(undefined)).toBe("读取工具失败，请检查连接配置后重试。");
  });

  it("reports cache and error state without inventing a successful sync", () => {
    expect(mcpSyncLabel({ status: "error", lastSuccessAt: null, error: "registry down", serverCount: 12, hasMore: false })).toContain("显示上次缓存");
    expect(mcpSyncLabel({ status: "ok", lastSuccessAt: "2026-01-01T00:00:00Z", error: null, serverCount: 12, hasMore: true })).toContain("可继续同步");
  });
});

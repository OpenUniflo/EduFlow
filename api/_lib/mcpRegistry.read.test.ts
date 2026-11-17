import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  sync: {
    id: 1, status: "ok", cursor: null, full_sync_completed: true, page_count: 7, server_count: 697,
    last_attempt_at: new Date().toISOString(), last_success_at: new Date().toISOString(), last_error: null,
    classifier_version: 2, updated_at: new Date().toISOString(),
  },
}));

vi.mock("./supabase.js", () => ({
  createServerSupabase: () => ({
    from(table: string) {
      if (table === "mcp_market_sync") return new FakeSyncQuery();
      if (table === "mcp_market_servers") return new FakeMarketQuery();
      throw new Error(`Unexpected table in catalog read test: ${table}`);
    },
  }),
}));

import { MCP_CLASSIFIER_VERSION, readMcpMarket } from "./mcpRegistry";
import { PLATFORM_MCP_SERVICES } from "./platformMcpCatalog";

const platformIds = PLATFORM_MCP_SERVICES.map((service) => service.id);

type Filter = { column: string; op: "eq" | "neq"; value: unknown };

class FakeSyncQuery {
  select() { return this; }
  eq() { return this; }
  maybeSingle() { return Promise.resolve({ data: fake.sync, error: null }); }
}

class FakeMarketQuery {
  private filters: Filter[] = [];
  private rangeValue: { start: number; end: number } | null = null;
  private countMode = false;

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    this.countMode = options?.count === "exact";
    return this;
  }
  eq(column: string, value: unknown) { this.filters.push({ column, op: "eq", value }); return this; }
  neq(column: string, value: unknown) { this.filters.push({ column, op: "neq", value }); return this; }
  or() { return this; }
  order() { return this; }
  range(start: number, end: number) { this.rangeValue = { start, end }; return this; }
  then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
    return Promise.resolve(this.result()).then(onFulfilled, onRejected);
  }
  private result() {
    const filtered = fake.rows.filter((row) => this.filters.every((filter) =>
      filter.op === "eq" ? row[filter.column] === filter.value : row[filter.column] !== filter.value,
    ));
    if (this.countMode) return { data: null, count: filtered.length, error: null };
    const data = this.rangeValue ? filtered.slice(this.rangeValue.start, this.rangeValue.end + 1) : filtered;
    return { data, count: null, error: null };
  }
}

function registryRows(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${String(index).padStart(3, "0")}`,
    source: "registry",
    source_id: `io.example/fixture-${index}`,
    name: `io.example/fixture-${index}`,
    title: `Fixture ${index}`,
    description: "Synthetic catalog row.",
    version: "1",
    url: `https://fixture.example/${index}/mcp`,
    transport: "streamable-http",
    auth_hint: "none",
    header_hints: [],
    category: index % 2 === 0 ? "data" : "finance",
    icon_url: null,
    website_url: null,
    repository_url: null,
    featured: false,
    connect_mode: "config",
    oauth_scopes: [],
    registry_status: "active",
    published_at: null,
    updated_at: null,
    last_seen_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }));
}

beforeEach(() => {
  fake.rows = registryRows(697);
  fake.sync.classifier_version = MCP_CLASSIFIER_VERSION;
});

describe("readMcpMarket platform catalog merge", () => {
  it("puts all platform services first, reserves their page slots, and keeps totals and category counts exact", async () => {
    expect(platformIds).toHaveLength(10);
    const first = await readMcpMarket({ sync: false, page: 1, limit: 120 });
    expect(first.total).toBe(707);
    expect(first.items).toHaveLength(120);
    expect(first.items[0]).toMatchObject({
      id: "platform-qichacha-company",
      source: "platform",
      title: "企查查企业工商",
      featured: true,
      recommended: true,
      connectMode: "login",
    });
    expect(first.items.map((item) => item.id).slice(0, 10)).toEqual(platformIds);
    expect(first.items[10].id).toBe("row-000");
    expect(first.items[first.items.length - 1].id).toBe("row-109");
    expect(first.hasMore).toBe(true);
    expect(first.recommendedIds).toEqual(platformIds);
    expect(first.categories.find((item) => item.key === "data")).toMatchObject({ label: "数据服务", count: 351 });
    expect(first.categories.find((item) => item.key === "finance")).toMatchObject({ label: "金融投资", count: 348 });
    expect(first.categories.find((item) => item.key === "productivity")).toMatchObject({ label: "办公协作", count: 3 });
    expect(first.categories.find((item) => item.key === "developer")).toMatchObject({ label: "开发工具", count: 4 });
    expect(first.categories.find((item) => item.key === "creative")).toMatchObject({ label: "内容创作", count: 1 });
    expect(first.categories.reduce((total, item) => total + item.count, 0)).toBe(first.total);

    const second = await readMcpMarket({ sync: false, page: 2, limit: 120 });
    expect(second.total).toBe(707);
    expect(second.items).toHaveLength(120);
    expect(second.items[0].id).toBe("row-110");
    expect(second.items[second.items.length - 1].id).toBe("row-229");
    expect(second.hasMore).toBe(true);
  });

  it("shows every platform service when the database has no market rows", async () => {
    fake.rows = [];
    const page = await readMcpMarket({ sync: false, page: 1, limit: 120 });
    expect(page.total).toBe(10);
    expect(page.items).toHaveLength(10);
    expect(page.items.map((item) => item.id)).toEqual(platformIds);
    expect(page.items[0]).toMatchObject({ id: "platform-qichacha-company", source: "platform" });
    expect(page.categories.find((item) => item.key === "data")).toMatchObject({ count: 2 });
    expect(page.categories.find((item) => item.key === "finance")).toMatchObject({ count: 0 });
    expect(page.hasMore).toBe(false);
  });

  it("removes a database row that duplicates a platform endpoint from rows and totals", async () => {
    const duplicate = registryRows(1)[0];
    fake.rows = [...registryRows(5), { ...duplicate, id: "admin-duplicate", source: "admin", url: "https://agent.qcc.com/mcp/company/stream/" }];
    const page = await readMcpMarket({ sync: false, page: 1, limit: 120 });
    expect(page.total).toBe(15);
    expect(page.items.map((item) => item.id)).toEqual([
      ...platformIds, "row-000", "row-001", "row-002", "row-003", "row-004",
    ]);
  });
});

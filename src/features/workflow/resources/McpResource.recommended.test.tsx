// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpMarketItem } from "../domain/v2/types";

const api = vi.hoisted(() => ({
  mcpMarket: vi.fn(),
  supplementMcpMarket: vi.fn(),
  extension: vi.fn(),
  testExtension: vi.fn(),
}));

vi.mock("../application/v2/useWorkflowV2Controller", () => ({ workflowApiV2: api }));

import { McpResource } from "./McpResource";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dialogProto = window.HTMLDialogElement?.prototype;
if (dialogProto) {
  dialogProto.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  dialogProto.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); };
}

const emptyMarket = {
  items: [], page: 1, limit: 120, total: 0, hasMore: false, categories: [], recommendedIds: [],
  sync: { status: "ok", cursor: null, hasMore: false, pageCount: 1, serverCount: 0, fullSyncCompleted: true, lastSuccessAt: null, lastAttemptAt: null, error: null },
  canAdmin: false,
};

const baseItem: McpMarketItem = {
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
};

function item(overrides: Partial<McpMarketItem>): McpMarketItem {
  return { ...baseItem, ...overrides };
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  api.mcpMarket.mockReset().mockResolvedValue(emptyMarket);
  api.supplementMcpMarket.mockReset().mockResolvedValue({});
  api.extension.mockReset().mockResolvedValue({ ok: true });
  api.testExtension.mockReset().mockResolvedValue({ ok: true, discoveredToolNames: [] });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render() {
  await act(async () => {
    root.render(<McpResource environmentRef="local" connections={[]} tools={[]} />);
  });
  await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 0)); });
}

function card(url: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(`.wf-mcp-card[data-mcp-url="${url}"]`);
  if (!found) throw new Error(`missing recommendation card: ${url}`);
  return found;
}

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function setSelect(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
  act(() => {
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("McpResource recommendations from the catalog API", () => {
  it("renders recommendations in the category grid after search, dedupes URLs, and preserves connection actions", async () => {
    const quick = item({ id: "quick-1", title: "Synthetic Quick", url: "https://quick.example/mcp", connectMode: "quick" });
    const login = item({
      id: "login-1", title: "Synthetic Login", url: "https://login.example/mcp", authHint: "oauth",
      connectMode: "login", oauthScopes: ["fixture:read"],
    });
    const pinned = item({ id: "pinned-1", title: "Synthetic Pinned", url: "https://pinned.example/mcp" });
    const duplicate = item({
      id: "registry-duplicate", source: "registry", sourceId: "io.example/quick", title: "Registry Duplicate",
      url: "https://quick.example/mcp/", featured: false, recommended: false, connectMode: "config",
    });
    const normal = item({
      id: "normal-1", source: "registry", sourceId: "io.example/normal", title: "Synthetic Normal",
      url: "https://normal.example/mcp", featured: false, recommended: false,
    });
    api.mcpMarket.mockResolvedValue({
      ...emptyMarket, items: [quick, login, pinned, duplicate, normal], total: 5,
      recommendedIds: [quick.id, login.id, pinned.id], canAdmin: false,
    });

    await render();

    expect(container.querySelectorAll('[data-mcp-url="https://quick.example/mcp"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-mcp-url="https://login.example/mcp"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-mcp-url="https://pinned.example/mcp"]')).toHaveLength(1);
    expect(container.textContent).not.toContain("Registry Duplicate");
    expect(container.querySelectorAll('[data-mcp-url="https://normal.example/mcp"]')).toHaveLength(1);

    const search = container.querySelector('input[aria-label="搜索 MCP 市场"]');
    const quickCard = card("https://quick.example/mcp");
    const loginCard = card("https://login.example/mcp");
    const pinnedCard = card("https://pinned.example/mcp");
    expect(container.querySelector(".wf-mcp-recommended")).toBeNull();
    expect(container.textContent).not.toContain("目录置顶");
    expect(search!.compareDocumentPosition(quickCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(quickCard.closest("section")).toBe(card("https://normal.example/mcp").closest("section"));
    for (const row of [quickCard, loginCard, pinnedCard]) expect(row.textContent).toContain("推荐");
    expect(quickCard.querySelector(".wf-mcp-card-actions .primary")?.textContent).toBe("一键连接");
    expect(loginCard.querySelector(".wf-mcp-card-actions .primary")?.textContent).toBe("登录授权");
  });

  it("quick-connects a guest row without opening a form and grants no tools", async () => {
    const quick = item({ id: "quick-1", title: "Synthetic Quick", url: "https://quick.example/mcp", suggestedRef: "synthetic_quick", connectMode: "quick" });
    api.mcpMarket.mockResolvedValue({ ...emptyMarket, items: [quick], total: 1, recommendedIds: [quick.id] });
    await render();

    const primary = card("https://quick.example/mcp").querySelector<HTMLButtonElement>(".wf-mcp-card-actions .primary")!;
    expect(primary.textContent).toBe("一键连接");
    await act(async () => { primary.click(); });

    expect(api.extension).toHaveBeenCalledWith("local", {
      action: "publish",
      kind: "connection",
      ref: "synthetic_quick",
      version: 1,
      content: {
        type: "mcp-http",
        name: "Synthetic Quick",
        url: "https://quick.example/mcp",
        transport: "streamable-http",
        authType: "none",
        allowedToolNames: [],
        serverTitle: "Synthetic Quick",
      },
    });
    expect(container.querySelector("dialog.wf-mcp-modal")).toBeNull();
    expect(container.textContent).toContain("未自动授予任何工具");
  });

  it("opens a catalog login entry with its configured scopes even if a fixture has the same suggested reference", async () => {
    const login = item({
      id: "login-1", title: "Synthetic Login", name: "login.example", url: "https://login.example/mcp",
      authHint: "oauth", connectMode: "login", oauthScopes: ["fixture:read"],
    });
    api.mcpMarket.mockResolvedValue({ ...emptyMarket, items: [login], total: 1, recommendedIds: [login.id] });
    await act(async () => {
      root.render(<McpResource environmentRef="local" connections={[{
        connectionKey: `p4:o:${login.suggestedRef}:1`, ref: login.suggestedRef, version: 1,
        disabled: false, hasCredential: false,
        content: { type: "mcp-http", url: "http://127.0.0.1:18087/mcp", allowedToolNames: [] },
      }]} tools={[]} />);
    });
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 0)); });

    const primary = card("https://login.example/mcp").querySelector<HTMLButtonElement>(".wf-mcp-card-actions .primary")!;
    expect(primary.textContent).toBe("登录授权");
    await act(async () => { primary.click(); });

    expect(container.textContent).toContain("登录Synthetic Login");
    expect(container.textContent).toContain("授权范围：fixture:read");
    expect(container.querySelector(".wf-mcp-form-grid")).toBeNull();
    expect(api.extension).not.toHaveBeenCalled();
    expect(api.testExtension).not.toHaveBeenCalled();
  });

  it("keeps a featured row without an explicit mode on the ordinary configuration form", async () => {
    const pinned = item({ id: "pinned-1", title: "Synthetic Pinned", url: "https://pinned.example/mcp" });
    api.mcpMarket.mockResolvedValue({ ...emptyMarket, items: [pinned], total: 1, recommendedIds: [pinned.id] });
    await render();

    expect(container.querySelector(".wf-mcp-recommended")).toBeNull();
    const primary = container.querySelector<HTMLButtonElement>('[data-mcp-url="https://pinned.example/mcp"] .wf-mcp-card-actions .primary')!;
    expect(primary.textContent).toBe("连接");
    await act(async () => { primary.click(); });
    expect(container.querySelector('input[aria-label="MCP 连接名称"]')).not.toBeNull();
    expect(container.textContent).toContain("连接 Synthetic Pinned");
    expect(api.extension).not.toHaveBeenCalled();
  });

  it("associates a catalog card with an existing connection by URL, including a trailing slash", async () => {
    const quick = item({ id: "quick-1", title: "Synthetic Quick", url: "https://quick.example/mcp", connectMode: "quick" });
    api.mcpMarket.mockResolvedValue({ ...emptyMarket, items: [quick], total: 1, recommendedIds: [quick.id] });
    await act(async () => {
      root.render(<McpResource environmentRef="local" connections={[{
        connectionKey: "p4:o:synthetic_quick:3", ref: "synthetic_quick", version: 3, disabled: false, hasCredential: false,
        content: { type: "mcp-http", url: "https://quick.example/mcp/", allowedToolNames: [] },
      }]} tools={[]} />);
    });
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 0)); });

    const primary = card("https://quick.example/mcp").querySelector<HTMLButtonElement>(".wf-mcp-card-actions .primary")!;
    expect(primary.textContent).toBe("配置");
    expect(container.textContent).toContain("已连接");
  });

  it("saves recommendation metadata through the admin supplement API", async () => {
    api.mcpMarket.mockResolvedValue({ ...emptyMarket, canAdmin: true, categories: [{ key: "data", label: "数据服务", count: 0 }] });
    await render();

    const admin = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("补充目录"));
    await act(async () => { admin!.click(); });
    setInput(container.querySelector<HTMLInputElement>('input[placeholder="例如 内部知识库 MCP"]')!, "Synthetic Admin");
    setInput(container.querySelector<HTMLInputElement>('input[placeholder="https://example.com/mcp"]')!, "https://admin.example/mcp");
    const featured = container.querySelector<HTMLInputElement>(".wf-resource-checkbox input[type=checkbox]")!;
    await act(async () => { featured.click(); });
    setSelect(container.querySelector<HTMLSelectElement>('select[aria-label="推荐连接方式"]')!, "quick");
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "保存补充项")!.click();
    });

    expect(api.supplementMcpMarket).toHaveBeenCalledWith(expect.objectContaining({
      title: "Synthetic Admin",
      url: "https://admin.example/mcp",
      featured: true,
      connectMode: "quick",
      authHint: "none",
      oauthScopes: [],
    }));
  });
});

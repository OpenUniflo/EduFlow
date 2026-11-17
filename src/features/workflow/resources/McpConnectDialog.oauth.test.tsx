// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpMarketItem } from "../domain/v2/types";

const api = vi.hoisted(() => ({
  discoverMcpOAuth: vi.fn(),
  startMcpOAuth: vi.fn(),
  extensions: vi.fn(),
  testExtension: vi.fn(),
  extension: vi.fn(),
  inspectMcp: vi.fn(),
}));
const oauthWindow = vi.hoisted(() => ({
  open: vi.fn(),
  navigate: vi.fn(),
  subscribe: vi.fn(),
  close: vi.fn(),
  fail: vi.fn(),
  createFlowId: vi.fn(() => "flow_0123456789abcdef"),
}));

vi.mock("../application/v2/useWorkflowV2Controller", () => ({ workflowApiV2: api }));
vi.mock("./mcpOAuthWindow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mcpOAuthWindow")>();
  return {
    ...actual,
    createMcpOAuthFlowId: oauthWindow.createFlowId,
    openMcpOAuthWindow: oauthWindow.open,
    navigateMcpOAuthWindow: oauthWindow.navigate,
    subscribeMcpOAuthResult: oauthWindow.subscribe,
    closeMcpOAuthWindow: oauthWindow.close,
    failMcpOAuthWindow: oauthWindow.fail,
  };
});

import { McpConnectDialog } from "./McpConnectDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dialogProto = window.HTMLDialogElement?.prototype;
if (dialogProto) {
  dialogProto.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  dialogProto.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); };
}

const server = {
  id: "synthetic-login", source: "admin", sourceId: "synthetic_login", name: "login.example", title: "Synthetic Login", description: "Synthetic login fixture", version: "1",
  url: "https://login.example/mcp", transport: "streamable-http", authHint: "oauth", headerHints: [],
  category: "business", categoryLabel: "商业", featured: false, suggestedRef: "synthetic_login", recommended: false,
  connectMode: "config", oauthScopes: [],
} as McpMarketItem;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  api.discoverMcpOAuth.mockReset().mockResolvedValue({ issuer: "https://login.example", authorizationEndpoint: "https://login.example/authorize", tokenEndpoint: "https://login.example/token", resource: "https://login.example/mcp", scopes: [] });
  api.startMcpOAuth.mockReset().mockResolvedValue({ authorizationUrl: "https://login.example/authorize?state=s", callbackUrl: "https://eduflow.example/api/workflows" });
  api.extensions.mockReset().mockResolvedValue({ connections: [] });
  api.testExtension.mockReset();
  oauthWindow.open.mockReset().mockReturnValue({ closed: false });
  oauthWindow.navigate.mockReset().mockReturnValue(true);
  oauthWindow.subscribe.mockReset().mockReturnValue(() => undefined);
  oauthWindow.close.mockReset();
  oauthWindow.fail.mockReset();
  oauthWindow.createFlowId.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function flush() {
  for (let index = 0; index < 12; index += 1) await act(async () => { await Promise.resolve(); });
}

describe("McpConnectDialog new-window OAuth", () => {
  it("opens the window from the click, starts the existing flow with correlation, and verifies the server connection", async () => {
    const onOAuthConnected = vi.fn();
    await act(async () => {
      root.render(<McpConnectDialog
        environmentRef="local"
        server={server}
        connections={[]}
        returnTo="/works/wf-1"
        onClose={() => undefined}
        onSaved={() => undefined}
        onOAuthConnected={onOAuthConnected}
      />);
    });
    const primary = container.querySelector<HTMLButtonElement>(".wf-mcp-modal-foot .primary");
    expect(primary?.textContent).toContain("前往授权");
    await act(async () => { primary!.click(); });
    await flush();
    expect(oauthWindow.open).toHaveBeenCalledTimes(1);
    expect(api.startMcpOAuth).toHaveBeenCalledTimes(1);
    const body = api.startMcpOAuth.mock.calls[0][0] as { returnTo: string; version: number };
    expect(body.version).toBe(1);
    expect(body.returnTo).toContain("oauthFlow=flow_0123456789abcdef");
    expect(body.returnTo).toContain("mcpOAuthPopup=1");
    expect(oauthWindow.navigate).toHaveBeenCalledWith(expect.anything(), "https://login.example/authorize?state=s");
    expect(container.textContent).toContain("等待服务方授权");

    const notification = oauthWindow.subscribe.mock.calls[0][1] as (value: unknown) => void;
    api.extensions.mockResolvedValue({
      connections: [{
        connectionKey: "p4:owner:synthetic_login:2", ref: "synthetic_login", version: 2, disabled: false, hasCredential: true,
        content: { type: "mcp-http", name: "Synthetic Login", url: "https://login.example/mcp", transport: "streamable-http", authType: "oauth", allowedToolNames: [] },
      }],
    });
    api.testExtension.mockResolvedValue({ ok: true, tools: [{ name: "fixture_read" }] });
    await act(async () => {
      notification({ id: "event-1", at: Date.now(), status: "pending", flowId: "flow_0123456789abcdef", ref: "synthetic_login", tools: 1, message: "已授权" });
    });
    await flush();
    expect(api.extensions).toHaveBeenCalled();
    expect(api.testExtension).toHaveBeenCalledWith("local", { ref: "synthetic_login", version: 2 });
    expect(onOAuthConnected).toHaveBeenCalledTimes(1);
    expect(onOAuthConnected.mock.calls[0][0]).toBe("synthetic_login");
    expect(onOAuthConnected.mock.calls[0][1]).toBe(2);
    expect(onOAuthConnected.mock.calls[0][3]).toMatchObject({ ok: true });
  });

  it("stops waiting and allows a retry when authorization is cancelled", async () => {
    await act(async () => {
      root.render(<McpConnectDialog
        environmentRef="local"
        server={server}
        connections={[]}
        returnTo="/works"
        onClose={() => undefined}
        onSaved={() => undefined}
      />);
    });
    await act(async () => { container.querySelector<HTMLButtonElement>(".wf-mcp-modal-foot .primary")!.click(); });
    await flush();
    expect(container.textContent).toContain("等待服务方授权");
    const cancel = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "取消授权");
    expect(cancel).toBeTruthy();
    await act(async () => { cancel!.click(); });
    await flush();

    // Cancelling only stops this page's wait. It must not claim the provider
    // window was closed, because a cross-origin window cannot be closed here.
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("已停止等待授权");
    expect(container.textContent).toContain("如果服务方授权窗口仍然开着，可以手动关闭");
    expect(container.textContent).not.toContain("已关闭授权窗口");
    expect(container.querySelector(".wf-mcp-modal-foot .primary")?.textContent).toContain("前往授权");

    // The same dialog can start a fresh attempt without reopening it.
    await act(async () => { container.querySelector<HTMLButtonElement>(".wf-mcp-modal-foot .primary")!.click(); });
    await flush();
    expect(oauthWindow.open).toHaveBeenCalledTimes(2);
    expect(api.startMcpOAuth).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("等待服务方授权");
  });

  it("asks the user to allow popups and retry when the window is blocked", async () => {
    oauthWindow.open.mockReturnValue(null);
    await act(async () => {
      root.render(<McpConnectDialog
        environmentRef="local"
        server={server}
        connections={[]}
        returnTo="/works"
        onClose={() => undefined}
        onSaved={() => undefined}
      />);
    });
    const primary = container.querySelector<HTMLButtonElement>(".wf-mcp-modal-foot .primary");
    await act(async () => { primary!.click(); });
    await flush();
    expect(api.startMcpOAuth).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("浏览器拦截了授权窗口");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("请允许此站点打开弹出窗口后重试");
    expect(container.querySelector(".wf-mcp-modal-hint")?.textContent).toContain("允许弹窗后重试");
    expect(container.textContent).not.toContain("当前页继续");
    expect(container.textContent).not.toContain("当前页授权");
    expect(container.querySelector(".wf-mcp-modal-foot .primary")?.textContent).toContain("重试授权窗口");

    // The retry opens another independent window; it never navigates this page.
    oauthWindow.open.mockReturnValue({ closed: false });
    await act(async () => { container.querySelector<HTMLButtonElement>(".wf-mcp-modal-foot .primary")!.click(); });
    await flush();
    expect(oauthWindow.open).toHaveBeenCalledTimes(2);
    expect(api.startMcpOAuth).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("等待服务方授权");
  });

  it("starts a catalog login with preset scopes and no configuration fields", async () => {
    const catalogLogin = {
      ...server,
      id: "synthetic-login",
      source: "admin" as const,
      sourceId: "synthetic_login",
      title: "Synthetic Login Catalog",
      name: "login.example",
      url: "https://login.example/mcp",
      authHint: "oauth" as const,
      connectMode: "login" as const,
      oauthScopes: ["fixture:read"],
      suggestedRef: "synthetic_login",
    };
    await act(async () => {
      root.render(<McpConnectDialog
        environmentRef="local"
        server={catalogLogin}
        loginOnly
        loginScopes={["fixture:read"]}
        connections={[]}
        returnTo="/works"
        onClose={() => undefined}
        onSaved={() => undefined}
      />);
    });
    expect(container.textContent).toContain("登录Synthetic Login Catalog");
    expect(container.textContent).toContain("授权范围：fixture:read");
    expect(container.textContent).toContain("不会自动允许任何工具");
    expect(container.querySelectorAll("input,select,textarea")).toHaveLength(0);
    const primary = container.querySelector<HTMLButtonElement>(".wf-mcp-modal-foot .primary");
    expect(primary?.textContent).toContain("登录并授权");
    await act(async () => { primary!.click(); });
    await flush();
    expect(api.discoverMcpOAuth).not.toHaveBeenCalled();
    expect(api.extension).not.toHaveBeenCalled();
    expect(oauthWindow.open).toHaveBeenCalledTimes(1);
    expect(api.startMcpOAuth).toHaveBeenCalledWith(expect.objectContaining({
      environmentRef: "local",
      ref: "synthetic_login",
      version: 1,
      url: "https://login.example/mcp",
      scopes: ["fixture:read"],
    }));
    expect(oauthWindow.navigate).toHaveBeenCalledWith(expect.anything(), "https://login.example/authorize?state=s");
    expect(container.textContent).toContain("等待服务方授权");
  });

  it("re-authorizes an existing OAuth connection from its saved configuration without discovery", async () => {
    const entry = {
      connectionKey: "p4:owner:synthetic_login:4", ref: "synthetic_login", version: 4, disabled: false, hasCredential: true,
      content: {
        type: "mcp-http", name: "Synthetic Login Catalog 本地验收", url: "https://login.example/mcp",
        transport: "streamable-http", authType: "oauth", allowedToolNames: [],
        oauth: {
          issuer: "https://login.example", authorizationEndpoint: "https://login.example/oauth/authorize",
          tokenEndpoint: "https://login.example/oauth/token", clientId: "saved-client",
          resource: "https://login.example/mcp", scope: "fixture:read", tokenEndpointAuthMethod: "none",
        },
      },
    };
    await act(async () => {
      root.render(<McpConnectDialog
        environmentRef="local"
        entry={entry}
        connections={[entry]}
        returnTo="/works/wf-1"
        onClose={() => undefined}
        onSaved={() => undefined}
      />);
    });
    const reauth = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(reauth).not.toBeNull();
    await act(async () => { reauth!.click(); });
    const primary = container.querySelector<HTMLButtonElement>(".wf-mcp-modal-foot .primary");
    expect(primary?.textContent).toContain("前往授权");
    await act(async () => { primary!.click(); });
    await flush();
    expect(api.discoverMcpOAuth).not.toHaveBeenCalled();
    expect(api.startMcpOAuth).toHaveBeenCalledTimes(1);
    const body = api.startMcpOAuth.mock.calls[0][0] as { version: number; scopes?: string[]; resourceMetadataUrl?: string; returnTo: string };
    expect(body.version).toBe(5);
    expect(body.scopes).toEqual(["fixture:read"]);
    expect(body.resourceMetadataUrl).toBeUndefined();
    expect(body.returnTo).toContain("oauthFlow=flow_0123456789abcdef");
    expect(oauthWindow.navigate).toHaveBeenCalledWith(expect.anything(), "https://login.example/authorize?state=s");
    expect(container.textContent).toContain("等待服务方授权");
  });
});

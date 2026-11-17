import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanMcpOAuthSearch,
  closeCurrentOAuthWindow,
  closeMcpOAuthWindow,
  MCP_OAUTH_POPUP_PARAM,
  navigateMcpOAuthWindow,
  notifyMcpOAuthResult,
  openMcpOAuthWindow,
  readMcpOAuthWindowResult,
  subscribeMcpOAuthResult,
  withMcpOAuthReturnTo,
} from "./mcpOAuthWindow";

const flowA = "flow_0123456789abcdef";
const flowB = "flow_fedcba9876543210";

class FakeBroadcastChannel {
  static channels = new Set<FakeBroadcastChannel>();
  listeners = new Set<(event: MessageEvent) => void>();
  constructor(readonly name: string) { FakeBroadcastChannel.channels.add(this); }
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (type === "message") this.listeners.add(listener);
  }
  postMessage(data: unknown) {
    for (const channel of FakeBroadcastChannel.channels) {
      if (channel.name !== this.name) continue;
      for (const listener of channel.listeners) listener({ data } as MessageEvent);
    }
  }
  close() { FakeBroadcastChannel.channels.delete(this); this.listeners.clear(); }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeBroadcastChannel.channels.clear();
});

describe("MCP OAuth window opening", () => {
  it("opens an independent window on every attempt instead of reusing a fixed name", () => {
    const popups = [0, 1].map(() => ({
      closed: false,
      opener: {} as Window | null,
      document: { title: "", body: { textContent: "", style: { cssText: "" } } },
      focus: vi.fn(),
    }));
    const open = vi.fn()
      .mockReturnValueOnce(popups[0] as unknown as Window)
      .mockReturnValueOnce(popups[1] as unknown as Window);
    vi.stubGlobal("window", { open });

    expect(openMcpOAuthWindow()).toBe(popups[0]);
    expect(openMcpOAuthWindow()).toBe(popups[1]);
    expect(open).toHaveBeenCalledTimes(2);
    for (const call of open.mock.calls) {
      expect(call[0]).toBe("about:blank");
      expect(call[1]).toBe("_blank");
    }
    expect(open.mock.calls.some(call => call[1] === "eduflow_mcp_oauth")).toBe(false);
  });
});

describe("MCP OAuth window return context", () => {
  it("keeps the originating path/search and adds only the correlation markers", () => {
    expect(withMcpOAuthReturnTo("/works/wf-1?tab=tools", flowA, true)).toBe(
      `/works/wf-1?tab=tools&oauthFlow=${flowA}&${MCP_OAUTH_POPUP_PARAM}=1`,
    );
    expect(withMcpOAuthReturnTo("/works?oauthFlow=old&mcpOAuthPopup=1", flowB, false)).toBe(
      `/works?oauthFlow=${flowB}`,
    );
    const longPath = `/works/wf-1?${"filter=".concat("x".repeat(520))}`;
    const short = withMcpOAuthReturnTo(longPath, flowA, true);
    expect(short.length).toBeLessThan(500);
    expect(short).toContain(`oauthFlow=${flowA}`);
    expect(short).toContain(`${MCP_OAUTH_POPUP_PARAM}=1`);
  });

  it("reads the callback result without trusting or forwarding unknown fields", () => {
    expect(readMcpOAuthWindowResult(`?mcpOAuth=pending&ref=qcc_test&tools=12&message=%E5%B7%B2%E6%8E%88%E6%9D%83&oauthFlow=${flowA}&mcpOAuthPopup=1`)).toMatchObject({
      status: "pending", flowId: flowA, ref: "qcc_test", tools: 12, message: "已授权", popup: true,
    });
    expect(readMcpOAuthWindowResult(`?mcpOAuth=error&tools=oops&oauthFlow=bad&mcpOAuthPopup=1`)).toMatchObject({
      status: "error", flowId: "", tools: null, popup: true,
    });
    expect(readMcpOAuthWindowResult("?mcpOAuth=ok")).toBeNull();
  });

  it("removes only the OAuth result markers during cleanup", () => {
    expect(cleanMcpOAuthSearch(`?keep=1&mcpOAuth=pending&ref=qcc&tools=2&message=x&oauthFlow=${flowA}&mcpOAuthPopup=1`)).toBe("?keep=1");
    expect(cleanMcpOAuthSearch("?mcpOAuth=error")).toBe("");
  });

  it("does not navigate a window to a non-http URL", () => {
    const popup = { closed: false, location: { href: "about:blank" } } as unknown as Window;
    expect(navigateMcpOAuthWindow(popup, "javascript:alert(1)")).toBe(false);
    expect((popup as unknown as { location: { href: string } }).location.href).toBe("about:blank");
    expect(navigateMcpOAuthWindow(popup, "https://provider.example/authorize?state=s")).toBe(true);
    expect((popup as unknown as { location: { href: string } }).location.href).toBe("https://provider.example/authorize?state=s");
    // A provider window is never navigated a second time from EduFlow.
    expect(navigateMcpOAuthWindow(popup, "https://provider.example/other")).toBe(false);
    expect((popup as unknown as { location: { href: string } }).location.href).toBe("https://provider.example/authorize?state=s");
  });
});

describe("MCP OAuth window closing", () => {
  it("closes a blank window that EduFlow still owns", () => {
    const close = vi.fn();
    closeMcpOAuthWindow({ closed: false, close } as unknown as Window);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not attempt a cross-origin close after the provider page loaded", () => {
    vi.stubGlobal("window", { location: { origin: "https://eduflow.example" } });
    const close = vi.fn();
    const popup = {
      closed: false,
      close,
      location: { href: "about:blank", origin: "https://provider.example" },
    } as unknown as Window;
    expect(navigateMcpOAuthWindow(popup, "https://provider.example/authorize?state=s")).toBe(true);
    closeMcpOAuthWindow(popup);
    expect(close).not.toHaveBeenCalled();
    expect((popup as unknown as { closed: boolean }).closed).toBe(false);
  });

  it("still closes a callback window that redirected back to EduFlow", () => {
    vi.stubGlobal("window", { location: { origin: "https://eduflow.example" } });
    const close = vi.fn();
    const popup = {
      closed: false,
      close,
      location: { href: "about:blank", origin: "https://eduflow.example" },
    } as unknown as Window;
    expect(navigateMcpOAuthWindow(popup, "https://eduflow.example/oauth/callback?state=s")).toBe(true);
    closeMcpOAuthWindow(popup);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not touch a window proxy that already reports closed", () => {
    const close = vi.fn();
    closeMcpOAuthWindow({ closed: true, close } as unknown as Window);
    expect(close).not.toHaveBeenCalled();
  });

  it("closes only a same-origin top, never a provider-origin callback top", () => {
    const selfClose = vi.fn();
    const topClose = vi.fn();
    vi.stubGlobal("window", {
      close: selfClose,
      top: { close: topClose, location: { origin: "https://eduflow.example" } },
      location: { origin: "https://eduflow.example" },
    });
    closeCurrentOAuthWindow();
    expect(selfClose).toHaveBeenCalledTimes(1);
    expect(topClose).toHaveBeenCalledTimes(1);

    selfClose.mockClear();
    topClose.mockClear();
    vi.stubGlobal("window", {
      close: selfClose,
      top: { close: topClose, get location(): { origin: string } { throw new Error("cross-origin"); } },
      location: { origin: "https://eduflow.example" },
    });
    closeCurrentOAuthWindow();
    expect(selfClose).toHaveBeenCalledTimes(1);
    expect(topClose).not.toHaveBeenCalled();
  });
});

describe("MCP OAuth same-origin notification", () => {
  it("filters by correlation id, de-duplicates events and drops unknown fields", () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel as unknown as typeof BroadcastChannel);
    const received: unknown[] = [];
    const unsubscribe = subscribeMcpOAuthResult(flowA, notification => received.push(notification));
    const sender = new FakeBroadcastChannel("eduflow:mcp-oauth");
    const payload = {
      id: "event-1", at: Date.now(), status: "pending", flowId: flowA, ref: "qcc_test", tools: 12, message: "已授权",
      access_token: "secret-token", client_secret: "secret-client",
    };
    sender.postMessage({ ...payload, flowId: flowB });
    sender.postMessage(payload);
    sender.postMessage(payload);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ status: "pending", flowId: flowA, ref: "qcc_test", tools: 12 });
    expect(JSON.stringify(received[0])).not.toContain("secret-token");
    expect(JSON.stringify(received[0])).not.toContain("secret-client");
    unsubscribe();
    sender.postMessage({ ...payload, id: "event-2" });
    expect(received).toHaveLength(1);
  });

  it("falls back to the native storage event when BroadcastChannel is unavailable", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const listeners = new Set<(event: StorageEvent) => void>();
    vi.stubGlobal("window", {
      addEventListener: (type: string, handler: (event: StorageEvent) => void) => { if (type === "storage") listeners.add(handler); },
      removeEventListener: (type: string, handler: (event: StorageEvent) => void) => { if (type === "storage") listeners.delete(handler); },
    });
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
    const received: unknown[] = [];
    const unsubscribe = subscribeMcpOAuthResult(flowA, notification => received.push(notification));
    const payload = notifyMcpOAuthResult({
      status: "pending", flowId: flowA, ref: "qcc", tools: 2, message: "已授权", popup: true,
    });
    const entry = [...store.entries()].find(([key]) => key.endsWith(payload.id));
    expect(entry).toBeTruthy();
    for (const listener of listeners) listener({ key: entry![0], newValue: entry![1] } as StorageEvent);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ flowId: flowA, status: "pending", tools: 2 });
    unsubscribe();
    for (const listener of listeners) listener({ key: entry![0], newValue: entry![1] } as StorageEvent);
    expect(received).toHaveLength(1);
  });

  it("emits only non-secret result fields", () => {
    const payload = notifyMcpOAuthResult({
      status: "error", flowId: flowA, ref: "qcc_test", tools: null, message: "授权未完成", popup: false,
    });
    expect(Object.keys(payload).sort()).toEqual(["at", "flowId", "id", "message", "ref", "status", "tools"]);
    expect(JSON.stringify(payload)).not.toMatch(/access_token|refresh_token|client_secret|code_verifier/);
  });
});

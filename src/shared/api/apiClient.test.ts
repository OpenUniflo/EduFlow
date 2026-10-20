import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());
vi.mock("./supabaseClient", () => ({ supabaseClient: { auth: { getSession, signOut } } }));

import { API_AUTHENTICATION_FAILURE_TTL_MS, ApiRequestError, ApiResponseError, apiRequest, getApiAuthenticationFailure, subscribeApiAuthenticationFailure } from "./apiClient";

describe("apiRequest expired-session recovery", () => {
  beforeEach(() => {
    getSession.mockReset();
    signOut.mockReset().mockResolvedValue({ error: null });
  });

  it("coalesces bearer 401 recovery into one local sign-out", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "expired-token" } } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "unauthorized", message: "expired" } }), { status: 401 })));

    const results = await Promise.allSettled([apiRequest("/api/knowledge"), apiRequest("/api/progress")]);

    expect(results.every((result) => result.status === "rejected" && result.reason instanceof ApiRequestError)).toBe(true);
    expect(signOut).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it.each([
    [null, 401],
    ["valid-token", 403],
    ["valid-token", 500]
  ])("does not clear the session for token %s with status %s", async (token, status) => {
    getSession.mockResolvedValue({ data: { session: token ? { access_token: token } : null } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "failure" } }), { status })));

    await expect(apiRequest("/api/test")).rejects.toBeInstanceOf(ApiRequestError);

    expect(signOut).not.toHaveBeenCalled();
  });

  it.each(["<html>frontend fallback</html>", "export default {}", "", "{ incomplete"])("rejects a successful non-JSON response without claiming an HTTP rejection: %s", async (body) => {
    getSession.mockResolvedValue({ data: { session: { access_token: "current-token" } } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    const result = await apiRequest("/api/learner?resource=route-plan").catch((error: unknown) => error);
    expect(result).toBeInstanceOf(ApiResponseError);
    expect(result).not.toBeInstanceOf(ApiRequestError);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("retains definitive HTTP status and local sign-out for a non-JSON 401", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "new-expired-token" } } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("expired", { status: 401 })));
    await expect(apiRequest("/api/test")).rejects.toMatchObject({ status: 401, name: "ApiRequestError" });
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("returns valid JSON without requiring a particular response MIME spelling", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: false }))));
    await expect(apiRequest("/api/test")).resolves.toEqual({ result: false });
  });
});

describe("tab-local authentication failure notification", () => {
  const userId = "00000000-0000-4000-8000-000000000049";
  const unsubscribe: (() => void)[] = [];
  let now = Date.UTC(2030, 0, 1);
  const listen = (listener: Parameters<typeof subscribeApiAuthenticationFailure>[0]) => unsubscribe.push(subscribeApiAuthenticationFailure(listener));
  beforeEach(() => {
    now += API_AUTHENTICATION_FAILURE_TTL_MS + 1;
    vi.spyOn(Date, "now").mockReturnValue(now);
    getApiAuthenticationFailure();
    getSession.mockReset().mockResolvedValue({ data: { session: { access_token: `synthetic-token-${now}`, user: { id: userId } } } });
    signOut.mockReset().mockResolvedValue({ error: null });
  });
  afterEach(() => {
    unsubscribe.splice(0).forEach(remove => remove());
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  function reject401(error: unknown = { code: "UNAUTHORIZED", details: { requestId: "request-049" } }) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error }), { status: 401 })));
  }

  it("notifies synchronously before local sign-out with only bounded routing metadata", async () => {
    const order: string[] = [];
    listen(() => order.push("notification"));
    signOut.mockImplementation(async () => { order.push("sign-out"); return { error: null }; });
    reject401({ code: "UNAUTHORIZED", message: "private response message", details: { requestId: "request-049", private: "do-not-export" } });
    await expect(apiRequest("/api/workflows?resource=runs&op=cancel&id=private-id&key=private-key", { method: "post", body: "private-body", headers: { "X-Private": "private-header" } })).rejects.toMatchObject({ status: 401 });
    expect(order).toEqual(["notification", "sign-out"]);
    expect(getApiAuthenticationFailure()).toEqual({ sessionUserId: userId, method: "POST", path: "/api/workflows", resource: "runs", op: "cancel", status: 401, code: "UNAUTHORIZED", requestId: "request-049", occurredAt: now });
    expect(JSON.stringify(getApiAuthenticationFailure())).not.toMatch(/synthetic-token|private-|do-not-export/);
    expect(Object.isFrozen(getApiAuthenticationFailure())).toBe(true);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("isolates a throwing listener without skipping the next listener, sign-out or HTTP rejection", async () => {
    listen(() => { throw Error("private subscriber error"); });
    const next = vi.fn(); listen(next); reject401();
    await expect(apiRequest("/api/workflows?resource=validate", { method: "POST" })).rejects.toBeInstanceOf(ApiRequestError);
    expect(next).toHaveBeenCalledOnce(); expect(signOut).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({ resource: "validate", status: 401 });
  });
  it("expires the single RAM record without storage or authentication work", async () => {
    reject401(); await apiRequest("/api/test").catch(() => undefined);
    expect(getApiAuthenticationFailure()).not.toBeNull();
    vi.mocked(Date.now).mockReturnValue(now + API_AUTHENTICATION_FAILURE_TTL_MS);
    expect(getApiAuthenticationFailure()).toBeNull(); expect(signOut).toHaveBeenCalledOnce();
  });
  it("does not export duplicate, oversized or unsafe query identifiers and error text", async () => {
    reject401({ code: "unsafe code with spaces", details: { requestId: "unsafe\nrequest", unknown: "private" } });
    await apiRequest("/api/workflows?resource=runs&resource=definitions&op=bad%0Aop&id=do-not-export", { method: "POST" }).catch(() => undefined);
    expect(getApiAuthenticationFailure()).toEqual({ sessionUserId: userId, method: "POST", path: "/api/workflows", status: 401, occurredAt: now });
    reject401(); await apiRequest(`/api/workflows?resource=${"a".repeat(65)}&op=preview`).catch(() => undefined);
    expect(getApiAuthenticationFailure()).not.toHaveProperty("resource");
    expect(getApiAuthenticationFailure()).toHaveProperty("op", "preview");
  });
  it("does not notify or sign out for an anonymous 401", async () => {
    getSession.mockResolvedValue({ data: { session: null } }); const listener = vi.fn(); listen(listener); reject401();
    await expect(apiRequest("/api/test")).rejects.toBeInstanceOf(ApiRequestError);
    expect(listener).not.toHaveBeenCalled(); expect(signOut).not.toHaveBeenCalled();
  });
  it("clears stale login feedback after a request succeeds under the new authenticated session", async () => {
    reject401(); await apiRequest("/api/test").catch(() => undefined);
    getSession.mockResolvedValue({ data: { session: { access_token: "new-authenticated-session", user: { id: userId } } } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    await apiRequest("/api/profile"); expect(getApiAuthenticationFailure()).toBeNull();
  });
  it("does not let an earlier in-flight success erase a newer authentication failure", async () => {
    let resolve!: (response: Response) => void;
    const slow = new Promise<Response>(yes => { resolve = yes; });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((path: string) => path === "/api/slow" ? slow : Promise.resolve(new Response('{"error":{"code":"UNAUTHORIZED"}}', { status: 401 }))));
    const earlier = apiRequest("/api/slow"); await Promise.resolve(); await Promise.resolve();
    await apiRequest("/api/current").catch(() => undefined);
    const failure = getApiAuthenticationFailure(); resolve(new Response("{}", { status: 200 })); await earlier;
    expect(getApiAuthenticationFailure()).toBe(failure);
  });
  it("rejects a late token-A 401 without notifying or signing out the newly authenticated token-B session", async () => {
    let token = "synthetic-session-A";
    getSession.mockImplementation(async () => ({ data: { session: { access_token: token, user: { id: userId } } } }));
    let resolve!: (response: Response) => void;
    const slow = new Promise<Response>(yes => { resolve = yes; });
    const fetched = vi.fn().mockReturnValue(slow); vi.stubGlobal("fetch", fetched);
    const listener = vi.fn(); listen(listener);
    const oldRequest = apiRequest("/api/workflows?resource=runs", { method: "POST" });
    await Promise.resolve(); await Promise.resolve(); expect(fetched).toHaveBeenCalledOnce();
    token = "synthetic-session-B";
    resolve(new Response('{"error":{"code":"UNAUTHORIZED","details":{"requestId":"old-A"}}}', { status: 401 }));
    await expect(oldRequest).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    expect(listener).not.toHaveBeenCalled(); expect(signOut).not.toHaveBeenCalled();
    expect(getApiAuthenticationFailure()).toBeNull(); expect(token).toBe("synthetic-session-B");
  });
  it("retains the original HTTP rejection when the current-session comparison cannot be read", async () => {
    getSession.mockReset().mockResolvedValueOnce({ data: { session: { access_token: "synthetic-A", user: { id: userId } } } }).mockRejectedValueOnce(Error("private session-read failure"));
    const listener = vi.fn(); listen(listener); reject401();
    await expect(apiRequest("/api/workflows?resource=runs", { method: "POST" })).rejects.toMatchObject({ status: 401, name: "ApiRequestError" });
    expect(listener).not.toHaveBeenCalled(); expect(signOut).not.toHaveBeenCalled();
  });
  it("coalesces sign-out while preserving each failed request's distinct route correlation", async () => {
    const listener = vi.fn(); listen(listener); reject401();
    await Promise.allSettled([apiRequest("/api/workflows?resource=runs", { method: "POST" }), apiRequest("/api/workflows?resource=events")]);
    expect(listener.mock.calls.map(([event]) => [event.method, event.resource]).sort((a, b) => a[1].localeCompare(b[1]))).toEqual([["GET", "events"], ["POST", "runs"]]);
    expect(signOut).toHaveBeenCalledOnce();
  });
  it("still supplies safe route context for a non-JSON 401 without exporting that body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private non-JSON body", { status: 401 })));
    const listener = vi.fn(); listen(listener);
    await expect(apiRequest("/api/workflows?resource=validate", { method: "POST" })).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledWith({ sessionUserId: userId, method: "POST", path: "/api/workflows", resource: "validate", status: 401, occurredAt: now });
  });
  it("unsubscribes a disposed feature before notifying later failures", async () => {
    const listener = vi.fn(); const remove = subscribeApiAuthenticationFailure(listener); remove(); reject401();
    await apiRequest("/api/test").catch(() => undefined); expect(listener).not.toHaveBeenCalled(); expect(signOut).toHaveBeenCalledOnce();
  });
});

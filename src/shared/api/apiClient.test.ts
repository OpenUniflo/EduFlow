import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());
vi.mock("./supabaseClient", () => ({ supabaseClient: { auth: { getSession, signOut } } }));

import { ApiRequestError, apiRequest } from "./apiClient";

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
});

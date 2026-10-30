// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { ApiAuthenticationFailure } from "@/shared/api/apiClient";
import { AuthProvider } from "../AuthContext";
import { AuthPage } from "./AuthPage";

const metadata = vi.hoisted(() => ({ current: null as ApiAuthenticationFailure | null }));
vi.mock("@/shared/api/apiClient", () => ({ API_AUTHENTICATION_FAILURE_TTL_MS: 300000, getApiAuthenticationFailure: () => metadata.current, subscribeApiAuthenticationFailure: () => () => undefined }));
const auth = { session: null, signIn: vi.fn(), signUp: vi.fn(), logout: vi.fn() };
function markup(mode: "login" | "register" = "login") {
  return renderToStaticMarkup(<MemoryRouter><AuthProvider value={auth}><AuthPage mode={mode}/></AuthProvider></MemoryRouter>);
}
beforeEach(() => { metadata.current = null; vi.clearAllMocks(); });

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("login failure feedback", () => {
  it("renders a real sign-in failure inline under the password field", async () => {
    auth.signIn.mockRejectedValueOnce(new Error("邮箱或密码错误，请检查后重试。"));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<MemoryRouter><AuthProvider value={auth}><AuthPage mode="login" /></AuthProvider></MemoryRouter>);
    });

    const email = container.querySelector<HTMLInputElement>('input[type="email"]');
    const password = container.querySelector<HTMLInputElement>('input[type="password"]');
    expect(email).not.toBeNull();
    expect(password).not.toBeNull();
    setInput(email!, "student@example.com");
    setInput(password!, "wrong-password");
    await act(async () => {
      container.querySelector("form")!.requestSubmit();
      await Promise.resolve();
      await Promise.resolve();
    });

    const passwordWrap = password!.closest(".ef-ui-field-wrap");
    const help = passwordWrap?.querySelector(".ef-ui-help.is-error");
    expect(help?.textContent).toContain("邮箱或密码错误");
    expect(password!.getAttribute("aria-invalid")).toBe("true");
    expect(password!.getAttribute("aria-describedby")).toBe(help?.id);
    expect(passwordWrap?.querySelector('[role="alert"]')).toBe(help);
    expect(container.querySelector(".ef-auth-error")).toBeNull();
    expect(auth.signIn).toHaveBeenCalledWith({ email: "student@example.com", password: "wrong-password" });

    act(() => root.unmount());
    container.remove();
  });
});

describe("generic expired-login feedback", () => {
  it("shows a clear login reason and request identity without claiming an operation or draft was recovered", () => {
    metadata.current = { sessionUserId: "owner", method: "POST", path: "/api/workflows", resource: "runs", status: 401, code: "UNAUTHORIZED", requestId: "request-049", occurredAt: Date.now() };
    const html = markup();
    expect(html).toContain('role="alert" aria-label="登录状态提醒"');
    expect(html).toContain("登录状态已失效"); expect(html).toContain("刚才的请求未能完成");
    expect(html).toContain("确认原操作状态，避免重复提交"); expect(html).toContain("HTTP 401");
    expect(html).toContain("请求编号：request-049");
    expect(html).not.toContain("草稿已保留"); expect(html).not.toContain("/api/workflows");
    expect(auth.signIn).not.toHaveBeenCalled();
  });
  it("retains an ordinary login page when there is no current failure record", () => {
    const html = markup(); expect(html).toContain("登录"); expect(html).not.toContain("登录状态提醒");
  });
  it("does not invent a request ID for an expired response without one or show login expiry on registration", () => {
    metadata.current = { sessionUserId: "owner", method: "GET", path: "/api/test", status: 401, occurredAt: Date.now() };
    expect(markup()).toContain("HTTP 401"); expect(markup()).not.toContain("请求编号");
    expect(markup("register")).not.toContain("登录状态提醒");
  });
});

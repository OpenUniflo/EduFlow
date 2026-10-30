// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlobalNav } from "./GlobalNav";
import type { MockSession } from "@/features/auth/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: Root; container: HTMLElement }> = [];
const student: MockSession = { userId: "u1", name: "小林", email: "lin@example.com", role: "student", capabilities: [], createdAt: "2026-01-01" };

function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(node));
  mounted.push({ root, container });
  return container;
}

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
  document.body.innerHTML = "";
});

function click(target: Element) {
  act(() => { target.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

function key(target: EventTarget, value: string) {
  act(() => { target.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true })); });
}

describe("GlobalNav shell", () => {
  it("marks the current page and renders learner items in one rail", () => {
    const container = mount(<MemoryRouter initialEntries={["/archive"]}><GlobalNav session={student} onLogout={vi.fn()} /></MemoryRouter>);
    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>("a.ef-nav-item"));
    expect(links.map((link) => link.textContent)).toEqual(["首页", "档案", "作品", "记录"]);
    expect(container.querySelector('a.ef-nav-item[aria-current="page"]')?.textContent).toBe("档案");
    expect(container.querySelector("nav")?.getAttribute("aria-label")).toBe("主导航");
  });

  it("opens the account menu from the avatar and supports Arrow/Escape with focus return", () => {
    const container = mount(<MemoryRouter initialEntries={["/"]}><GlobalNav session={student} onLogout={vi.fn()} /></MemoryRouter>);
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    // The menu is portaled to <body> so its backdrop-filter is not nested
    // inside the rail's own backdrop root.
    const menu = document.querySelector('[role="menu"]')!;
    expect(menu).not.toBeNull();
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(items[0]?.textContent).toContain("打开我的面板");
    expect(document.activeElement).toBe(items[0]);
    key(items[0]!, "ArrowDown");
    expect(document.activeElement).toBe(items[1]);
    key(document, "Escape");
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("shows the compact display name in the rail without an ellipsis", () => {
    const container = mount(<MemoryRouter initialEntries={["/"]}><GlobalNav session={{ ...student, name: "Local Student" }} onLogout={vi.fn()} /></MemoryRouter>);
    const name = container.querySelector(".ef-nav-me-name");
    expect(name?.textContent).toBe("Local");
    expect(name?.textContent).not.toContain("…");
  });

  it("shows only Home/Archive and a login action to guests", () => {
    const container = mount(<MemoryRouter initialEntries={["/"]}><GlobalNav session={null} /></MemoryRouter>);
    expect(Array.from(container.querySelectorAll("a.ef-nav-item")).map((link) => link.textContent)).toEqual(["首页", "档案"]);
    expect(container.querySelector('button[aria-label="登录"]')).not.toBeNull();
    expect(container.querySelector('button[aria-haspopup="menu"]')).toBeNull();
  });
});

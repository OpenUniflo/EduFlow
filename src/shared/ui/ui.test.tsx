// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AccountMenu,
  Avatar,
  AvatarStack,
  Bubble,
  Button,
  Chip,
  ContextPill,
  ConversationCard,
  EventRow,
  GlassDefs,
  GlassSurface,
  HomeComposer,
  ObjectShell,
  ObjectShellSection,
  Pill,
  PreviewBadge,
  TextField,
  Textarea
} from "./index";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const css = readFileSync(resolve(process.cwd(), "src/shared/ui/ui.css"), "utf8");
const mounted: Array<{ root: Root; container: HTMLElement }> = [];

function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(node));
  mounted.push({ root, container });
  return container;
}

function setInput(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function key(target: EventTarget, value: string) {
  act(() => { target.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true })); });
}

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
  document.body.innerHTML = "";
});

describe("new-UI primitives", () => {
  it("renders button variants, sizes, loading and disabled semantics", () => {
    const primary = renderToStaticMarkup(<Button variant="primary" size="32">保存</Button>);
    expect(primary).toContain("ef-ui-btn--primary");
    expect(primary).toContain("ef-ui-btn--32");
    const loading = renderToStaticMarkup(<Button loading>提交</Button>);
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("ef-ui-spinner");
    expect(loading).toContain("disabled");
  });

  it("wires field labels, hints, errors and textarea chrome", () => {
    const field = renderToStaticMarkup(<TextField label="课程名" hint="必填" error="不能为空" />);
    expect(field).toContain('aria-invalid="true"');
    expect(field).toContain("不能为空");
    expect(field).toMatch(/id="[^"]+-help"/);
    const area = renderToStaticMarkup(<Textarea label="说明" hint="可选" />);
    expect(area).toContain("ef-ui-textarea");
    expect(area).toContain("说明");
  });

  it("renders pills, chips and removable context pills with accessible labels", () => {
    expect(renderToStaticMarkup(<Pill tone="warn" dot>待修改</Pill>)).toContain("ef-ui-pill--warn");
    expect(renderToStaticMarkup(<Chip selected>仅看我的</Chip>)).toContain('aria-pressed="true"');
    const context = renderToStaticMarkup(<ContextPill label="课程 · 智能体入门" onRemove={() => {}} />);
    expect(context).toContain('aria-label="移除 课程 · 智能体入门"');
    expect(context).toContain("ef-ui-ctx-remove");
  });

  it("renders avatars, person-colour rings and stacks", () => {
    expect(renderToStaticMarkup(<Avatar name="小林" personColor="cyan" />)).toContain("is-ring--cyan");
    expect(renderToStaticMarkup(<Avatar name="Ab" size={40} />)).toContain("ef-ui-avatar--40");
    const stack = renderToStaticMarkup(<AvatarStack people={[{ id: "1", name: "甲" }, { id: "2", name: "乙" }, { id: "3", name: "丙" }]} max={2} />);
    expect(stack.match(/ef-ui-avatar--28/g)).toHaveLength(2);
    expect(stack).toContain("+1");
  });
});

describe("object shell and conversation geometry", () => {
  it("renders all four object-shell sizes with the same header/footer contract", () => {
    for (const size of ["s", "l", "panel", "immersive"] as const) {
      const html = renderToStaticMarkup(
        <ObjectShell size={size} title="对象" kicker="小练习" badge={<Pill>进行中</Pill>} footer={<Button>继续</Button>}>
          <ObjectShellSection title="要求" description="一句话目标"><p>正文</p></ObjectShellSection>
        </ObjectShell>
      );
      expect(html, size).toContain(`ef-ui-obj--${size}`);
      expect(html, size).toContain(`data-size="${size}"`);
      expect(html, size).toContain("ef-ui-obj-head");
      expect(html, size).toContain("ef-ui-obj-foot");
    }
    const immersive = renderToStaticMarkup(
      <ObjectShell size="immersive" title="实践" stage={<div>画布</div>} inspector={<div>检查器内容</div>} inspectorTitle="提交检查器" footer={<Button>提交</Button>} />
    );
    expect(immersive).toContain("ef-ui-obj-stage");
    expect(immersive).toContain("提交检查器");
    expect(immersive).toContain("画布");
  });

  it("spans the conversation column with both S and L conversation cards", () => {
    const small = renderToStaticMarkup(<ConversationCard size="s" label="课程卡"><Bubble>摘要</Bubble></ConversationCard>);
    const large = renderToStaticMarkup(<ConversationCard size="l"><Bubble>摘要</Bubble></ConversationCard>);
    expect(small).toContain("ef-ui-conversation-card--s");
    expect(large).toContain("ef-ui-conversation-card--l");
    expect(css).toMatch(/\.ef-ui-conversation-card--s,[\s\S]*?\.ef-ui-conversation-card--l\s*\{[^}]*width: 100%/);
    expect(css).not.toMatch(/\.ef-ui-conversation-card--s\s*\{[^}]*max-width: 480px/);
    expect(renderToStaticMarkup(<EventRow title="已提交" detail="第 2 次" />)).toContain("ef-ui-event-row");
    expect(renderToStaticMarkup(<Bubble from="user">问题</Bubble>)).toContain("ef-ui-bubble--user");
  });

  it("defines reduced-motion and reduced-transparency fallbacks", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\)[\s\S]*?\.ef-ui-glass[\s\S]*?backdrop-filter: none/);
    expect(css).toContain(".ef-ui-spinner {\n    animation: none;");
  });
});

describe("glass", () => {
  it("uses the design lens filters and a blur-only Safari prefix", () => {
    const regular = renderToStaticMarkup(<GlassSurface tone="regular" radius={16}>内容</GlassSurface>);
    expect(regular).toContain("ef-ui-glass--regular");
    expect(regular).toContain("ef-ui-glass--r-16");
    const prefixed = css.match(/-webkit-backdrop-filter: ([^;]+);/)?.[1] ?? "";
    const standard = css.match(/(?<!-webkit-)backdrop-filter: ([^;]+);/)?.[1] ?? "";
    expect(prefixed).toContain("blur(");
    expect(prefixed).not.toContain("url(");
    expect(standard).toContain("var(--lg-lens)");
    const defs = renderToStaticMarkup(<GlassDefs />);
    for (const id of ["lg-lens-nav", "lg-lens-round", "lg-lens-panel", "lg-lens-course", "lg-lens-input", "lg-lens-menu"]) {
      expect(defs, id).toContain(`id="${id}"`);
    }
  });
});

describe("keyboard and focus", () => {
  it("submits the composer on Enter, supports context removal and exposes the send action", () => {
    const submitted = vi.fn();
    const removed = vi.fn();
    const container = mount(
      <HomeComposer contexts={[{ id: "c1", label: "课程 · 智能体" }]} onRemoveContext={removed} onSubmit={submitted} hint="Enter 发送" />
    );
    const input = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="给助手发消息"]')!;
    const send = container.querySelector<HTMLButtonElement>('button[aria-label="发送"]')!;
    expect(send.disabled).toBe(true);
    setInput(input, "  帮我解释一下  ");
    expect(send.disabled).toBe(false);
    key(input, "Enter");
    expect(submitted).toHaveBeenCalledWith("帮我解释一下", { mentions: [], links: [] });
    act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="移除 课程 · 智能体"]')!.click(); });
    expect(removed).toHaveBeenCalledWith("c1");
    input.focus();
    expect(document.activeElement).toBe(input);
  });

  it("keeps the draft editable while replying and turns send into stop", () => {
    const submitted = vi.fn();
    const stopped = vi.fn();
    const container = mount(
      <HomeComposer replying onStop={stopped} onSubmit={submitted} hint="Enter 发送" />
    );
    const input = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="给助手发消息"]')!;
    const stop = container.querySelector<HTMLButtonElement>('button[aria-label="停止回复"]')!;
    expect(input.disabled).toBe(false);
    expect(stop.disabled).toBe(false);
    setInput(input, "草稿还在");
    key(input, "Enter");
    expect(submitted).not.toHaveBeenCalled();
    expect(input.value).toBe("草稿还在");
    act(() => stop.click());
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(submitted).not.toHaveBeenCalled();
    expect(input.value).toBe("草稿还在");
  });

  it("opens on the account panel row, roves with arrows and returns focus on Escape", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const triggerRef = { current: trigger } as RefObject<HTMLElement | null>;
    const onClose = vi.fn();
    const onOpenPanel = vi.fn();
    const container = mount(
      <AccountMenu open name="小林" email="lin@example.com" onOpenPanel={onOpenPanel} onClose={onClose} returnFocusRef={triggerRef}
        items={[{ id: "settings", label: "设置" }, { id: "following", label: "关注的人" }]} />
    );
    const first = container.querySelector<HTMLButtonElement>('[role="menuitem"]')!;
    expect(first.textContent).toContain("打开我的面板");
    expect(document.activeElement).toBe(first);
    key(first, "ArrowDown");
    const items = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(document.activeElement).toBe(items[1]);
    key(document, "Escape");
    expect(onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when clicking outside the menu", () => {
    const onClose = vi.fn();
    const container = mount(<AccountMenu open name="小林" email="lin@example.com" onOpenPanel={() => {}} onClose={onClose} />);
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    act(() => { document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); });
    expect(onClose).toHaveBeenCalled();
  });

  it("marks the preview badge visibly", () => {
    const html = renderToStaticMarkup(<PreviewBadge />);
    expect(html).toContain("预览 · 示例数据");
    expect(html).toContain('data-preview="sample"');
    expect(html).toContain('role="note"');
  });
});

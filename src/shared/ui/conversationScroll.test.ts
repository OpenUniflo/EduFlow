// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  completionScrollTarget,
  contentGap,
  conversationAvailableHeight,
  keyboardScrollTop,
  pinSpaceHeight,
  scrollTopToReveal,
  shouldShowJump
} from "./conversationScroll";

describe("conversation scroll geometry", () => {
  it("subtracts the sticky title bar and composer from the usable viewport", () => {
    expect(conversationAvailableHeight({ clientHeight: 720, titleHeight: 64, composerHeight: 112 })).toBe(536);
    expect(conversationAvailableHeight({ clientHeight: 80, titleHeight: 64, composerHeight: 112 })).toBe(0);
  });

  it("fills only the remaining trailing room and never goes negative", () => {
    expect(pinSpaceHeight(536, 180)).toBe(356);
    expect(pinSpaceHeight(536, 620)).toBe(0);
  });

  it("puts an element below the title bar without scrolling above zero", () => {
    expect(scrollTopToReveal({ elementTop: 400, scrollerTop: 100, scrollTop: 120, titleHeight: 64 })).toBe(348);
    expect(scrollTopToReveal({ elementTop: 100, scrollerTop: 100, scrollTop: 0, titleHeight: 64 })).toBe(0);
  });

  it("shows jump-to-latest only after the content end clears the composer", () => {
    expect(contentGap(500, 520)).toBe(-20);
    expect(shouldShowJump(contentGap(500, 520))).toBe(false);
    expect(shouldShowJump(contentGap(900, 520))).toBe(true);
    expect(shouldShowJump(100, 96)).toBe(true);
  });

  describe("completion follow target", () => {
    function mount(options: { titleBottom: number; stripTop: number | null; composerTop: number; scrollTop: number; startTop: number; endBottom: number; scrollHeight?: number; clientHeight?: number }) {
      document.body.innerHTML = `
        <div class="ef-home-scroller">
          <header class="ef-home-titlebar"></header>
          <div class="ef-home-composer">
            <div class="ef-home-strip-anchor"${options.stripTop == null ? " hidden" : ""}>
              <div class="ef-home-next-strip"></div>
            </div>
          </div>
        </div>`;
      const scroller = document.querySelector<HTMLElement>(".ef-home-scroller")!;
      const title = document.querySelector<HTMLElement>(".ef-home-titlebar")!;
      const composer = document.querySelector<HTMLElement>(".ef-home-composer")!;
      const strip = document.querySelector<HTMLElement>(".ef-home-next-strip")!;
      const start = document.createElement("div");
      const end = document.createElement("div");
      const box = (wrap: Element, top: number, bottom: number) => {
        Object.defineProperty(wrap, "getBoundingClientRect", { value: () => ({ top, bottom, left: 0, right: 500, width: 500, height: bottom - top, x: 0, y: top, toJSON() { return {}; } }) });
      };
      Object.defineProperty(title, "offsetHeight", { value: 64 });
      box(scroller, 0, options.clientHeight ?? 720);
      box(strip, options.stripTop ?? 0, (options.stripTop ?? 0) + 56);
      box(composer, options.composerTop, options.composerTop + 100);
      box(start, options.startTop, options.startTop + 50);
      box(end, options.endBottom - 50, options.endBottom);
      document.body.append(start, end);
      Object.defineProperty(scroller, "scrollTop", { value: options.scrollTop, writable: true });
      Object.defineProperty(scroller, "scrollHeight", { value: options.scrollHeight ?? 1600 });
      Object.defineProperty(scroller, "clientHeight", { value: options.clientHeight ?? 720 });
      return { scroller, start, end };
    }

    it("aligns the card bottom above the visible strip when the reply fits", () => {
      const { scroller, start, end } = mount({ titleBottom: 64, stripTop: 500, composerTop: 556, scrollTop: 300, startTop: 200, endBottom: 460 });
      expect(completionScrollTarget(scroller, start, end)).toBe(268);
    });

    it("uses the composer top when the strip is hidden", () => {
      const { scroller, start, end } = mount({ titleBottom: 64, stripTop: null, composerTop: 600, scrollTop: 300, startTop: 200, endBottom: 500 });
      expect(completionScrollTarget(scroller, start, end)).toBe(208);
    });

    it("aligns the reply start when the reply plus cards is taller than the viewport", () => {
      const { scroller, start, end } = mount({ titleBottom: 64, stripTop: 500, composerTop: 556, scrollTop: 300, startTop: 200, endBottom: 900 });
      expect(completionScrollTarget(scroller, start, end)).toBe(428);
    });
  });

  it("maps Page and arrow keys to a clamped scroll target", () => {
    const base = { scrollTop: 400, clientHeight: 600, maxTop: 1200 };
    expect(keyboardScrollTop("PageDown", base)).toBe(880);
    expect(keyboardScrollTop("PageUp", base)).toBe(0);
    expect(keyboardScrollTop("ArrowDown", base)).toBe(464);
    expect(keyboardScrollTop("ArrowUp", base)).toBe(336);
    expect(keyboardScrollTop("Home", base)).toBe(0);
    expect(keyboardScrollTop("End", base)).toBe(1200);
    expect(keyboardScrollTop("Escape", base)).toBeNull();
  });
});

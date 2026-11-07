/**
 * Conversation scroll geometry shared by the Home timeline and answer cards.
 *
 * The scroller fills the main area. The sticky title bar and composer reduce the
 * usable viewport; the tail spacer is the only element whose height is changed
 * to pin a message or an expanded card near the title bar.
 */

export type ConversationViewportInput = {
  clientHeight: number;
  titleHeight: number;
  composerHeight: number;
  gap?: number;
};

export function conversationAvailableHeight(input: ConversationViewportInput): number {
  const gap = input.gap ?? 8;
  return Math.max(0, Math.round(input.clientHeight - input.titleHeight - input.composerHeight - gap));
}

/** Height of the trailing spacer that keeps content ending at the composer. */
export function pinSpaceHeight(available: number, used: number): number {
  return Math.max(0, Math.round(available - used));
}

/** New scrollTop that puts an element just below the sticky title bar. */
export function scrollTopToReveal(input: {
  elementTop: number;
  scrollerTop: number;
  scrollTop: number;
  titleHeight: number;
  gap?: number;
}): number {
  const gap = input.gap ?? 8;
  return Math.max(0, Math.round(input.scrollTop + input.elementTop - input.scrollerTop - input.titleHeight - gap));
}

/** Distance between the content end and the composer top (positive = above). */
export function contentGap(tailTop: number, composerTop: number): number {
  return tailTop - composerTop;
}

export function shouldShowJump(gap: number, threshold = 96): boolean {
  return gap > threshold;
}

const KEYBOARD_STEP: Record<string, { ratio?: number; delta?: number }> = {
  PageDown: { ratio: 0.8 },
  PageUp: { ratio: -0.8 },
  ArrowDown: { delta: 64 },
  ArrowUp: { delta: -64 },
  Home: { delta: Number.NEGATIVE_INFINITY },
  End: { delta: Number.POSITIVE_INFINITY }
};

/** Pure keyboard scroll target. Returns null for keys we do not handle. */
export function keyboardScrollTop(key: string, input: { scrollTop: number; clientHeight: number; maxTop: number }): number | null {
  const step = KEYBOARD_STEP[key];
  if (!step) return null;
  const delta = step.ratio != null ? input.clientHeight * step.ratio : step.delta ?? 0;
  return Math.max(0, Math.min(input.maxTop, Math.round(input.scrollTop + delta)));
}

function query<T extends HTMLElement>(root: HTMLElement, selector: string) {
  return root.querySelector<T>(selector);
}

function measureConversation(scroller: HTMLElement) {
  const title = query<HTMLElement>(scroller, ".ef-home-titlebar");
  const composer = query<HTMLElement>(scroller, ".ef-home-composer");
  const tail = query<HTMLElement>(scroller, ".ef-home-tail-space");
  return {
    titleHeight: title?.offsetHeight ?? 0,
    composerHeight: composer?.offsetHeight ?? 0,
    tail
  };
}

/** Keep the sticky action bar and scroll geometry in sync with the composer. */
export function syncConversationComposerHeight(scroller: HTMLElement | null) {
  if (!scroller) return;
  const composer = query<HTMLElement>(scroller, ".ef-home-composer");
  if (composer) scroller.style.setProperty("--ef-composer-h", `${composer.offsetHeight}px`);
}

function setTailHeight(scroller: HTMLElement, height: number) {
  const tail = query<HTMLElement>(scroller, ".ef-home-tail-space");
  if (tail) tail.style.height = `${Math.max(0, Math.round(height))}px`;
}

/** Remove the trailing room added while a card is expanded. */
export function clearConversationTail(scroller: HTMLElement | null) {
  if (!scroller) return;
  setTailHeight(scroller, 0);
  delete scroller.dataset.cardOpen;
}

/**
 * Give an expanded card enough trailing room to reach the title bar, then put
 * its top just below that bar. Never relies on the card's own scroll height.
 */
export function alignConversationElement(scroller: HTMLElement, element: HTMLElement, options: { smooth?: boolean } = {}) {
  const { titleHeight, composerHeight, tail } = measureConversation(scroller);
  const elementTop = element.getBoundingClientRect().top;
  if (tail) {
    const available = conversationAvailableHeight({ clientHeight: scroller.clientHeight, titleHeight, composerHeight });
    const used = tail.getBoundingClientRect().top - elementTop;
    setTailHeight(scroller, pinSpaceHeight(available, used));
  }
  const top = scrollTopToReveal({
    elementTop,
    scrollerTop: scroller.getBoundingClientRect().top,
    scrollTop: scroller.scrollTop,
    titleHeight
  });
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  scroller.scrollTo({ top, behavior: options.smooth && !reduce ? "smooth" : "auto" });
}

/**
 * Put a completion reply plus the cards inside it fully above the strip or
 * composer. When it does not fit, align the reply start under the title bar.
 * Pure geometry, so both the hook and tests can verify it.
 */
export function completionScrollTarget(scroller: HTMLElement, start: HTMLElement, end: HTMLElement): number {
  const title = query<HTMLElement>(scroller, ".ef-home-titlebar");
  const composer = query<HTMLElement>(scroller, ".ef-home-composer");
  const strip = composer?.querySelector<HTMLElement>(".ef-home-strip-anchor:not([hidden]) .ef-home-next-strip") ?? null;
  const titleHeight = title?.offsetHeight ?? 0;
  const topLimit = scroller.getBoundingClientRect().top + titleHeight + 8;
  const bottomLimit = (strip ?? composer)?.getBoundingClientRect().top ?? scroller.getBoundingClientRect().bottom;
  const available = Math.max(0, bottomLimit - 8 - topLimit);
  const startTop = start.getBoundingClientRect().top;
  const endBottom = end.getBoundingClientRect().bottom;
  const fits = endBottom - startTop <= available;
  const target = fits ? scroller.scrollTop + endBottom - (bottomLimit - 8) : scroller.scrollTop + startTop - topLimit;
  return Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, Math.round(target)));
}

/** Smooth (or instant with reduced motion) completion alignment. */
export function alignConversationCompletion(scroller: HTMLElement, start: HTMLElement, end: HTMLElement, options: { smooth?: boolean } = {}) {
  setTailHeight(scroller, 0);
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  scroller.scrollTo({ top: completionScrollTarget(scroller, start, end), behavior: options.smooth && !reduce ? "smooth" : "auto" });
}

/** Scroll to the last piece of content, stopping above the composer. */
export function scrollConversationToLatest(scroller: HTMLElement | null, behavior: ScrollBehavior = "auto") {
  if (!scroller) return;
  const { tail } = measureConversation(scroller);
  const composer = query<HTMLElement>(scroller, ".ef-home-composer");
  if (!tail || !composer) {
    scroller.scrollTo({ top: scroller.scrollHeight, behavior });
    return;
  }
  const gap = contentGap(tail.getBoundingClientRect().top, composer.getBoundingClientRect().top);
  // When content already ends above the composer there is nothing to reveal;
  // the trailing spacer is pin room, not a message.
  if (gap <= 0) return;
  scroller.scrollBy({ top: gap + 16, behavior });
}

/**
 * The minimum scroll needed to bring a newly rendered feedback box fully into
 * the visible part of its scroll container. The visible bottom is clipped by a
 * sticky/fixed action bar when one overlays the container.
 */
export function feedbackScrollDelta(input: {
  top: number;
  bottom: number;
  containerTop: number;
  containerBottom: number;
  footerTop?: number | null;
  gap?: number;
}) {
  const gap = input.gap ?? 12;
  const visibleTop = input.containerTop + gap;
  const visibleBottom = Math.min(input.containerBottom, input.footerTop ?? Number.POSITIVE_INFINITY) - gap;
  if (visibleBottom <= visibleTop) return 0;
  const available = visibleBottom - visibleTop;
  if (input.bottom - input.top > available) return input.top - visibleTop;
  if (input.bottom > visibleBottom) return input.bottom - visibleBottom;
  if (input.top < visibleTop) return input.top - visibleTop;
  return 0;
}

function nearestScrollContainer(element: HTMLElement) {
  let node = element.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
    node = node.parentElement;
  }
  return document.scrollingElement ?? document.documentElement;
}

/**
 * Scroll once after a feedback box appears. Uses the nearest scrolling area and
 * reserves the height of a sticky/fixed footer, so the whole box is visible.
 */
export function scrollFeedbackIntoView(feedback: HTMLElement) {
  const container = nearestScrollContainer(feedback);
  const card = feedback.closest(".micro-card");
  const footer = card?.querySelector("footer")
    ?? feedback.closest(".ef-ui-obj")?.querySelector(".ef-ui-obj-foot")
    ?? null;
  const box = feedback.getBoundingClientRect();
  const footerRect = footer?.getBoundingClientRect();
  const isDocument = container === document.scrollingElement || container === document.documentElement || container === document.body;
  const containerRect = isDocument ? { top: 0, bottom: window.innerHeight } : container.getBoundingClientRect();
  // A card footer is sticky inside the scrolling timeline, so its top moves
  // with the scroll and is not a stable occluder during the first frame. Use
  // its height and leave a small gap; panel/immersive footers sit outside the
  // scroll container, where their top edge is stable.
  const footerTop = card && footerRect ? containerRect.bottom - footerRect.height - 16 : footerRect?.top;
  const delta = feedbackScrollDelta({
    top: box.top,
    bottom: box.bottom,
    containerTop: containerRect.top,
    containerBottom: containerRect.bottom,
    footerTop,
  });
  if (!delta) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const behavior: ScrollBehavior = reduce ? "auto" : "smooth";
  if (isDocument) window.scrollBy({ top: delta, behavior });
  else container.scrollBy({ top: delta, behavior });
}

import { animate } from "motion/react";

const MORPH_MS = 0.24;
const MORPH_EASE = [0.2, 0.8, 0.2, 1] as const;

function morphTransform(from: DOMRect, to: DOMRect) {
  return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
}

/**
 * Expand a mounted panel from the card/row rectangle it belongs to. The panel
 * is never moved from the screen edge; it grows from the origin in place.
 */
export function expandPanelFromRect(element: HTMLElement | null, origin: DOMRect | null | undefined, reducedMotion: boolean): Promise<void> {
  if (!element || !origin || reducedMotion) return Promise.resolve();
  const to = element.getBoundingClientRect();
  if (!to.width || !to.height || !origin.width || !origin.height) return Promise.resolve();
  element.style.transformOrigin = "top left";
  element.style.willChange = "transform";
  element.style.overflow = "clip";
  const controls = animate(element, { transform: [morphTransform(origin, to), "translate(0px, 0px) scale(1, 1)"] }, { duration: MORPH_MS, ease: MORPH_EASE });
  return controls.finished.catch(() => undefined).then(() => {
    element.style.transform = "";
    element.style.transformOrigin = "";
    element.style.willChange = "";
    element.style.overflow = "";
  });
}

/** Contract the panel back to the same origin before the parent unmounts it. */
export function contractPanelToRect(element: HTMLElement | null, origin: DOMRect | null | undefined, reducedMotion: boolean): Promise<void> {
  if (!element || !origin || reducedMotion) return Promise.resolve();
  const from = element.getBoundingClientRect();
  if (!from.width || !from.height || !origin.width || !origin.height) return Promise.resolve();
  element.style.transformOrigin = "top left";
  element.style.willChange = "transform";
  element.style.overflow = "clip";
  const controls = animate(element, { transform: ["translate(0px, 0px) scale(1, 1)", morphTransform(origin, from)] }, { duration: MORPH_MS, ease: MORPH_EASE });
  return controls.finished.catch(() => undefined).then(() => {
    element.style.transform = "";
    element.style.transformOrigin = "";
    element.style.willChange = "";
    element.style.overflow = "";
  });
}

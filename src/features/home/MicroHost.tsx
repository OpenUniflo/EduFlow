import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, createContext, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Maximize2, MessageSquare, PanelRight } from "lucide-react";
import { animate, useReducedMotion } from "motion/react";
import { applicationServices, refreshLearnerState } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import { InlineMicro } from "@/features/home/InlineMicro";
import { alignConversationElement, clearConversationTail } from "@/shared/ui/conversationScroll";
import "./microHost.css";
import {
  defaultMicroForm,
  preferredMicroForm,
  readMicroFormPreference,
  reduceMicroPresence,
  writeMicroFormPreference,
  type MicroForm,
  type MicroNonFocusForm,
  type MicroOpenInput,
  type MicroPresence,
  type MicroPresenceState
} from "./microPresence";

/** Paths already reported to the Assistant in this browser session. */
const MORPH_MS = 400;
const GROW_MS = 240;
const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;

type SlotEntry = { element: HTMLElement; key: string; kind?: string };

/** A card must be mounted in this conversation before inline becomes a target. */
function timelineHasCard(pathId: string): boolean {
  if (typeof document === "undefined" || !pathId) return false;
  const escaped = pathId.replace(/["\\]/g, "\\$&");
  return Boolean(document.querySelector(`.ef-home-timeline [data-card-type][data-path-id="${escaped}"]`));
}
type SlotRegistry = Map<string, SlotEntry[]>;

export type MicroHostController = {
  presence: MicroPresence | null;
  path: ReturnType<typeof loadMicroPath>;
  revision: number;
  slotVersion: number;
  slotOwner(pathId: string): string | null;
  cardSlot(pathId: string, key?: string): HTMLElement | null;
  cardOwner(pathId: string): string | null;
  open(input: MicroOpenInput, form?: MicroForm): void;
  setForm(form: MicroForm): void;
  close(): void;
  clear(): void;
  dismissSide(): void;
  exitFocus(): void;
  registerSlot(pathId: string, key: string, element: HTMLElement): () => void;
  registerCard(pathId: string, key: string, element: HTMLElement, kind?: string): () => void;
  handleCompleted(): void;
  alignInline(smooth?: boolean, settle?: boolean): void;
  container: HTMLDivElement;
  parkingRef: RefObject<HTMLDivElement | null>;
  sideSlotRef: RefObject<HTMLDivElement | null>;
  dialogRef: RefObject<HTMLDialogElement | null>;
  dialogSlotRef: RefObject<HTMLDivElement | null>;
};

type MicroHostValue = Pick<MicroHostController, "presence" | "revision" | "slotVersion" | "slotOwner" | "cardSlot" | "cardOwner" | "open" | "setForm" | "close" | "clear" | "dismissSide" | "registerSlot" | "registerCard">;

const EMPTY_MICRO_HOST: MicroHostValue = {
  presence: null,
  revision: 0,
  slotVersion: 0,
  slotOwner: () => null,
  cardSlot: () => null,
  cardOwner: () => null,
  open: () => undefined,
  setForm: () => undefined,
  close: () => undefined,
  clear: () => undefined,
  dismissSide: () => undefined,
  registerSlot: () => () => undefined,
  registerCard: () => () => undefined
};

const MicroHostContext = createContext<MicroHostValue>(EMPTY_MICRO_HOST);

function loadMicroPath(input: MicroOpenInput | null) {
  if (!input) return null;
  return applicationServices.microLearningRepository.getPath(input.knowledgeId, {
    mode: "learn",
    pathId: input.pathId,
    ...(input.courseId ? { courseId: input.courseId } : {})
  });
}

function visibleRect(element: HTMLElement | null) {
  if (!element || !element.isConnected || element.hidden) return null;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

/** The immediately-latest card is the last one in conversation document order. */
function latest(list: SlotEntry[] | undefined) {
  if (!list?.length) return null;
  const connected = list.filter((entry) => entry.element.isConnected);
  if (!connected.length) return list[list.length - 1];
  return connected.reduce((last, entry) => (
    last.element.compareDocumentPosition(entry.element) & Node.DOCUMENT_POSITION_FOLLOWING ? entry : last
  ));
}

function focusWithoutScroll(element: HTMLElement | null | undefined) {
  if (element?.isConnected && element.getClientRects().length) element.focus({ preventScroll: true });
}

export function useMicroHostController(options: {
  session: MockSession;
  conversationKey: string | null;
}): MicroHostController {
  const { session, conversationKey } = options;
  const reducedMotion = Boolean(useReducedMotion());
  const [state, dispatch] = useReducer(reduceMicroPresence, { presence: null } as MicroPresenceState);
  const [revision, setRevision] = useState(0);
  const [slotsVersion, setSlotsVersion] = useState(0);
  const [container] = useState(() => {
    const element = document.createElement("div");
    element.className = "ef-micro-instance";
    element.hidden = true;
    return element;
  });
  const slots = useRef<SlotRegistry>(new Map());
  const cards = useRef<SlotRegistry>(new Map());
  const parkingRef = useRef<HTMLDivElement>(null);
  const sideSlotRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogSlotRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef<{ pathId: string; form: MicroForm } | null>(null);
  const pendingHeightRef = useRef<{ pathId: string; height: number } | null>(null);
  const activeAnimationRef = useRef<ReturnType<typeof animate> | null>(null);
  const skipFlyRef = useRef(false);
  const transitionOriginRef = useRef<DOMRect | null>(null);
  const inlineSettleFrame = useRef(0);
  const inlineSettleCleanup = useRef<(() => void) | null>(null);
  const previousConversationKey = useRef(conversationKey);
  const previousForm = useRef<MicroForm | "none">("none");
  const inlineUserScrolledRef = useRef(false);

  useEffect(() => applicationServices.microLearningRepository.subscribe(() => setRevision((value) => value + 1)), []);

  const path = useMemo(
    () => loadMicroPath(state.presence),
    // The repository is the revision source; reading it here keeps the runner
    // current when a step is graded or the same path is re-published.
    [state.presence?.pathId, state.presence?.knowledgeId, state.presence?.courseId, revision]
  );

  const latestCard = useCallback((pathId: string) => latest(cards.current.get(pathId))?.element ?? null, []);
  const visibleSlot = useCallback((pathId: string) => {
    const list = slots.current.get(pathId) ?? [];
    const visible = list.filter((entry) => entry.element.getClientRects().length > 0 && !entry.element.classList.contains("ef-micro-slot-standby"));
    return latest(visible.length ? visible : list);
  }, []);
  const latestSlot = useCallback((pathId: string) => visibleSlot(pathId)?.element ?? null, [visibleSlot]);
  const slotOwner = useCallback((pathId: string) => visibleSlot(pathId)?.key ?? null, [visibleSlot]);
  const cardSlot = useCallback((pathId: string, key?: string) => {
    if (!key) return null;
    return (slots.current.get(pathId) ?? []).find((entry) => entry.key === key)?.element ?? null;
  }, []);
  const cardOwner = useCallback((pathId: string) => latest(cards.current.get(pathId))?.key ?? null, []);

  const registerIn = useCallback((map: SlotRegistry, pathId: string, entry: SlotEntry) => {
    const list = (map.get(pathId) ?? []).filter((item) => item.element !== entry.element);
    list.push(entry);
    map.set(pathId, list);
    setSlotsVersion((value) => value + 1);
    return () => {
      const current = map.get(pathId);
      if (!current) return;
      const next = current.filter((item) => item.element !== entry.element);
      if (next.length) map.set(pathId, next);
      else map.delete(pathId);
      setSlotsVersion((value) => value + 1);
    };
  }, []);

  const registerSlot = useCallback((pathId: string, key: string, element: HTMLElement) => registerIn(slots.current, pathId, { key, element }), [registerIn]);
  const registerCard = useCallback((pathId: string, key: string, element: HTMLElement, kind?: string) => registerIn(cards.current, pathId, { key, element, ...(kind ? { kind } : {}) }), [registerIn]);

  const dialogOpen = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
  }, []);

  const dialogClose = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
  }, []);

  const park = useCallback(() => {
    const parking = parkingRef.current;
    if (!parking) return;
    if (container.parentElement !== parking) parking.appendChild(container);
    container.hidden = true;
    container.style.position = "";
    container.style.left = "";
    container.style.top = "";
    container.style.width = "";
    container.style.height = "";
    container.style.margin = "";
    container.style.zIndex = "";
    skipFlyRef.current = false;
  }, [container]);

  const resetAnimation = useCallback(() => {
    activeAnimationRef.current?.cancel();
    activeAnimationRef.current = null;
    container.classList.remove("ef-micro-morphing");
    container.style.position = "";
    container.style.left = "";
    container.style.top = "";
    container.style.width = "";
    container.style.height = "";
    container.style.margin = "";
    container.style.zIndex = "";
    container.style.transform = "";
    container.style.transformOrigin = "";
    container.style.visibility = "";
    dialogRef.current?.removeAttribute("data-morphing");
  }, [container]);

  const fly = useCallback((from: DOMRect, to: DOMRect, duration: number, trackTarget = false) => {
    if (reducedMotion || !from.width || !from.height || !to.width || !to.height) return;
    if (Math.abs(from.width - to.width) < 1 && Math.abs(from.height - to.height) < 1 && Math.abs(from.left - to.left) < 1 && Math.abs(from.top - to.top) < 1) return;
    const parent = container.parentElement as HTMLElement | null;
    const slot = parent?.classList.contains("ef-micro-slot") ? parent : null;
    const previousMin = slot?.style.minHeight ?? "";
    if (slot && !trackTarget) slot.style.minHeight = `${to.height}px`;
    // Keep the final layout size, then FLIP it from the old visual rectangle.
    // This avoids reflowing the interaction while it is flying between forms.
    const scaleX = from.width / to.width;
    const scaleY = from.height / to.height;
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (trackTarget) {
      // The inline target moves while Home's history column animates back.
      // Keep the container in flow and decay a relative transform to zero, so
      // the card travels with the real column instead of flying to a stale
      // rectangle and snapping on the last frame.
      container.style.transformOrigin = "top left";
      container.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
    } else {
      container.style.position = "fixed";
      container.style.left = `${to.left}px`;
      container.style.top = `${to.top}px`;
      container.style.width = `${to.width}px`;
      container.style.height = `${to.height}px`;
      container.style.margin = "0";
      container.style.zIndex = "130";
      container.style.transformOrigin = "top left";
      container.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
    }
    container.classList.add("ef-micro-morphing");
    if (parent?.classList.contains("ef-micro-focus-slot")) dialogRef.current?.setAttribute("data-morphing", "1");
    activeAnimationRef.current?.cancel();
    const controls = animate(container, {
      transform: [`translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`, "translate(0px, 0px) scale(1, 1)"]
    }, { duration: duration / 1000, ease: EASE_OUT });
    activeAnimationRef.current = controls;
    void controls.finished.catch(() => undefined).then(() => {
      if (activeAnimationRef.current !== controls) return;
      activeAnimationRef.current = null;
      controls.cancel();
      resetAnimation();
      if (slot) slot.style.minHeight = previousMin;
    });
  }, [container, reducedMotion, resetAnimation]);

  const place = useCallback((target: HTMLElement | null, origin: DOMRect | null, duration: number) => {
    if (!target) { resetAnimation(); park(); return; }
    // Re-registering the same slot must not cancel an animation already
    // heading to that target.
    if (container.parentElement === target && !container.hidden) return;
    const from = visibleRect(container) ?? origin;
    resetAnimation();
    container.hidden = false;
    const inlineSlot = target.classList.contains("ef-micro-slot") && !target.classList.contains("ef-micro-slot-standby");
    const preAlign = Boolean(from && !skipFlyRef.current && inlineSlot);
    target.appendChild(container);
    if (preAlign) {
      // The card scroll position must be final before we measure the flight
      // target. Otherwise the animation lands on the pre-scroll rectangle and
      // jumps by the scroll delta on the last frame.
      const scroller = target.closest<HTMLElement>(".ef-home-scroller");
      const frame = target.closest<HTMLElement>(".ef-assistant-micro-frame");
      if (scroller && frame) {
        scroller.dataset.cardOpen = "1";
        window.dispatchEvent(new CustomEvent("eduflow:conversation-card-opening"));
        alignConversationElement(scroller, frame, { smooth: false });
      }
      // Start the FLIP only after the card scroll position is stable, so a
      // late re-align cannot move the page after the animation has finished
      // and look like a final-frame jump. The tracked transform still absorbs
      // any column-width motion while the animation runs.
      const started = performance.now();
      let lastKey = "";
      let stableFrames = 0;
      const start = () => {
        const frameTop = frame?.getBoundingClientRect().top ?? 0;
        const key = `${Math.round(frameTop * 10)}:${scroller?.scrollTop ?? 0}`;
        if (key === lastKey) stableFrames += 1;
        else { lastKey = key; stableFrames = 0; }
        const aligned = !frame || Math.abs(frameTop - 72) <= 1;
        if ((stableFrames >= 2 && aligned) || performance.now() - started > 500) {
          const to = container.getBoundingClientRect();
          if (from && !skipFlyRef.current) fly(from, to, duration, true);
          skipFlyRef.current = false;
          return;
        }
        window.requestAnimationFrame(start);
      };
      window.requestAnimationFrame(start);
      return;
    }
    const to = container.getBoundingClientRect();
    if (from && !skipFlyRef.current) fly(from, to, duration);
    skipFlyRef.current = false;
  }, [container, fly, park, resetAnimation]);

  const growCard = useCallback((pathId: string, fromHeight: number) => {
    if (reducedMotion) return;
    const element = latestCard(pathId);
    if (!element) return;
    const toHeight = element.getBoundingClientRect().height;
    if (!fromHeight || Math.abs(fromHeight - toHeight) < 1) return;
    const previousOverflow = element.style.overflow;
    const previousHeight = element.style.height;
    element.style.overflow = "hidden";
    const controls = animate(element, { height: [`${fromHeight}px`, `${toHeight}px`] }, { duration: GROW_MS / 1000, ease: EASE_OUT });
    void controls.finished.catch(() => undefined).then(() => {
      controls.cancel();
      element.style.height = previousHeight;
      element.style.overflow = previousOverflow;
    });
  }, [latestCard, reducedMotion]);

  const requestHeight = useCallback((pathId: string) => {
    const element = latestCard(pathId);
    if (!element) return;
    pendingHeightRef.current = { pathId, height: element.getBoundingClientRect().height };
    skipFlyRef.current = true;
  }, [latestCard]);

  const preferredForm = useCallback((input: MicroOpenInput): MicroNonFocusForm => {
    const target = loadMicroPath(input);
    const base = defaultMicroForm(target?.units.length ?? 1);
    return preferredMicroForm(base, readMicroFormPreference());
  }, []);

  const captureOrigin = useCallback(() => {
    transitionOriginRef.current = visibleRect(container);
  }, [container]);

  const open = useCallback((input: MicroOpenInput, form?: MicroForm) => {
    const current = stateRef.current.presence;
    const hasInlineCard = timelineHasCard(input.pathId) || Boolean(input.cardKey);
    inlineUserScrolledRef.current = false;
    // The single Micro entry starts a fresh scroll-follow window, whether it
    // came from a card button, the next-step strip or a route step.
    window.dispatchEvent(new Event("eduflow:learner-action-start"));
    captureOrigin();
    const preferred = preferredForm(input);
    const base: MicroNonFocusForm = preferred === "inline" && !hasInlineCard ? "side" : preferred;
    let next: MicroForm = form ?? base;
    if (next === "inline" && !hasInlineCard) next = "side";
    if (current?.form === "focus" && next !== "focus") restoreFocusRef.current = { pathId: current.pathId, form: next };
    if ((current?.form === "inline" && next === "closed") || ((!current || current.form === "closed") && next === "inline")) {
      requestHeight(current && current.pathId === input.pathId ? current.pathId : input.pathId);
    }
    if (next === "focus") focusReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (next !== "focus") restoreFocusRef.current = { pathId: input.pathId, form: next };
    if (next !== "closed") writeMicroFormPreference(next);
    dispatch({ type: "open", input, form: next, defaultForm: base });
  }, [captureOrigin, latestCard, preferredForm, requestHeight]);

  const setForm = useCallback((form: MicroForm) => {
    const current = stateRef.current.presence;
    if (!current || current.form === form) return;
    // A conversation card must exist before the runner can move into it. Never
    // leave an invisible inline state behind.
    if (form === "inline" && !timelineHasCard(current.pathId)) return;
    captureOrigin();
    if (form === "focus") focusReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (form !== "focus") restoreFocusRef.current = { pathId: current.pathId, form };
    if ((current.form === "inline" && form === "closed") || (current.form === "closed" && form === "inline")) requestHeight(current.pathId);
    if (form !== "closed") writeMicroFormPreference(form);
    dispatch({ type: "set-form", form });
  }, [captureOrigin, latestCard, requestHeight]);

  const close = useCallback(() => setForm("closed"), [setForm]);

  const clear = useCallback(() => {
    const current = stateRef.current.presence;
    if (current?.form === "inline") requestHeight(current.pathId);
    dispatch({ type: "clear" });
  }, [requestHeight]);

  const dismissSide = useCallback(() => {
    if (stateRef.current.presence?.form === "side") dispatch({ type: "dismiss-side" });
  }, []);

  const exitFocus = useCallback(() => {
    const current = stateRef.current.presence;
    if (!current || current.form !== "focus") return;
    setForm(current.returnForm);
  }, [setForm]);

  const handleCompleted = useCallback(() => {
    const current = stateRef.current.presence;
    if (!current) return;
    // Completion updates the same card in place. Never collapse, hide or move
    // it; the learner decides when to close it.
    if (current.form === "inline") requestHeight(current.pathId);
  }, [requestHeight]);

  const stopInlineSettle = useCallback(() => {
    if (inlineSettleFrame.current) window.cancelAnimationFrame(inlineSettleFrame.current);
    inlineSettleFrame.current = 0;
    inlineSettleCleanup.current?.();
    inlineSettleCleanup.current = null;
  }, []);

  /**
   * The card owns the scroll position while it is inline. Keep it pinned for a
   * short settle window: a delayed conversation load, an image/font, or the
   * open height animation must not leave the card half-scrolled. A real wheel,
   * touch or pointer interaction hands control back immediately.
   */
  const alignInline = useCallback((smooth = false, settle = true) => {
    const frame = container.closest<HTMLElement>(".ef-assistant-micro-frame");
    const scroller = container.closest<HTMLElement>(".ef-home-scroller");
    if (!frame || !scroller) return;
    // A learner who scrolled the conversation upward keeps control. Clicking a
    // step must not re-pin the card and drag the conversation back down.
    if (inlineUserScrolledRef.current) { stopInlineSettle(); return; }
    scroller.dataset.cardOpen = "1";
    window.dispatchEvent(new CustomEvent("eduflow:conversation-card-opening"));
    // Content growth (for example feedback) may only update the trailing room;
    // once the learner has scrolled the card away, do not snap it back.
    if (!settle) stopInlineSettle();
    if (!settle && Math.abs(frame.getBoundingClientRect().top - 72) > 1) return;
    alignConversationElement(scroller, frame, { smooth });
    if (!settle) return;
    stopInlineSettle();
    const until = performance.now() + 1200;
    const cancel = () => stopInlineSettle();
    scroller.addEventListener("wheel", cancel, { passive: true, once: true });
    scroller.addEventListener("touchmove", cancel, { passive: true, once: true });
    scroller.addEventListener("pointerdown", cancel, { once: true });
    inlineSettleCleanup.current = () => {
      scroller.removeEventListener("wheel", cancel);
      scroller.removeEventListener("touchmove", cancel);
      scroller.removeEventListener("pointerdown", cancel);
    };
    const tick = () => {
      inlineSettleFrame.current = 0;
      if (!frame.isConnected || !container.closest(".ef-home-scroller")) { stopInlineSettle(); return; }
      if (Math.abs(frame.getBoundingClientRect().top - 72) > 1) alignConversationElement(scroller, frame, { smooth: false });
      if (performance.now() < until) inlineSettleFrame.current = window.requestAnimationFrame(tick);
      else stopInlineSettle();
    };
    inlineSettleFrame.current = window.requestAnimationFrame(tick);
  }, [container, stopInlineSettle]);

  useEffect(() => () => stopInlineSettle(), [stopInlineSettle]);

  // `data-micro-bar` means the running step's action bar is actually docked on
  // the composer, not merely that the card is somewhere in view. Only that
  // state needs the opaque composer seam; a short step keeps the normal glass.
  useLayoutEffect(() => {
    if (state.presence?.form !== "inline") return;
    const frame = container.closest<HTMLElement>(".ef-assistant-micro-frame");
    const scroller = container.closest<HTMLElement>(".ef-home-scroller");
    if (!frame || !scroller) return;
    let queued = 0;
    const update = () => {
      queued = 0;
      const footer = frame.querySelector<HTMLElement>(".micro-card footer");
      const composer = scroller.querySelector<HTMLElement>(".ef-home-composer");
      if (!footer || !composer) { delete scroller.dataset.microBar; return; }
      const footerBox = footer.getBoundingClientRect();
      const composerBox = composer.getBoundingClientRect();
      // The sticky footer docks when its bottom reaches the composer top.
      if (footerBox.bottom >= composerBox.top - 2 && footerBox.top < composerBox.top) scroller.dataset.microBar = "1";
      else delete scroller.dataset.microBar;
    };
    const schedule = () => { if (!queued) queued = window.requestAnimationFrame(update); };
    update();
    scroller.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    const composer = scroller.querySelector<HTMLElement>(".ef-home-composer");
    if (composer) observer.observe(composer);
    // A step change swaps the footer under the same form; update before paint
    // so the composer never flashes the previous docked/undocked surface.
    const mutations = new MutationObserver(update);
    mutations.observe(frame, { childList: true, subtree: true });
    return () => {
      if (queued) window.cancelAnimationFrame(queued);
      scroller.removeEventListener("scroll", schedule);
      observer.disconnect();
      mutations.disconnect();
      delete scroller.dataset.microBar;
    };
  }, [container, slotsVersion, state.presence?.form]);

  // Track a real upward scroll while the inline runner is open. Only wheel,
  // touch and keyboard scroll count; clicks and programmatic alignment do not.
  useEffect(() => {
    if (state.presence?.form !== "inline") return;
    const scroller = container.closest<HTMLElement>(".ef-home-scroller");
    if (!scroller) return;
    const onWheel = (event: WheelEvent) => { if (event.deltaY < 0) inlineUserScrolledRef.current = true; };
    const onTouch = () => { inlineUserScrolledRef.current = true; };
    const onKey = (event: KeyboardEvent) => {
      if (["PageUp", "Home", "ArrowUp"].includes(event.key)) inlineUserScrolledRef.current = true;
    };
    scroller.addEventListener("wheel", onWheel, { passive: true });
    scroller.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("touchmove", onTouch);
      window.removeEventListener("keydown", onKey);
    };
  }, [container, state.presence?.form, state.presence?.pathId]);

  // Any interaction inside the inline runner can change its height (a selected
  // answer, a simulation step). Let the card settle back to its pinned top.
  useEffect(() => {
    if (state.presence?.form !== "inline") return;
    const onClick = () => {
      window.setTimeout(() => alignInline(false, true), 0);
    };
    container.addEventListener("click", onClick);
    return () => container.removeEventListener("click", onClick);
  }, [alignInline, container, state.presence?.form]);

  // A conversation switch collapses only the in-conversation form. Side and
  // immersive keep running because their form is independent of the timeline.
  useLayoutEffect(() => {
    if (previousConversationKey.current === conversationKey) return;
    previousConversationKey.current = conversationKey;
    if (stateRef.current.presence?.form === "inline") dispatch({ type: "set-form", form: "closed" });
  }, [conversationKey]);

  useLayoutEffect(() => {
    const presence = state.presence;
    const origin = transitionOriginRef.current ?? visibleRect(container) ?? visibleRect(presence ? latestCard(presence.pathId) : null);
    transitionOriginRef.current = null;
    if (!presence || presence.form === "closed") {
      dialogClose();
      park();
    } else if (presence.form === "focus") {
      dialogOpen();
      place(dialogSlotRef.current, origin, MORPH_MS);
      window.requestAnimationFrame(() => {
        const button = dialogRef.current?.querySelector<HTMLElement>('[data-micro-form="focus"]');
        focusWithoutScroll(button);
      });
    } else {
      dialogClose();
      const target = presence.form === "side"
        ? sideSlotRef.current
        : cardSlot(presence.pathId, presence.cardKey) ?? (presence.cardKey ? null : latestSlot(presence.pathId));
      if (target) place(target, origin, MORPH_MS);
      else park();
    }

    if (presence?.form !== "inline") stopInlineSettle();

    const heightRequest = pendingHeightRef.current;
    if (heightRequest && (presence?.form === "inline" || presence?.form === "closed" || !presence)) {
      pendingHeightRef.current = null;
      window.requestAnimationFrame(() => growCard(heightRequest.pathId, heightRequest.height));
    } else if (heightRequest && presence?.form !== "inline") {
      pendingHeightRef.current = null;
    }

    const restore = restoreFocusRef.current;
    if (restore && presence?.form !== "focus") {
      restoreFocusRef.current = null;
      window.requestAnimationFrame(() => {
        const stored = focusReturnRef.current;
        focusReturnRef.current = null;
        if (stored?.isConnected && stored.getClientRects().length) { focusWithoutScroll(stored); return; }
        const root = restore.form === "inline" ? latestCard(restore.pathId) : restore.form === "side" ? sideSlotRef.current : null;
        const selector = restore.form === "closed" ? '[data-micro-action="open"]' : `[data-micro-form="${restore.form}"]`;
        const visible = [...(root?.querySelectorAll<HTMLElement>(selector) ?? []), ...document.querySelectorAll<HTMLElement>(selector)].find((element) => element.getClientRects().length > 0);
        focusWithoutScroll(visible);
      });
    }
    if (presence?.form === "inline") {
      const scroller = container.closest<HTMLElement>(".ef-home-scroller");
      if (scroller) scroller.dataset.cardOpen = "1";
      window.dispatchEvent(new CustomEvent("eduflow:conversation-card-opening"));
      window.requestAnimationFrame(() => alignInline(false));
    }
    return () => undefined;
    // slotsVersion re-attaches when a card slot appears/disappears; form decides the target.
  }, [state.presence, slotsVersion, reducedMotion, stopInlineSettle, cardSlot, latestSlot]);

  useLayoutEffect(() => {
    const was = previousForm.current;
    previousForm.current = state.presence?.form ?? "none";
    if (was === "inline" && state.presence?.form !== "inline") {
      const scroller = document.querySelector<HTMLElement>(".ef-home-scroller");
      clearConversationTail(scroller);
      if (scroller) delete scroller.dataset.cardOpen;
    }
  }, [container, state.presence?.form]);

  const value = useMemo<MicroHostValue>(() => ({
    presence: state.presence,
    revision,
    slotVersion: slotsVersion,
    slotOwner,
    cardSlot,
    cardOwner,
    open,
    setForm,
    close,
    clear,
    dismissSide,
    registerSlot,
    registerCard
  }), [state.presence, revision, slotsVersion, slotOwner, cardSlot, cardOwner, open, setForm, close, clear, dismissSide, registerSlot, registerCard]);

  return {
    ...value,
    path,
    exitFocus,
    handleCompleted,
    alignInline,
    container,
    parkingRef,
    sideSlotRef,
    dialogRef,
    dialogSlotRef
  };
}

export function MicroHostProvider({ host, children }: { host: MicroHostController; children: ReactNode }) {
  const { presence, revision, slotVersion, slotOwner, cardSlot, cardOwner, open, setForm, close, clear, dismissSide, registerSlot, registerCard } = host;
  const value = useMemo<MicroHostValue>(() => ({
    presence,
    revision,
    slotVersion,
    slotOwner,
    cardSlot,
    cardOwner,
    open,
    setForm,
    close,
    clear,
    dismissSide,
    registerSlot,
    registerCard
  }), [presence, revision, slotVersion, slotOwner, cardSlot, cardOwner, open, setForm, close, clear, dismissSide, registerSlot, registerCard]);
  return <MicroHostContext.Provider value={value}>{children}</MicroHostContext.Provider>;
}

export function useMicroHost(): MicroHostValue {
  return useContext(MicroHostContext);
}

/** One entry for the Micro, Knowledge and Route cards. */
export function useMicroEntry(input: { pathId?: string; knowledgeId?: string; courseId?: string; userId?: string; cardKey?: string }) {
  const host = useMicroHost();
  const { pathId, knowledgeId, courseId, userId, cardKey } = input;
  const [starting, setStarting] = useState(false);
  const path = useMemo(() => {
    if (!knowledgeId) return null;
    return applicationServices.microLearningRepository.getPath(knowledgeId, {
      mode: "learn",
      ...(courseId ? { courseId } : {}),
      ...(pathId ? { pathId } : {})
    });
  }, [knowledgeId, pathId, courseId, host.revision]);
  const actualPathId = path?.id ?? pathId ?? "";
  const progress = actualPathId ? applicationServices.microLearningRepository.getPathProgress(actualPathId) : undefined;
  const completed = progress?.status === "completed";
  const active = Boolean(host.presence && actualPathId && host.presence.pathId === actualPathId);
  const form = active ? host.presence!.form : "closed";
  const totalSteps = path?.units.reduce((total, unit) => total + unit.steps.length, 0) ?? 0;
  const resumeUnit = path?.units.find((unit) => unit.id === progress?.currentUnitId)
    ?? path?.units.find((unit) => applicationServices.microLearningRepository.getUnitProgress(unit.id)?.status !== "completed");
  const countedSteps = path?.units.reduce((total, unit) => total + (applicationServices.microLearningRepository.getUnitProgress(unit.id)?.completedStepIds.length ?? 0), 0) ?? 0;
  const resumeIndex = path && resumeUnit && progress?.currentStepId
    ? path.units.filter((unit) => unit.position < resumeUnit.position).reduce((total, unit) => total + unit.steps.length, 0) + Math.max(0, resumeUnit.steps.findIndex((step) => step.id === progress.currentStepId))
    : 0;
  const completeSteps = completed ? totalSteps : Math.max(countedSteps, progress ? resumeIndex : 0);
  const open = useCallback((nextForm?: MicroForm) => {
    if (!path || !knowledgeId) return;
    host.open({ pathId: path.id, knowledgeId, ...(courseId ? { courseId } : {}), ...(cardKey ? { cardKey } : {}) }, nextForm);
  }, [cardKey, courseId, host, knowledgeId, path]);
  /** The card's primary/secondary entries get the real runner started first. */
  const openWithStart = useCallback(async (nextForm?: MicroForm) => {
    if (!path || !knowledgeId || starting) return;
    if (!progress || progress.status === "not_started") {
      setStarting(true);
      try {
        await applicationServices.microLearningRepository.start(path.id, courseId);
        if (userId) void refreshLearnerState(userId).catch(() => undefined);
      } catch {
        setStarting(false);
        return;
      }
      setStarting(false);
    }
    host.open({ pathId: path.id, knowledgeId, ...(courseId ? { courseId } : {}), ...(cardKey ? { cardKey } : {}) }, nextForm);
  }, [cardKey, courseId, host, knowledgeId, path, progress, starting, userId]);
  return { path, pathId: actualPathId, knowledgeId: knowledgeId ?? "", courseId, progress, completed, active, form, starting, totalSteps, completeSteps, open, openWithStart, collapse: host.close, dismiss: host.dismissSide };
}

/** Registers the latest mounted card as the inline slot for a path. */
export function MicroSlot({ pathId, slotKey, className = "ef-assistant-micro-body", children }: { pathId: string; slotKey: string; className?: string; children?: ReactNode }) {
  const { registerSlot } = useMicroHost();
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    return registerSlot(pathId, slotKey, node);
  }, [registerSlot, pathId, slotKey]);
  return <div ref={ref} className={`${className} ef-micro-slot`} data-micro-slot={pathId} data-micro-slot-key={slotKey}>{children}</div>;
}

export function MicroCardAnchor({ pathId, cardKey, children }: { pathId: string; cardKey: string; children: (ref: (node: HTMLElement | null) => void) => ReactNode }) {
  const { registerCard } = useMicroHost();
  const ref = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    return registerCard(pathId, cardKey, node);
  }, [registerCard, pathId, cardKey]);
  return <>{children(ref)}</>;
}

export function MicroFormSwitch({ current, onChange, label = "切换小练习形态", allowInline = true }: { current: MicroForm; onChange(form: MicroForm): void; label?: string; allowInline?: boolean }) {
  const forms: Array<{ form: Exclude<MicroForm, "closed">; label: string; icon: ReactNode }> = [
    ...(allowInline ? [{ form: "inline" as const, label: "对话内", icon: <MessageSquare size={13} aria-hidden="true" /> }] : []),
    { form: "side", label: "侧边", icon: <PanelRight size={13} aria-hidden="true" /> },
    { form: "focus", label: "沉浸", icon: <Maximize2 size={13} aria-hidden="true" /> }
  ];
  return <div className="ef-micro-seg" role="group" aria-label={label}>
    {forms.map((item) => <button key={item.form} type="button" data-micro-form={item.form} aria-pressed={current === item.form} title={`切换到${item.label}`} onClick={() => onChange(item.form)}>{item.icon}{item.label}</button>)}
  </div>;
}

/** Side workspace, modal dialog and the one fixed portal container. */
export function MicroHostLayer({ host, session }: { host: MicroHostController; session: MockSession }) {
  const reducedMotion = Boolean(useReducedMotion());
  const presence = host.presence;
  const path = host.path;
  const form = presence?.form ?? "closed";
  const panelForm = form === "side" || form === "focus";
  const alignStep = useCallback(() => host.alignInline(false, true), [host.alignInline]);
  const alignContent = useCallback(() => host.alignInline(false, false), [host.alignInline]);
  useEffect(() => {
    if (form !== "focus") return;
    function focusable() {
      const dialog = host.dialogRef.current;
      if (!dialog) return [];
      return [...dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')].filter((element) => element.getClientRects().length > 0);
    }
    function keepFocusInside(event: FocusEvent) {
      const dialog = host.dialogRef.current;
      if (!dialog?.open) return;
      if (event.target instanceof Node && dialog.contains(event.target)) return;
      const first = focusable()[0];
      if (first) first.focus({ preventScroll: true });
    }
    // Native modal focus can land on <body> after the last control; a
    // document-level Tab trap keeps the next stop inside the dialog.
    function keepTabInside(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const dialog = host.dialogRef.current;
      if (!dialog?.open) return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!(active instanceof Node) || !dialog.contains(active)) {
        event.preventDefault();
        event.stopPropagation();
        first.focus({ preventScroll: true });
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        event.stopPropagation();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        event.stopPropagation();
        first.focus({ preventScroll: true });
      }
    }
    document.addEventListener("focusin", keepFocusInside);
    document.addEventListener("keydown", keepTabInside, true);
    return () => {
      document.removeEventListener("focusin", keepFocusInside);
      document.removeEventListener("keydown", keepTabInside, true);
    };
  }, [form, host.dialogRef]);

  return <>
    <div ref={host.parkingRef} className="ef-micro-parking" hidden aria-hidden="true" />
    {form === "side" ? <div className="ef-home-workspace ef-micro-side" aria-label="小练习工作区">
      <div ref={host.sideSlotRef} className="ef-micro-side-slot" />
    </div> : null}
    <dialog
      ref={host.dialogRef}
      className="ef-micro-focus"
      aria-label="沉浸小练习"
      onCancel={(event) => { event.preventDefault(); host.exitFocus(); }}
      onClick={(event) => { if (event.target === event.currentTarget) host.exitFocus(); }}
    >
      <div className={`ef-micro-focus-frame${reducedMotion ? " is-reduced" : ""}`}>
        <div ref={host.dialogSlotRef} className="ef-micro-focus-slot" />
      </div>
    </dialog>
    {createPortal(path && presence ? <InlineMicro
      key={path.id}
      path={path}
      knowledgeId={presence.knowledgeId}
      courseId={presence.courseId}
      session={session}
      surface={panelForm ? "panel" : "inline"}
      hideHeader={!panelForm}
      formControls={panelForm ? <MicroFormSwitch current={form} onChange={host.setForm} label={`切换 ${path.title} 的形态`} allowInline={timelineHasCard(presence.pathId)} /> : undefined}
      onFormChange={host.setForm}
      onCompleted={host.handleCompleted}
      onClose={panelForm ? host.close : undefined}
      onStepChange={alignStep}
      onContentChange={alignContent}
    /> : null, host.container)}
  </>;
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { AssistantUIMessage } from "@/features/assistant/AssistantRuntimeContext";
import {
  alignConversationCompletion,
  alignConversationElement,
  completionScrollTarget,
  contentGap,
  conversationAvailableHeight,
  keyboardScrollTop,
  pinSpaceHeight,
  scrollConversationToLatest,
  scrollTopToReveal,
  shouldShowJump,
  syncConversationComposerHeight
} from "@/shared/ui/conversationScroll";

type ConversationScrollInput = {
  conversationKey: string | null;
  messages: AssistantUIMessage[];
  sending: boolean;
  scrollerRef: RefObject<HTMLDivElement | null>;
  titleBarRef: RefObject<HTMLElement | null>;
  composerRef: RefObject<HTMLDivElement | null>;
  tailRef: RefObject<HTMLDivElement | null>;
};

function lastUserElement(scroller: HTMLElement) {
  const rows = scroller.querySelectorAll<HTMLElement>(".ef-home-message-row[data-role='user'], .ef-assistant-action-user-row[data-role='user']");
  return rows.length ? rows[rows.length - 1] : null;
}

function openMicroCard(scroller: HTMLElement) {
  const frames = scroller.querySelectorAll<HTMLElement>(".ef-assistant-micro-frame");
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const body = frames[index].querySelector<HTMLElement>(".ef-assistant-micro-body:not(.ef-micro-slot-standby)");
    if (body && body.getClientRects().length > 0) return frames[index];
  }
  return null;
}

function actionKey(message: AssistantUIMessage): string {
  return message.metadata?.dedupeKey ?? "";
}

function isActionMessage(message: AssistantUIMessage): boolean {
  return message.metadata?.messageKind === "action" || Boolean(actionKey(message));
}

/** The learner's own completion event, identified by the server action key. */
function isCompletionAction(message: AssistantUIMessage): boolean {
  return message.role === "user" && /^(micro-completed|practice-submitted):/.test(actionKey(message));
}

/** A new Micro or Assignment is starting: a fresh follow window begins. */
function isActionStart(message: AssistantUIMessage): boolean {
  return /^(micro-opened|practice-opened|route-started):/.test(actionKey(message));
}

/** Server-owned completion replies whose arrival should reveal themselves. */
function isCompletionReply(message: AssistantUIMessage): boolean {
  if (message.role !== "assistant") return false;
  const key = actionKey(message);
  return /^(micro-completed|practice-submitted):.+:assistant$/.test(key)
    || /^(practice-evaluated|segment-cleared|chapter-completed):/.test(key);
}

export function completionReplyFor(messages: readonly AssistantUIMessage[], newIds: ReadonlySet<string>): string | null {
  const fresh = messages.filter((message) => newIds.has(message.id));
  let found: string | null = null;
  for (const message of fresh) {
    if (isCompletionReply(message)) found = message.id;
  }
  return found;
}

/**
 * Three scroll rules only:
 * 1. A conversation opens at its latest content.
 * 2. A sent message is pinned below the title bar by a trailing spacer.
 * 3. Once the learner scrolls, nothing moves the conversation for them.
 */
export function useConversationScroll({
  conversationKey,
  messages,
  sending,
  scrollerRef,
  titleBarRef,
  composerRef,
  tailRef
}: ConversationScrollInput) {
  const [showJump, setShowJump] = useState(false);
  const userScrolled = useRef(false);
  const pinned = useRef(false);
  // After "回到最新" the learner keeps following streaming content until they
  // scroll upward again; sending still uses the pinned-user-message rule.
  const following = useRef(false);
  const followBottom = useRef(0);
  const pinnedScrollTop = useRef(0);
  const initialDone = useRef(false);
  const initialWindowUntil = useRef(0);
  const initialFrame = useRef(0);
  const lastUserId = useRef<string | null>(null);
  const firstMessageId = useRef<string | null>(null);
  // Only a real input gesture (wheel, touch, keyboard, scrollbar drag) sets
  // this. Programmatic scrolls and layout clamps must never look like the
  // learner scrolling away.
  const learnerScrolledUp = useRef(false);
  const lastScrollTop = useRef(0);
  const scrollbarDrag = useRef(false);
  const seenMessageIds = useRef<Set<string>>(new Set());
  const followReply = useRef<{ messageId: string; until: number; target?: number; appliedAt?: number } | null>(null);
  const keyRef = useRef(conversationKey);
  const sendingRef = useRef(sending);
  sendingRef.current = sending;

  const syncComposer = useCallback(() => {
    syncConversationComposerHeight(scrollerRef.current);
  }, [scrollerRef]);

  const updateJump = useCallback(() => {
    const scroller = scrollerRef.current;
    const tail = tailRef.current;
    const composer = composerRef.current;
    if (!scroller || !composer) return;
    if (tail) {
      setShowJump(shouldShowJump(contentGap(tail.getBoundingClientRect().top, composer.getBoundingClientRect().top)));
      return;
    }
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    setShowJump(shouldShowJump(distance));
  }, [composerRef, scrollerRef, tailRef]);

  const cancelInitialSettle = useCallback(() => {
    if (!initialFrame.current) return;
    window.cancelAnimationFrame(initialFrame.current);
    initialFrame.current = 0;
  }, []);

  const markUserScroll = useCallback(() => {
    userScrolled.current = true;
    pinned.current = false;
    following.current = false;
    cancelInitialSettle();
  }, [cancelInitialSettle]);

  /**
   * A conversation opens at its latest content. Cards may hydrate a frame or
   * two later, so settle with the browser's own frames instead of a timer;
   * any learner scroll cancels this immediately.
   */
  const startInitialSettle = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    cancelInitialSettle();
    let stableBottom = -1;
    let stableFrames = 0;
    let frames = 0;
    const step = () => {
      initialFrame.current = 0;
      if (userScrolled.current) return;
      // An expanded inline card owns the viewport; its own alignment takes
      // over, including before the dataset flag has committed.
      if (scroller.dataset.cardOpen === "1" || openMicroCard(scroller)) return;
      const bottom = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTop = bottom;
      if (bottom === stableBottom) stableFrames += 1;
      else { stableBottom = bottom; stableFrames = 0; }
      frames += 1;
      if (frames < 120 && stableFrames < 24) initialFrame.current = window.requestAnimationFrame(step);
    };
    step();
  }, [cancelInitialSettle, scrollerRef]);

  const onScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    // A scrollbar drag is a real gesture; a programmatic scroll or a layout
    // clamp is not. This is the only scrollTop-based learner signal.
    if (scrollbarDrag.current && scroller.scrollTop < lastScrollTop.current - 2) learnerScrolledUp.current = true;
    lastScrollTop.current = scroller.scrollTop;
    // A scrollbar drag (or any non-wheel scroll) also gives the learner control.
    if (pinned.current && Math.abs(scroller.scrollTop - pinnedScrollTop.current) > 2) {
      userScrolled.current = true;
      pinned.current = false;
    }
    // Following tolerates the downward motion of its own scroll; moving above
    // the last followed bottom means the learner scrolled upward.
    if (following.current && scroller.scrollTop < followBottom.current - 4) markUserScroll();
    updateJump();
  }, [markUserScroll, scrollerRef, updateJump]);

  const onWheel = useCallback((event: { deltaY: number }) => {
    if (event.deltaY < 0) learnerScrolledUp.current = true;
    if (following.current && event.deltaY >= 0) return;
    markUserScroll();
  }, [markUserScroll]);

  const onTouchMove = useCallback(() => {
    learnerScrolledUp.current = true;
    markUserScroll();
  }, [markUserScroll]);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    following.current = true;
    userScrolled.current = false;
    learnerScrolledUp.current = false;
    followReply.current = null;
    pinned.current = false;
    followBottom.current = scroller.scrollTop;
    // Let the scroll event hide the control once the content end reaches the
    // composer. Hiding it in the click handler can cancel the smooth scroll.
    scrollConversationToLatest(scroller, behavior);
  }, [scrollerRef]);

  const setupTail = useCallback((user: HTMLElement, scroller: HTMLElement) => {
    const tail = tailRef.current;
    if (!tail) return;
    const available = conversationAvailableHeight({
      clientHeight: scroller.clientHeight,
      titleHeight: titleBarRef.current?.offsetHeight ?? 0,
      composerHeight: composerRef.current?.offsetHeight ?? 0
    });
    const used = tail.getBoundingClientRect().top - user.getBoundingClientRect().top;
    tail.style.height = `${pinSpaceHeight(available, used)}px`;
  }, [composerRef, tailRef, titleBarRef]);

  // A different conversation starts at its latest content again, unless the
  // learner is already sending the first message of a brand-new conversation.
  useLayoutEffect(() => {
    if (keyRef.current === conversationKey) return;
    keyRef.current = conversationKey;
    if (sendingRef.current) return;
    initialDone.current = false;
    userScrolled.current = false;
    pinned.current = false;
    following.current = false;
    learnerScrolledUp.current = false;
    lastScrollTop.current = 0;
    followReply.current = null;
    seenMessageIds.current = new Set();
    lastUserId.current = null;
    firstMessageId.current = null;
    setShowJump(false);
  }, [conversationKey]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const tail = tailRef.current;
    if (!scroller || !tail) return;
    syncComposer();

    const count = messages.length;
    if (!count) {
      initialDone.current = true;
      lastUserId.current = null;
      firstMessageId.current = null;
      followReply.current = null;
      seenMessageIds.current = new Set();
      tail.style.height = "0px";
      setShowJump(false);
      return;
    }

    const last = messages[messages.length - 1];
    const firstId = messages[0]?.id ?? null;

    // Only messages that were not present on the previous render can start a
    // follow. On first paint the initial settle owns the scroll position.
    const newIds = new Set(messages.filter((message) => !seenMessageIds.current.has(message.id)).map((message) => message.id));
    for (const id of newIds) seenMessageIds.current.add(id);
    const wasInitial = initialDone.current;
    if (wasInitial) {
      for (const message of messages) {
        if (!newIds.has(message.id)) continue;
        if (isActionStart(message)) {
          // A new Micro or Assignment begins a fresh judgement window.
          learnerScrolledUp.current = false;
          followReply.current = null;
        }
      }
      const replyId = completionReplyFor(messages, newIds);
      if (replyId && !learnerScrolledUp.current) {
        followReply.current = { messageId: replyId, until: performance.now() + 15000 };
        pinned.current = false;
        following.current = false;
      }
    }
    const isNewUser = last?.role === "user" && last.id !== lastUserId.current;

    if (!initialDone.current) {
      initialDone.current = true;
      initialWindowUntil.current = performance.now() + 8000;
      firstMessageId.current = firstId;
      lastUserId.current = last?.role === "user" ? last.id : null;
      userScrolled.current = false;
      pinned.current = false;
      const openCard = openMicroCard(scroller);
      if (openCard) {
        alignConversationElement(scroller, openCard, { smooth: false });
      } else if (scroller.dataset.cardOpen !== "1") {
        tail.style.height = "0px";
        startInitialSettle();
      }
      setShowJump(false);
      return;
    }

    // A conversation switch replaces the first message. A newly sent first
    // message in that new conversation is still governed by the send rule.
    if (firstMessageId.current !== firstId && !isNewUser) {
      firstMessageId.current = firstId;
      initialWindowUntil.current = performance.now() + 8000;
      lastUserId.current = last?.role === "user" ? last.id : null;
      userScrolled.current = false;
      pinned.current = false;
      followReply.current = null;
      learnerScrolledUp.current = false;
      seenMessageIds.current = new Set(messages.map((message) => message.id));
      const openCard = openMicroCard(scroller);
      if (openCard) {
        alignConversationElement(scroller, openCard, { smooth: false });
      } else if (scroller.dataset.cardOpen !== "1") {
        tail.style.height = "0px";
        startInitialSettle();
      }
      setShowJump(false);
      return;
    }

    if (isActionMessage(last)) {
      // Action rows are system feedback; they must never pin a previous typed
      // message. A fresh completion reply is aligned with its own cards.
      const pending = followReply.current;
      if (pending && pending.messageId === last.id && !learnerScrolledUp.current) {
        const turn = scroller.querySelector<HTMLElement>(`.ef-assistant-turn[data-message-id="${CSS.escape(pending.messageId)}"]`);
        if (turn) {
          pending.target = completionScrollTarget(scroller, turn, turn);
          alignConversationCompletion(scroller, turn, turn, { smooth: true });
          updateJump();
          return;
        }
      }
      pinned.current = false;
      following.current = false;
      updateJump();
      return;
    }

    if (isNewUser) {
      followReply.current = null;
      learnerScrolledUp.current = false;
      firstMessageId.current = firstId;
      lastUserId.current = last.id;
      userScrolled.current = false;
      following.current = false;
      pinned.current = true;
      const user = lastUserElement(scroller);
      if (!user) return;
      setupTail(user, scroller);
      const top = scrollTopToReveal({
        elementTop: user.getBoundingClientRect().top,
        scrollerTop: scroller.getBoundingClientRect().top,
        scrollTop: scroller.scrollTop,
        titleHeight: titleBarRef.current?.offsetHeight ?? 0
      });
      scroller.scrollTop = top;
      pinnedScrollTop.current = scroller.scrollTop;
      setShowJump(false);
      return;
    }

    // Streaming grows below the pinned user message. Shrinking the tail by the
    // same amount keeps the scroll height and scrollTop stable; completion
    // therefore never jumps.
    if (pinned.current && !userScrolled.current) {
      const user = lastUserElement(scroller);
      if (user) setupTail(user, scroller);
    }
    // "回到最新" opts into following. Keep the growing answer in view until a
    // real upward scroll clears the flag.
    if (following.current && !userScrolled.current) {
      scrollConversationToLatest(scroller, "auto");
      followBottom.current = scroller.scrollTop;
      updateJump();
      return;
    }
    // A growing answer can pass the viewport without any scroll event. Keep
    // the jump control truthful without ever moving the scroll position.
    updateJump();
  }, [composerRef, messages, scrollerRef, setupTail, startInitialSettle, syncComposer, tailRef, titleBarRef, updateJump]);

  useEffect(() => cancelInitialSettle, [cancelInitialSettle]);

  // Opening a card cancels the initial bottom settle immediately; the card
  // alignment then owns the scroll position.
  useEffect(() => {
    const onCardOpening = () => cancelInitialSettle();
    window.addEventListener("eduflow:conversation-card-opening", onCardOpening);
    return () => window.removeEventListener("eduflow:conversation-card-opening", onCardOpening);
  }, [cancelInitialSettle]);

  // Cards hydrate after their first paint. While the conversation is still
  // opening (and before any learner scroll), keep the latest content in view.
  useEffect(() => {
    const onCardReady = () => {
      if (!initialDone.current || userScrolled.current || pinned.current) return;
      if (performance.now() > initialWindowUntil.current) return;
      if (scrollerRef.current && (scrollerRef.current.dataset.cardOpen === "1" || openMicroCard(scrollerRef.current))) return;
      startInitialSettle();
    };
    window.addEventListener("eduflow:conversation-card-hydrated", onCardReady);
    return () => window.removeEventListener("eduflow:conversation-card-hydrated", onCardReady);
  }, [startInitialSettle]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onResize = () => syncComposer();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [scrollerRef, syncComposer]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const target = event.target as HTMLElement | null;
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (target?.closest("input, textarea, select, button, a, [contenteditable='true'], [role='button']")) return;
      if (target?.closest(".ef-my-panel, .ef-home-route-panel, .ef-home-workspace, [role='dialog']")) return;
      const key = event.key;
      if (!["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"].includes(key)) return;
      event.preventDefault();
      if (key === "PageUp" || key === "Home" || key === "ArrowUp") learnerScrolledUp.current = true;
      markUserScroll();
      if (key === "End") {
        setShowJump(false);
        scrollConversationToLatest(scroller, "auto");
        return;
      }
      const top = keyboardScrollTop(key, {
        scrollTop: scroller.scrollTop,
        clientHeight: scroller.clientHeight,
        maxTop: scroller.scrollHeight - scroller.clientHeight
      });
      if (top == null) return;
      // Instant so Home/End and page steps land on the exact frame the learner
      // asked for; the scroll event then updates jump-to-latest normally.
      scroller.scrollTo({ top, behavior: "auto" });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [markUserScroll, scrollerRef]);

  const onPointerDown = useCallback((event?: { target?: EventTarget | null; nativeEvent?: { offsetX?: number } }) => {
    const scroller = scrollerRef.current;
    if (scroller && event) {
      const offsetX = typeof event.nativeEvent?.offsetX === "number" ? event.nativeEvent.offsetX : -1;
      if (event.target === scroller && offsetX >= scroller.clientWidth) scrollbarDrag.current = true;
    }
    markUserScroll();
  }, [markUserScroll, scrollerRef]);

  useEffect(() => {
    const release = () => { scrollbarDrag.current = false; };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, []);

  // A new Micro/Assignment start is a real action boundary even when the
  // server action reply is skipped. Reset the learner-scroll judgement there.
  useEffect(() => {
    const onActionStart = () => {
      learnerScrolledUp.current = false;
      followReply.current = null;
    };
    window.addEventListener("eduflow:learner-action-start", onActionStart);
    return () => window.removeEventListener("eduflow:learner-action-start", onActionStart);
  }, []);

  // The strip is absolutely positioned and appears after an intersection
  // change. Recompute the completion target from its real top edge instead of
  // letting a hidden strip leave the reply under the composer. The same
  // observer absorbs late card hydration without ever fighting a real scroll.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const realign = (smooth: boolean) => {
      const pending = followReply.current;
      if (!pending || learnerScrolledUp.current) return;
      if (performance.now() > pending.until) { followReply.current = null; return; }
      const turn = scroller.querySelector<HTMLElement>(`.ef-assistant-turn[data-message-id="${CSS.escape(pending.messageId)}"]`);
      if (!turn) return;
      const target = completionScrollTarget(scroller, turn, turn);
      if (Math.abs(target - scroller.scrollTop) <= 2) return;
      const now = performance.now();
      // Reapply when layout changed (target moved), or when a previous attempt
      // was clamped by the old max scroll and did not reach its target.
      const sameTarget = pending.target != null && Math.abs(target - pending.target) <= 2;
      if (sameTarget && pending.appliedAt != null && now - pending.appliedAt < 600) return;
      pending.target = target;
      pending.appliedAt = now;
      alignConversationCompletion(scroller, turn, turn, { smooth });
      updateJump();
    };
    const schedule = (smooth: boolean) => {
      window.requestAnimationFrame(() => realign(smooth));
    };
    const anchor = scroller.querySelector<HTMLElement>(".ef-home-strip-anchor");
    const stripObserver = anchor ? new MutationObserver(() => schedule(true)) : null;
    if (anchor && stripObserver) {
      stripObserver.observe(anchor, { attributes: true, attributeFilter: ["hidden"], childList: true, subtree: true });
    }
    const resize = new ResizeObserver(() => schedule(true));
    const composer = scroller.querySelector<HTMLElement>(".ef-home-composer");
    const timeline = scroller.querySelector<HTMLElement>(".ef-home-timeline");
    const pendingTurn = followReply.current
      ? scroller.querySelector<HTMLElement>(`.ef-assistant-turn[data-message-id="${CSS.escape(followReply.current.messageId)}"]`)
      : null;
    if (composer) resize.observe(composer);
    if (anchor) resize.observe(anchor);
    // Card hydration and panel width changes grow the reply itself; both must
    // recompute the target while the follow window is open.
    if (timeline) resize.observe(timeline);
    if (pendingTurn) resize.observe(pendingTurn);
    // Observers can miss replaced anchors or a panel-width pass that does not
    // resize the observed boxes. While a follow window is open, a slow tick
    // recomputes from the actual strip/composer edges; it is a no-op once the
    // target is reached.
    const tick = window.setInterval(() => schedule(true), 400);
    return () => {
      window.clearInterval(tick);
      stripObserver?.disconnect();
      resize.disconnect();
    };
  }, [messages, scrollerRef, updateJump]);

  return {
    showJump,
    onScroll,
    onWheel,
    onTouchMove,
    onPointerDown,
    scrollToLatest,
    syncComposer,
    markUserScroll
  };
}

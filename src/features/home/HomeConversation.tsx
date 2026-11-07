import { AlertTriangle, ArrowRight, PanelLeft, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AssistantUIMessage } from "@/features/assistant/AssistantRuntimeContext";
import type { AssistantCardActions } from "@/features/assistant/cards/AssistantCardView";
import { AssistantText, AssistantTimeline } from "@/features/assistant/components/AssistantTimeline";
import type { MockSession } from "@/features/auth/types";
import { ConversationCard } from "@/shared/ui/Conversation";
import { ConversationCardRegistryContext, type ConversationNextStepCard } from "@/shared/ui/conversationCardRegistry";
import { HomeComposer, type ComposerContext } from "@/shared/ui/HomeComposer";
import { PreviewBadge } from "@/shared/ui/PreviewBadge";
import type { FollowedPerson } from "@/features/profile/people/PeopleRepository";
import { archiveHref } from "@/features/archive/model/atlasParams";
import { useNavigate } from "react-router-dom";
import { useConversationScroll } from "./useConversationScroll";

export type HomeConversationProps = {
  messages: AssistantUIMessage[];
  session: MockSession;
  cardActions: AssistantCardActions;
  loading: boolean;
  sending: boolean;
  replying?: boolean;
  error: string;
  onStop?: () => void;
  contexts: ComposerContext[];
  onRemoveContext: (id: string) => void;
  onSend: (message: string) => Promise<boolean> | boolean;
  suggestions: string[];
  /** Database-configured prompt examples; the first-run start entry is separate. */
  emptyExamples?: Array<{ id: string; label: string; onSelect(): void }>;
  emptyTitle?: string;
  emptyDescription?: string;
  /** "带我从最简单的开始" stays in the composer band before the first segment. */
  starterEntry?: ReactNode;
  previewPerson: FollowedPerson | null;
  onRetry: () => void;
  /** The one next-step entry sits above the composer, never in the page header. */
  composerHeader?: ReactNode;
  /** The composer header contains the next-step strip (not just a starter chip). */
  hasNextStepStrip?: boolean;
  /** The card that owns the current next step; the strip steps aside while it is visible. */
  nextStepCard?: ConversationNextStepCard | null;
  /** Current conversation title, shown in the sticky title bar. */
  title?: string;
  /** Identifies the loaded conversation so a switch returns to its latest content. */
  conversationKey?: string | null;
  /** Shown at the title bar's left edge when the history column is collapsed. */
  onExpandHistory?: () => void;
  /** Changes when the available conversation width changes (history/panel). */
  layoutEpoch?: string;
};

/** Home conversation workbench. It renders the Global Assistant timeline and never writes directly. */
export function HomeConversation({ messages, session, cardActions, loading, sending, replying = false, error, onStop = () => undefined, contexts, onRemoveContext, onSend, suggestions, emptyExamples, emptyTitle, emptyDescription, starterEntry, previewPerson, onRetry, composerHeader, hasNextStepStrip = false, nextStepCard = null, title, conversationKey = null, onExpandHistory, layoutEpoch = "" }: HomeConversationProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const titleBarRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);
  const [stripSuppressed, setStripSuppressed] = useState(false);
  const registeredCards = useRef(new Set<HTMLElement>());
  const [registryVersion, setRegistryVersion] = useState(0);

  const registerCard = useCallback((element: HTMLElement) => {
    registeredCards.current.add(element);
    setRegistryVersion((value) => value + 1);
  }, []);
  const unregisterCard = useCallback((element: HTMLElement) => {
    registeredCards.current.delete(element);
    setRegistryVersion((value) => value + 1);
  }, []);
  const registry = useMemo(() => ({ nextStep: nextStepCard, register: registerCard, unregister: unregisterCard }), [nextStepCard, registerCard, unregisterCard]);

  const { showJump, onScroll, onWheel, onTouchMove, onPointerDown, scrollToLatest, syncComposer } = useConversationScroll({
    conversationKey,
    messages,
    sending,
    scrollerRef,
    titleBarRef,
    composerRef,
    tailRef
  });

  // The running inline Micro owns the bottom of the conversation. Its action
  // bar and "回到最新" share the composer band, so hide the jump while that bar
  // is anywhere in the viewport; show it again once the practice is scrolled
  // completely out and real content remains below.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const update = () => {
      const footer = scroller.querySelector<HTMLElement>(".ef-assistant-micro-body .micro-card footer");
      if (!footer) { delete scroller.dataset.microJumpHidden; return; }
      const viewport = scroller.getBoundingClientRect();
      const box = footer.getBoundingClientRect();
      const visible = box.bottom > viewport.top && box.top < viewport.bottom;
      // A dataset (not React state) keeps this synchronous: the jump never
      // paints for a frame above the action bar after a step/scroll update.
      if (visible) scroller.dataset.microJumpHidden = "1";
      else delete scroller.dataset.microJumpHidden;
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(scroller);
    // A step change swaps the footer; update synchronously before the next
    // paint so the jump never flashes over the new bar.
    const mutations = new MutationObserver(update);
    mutations.observe(scroller, { childList: true, subtree: true });
    return () => {
      scroller.removeEventListener("scroll", update);
      resize.disconnect();
      mutations.disconnect();
      delete scroller.dataset.microJumpHidden;
    };
  }, [loading, scrollerRef]);

  // Panel and history transitions change the conversation width. Keep the
  // first visible row visually fixed while the width animates instead of
  // letting text reflow pull the content up or down under a still scrollTop.
  const anchorRef = useRef<{ element: HTMLElement; top: number } | null>(null);
  const anchorFrame = useRef(0);
  const anchorLocking = useRef(false);
  const anchorEpoch = useRef(layoutEpoch);
  const captureAnchor = useCallback(() => {
    if (anchorLocking.current) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const scrollerBox = scroller.getBoundingClientRect();
    const revealTop = scrollerBox.top + (titleBarRef.current?.offsetHeight ?? 0);
    const rows = scroller.querySelectorAll<HTMLElement>(".ef-home-message-row, .ef-home-day, .ef-assistant-action-user-row");
    for (const element of rows) {
      const box = element.getBoundingClientRect();
      if (box.top >= revealTop - 1 && box.top < scrollerBox.bottom) {
        anchorRef.current = { element, top: box.top };
        return;
      }
    }
    anchorRef.current = null;
  }, [scrollerRef, titleBarRef]);
  const cancelAnchorLock = useCallback(() => {
    anchorLocking.current = false;
    if (!anchorFrame.current) return;
    window.cancelAnimationFrame(anchorFrame.current);
    anchorFrame.current = 0;
  }, []);
  useLayoutEffect(() => {
    if (anchorEpoch.current === layoutEpoch) return;
    anchorEpoch.current = layoutEpoch;
    const scroller = scrollerRef.current;
    const anchor = anchorRef.current;
    if (!scroller || !anchor?.element.isConnected) return;
    // Keep the original visual target across a nested epoch change (panel
    // width + history width commit in separate renders).
    const target = anchor.top;
    const started = performance.now();
    if (anchorFrame.current) window.cancelAnimationFrame(anchorFrame.current);
    anchorLocking.current = true;
    const settle = () => {
      anchorFrame.current = 0;
      if (!anchor.element.isConnected) { anchorLocking.current = false; return; }
      const current = anchor.element.getBoundingClientRect().top;
      const delta = current - target;
      if (Math.abs(delta) > 0.5) scroller.scrollTop += delta;
      if (performance.now() - started < 320) {
        anchorFrame.current = window.requestAnimationFrame(settle);
      } else {
        anchorLocking.current = false;
        captureAnchor();
      }
    };
    settle();
    return cancelAnchorLock;
  }, [cancelAnchorLock, captureAnchor, layoutEpoch, scrollerRef]);
  useEffect(() => cancelAnchorLock, [cancelAnchorLock]);

  // Observe only the card that owns the next step. The root margin uses the
  // stable title/composer heights, never the strip's own height.
  useEffect(() => {
    const scroller = scrollerRef.current;
    setStripSuppressed(false);
    if (!scroller || !nextStepCard) return;
    const cards = [...registeredCards.current];
    if (!cards.length) return;
    const intersecting = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) intersecting.add(entry.target);
        else intersecting.delete(entry.target);
      }
      setStripSuppressed(intersecting.size > 0);
    }, {
      root: scroller,
      rootMargin: `-${(titleBarRef.current?.offsetHeight ?? 64) + 8}px 0px -${(composerRef.current?.offsetHeight ?? 96) + 16}px 0px`,
      threshold: 0
    });
    for (const card of cards) observer.observe(card);
    return () => observer.disconnect();
  }, [nextStepCard, registryVersion]);

  if (loading) return <HomeConversationSkeleton contexts={contexts} onRemoveContext={onRemoveContext} onSend={onSend} title={title} />;
  const lastMessage = messages[messages.length - 1];
  const lastStopped = Boolean(lastMessage?.metadata?.stopped);
  const awaitingReply = !sending && !lastStopped && messages.length > 0 && lastMessage?.role === "user";
  const emptyAssistant = !sending && !lastStopped && lastMessage?.role === "assistant" && !(lastMessage.parts ?? []).some((part) => (
    (part.type === "text" && Boolean((part as { text?: string }).text?.trim())) || part.type === "tool-displayCard"
  ));
  const visibleError = error || (emptyAssistant ? "助手这次没有生成有效回复，请重试。" : awaitingReply ? "回复没有完成。请重试。" : "");
  const stripShown = Boolean(composerHeader) && hasNextStepStrip && !stripSuppressed;

  return <ConversationCardRegistryContext.Provider value={registry}>
    <section className="ef-home-conversation" aria-label="EduFlow 对话">
      <div
        className="ef-home-scroller"
        ref={scrollerRef}
        tabIndex={0}
        onScroll={() => { onScroll(); captureAnchor(); }}
        onWheel={(event) => {
          const target = event.target as Element | null;
          // Panels are siblings of the scroller today, but a portal move must
          // never turn their internal scrolling into a conversation gesture.
          if (target?.closest?.(".ef-home-workspace, dialog, .ef-my-panel, .ef-home-route-panel")) return;
          cancelAnchorLock();
          onWheel(event);
        }}
        onTouchMove={() => { cancelAnchorLock(); onTouchMove(); }}
        onPointerDown={(event) => { cancelAnchorLock(); onPointerDown(event); }}
        onInput={syncComposer}
      >
        <header className="ef-home-titlebar" ref={titleBarRef}>
          <div className="ef-home-titlebar-inner">
            {onExpandHistory ? <button type="button" className="ef-home-icon ef-home-history-expand" onClick={onExpandHistory} aria-label="展开对话记录" title="展开对话记录"><PanelLeft size={16} aria-hidden="true" /></button> : null}
            <h1>{title?.trim() || "新对话"}</h1>
          </div>
        </header>
        <div className="ef-home-timeline" aria-live="polite" aria-relevant="additions text" aria-busy={sending}>
          {!messages.length ? <div className="ef-home-empty">
            <h2>{emptyTitle ?? "想聊点什么？"}</h2>
            <p>{emptyDescription ?? "可以问问题、说说想学什么，或者只是随便看看。"}</p>
          </div> : null}
          {previewPerson ? <PreviewPersonCard person={previewPerson} /> : null}
          {!messages.length && (emptyExamples?.length || suggestions.length) ? <div className="ef-home-suggestions is-empty" aria-label="示例">
            {emptyExamples?.length
              ? emptyExamples.map((example) => <button key={example.id} type="button" className="ef-ui-chip" onClick={example.onSelect}>{example.label}</button>)
              : suggestions.map((prompt) => <button key={prompt} type="button" className="ef-ui-chip" onClick={() => void onSend(prompt)}>{prompt}</button>)}
          </div> : null}
          <AssistantTimeline messages={messages} session={session} actions={cardActions} sending={sending} showDaySeparators />
          {visibleError ? <div className="ef-home-error" role="alert"><AlertTriangle size={15} aria-hidden="true" /><span>{visibleError}</span><button type="button" onClick={onRetry}><RefreshCw size={13} />重试</button></div> : null}
          <div className="ef-home-tail-space" ref={tailRef} aria-hidden="true" />
        </div>
        <div className="ef-home-composer" ref={composerRef} data-strip={stripShown ? "1" : undefined}>
          {starterEntry ? <div className="ef-home-starter-slot">{starterEntry}</div> : null}
          {composerHeader ? <div className="ef-home-strip-anchor" hidden={!stripShown}>{composerHeader}</div> : null}
          <button type="button" className="ef-home-jump" hidden={!showJump} onClick={() => scrollToLatest("auto")}>回到最新<span aria-hidden="true">↓</span></button>
          <HomeComposer contexts={contexts} onRemoveContext={onRemoveContext} onSubmit={(value) => void onSend(value)} onStop={() => void onStop()} disabled={sending && !replying} replying={replying} hint={<span>Enter 发送 · Shift + Enter 换行</span>} />
        </div>
      </div>
    </section>
  </ConversationCardRegistryContext.Provider>;
}

function PreviewPersonCard({ person }: { person: FollowedPerson }) {
  const navigate = useNavigate();
  const isPrivate = person.visibility === "private";
  return <div className="ef-home-person-card" data-preview="sample">
    <ConversationCard size="l" label={`预览人物 ${person.displayName}`}>
      <div className="ef-home-person-inner">
        <div className="ef-home-person-head">
          <span className={`ef-home-person-avatar accent-${person.accent}`} aria-hidden="true">{person.displayName.replace("示例 · ", "").slice(0, 1) || "友"}</span>
          <span><strong>{person.displayName} · 学习进度</strong><small>{person.handle} · 公开地图</small></span>
          <PreviewBadge />
        </div>
        {isPrivate ? <div className="ef-home-person-private"><strong>对方未公开学习进度</strong><p>可以请 TA 分享，或先查看公开地图。预览不会展示分数、失败尝试、对话或 AI 评价。</p></div> : <div className="ef-home-person-progress">
          <div><span>公开进度</span><strong>{person.sharedKnowledgeCount} 个要点</strong></div>
          <div className="ef-home-person-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, person.sharedKnowledgeCount * 6)}%` }} /></div>
          <p>{person.activityLabel}</p>
        </div>}
        <div className="ef-home-person-actions"><button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => navigate(archiveHref({ panel: "people" }))}>查看地图</button><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={() => navigate(archiveHref({ panel: "people", compare: [person.id] }))}>在地图中对比<ArrowRight size={13} /></button></div>
      </div>
    </ConversationCard>
  </div>;
}

export function HomeConversationSkeleton({ contexts, onRemoveContext, onSend, title }: { contexts: ComposerContext[]; onRemoveContext: (id: string) => void; onSend: (message: string) => Promise<boolean> | boolean; title?: string }) {
  return <section className="ef-home-conversation ef-home-conversation-skeleton" aria-label="正在加载对话">
    <div className="ef-home-scroller">
      <header className="ef-home-titlebar"><div className="ef-home-titlebar-inner"><h1>{title?.trim() || "正在加载对话"}</h1></div></header>
      <div className="ef-home-timeline" role="status" aria-label="正在加载学习上下文">
        <div className="ef-home-skeleton-row"><span className="ef-home-skeleton-avatar" /><span className="ef-home-skeleton-bubble" /></div>
        <div className="ef-home-skeleton-row is-user"><span className="ef-home-skeleton-bubble short" /></div>
        <div className="ef-home-skeleton-row"><span className="ef-home-skeleton-avatar" /><span className="ef-home-skeleton-bubble tall" /></div>
        <div className="ef-home-skeleton-row"><span className="ef-home-skeleton-avatar" /><span className="ef-home-skeleton-line">正在准备回答…</span></div>
      </div>
      <div className="ef-home-composer">
        <HomeComposer contexts={contexts} onRemoveContext={onRemoveContext} onSubmit={(value) => void onSend(value)} hint={<span>Enter 发送 · Shift + Enter 换行</span>} />
      </div>
    </div>
  </section>;
}

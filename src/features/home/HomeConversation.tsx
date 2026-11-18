import { AlertTriangle, ArrowRight, PanelLeft, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ASSISTANT_NO_REPLY, ASSISTANT_REPLY_FAILURE, type AssistantUIMessage } from "@/features/assistant/AssistantRuntimeContext";
import type { AssistantCardActions } from "@/features/assistant/cards/AssistantCardView";
import { AssistantTimeline } from "@/features/assistant/components/AssistantTimeline";
import type { MockSession } from "@/features/auth/types";
import { ConversationCard } from "@/shared/ui/Conversation";
import { HomeComposer, type ComposerAttachment, type ComposerContext, type ComposerExtras } from "@/shared/ui/HomeComposer";
import { PreviewBadge } from "@/shared/ui/PreviewBadge";
import type { FollowedPerson } from "@/features/profile/people/PeopleRepository";
import { archiveHref } from "@/features/archive/model/atlasParams";
import { useNavigate } from "react-router-dom";
import { useConversationScroll } from "./useConversationScroll";
import { uploadEvidence } from "@/features/evidence/evidenceClient";
import { attachmentCountMessage, attachmentFileError, attachmentRoom } from "@/shared/assistant/attachments";

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
  onSend: (message: string, extras?: ComposerExtras & { attachments?: ComposerAttachment[] }) => Promise<boolean> | boolean;
  suggestions: string[];
  /** Database-configured fresh-state example questions. */
  emptyExamples?: Array<{ id: string; label: string; onSelect(): void }>;
  emptyTitle?: string;
  emptyDescription?: string;
  previewPerson: FollowedPerson | null;
  onRetry: () => void;
  /** Current conversation title, shown in the sticky title bar. */
  title?: string;
  /** Identifies the loaded conversation so a switch returns to its latest content. */
  conversationKey?: string | null;
  /** Shown at the title bar's left edge when the history column is collapsed. */
  onExpandHistory?: () => void;
  /** Changes when the available conversation width changes (history/panel). */
  layoutEpoch?: string;
  /** Every model-offered follow-up fills the composer; nothing is sent automatically. */
  onSuggestion?: (text: string) => void;
};

/** Home conversation workbench. It renders the Global Assistant timeline and never writes directly. */
export function HomeConversation({ messages, session, cardActions, loading, sending, replying = false, error, onStop = () => undefined, contexts, onRemoveContext, onSend, suggestions, emptyExamples, emptyTitle, emptyDescription, previewPerson, onRetry, title, conversationKey = null, onExpandHistory, layoutEpoch = "", onSuggestion }: HomeConversationProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const titleBarRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [suggestionInsertion, setSuggestionInsertion] = useState<{ id: string; text: string } | null>(null);
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

  if (loading) return <HomeConversationSkeleton contexts={contexts} onRemoveContext={onRemoveContext} onSend={onSend} title={title} />;
  const lastMessage = messages[messages.length - 1];
  const lastStopped = Boolean(lastMessage?.metadata?.stopped);
  const awaitingReply = !sending && !lastStopped && messages.length > 0 && lastMessage?.role === "user";
  const lastFailed = lastMessage?.role === "assistant" && (lastMessage.parts ?? []).some((part) => part.type === "data-failed");
  const emptyAssistant = !sending && !lastStopped && !lastFailed && lastMessage?.role === "assistant" && !(lastMessage.parts ?? []).some((part) => (
    (part.type === "text" && Boolean((part as { text?: string }).text?.trim())) || part.type === "tool-displayCard"
  ));
  // A persisted failed turn renders its own inline reason and retry control;
  // only a trailing user turn (no assistant row at all) uses the page banner.
  const visibleError = error || (awaitingReply ? ASSISTANT_NO_REPLY : emptyAssistant ? ASSISTANT_REPLY_FAILURE : "");

  async function addFiles(files: File[]) {
    setAttachmentError("");
    const room = attachmentRoom(attachments.filter((attachment) => !attachment.uploading).length);
    if (room <= 0) { setAttachmentError(attachmentCountMessage()); return; }
    const accepted: Array<{ file: File; key: string }> = [];
    for (const file of files.slice(0, room)) {
      const fileError = attachmentFileError(file);
      if (fileError) { setAttachmentError(fileError); continue; }
      accepted.push({ file, key: `upload:${crypto.randomUUID()}` });
    }
    if (!accepted.length) return;
    setAttachments((current) => [...current, ...accepted.map(({ file, key }) => ({ id: key, name: file.name, uploading: true }))]);
    for (const { file, key } of accepted) {
      try {
        const sourceId = await uploadEvidence(file, {});
        setAttachments((current) => current.map((attachment) => attachment.id === key ? { id: sourceId, name: file.name } : attachment));
      } catch (uploadFailure) {
        setAttachments((current) => current.filter((attachment) => attachment.id !== key));
        setAttachmentError(uploadFailure instanceof Error ? uploadFailure.message : "文件上传失败，请重试。");
      }
    }
  }

  function removeAttachment(id: string) {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  function send(value: string, extras: ComposerExtras) {
    const ready = attachments.filter((attachment) => !attachment.uploading);
    void Promise.resolve(onSend(value, { ...extras, attachments: ready })).then((ok) => {
      if (ok === false) return;
      setAttachments([]);
      setAttachmentError("");
    });
  }

  return <section
    className="ef-home-conversation"
    aria-label="EduFlow 对话"
    onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
    onDrop={(event) => { if (!event.dataTransfer.files.length) return; event.preventDefault(); void addFiles(Array.from(event.dataTransfer.files)); }}
  >
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
          <AssistantTimeline
            messages={messages}
            session={session}
            actions={cardActions}
            sending={sending}
            showDaySeparators
            onSuggestion={onSuggestion ?? ((text) => setSuggestionInsertion({ id: crypto.randomUUID(), text }))}
            onRetry={onRetry}
          />
          {visibleError ? <div className="ef-home-error" role="alert"><AlertTriangle size={15} aria-hidden="true" /><span>{visibleError}</span><button type="button" onClick={onRetry}><RefreshCw size={13} />重试</button></div> : null}
          <div className="ef-home-tail-space" ref={tailRef} aria-hidden="true" />
        </div>
        <div className="ef-home-composer" ref={composerRef}>
          {/* The jump control has a permanent slot in the composer band, so
              showing it never changes the scroll range and it never sits over
              readable answer text. */}
          <div className="ef-home-jump-slot">
            <button type="button" className="ef-home-jump" data-visible={showJump ? "true" : "false"} tabIndex={showJump ? 0 : -1} onClick={() => scrollToLatest("auto")}>回到最新<span aria-hidden="true">↓</span></button>
          </div>
          <HomeComposer
            contexts={contexts}
            onRemoveContext={onRemoveContext}
            onSubmit={send}
            onStop={() => void onStop()}
            disabled={sending && !replying}
            replying={replying}
            attachments={attachments}
            onAddFiles={(files) => void addFiles(files)}
            onRemoveAttachment={removeAttachment}
            attachmentError={attachmentError}
            uploadingAttachments={attachments.some((attachment) => attachment.uploading)}
            insertText={suggestionInsertion?.text}
            insertKey={suggestionInsertion?.id}
            placeholder="问知识点、看路线、读资料，或拖入 .txt / .md / .csv 交任务"
            hint={<span>Enter 发送 · Shift + Enter 换行 · @ 提及 · / 功能</span>}
          />
        </div>
      </div>
    </section>;
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
          <div><span>公开进度</span><strong>{person.sharedKnowledgeCount} 个知识点</strong></div>
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

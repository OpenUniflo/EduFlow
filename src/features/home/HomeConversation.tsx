import { AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { AssistantUIMessage } from "@/features/assistant/AssistantRuntimeContext";
import type { AssistantCardActions } from "@/features/assistant/cards/AssistantCardView";
import { AssistantTimeline } from "@/features/assistant/components/AssistantTimeline";
import type { MockSession } from "@/features/auth/types";
import { Bubble, ConversationCard } from "@/shared/ui/Conversation";
import { HomeComposer, type ComposerContext } from "@/shared/ui/HomeComposer";
import { PreviewBadge } from "@/shared/ui/PreviewBadge";
import type { FollowedPerson } from "@/features/profile/people/PeopleRepository";
import { archiveHref } from "@/features/archive/model/atlasParams";
import { useNavigate } from "react-router-dom";

export type HomeConversationProps = {
  messages: AssistantUIMessage[];
  session: MockSession;
  cardActions: AssistantCardActions;
  loading: boolean;
  sending: boolean;
  error: string;
  contexts: ComposerContext[];
  onRemoveContext: (id: string) => void;
  onSend: (message: string) => Promise<boolean> | boolean;
  suggestions: string[];
  previewPerson: FollowedPerson | null;
  onRetry: () => void;
  /** The one next-step entry sits above the composer, never in the page header. */
  composerHeader?: ReactNode;
  /** Starter hint belongs to the first-run Home only. */
  showStarterHint?: boolean;
};

/** Home conversation workbench. It renders the Global Assistant timeline and never writes directly. */
export function HomeConversation({ messages, session, cardActions, loading, sending, error, contexts, onRemoveContext, onSend, suggestions, previewPerson, onRetry, composerHeader, showStarterHint = false }: HomeConversationProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const stickToLatest = useRef(true);
  const programmaticUntil = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const lastCount = useRef(0);
  const lastSignature = useRef("");
  const lastAssistantId = useRef<string | null>(null);
  const pinReplyStart = useRef(false);

  const signature = messages.map((message) => `${message.id}:${(message.parts ?? []).length}`).join("|");

  const setScroll = useCallback((top: number) => {
    const node = timelineRef.current;
    if (!node) return;
    programmaticUntil.current = performance.now() + 120;
    node.scrollTop = Math.max(0, Math.min(top, node.scrollHeight - node.clientHeight));
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const node = timelineRef.current;
    if (!node) return;
    stickToLatest.current = true;
    setShowJump(false);
    programmaticUntil.current = performance.now() + (behavior === "smooth" ? 500 : 120);
    node.scrollTo({ top: node.scrollHeight, behavior });
  }, []);

  const replyTurn = useCallback(() => {
    const node = timelineRef.current;
    if (!node) return null;
    const turns = node.querySelectorAll<HTMLElement>(".ef-assistant-turn");
    return turns.length ? turns[turns.length - 1] : null;
  }, []);

  /** Short replies stay fully visible; long replies keep their first line at the top. */
  const positionCurrentReply = useCallback(() => {
    // While the model is streaming, the reply start stays pinned; new text
    // grows below. Settle only when the answer finishes.
    if (sending) return;
    const node = timelineRef.current;
    const turn = replyTurn();
    if (!node || !turn || !stickToLatest.current) return;
    const available = node.clientHeight - 24;
    const turnHeight = turn.getBoundingClientRect().height;
    if (turnHeight <= available || !pinReplyStart.current) {
      scrollToBottom("auto");
      return;
    }
    const top = turn.getBoundingClientRect().top - node.getBoundingClientRect().top + node.scrollTop - 12;
    setScroll(top);
    setShowJump(false);
  }, [replyTurn, scrollToBottom, sending, setScroll]);

  const markUserScroll = useCallback(() => {
    const node = timelineRef.current;
    if (!node) return;
    if (node.scrollHeight - node.scrollTop - node.clientHeight > 96) {
      stickToLatest.current = false;
      setShowJump(true);
    }
  }, []);

  const onScroll = useCallback(() => {
    const node = timelineRef.current;
    if (!node) return;
    if (performance.now() < programmaticUntil.current) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distance < 96) {
      stickToLatest.current = true;
      setShowJump(false);
      return;
    }
    stickToLatest.current = false;
    setShowJump(node.scrollHeight > node.clientHeight + 120);
  }, []);

  useEffect(() => {
    const node = timelineRef.current;
    if (!node) return;
    const firstLoad = lastCount.current === 0 && messages.length > 0;
    const grew = messages.length > lastCount.current || signature !== lastSignature.current;
    const last = messages[messages.length - 1];
    lastCount.current = messages.length;
    lastSignature.current = signature;
    if (!grew) return;
    if (firstLoad) {
      pinReplyStart.current = false;
      scrollToBottom("auto");
      lastAssistantId.current = last?.role === "assistant" ? last.id : null;
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => positionCurrentReply()));
      window.setTimeout(positionCurrentReply, 240);
      window.setTimeout(positionCurrentReply, 700);
      return;
    }
    if (last?.role === "user") {
      if (stickToLatest.current) scrollToBottom("auto");
      return;
    }
    if (last?.role === "assistant" && last.id !== lastAssistantId.current) {
      lastAssistantId.current = last.id;
      pinReplyStart.current = true;
      if (stickToLatest.current) {
        const nodeTop = node.getBoundingClientRect().top;
        const turn = replyTurn();
        if (turn) setScroll(turn.getBoundingClientRect().top - nodeTop + node.scrollTop - 12);
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => positionCurrentReply()));
      }
    }
  }, [messages, positionCurrentReply, replyTurn, scrollToBottom, sending, setScroll, signature]);

  useEffect(() => {
    if (sending) return;
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => positionCurrentReply()));
    const timers = [180, 600].map((delay) => window.setTimeout(positionCurrentReply, delay));
    return () => { window.cancelAnimationFrame(frame); timers.forEach((timer) => window.clearTimeout(timer)); };
  }, [positionCurrentReply, sending]);

  // Reliable follow: a size/mutation observer catches streaming text and async
  // card hydration. No timed pin: once the learner scrolls up, stick is false.
  useEffect(() => {
    const node = timelineRef.current;
    if (!node) return;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        positionCurrentReply();
      });
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(node);
    const turn = replyTurn();
    if (turn) resize.observe(turn);
    const mutation = new MutationObserver(schedule);
    mutation.observe(node, { childList: true, subtree: true, characterData: true });
    schedule();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
    };
  }, [positionCurrentReply, replyTurn]);

  if (loading) return <HomeConversationSkeleton contexts={contexts} onRemoveContext={onRemoveContext} onSend={onSend} />;
  const lastMessage = messages[messages.length - 1];
  const awaitingReply = !sending && messages.length > 0 && lastMessage?.role === "user";
  const emptyAssistant = !sending && lastMessage?.role === "assistant" && !(lastMessage.parts ?? []).some((part) => (
    (part.type === "text" && Boolean((part as { text?: string }).text?.trim())) || part.type === "tool-displayCard"
  ));
  const visibleError = error || (emptyAssistant ? "助手这次没有生成有效回复，请重试。" : awaitingReply ? "回复没有完成。请重试。" : "");

  return <section className="ef-home-conversation" aria-label="EduFlow 对话">
    <div className="ef-home-timeline" ref={timelineRef} onScroll={onScroll} onWheel={() => markUserScroll()} onTouchMove={() => markUserScroll()} onClickCapture={(event) => { if ((event.target as HTMLElement).closest(".ef-ui-conversation-card")) stickToLatest.current = false; }} aria-live="polite" aria-relevant="additions text" aria-busy={sending}>
      <div className="ef-home-day"><span>今天</span></div>
      {!messages.length ? <Bubble from="assistant" meta={<AssistantMeta />}>
        <p className="ef-home-copy">你好，我是 EduFlow。先从你最想解决的一件事说起，哪怕还很模糊也可以。</p>
        {showStarterHint ? <p className="ef-home-copy ef-home-muted">也可以直接点「带我从最简单的开始」，先做几个小练习。</p> : null}
      </Bubble> : null}
      {previewPerson ? <PreviewPersonCard person={previewPerson} /> : null}
      {!messages.length ? <div className="ef-home-suggestions" aria-label="建议提问">{suggestions.map((prompt) => <button key={prompt} type="button" className="ef-ui-chip" onClick={() => void onSend(prompt)}>{prompt}</button>)}</div> : null}
      <AssistantTimeline messages={messages} session={session} actions={cardActions} sending={sending} />
      {visibleError ? <div className="ef-home-error" role="alert"><AlertTriangle size={15} aria-hidden="true" /><span>{visibleError}</span><button type="button" onClick={onRetry}><RefreshCw size={13} />重试</button></div> : null}
    </div>
    <div className="ef-home-composer">
      {composerHeader}
      {showJump ? <div className="ef-home-jump-row"><button type="button" className="ef-home-jump" onClick={() => scrollToBottom("smooth")}>回到最新<span aria-hidden="true">↓</span></button></div> : null}
      <HomeComposer contexts={contexts} onRemoveContext={onRemoveContext} onSubmit={(value) => void onSend(value)} disabled={sending} hint={<span>Enter 发送 · Shift + Enter 换行</span>} />
    </div>
  </section>;
}

function AssistantMeta() {
  return <span className="ef-home-assistant-meta">EduFlow Assistant</span>;
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

export function HomeConversationSkeleton({ contexts, onRemoveContext, onSend }: { contexts: ComposerContext[]; onRemoveContext: (id: string) => void; onSend: (message: string) => Promise<boolean> | boolean }) {
  return <section className="ef-home-conversation ef-home-conversation-skeleton" aria-label="正在加载对话">
    <div className="ef-home-timeline" role="status" aria-label="正在加载学习上下文">
      <div className="ef-home-skeleton-row"><span className="ef-home-skeleton-avatar" /><span className="ef-home-skeleton-bubble" /></div>
      <div className="ef-home-skeleton-row is-user"><span className="ef-home-skeleton-bubble short" /></div>
      <div className="ef-home-skeleton-row"><span className="ef-home-skeleton-avatar" /><span className="ef-home-skeleton-bubble tall" /></div>
      <div className="ef-home-skeleton-row"><span className="ef-home-skeleton-avatar" /><span className="ef-home-skeleton-line">正在准备回答…</span></div>
    </div>
    <div className="ef-home-composer">
      <HomeComposer contexts={contexts} onRemoveContext={onRemoveContext} onSubmit={(value) => void onSend(value)} hint={<span>Enter 发送 · Shift + Enter 换行</span>} />
    </div>
  </section>;
}

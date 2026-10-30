import { AlertTriangle, ArrowRight, BookOpen, RefreshCw, Sparkles, Target } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { AssistantMessage } from "@/features/assistant/assistantContract";
import { Bubble, ConversationCard, EventRow } from "@/shared/ui/Conversation";
import { HomeComposer, type ComposerContext } from "@/shared/ui/HomeComposer";
import { PreviewBadge } from "@/shared/ui/PreviewBadge";
import { Pill } from "@/shared/ui/Pill";
import type { FollowedPerson } from "@/features/profile/people/PeopleRepository";
import { archiveHref } from "@/features/archive/model/atlasParams";

export type HomeConversationProps = {
  messages: AssistantMessage[];
  loading: boolean;
  sending: boolean;
  error: string;
  contexts: ComposerContext[];
  onRemoveContext: (id: string) => void;
  onSend: (message: string) => Promise<boolean> | boolean;
  suggestions: string[];
  todayCard?: ReactNode;
  eventRow?: ReactNode;
  coursePreview?: ReactNode;
  microCard?: ReactNode;
  previewPerson: FollowedPerson | null;
  onRetry: () => void;
};

/** Home conversation workbench. It uses the Global Assistant session and never writes directly. */
export function HomeConversation({ messages, loading, sending, error, contexts, onRemoveContext, onSend, suggestions, todayCard, eventRow, coursePreview, microCard, previewPerson, onRetry }: HomeConversationProps) {
  const navigate = useNavigate();
  const timelineRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!messages.length && !sending) return;
    const node = timelineRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending]);

  if (loading) return <HomeConversationSkeleton contexts={contexts} onRemoveContext={onRemoveContext} onSend={onSend} />;

  return <section className="ef-home-conversation" aria-label="EduFlow 对话">
    <div className="ef-home-timeline" ref={timelineRef} aria-live="polite" aria-relevant="additions text" aria-busy={sending}>
      <div className="ef-home-day"><span>今天</span></div>
      <Bubble from="assistant" meta={<AssistantMeta />}>
        <p className="ef-home-copy">你好，我是 EduFlow。先从你最想解决的一件事说起，哪怕还很模糊也可以。</p>
        <p className="ef-home-copy ef-home-muted">我会读取你的真实学习上下文；任何学习状态变更仍需要预览、校验和你的确认。</p>
      </Bubble>
      {eventRow}
      {previewPerson ? <PreviewPersonCard person={previewPerson} /> : null}
      {!messages.length ? <div className="ef-home-suggestions" aria-label="建议提问">{suggestions.map((prompt) => <button key={prompt} type="button" className="ef-ui-chip" onClick={() => void onSend(prompt)}>{prompt}</button>)}</div> : null}
      {todayCard}
      {messages.map((message) => <MessageRow key={message.id} message={message} />)}
      {coursePreview}
      {microCard}
      {sending ? <EventRow icon={<Sparkles size={15} />} title="正在整理你的学习情况" detail="EduFlow 正在读取对话上下文…" className="ef-home-thinking" /> : null}
      {error ? <div className="ef-home-error" role="alert"><AlertTriangle size={15} aria-hidden="true" /><span>{error}</span><button type="button" onClick={onRetry}><RefreshCw size={13} />重试</button></div> : null}
    </div>
    <div className="ef-home-composer">
      <HomeComposer contexts={contexts} onRemoveContext={onRemoveContext} onSubmit={(value) => void onSend(value)} disabled={sending} hint={<span>Enter 发送 · Shift + Enter 换行 · 助手只提议，变更需要预览与确认</span>} />
    </div>
  </section>;
}

function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => part.startsWith("**") && part.endsWith("**")
    ? <strong key={`b${index}`}>{part.slice(2, -2)}</strong>
    : <span key={`t${index}`}>{part}</span>);
}

/** Small, safe markdown subset for assistant replies; no raw HTML is rendered. */
function renderAssistantText(text: string): ReactNode[] {
  const output: ReactNode[] = [];
  let list: string[] = [];
  let table: string[][] = [];
  let key = 0;
  const flushList = () => {
    if (!list.length) return;
    output.push(<ul key={`ul${key++}`}>{list.map((item, index) => <li key={`li${index}`}>{renderInline(item)}</li>)}</ul>);
    list = [];
  };
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell)));
    output.push(<div className="ef-home-md-table" key={`tb${key++}`}>{rows.map((row, rowIndex) => <div key={`tr${rowIndex}`}>{row.map((cell, cellIndex) => <span key={`td${cellIndex}`}>{renderInline(cell)}</span>)}</div>)}</div>);
    table = [];
  };
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) { flushList(); flushTable(); continue; }
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushList();
      table.push(trimmed.slice(1, -1).split("|").map((cell) => cell.trim()));
      continue;
    }
    flushTable();
    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) { flushList(); output.push(<strong className="ef-home-md-heading" key={`h${key++}`}>{renderInline(heading[2])}</strong>); continue; }
    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    if (bullet) { list.push(bullet[1]); continue; }
    flushList();
    output.push(<p key={`p${key++}`}>{renderInline(trimmed)}</p>);
  }
  flushList(); flushTable();
  return output;
}

function AssistantMeta() {
  return <span className="ef-home-assistant-meta"><Sparkles size={12} aria-hidden="true" />EduFlow Assistant</span>;
}

function MessageRow({ message }: { message: AssistantMessage }) {
  const structured = message.structuredContent;
  const [expanded, setExpanded] = useState(false);
  const long = message.role === "assistant" && message.content.length > 620;
  const text = long && !expanded ? `${message.content.slice(0, 620)}…` : message.content;
  const content = <div className="ef-home-message-content">
    {message.role === "assistant" ? <div className="ef-home-copy ef-home-rich">{renderAssistantText(text || "正在回复…")}</div> : <p className="ef-home-copy">{message.content}</p>}
    {long ? <button type="button" className="ef-home-expand" onClick={() => setExpanded((value) => !value)}>{expanded ? "收起" : `展开全文 · ${message.content.length} 字`}</button> : null}
    {structured?.type === "course_search" ? <CourseSearchMini content={structured} /> : null}
    {structured?.type === "course_creation_brief" ? <BriefMini content={structured} /> : null}
  </div>;
  return <div className="ef-home-message-row" data-role={message.role}>
    {message.role === "assistant" ? <span className="ef-home-assistant-mark" aria-hidden="true"><Sparkles size={14} /></span> : null}
    <Bubble from={message.role} meta={formatTime(message.createdAt)}>{content}</Bubble>
  </div>;
}

function CourseSearchMini({ content }: { content: Extract<NonNullable<AssistantMessage["structuredContent"]>, { type: "course_search" }> }) {
  const navigate = useNavigate();
  const matches = content.plan.matches.slice(0, 3);
  return <ConversationCard size="s" label="课程匹配结果">
    <div className="ef-home-structured-card">
      <div className="ef-home-structured-head"><Target size={15} aria-hidden="true" /><strong>课程匹配</strong><Pill tone="brand">{matches.length} 门</Pill></div>
      <p>{content.intentSummary}</p>
      <ul>{matches.map((match) => <li key={match.courseId}><button type="button" onClick={() => navigate(`/courses/${encodeURIComponent(match.courseId)}`)}><span><strong>{match.courseTitle}</strong><small>目标覆盖 {Math.round(match.targetCoverage * 100)}% · 必要范围 {Math.round(match.requiredCoverage * 100)}%</small></span><ArrowRight size={14} aria-hidden="true" /></button></li>)}</ul>
      {!matches.length ? <p className="ef-home-muted">当前没有匹配的课程，可以继续和助手讨论目标。</p> : null}
    </div>
  </ConversationCard>;
}

function BriefMini({ content }: { content: Extract<NonNullable<AssistantMessage["structuredContent"]>, { type: "course_creation_brief" }> }) {
  const navigate = useNavigate();
  return <ConversationCard size="s" label="课程创建简报">
    <div className="ef-home-structured-card">
      <div className="ef-home-structured-head"><BookOpen size={15} aria-hidden="true" /><strong>课程创建简报</strong></div>
      <p>{content.goal}</p>
      <p className="ef-home-muted">目标知识 {content.targetKnowledge.length} 项 · 参考{content.referenceMaterialIntent === "upload_in_creator" ? "资料将在创建页上传" : "资料暂无"}</p>
      <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => navigate(`/courses/create?briefId=${encodeURIComponent(content.briefId)}`)}>进入课程创建<ArrowRight size={13} /></button>
    </div>
  </ConversationCard>;
}

function PreviewPersonCard({ person }: { person: FollowedPerson }) {
  const navigate = useNavigate();
  const isPrivate = person.visibility === "private";
  return <div className="ef-home-person-card" data-preview="sample">
    <ConversationCard size="l" label={`预览人物 ${person.displayName}`}>
      <div className="ef-home-person-inner">
        <div className="ef-home-person-head">
          <span className={`ef-home-person-avatar accent-${person.accent}`} aria-hidden="true">{person.displayName.replace("示例 · ", "").slice(0, 1) || "友"}</span>
          <span><strong>{person.displayName} · 学习进度</strong><small>{person.handle} · 公开档案</small></span>
          <PreviewBadge />
        </div>
        {isPrivate ? <div className="ef-home-person-private"><strong>对方未公开学习进度</strong><p>可以请 TA 分享，或先查看公开档案。预览不会展示分数、失败尝试、对话或 AI 评价。</p></div> : <div className="ef-home-person-progress">
          <div><span>公开进度</span><strong>{person.sharedKnowledgeCount} 个知识</strong></div>
          <div className="ef-home-person-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, person.sharedKnowledgeCount * 6)}%` }} /></div>
          <p>{person.activityLabel}</p>
        </div>}
        <div className="ef-home-person-actions"><button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => navigate(archiveHref({ panel: "people" }))}>查看档案</button><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={() => navigate(archiveHref({ panel: "people", compare: [person.id] }))}>在档案中对比<ArrowRight size={13} /></button></div>
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
      <div className="ef-home-skeleton-row"><span className="ef-home-skeleton-avatar" /><span className="ef-home-skeleton-line">正在整理你的学习情况</span></div>
    </div>
    <div className="ef-home-composer">
      <HomeComposer contexts={contexts} onRemoveContext={onRemoveContext} onSubmit={(value) => void onSend(value)} hint={<span>Enter 发送 · Shift + Enter 换行 · 助手只提议，变更需要预览与确认</span>} />
    </div>
  </section>;
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "已读" : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

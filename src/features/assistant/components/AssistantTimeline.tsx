import { AlertTriangle, Check, RefreshCw, Sparkles } from "lucide-react";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { applicationServices } from "@/app/services/applicationServices";
import { ASSISTANT_REPLY_FAILURE, type AssistantUIMessage } from "@/features/assistant/AssistantRuntimeContext";
import type { AssistantStructuredContent, CourseCreationBrief, CourseSearchTimelineContent } from "@/features/assistant/assistantContract";
import { AssistantCardView, type AssistantCardActions } from "@/features/assistant/cards/AssistantCardView";
import { AssistantMarkdown } from "@/features/assistant/cards/AssistantMarkdown";
import { PROTOCOL_HIDDEN_MESSAGE } from "@/features/assistant/protocolGuard";
import type { MockSession } from "@/features/auth/types";
import { Bubble, EventRow } from "@/shared/ui/Conversation";
import { conversationDayKey, formatConversationDay } from "@/shared/ui/conversationDates";
import "./assistantTimeline.css";

type TimelineTextPart = { type: "text"; text: string };

/** Bubble-less assistant copy: the answer text shares the column left edge with cards. */
export function AssistantText({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return <div className="ef-assistant-text" data-role="assistant">
    <div className="ef-assistant-body">{children}</div>
    {meta ? <small className="ef-assistant-time">{meta}</small> : null}
  </div>;
}

function StoppedMarker() {
  return <p className="ef-assistant-stopped" role="status">已停止回复</p>;
}

function isTextPart(part: unknown): part is TimelineTextPart {
  return Boolean(part) && typeof part === "object" && (part as { type?: string }).type === "text" && typeof (part as { text?: unknown }).text === "string";
}

function WriteResultRow({ data, actions }: { data: { toolName: string; ok: boolean; title: string; detail?: string; card?: { courseId: string; assignmentId: string } }; actions: AssistantCardActions }) {
  return <div className={`ef-assistant-write-result${data.ok ? " is-ok" : " is-failed"}`} data-write-result={data.toolName} role="status">
    <span className="ef-assistant-write-result-icon" aria-hidden="true">{data.ok ? <Check size={13} /> : <AlertTriangle size={13} />}</span>
    <span><strong>{data.title}</strong>{data.detail ? <small>{data.detail}</small> : null}</span>
    {data.card ? <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => actions.openObject({ kind: "practice", courseId: data.card!.courseId, assignmentId: data.card!.assignmentId })}>查看任务</button> : null}
  </div>;
}

export function AssistantTimeline({ messages, session, actions, sending, showDaySeparators = false, onSuggestion, onRetry }: {
  messages: AssistantUIMessage[];
  session: MockSession;
  actions: AssistantCardActions;
  sending: boolean;
  showDaySeparators?: boolean;
  onSuggestion?: (text: string) => void;
  onRetry?: () => void;
}) {
  const [, setRevision] = useState(0);
  useEffect(() => {
    const unsubscribers = [
      applicationServices.microLearningRepository.subscribe(() => setRevision((value) => value + 1)),
      applicationServices.learningProgressRepository.subscribe(() => setRevision((value) => value + 1)),
      applicationServices.userKnowledgeRepository.subscribe(() => setRevision((value) => value + 1))
    ];
    return () => { for (const unsubscribe of unsubscribers) unsubscribe(); };
  }, []);

  const unanswered = unansweredUserMessages(messages);
  let previousDay = "";
  return <div className="ef-assistant-timeline" data-sending={sending ? "true" : "false"}>
    {messages.map((message, index) => {
      const day = conversationDayKey(message.metadata?.createdAt);
      const showDay = showDaySeparators && day !== previousDay;
      previousDay = day;
      return <Fragment key={message.id}>
        {showDay ? <div className="ef-home-day"><span>{formatConversationDay(message.metadata?.createdAt)}</span></div> : null}
        <AssistantTimelineMessage
          message={message}
          session={session}
          actions={actions}
          streaming={sending && message.role === "assistant" && index === messages.length - 1}
          unanswered={unanswered.has(message.id)}
          isLast={index === messages.length - 1}
          onSuggestion={onSuggestion}
          onRetry={onRetry}
        />
      </Fragment>;
    })}
    {sending && messages[messages.length - 1]?.role === "user" ? <EventRow icon={<Sparkles size={15} />} title="正在准备回答…" className="ef-home-thinking" /> : null}
  </div>;
}

export function AssistantTimelineMessage({ message, session, actions, streaming = false, unanswered = false, isLast = false, onSuggestion, onRetry }: {
  message: AssistantUIMessage;
  session: MockSession;
  actions: AssistantCardActions;
  streaming?: boolean;
  unanswered?: boolean;
  isLast?: boolean;
  onSuggestion?: (text: string) => void;
  onRetry?: () => void;
}) {
  const metadata = message.metadata;
  const legacy = metadata?.structuredContent;
  const isAction = metadata?.messageKind === "action";
  // Structured Brief/Search action rows remain readable; operation rows are
  // filtered before they reach the timeline.
  const hidden = Boolean(metadata?.invalidReason);
  const parts = message.parts ?? [];
  const textBlocks = parts.filter(isTextPart);
  const nonEmptyText = textBlocks.filter((part) => part.text.trim().length > 0);
  const totalText = nonEmptyText.reduce((sum, part) => sum + part.text.length, 0);
  const failed = parts.some((part) => part.type === "data-failed");

  if (message.role === "user") {
    const text = textBlocks.map((part) => part.text).join("\n");
    const files = parts.flatMap((part) => part.type === "data-attachment" && part.data && typeof part.data === "object"
      ? [{ id: String((part.data as { id?: string }).id ?? ""), title: String((part.data as { title?: string }).title ?? "附件") }]
      : []);
    const marker = metadata?.stopped ? <StoppedMarker /> : null;
    if (isAction) return null;
    return <><div className="ef-home-message-row" data-role="user">
      <Bubble from="user" meta={formatTime(metadata?.createdAt)}>
        {text ? <p className="ef-home-copy">{text}</p> : null}
        {files.length ? <ul className="ef-assistant-user-files">{files.map((file) => <li key={file.id}><span aria-hidden="true">▤</span>{file.title}</li>)}</ul> : null}
      </Bubble>
    </div>{unanswered ? <p className="ef-assistant-no-reply">没有回复</p> : null}{marker}</>;
  }

  let textIndex = 0;
  const ordered: Array<{ kind: "text" | "card" | "meta"; node: ReactNode }> = [];
  const followUps = parts.flatMap((part) => part.type === "data-follow-ups" && part.data && typeof part.data === "object" && Array.isArray((part.data as { items?: unknown }).items)
    ? ((part.data as { items: unknown[] }).items.flatMap((item) => {
        if (typeof item === "string" && item.trim()) return [{ text: item.trim() }];
        if (item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string") {
          return [{ text: String((item as { text: string }).text).trim() }];
        }
        return [];
      }).slice(0, 3))
    : []);
  for (const [partIndex, part] of parts.entries()) {
    if (isTextPart(part)) {
      const first = textIndex === 0;
      textIndex += 1;
      const text = hidden ? PROTOCOL_HIDDEN_MESSAGE : part.text;
      if (!text.trim()) continue;
      ordered.push({ kind: "text", node: <AssistantText key={`text-${partIndex}`} meta={first ? formatTime(metadata?.createdAt) : undefined}>
        <AssistantMarkdown text={text} streaming={streaming && partIndex === parts.length - 1} />
      </AssistantText> });
      continue;
    }
    if (part.type === "data-tool-progress" && part.data && typeof part.data === "object") {
      // The tool plugin declared this label when it registered; the timeline
      // only renders the persisted/streamed value and never maps tool names.
      const label = String((part.data as { label?: unknown }).label ?? "读取产品数据");
      ordered.push({ kind: "meta", node: <details key={`tool-${partIndex}`} className="ef-assistant-tool-progress-details" data-tool-progress="true"><summary><Sparkles size={12} aria-hidden="true" /><span>{label}</span></summary></details> });
      continue;
    }
    if (part.type === "data-write-result" && part.data && typeof part.data === "object") {
      const data = part.data as { toolName?: unknown; ok?: unknown; title?: unknown; detail?: unknown; card?: { courseId: string; assignmentId: string } };
      if (typeof data.toolName === "string" && typeof data.ok === "boolean" && typeof data.title === "string") {
        ordered.push({ kind: "meta", node: <WriteResultRow key={`write-${partIndex}`} data={{ toolName: data.toolName, ok: data.ok, title: data.title, ...(typeof data.detail === "string" ? { detail: data.detail } : {}), ...(data.card ? { card: data.card } : {}) }} actions={actions} /> });
      }
      continue;
    }
    if (part.type === "tool-displayCard") {
      const output = (part as { output?: unknown }).output;
      const toolCallId = (part as { toolCallId?: unknown }).toolCallId;
      const cardKey = typeof toolCallId === "string" && toolCallId ? toolCallId : `${message.id}:${partIndex}`;
      ordered.push({ kind: "card", node: <AssistantCardView key={`card-${partIndex}`} output={output} session={session} actions={actions} cardKey={cardKey} /> });
    }
  }

  if (followUps.length && !streaming) {
    ordered.push({ kind: "meta", node: <div key="follow-ups" className="ef-assistant-followups" aria-label="后续建议">
      {followUps.map((suggestion) => <button key={suggestion.text} type="button" className="ef-ui-chip" onClick={() => onSuggestion?.(suggestion.text)}>{suggestion.text}</button>)}
    </div> });
  }

  if (!isAction && !metadata?.stopped && !failed && nonEmptyText.length === 0 && !ordered.some((entry) => entry.kind === "card" || entry.kind === "meta")) {
    ordered.push({ kind: "text", node: <AssistantText key="fallback" meta={formatTime(metadata?.createdAt)}>
      <p className="ef-home-copy ef-home-muted">{streaming ? "正在回复…" : ASSISTANT_REPLY_FAILURE}</p>
    </AssistantText> });
  }
  const content = ordered.map((entry) => entry.node);

  return <>
    <div className={`ef-assistant-turn${isAction ? " is-action" : ""}`} data-role="assistant" data-message-id={message.id} data-message-kind={metadata?.messageKind ?? "utterance"}>
      {content}
    </div>
    {legacy ? <LegacyStructuredCard content={legacy} messageId={message.id} session={session} actions={actions} /> : null}
    {failed ? <div className="ef-assistant-failed" role="alert">
      <AlertTriangle size={14} aria-hidden="true" />
      <span>{ASSISTANT_REPLY_FAILURE}</span>
      {isLast && onRetry ? <button type="button" onClick={onRetry}><RefreshCw size={12} aria-hidden="true" />重试</button> : null}
    </div> : null}
    {metadata?.stopped ? <StoppedMarker /> : null}
  </>;
}

function hasAssistantPayload(message: AssistantUIMessage) {
  return (message.parts ?? []).some((part) => (
    (part.type === "text" && Boolean((part as { text?: string }).text?.trim()))
    || part.type === "tool-displayCard"
    || part.type === "data-follow-ups"
  ));
}

/** A failed turn followed by another question gets one grey line, not a new reply. */
function unansweredUserMessages(messages: AssistantUIMessage[]) {
  const unanswered = new Set<string>();
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role !== "user") continue;
    let answered = false;
    let laterUser = false;
    for (let next = index + 1; next < messages.length; next += 1) {
      const candidate = messages[next];
      if (candidate.role === "user") { laterUser = true; break; }
      if (hasAssistantPayload(candidate)) { answered = true; break; }
    }
    if (laterUser && !answered) unanswered.add(message.id);
  }
  return unanswered;
}

/**
 * Legacy structured rows store their own plan/brief payload. They are only
 * adapted into the same card references and display props the current cards
 * use; there is no second view implementation.
 */
function LegacyStructuredCard({ content, messageId, session, actions }: { content: AssistantStructuredContent; messageId: string; session: MockSession; actions: AssistantCardActions }) {
  if (content.type === "course_search") return <LegacyCourseSearchCard content={content} session={session} actions={actions} />;
  if (content.type === "course_creation_brief") return <LegacyBriefCard content={content} messageId={messageId} session={session} actions={actions} />;
  return null;
}

function LegacyCourseSearchCard({ content, session, actions }: { content: CourseSearchTimelineContent; session: MockSession; actions: AssistantCardActions }) {
  const matches = content.plan.matches;
  if (!matches.length) return <p className="ef-home-structured-note">课程匹配结果 · 暂无匹配课程</p>;
  const targetKnowledgeIds = content.plan.resolution.targetKnowledge.map((item) => item.id);
  return <AssistantCardView
    output={{
      card: {
        cardType: "course_match",
        courseIds: matches.map((match) => match.courseId),
        targetKnowledgeIds,
        goalText: content.goalText
      },
      display: {
        title: "课程匹配",
        kicker: "课程匹配结果",
        description: content.intentSummary,
        items: matches.map((match) => ({
          id: match.courseId,
          title: match.courseTitle,
          meta: `目标覆盖 ${Math.round(match.targetCoverage * 100)}% · 必要范围 ${Math.round(match.requiredCoverage * 100)}%`,
          state: "quiet" as const
        })),
        actionLabel: "查看课程"
      }
    }}
    session={session}
    actions={actions}
    cardKey={`legacy-course-search:${content.planningId}`}
  />;
}

function LegacyBriefCard({ content, messageId, session, actions }: { content: CourseCreationBrief; messageId: string; session: MockSession; actions: AssistantCardActions }) {
  return <AssistantCardView
    output={{
      card: { cardType: "brief", messageId },
      display: {
        title: content.goal,
        kicker: "课程创建简报",
        description: content.requestedAdjustments ?? "课程创建简报",
        meta: [`目标知识点 ${content.targetKnowledge.length} 项`, content.referenceMaterialIntent === "upload_in_creator" ? "资料在创建页上传" : "资料暂无"],
        actionLabel: "查看课程简介"
      }
    }}
    session={session}
    actions={actions}
    cardKey={`legacy-brief:${messageId}`}
  />;
}

function formatTime(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "已读" : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

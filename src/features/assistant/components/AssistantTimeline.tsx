import { Check, Sparkles, Target } from "lucide-react";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { applicationServices } from "@/app/services/applicationServices";
import type { AssistantUIMessage } from "@/features/assistant/AssistantRuntimeContext";
import type { AssistantContextSnapshot, AssistantStructuredContent, CourseCreationBrief, CourseSearchTimelineContent } from "@/features/assistant/assistantContract";
import { collectSkippedCompletedCards } from "@/features/assistant/cardDedupe";
import { AssistantCardView, type AssistantCardActions } from "@/features/assistant/cards/AssistantCardView";
import { satisfiesTeachingPrerequisite } from "@/shared/learning/teachingPrerequisites";
import { AssistantMarkdown } from "@/features/assistant/cards/AssistantMarkdown";
import { PROTOCOL_HIDDEN_MESSAGE } from "@/features/assistant/protocolGuard";
import type { MockSession } from "@/features/auth/types";
import { Bubble, ConversationCard, EventRow } from "@/shared/ui/Conversation";
import { Pill } from "@/shared/ui/Pill";
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

export function AssistantTimeline({ messages, session, actions, sending, showDaySeparators = false }: {
  messages: AssistantUIMessage[];
  session: MockSession;
  actions: AssistantCardActions;
  sending: boolean;
  showDaySeparators?: boolean;
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

  // Completed results are projected by object identity. The learner keeps the
  // first card they saw; every later copy from a completion reply is hidden,
  // including when the model switches between Micro and Knowledge cards.
  const learnedNodes = new Set(applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId)
    .filter((record) => satisfiesTeachingPrerequisite(record.status))
    .map((record) => record.nodeId));
  const completionLookup = {
    isMicroCompleted: (pathId: string) => applicationServices.microLearningRepository.getPathProgress(pathId)?.status === "completed",
    knowledgePathId: (card: { nodeId: string; pathId?: string; courseId?: string }) => {
      const path = applicationServices.microLearningRepository.getPath(card.nodeId, {
        mode: "learn",
        ...(card.pathId ? { pathId: card.pathId } : {}),
        ...(card.courseId ? { courseId: card.courseId } : {})
      });
      return path && applicationServices.microLearningRepository.getPathProgress(path.id)?.status === "completed" ? path.id : null;
    },
    isKnowledgeLearned: (nodeId: string) => learnedNodes.has(nodeId),
    isPracticeCompleted: (card: { courseId: string; assignmentId: string }) => {
      const state = applicationServices.learningProgressRepository.getCourseState(session.userId, card.courseId)?.assignmentStates[card.assignmentId]?.status;
      return state === "accepted" || state === "completed";
    }
  };
  const skippedCards = collectSkippedCompletedCards(messages, completionLookup);
  // Unfinished Micro nominations keep the previous rule: a later explicit
  // Continue action wins over an older recommendation. Completed paths are
  // already owned by the first-seen projection above.
  const seenMicroPaths = new Set<string>();
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    const parts = message.parts ?? [];
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = parts[partIndex];
      if (part.type !== "tool-displayCard") continue;
      const card = (part as { output?: { card?: { cardType?: string; pathId?: string } } }).output?.card;
      if (card?.cardType !== "micro" || !card.pathId) continue;
      if (completionLookup.isMicroCompleted(card.pathId)) continue;
      if (seenMicroPaths.has(card.pathId)) skippedCards.add(`${message.id}:${partIndex}`);
      else seenMicroPaths.add(card.pathId);
    }
  }
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
          skippedCards={skippedCards}
          streaming={sending && message.role === "assistant" && index === messages.length - 1}
        />
      </Fragment>;
    })}
    {sending && messages[messages.length - 1]?.role === "user" ? <EventRow icon={<Sparkles size={15} />} title="正在准备回答…" className="ef-home-thinking" /> : null}
  </div>;
}

export function AssistantTimelineMessage({ message, session, actions, streaming = false, skippedCards }: {
  message: AssistantUIMessage;
  session: MockSession;
  actions: AssistantCardActions;
  streaming?: boolean;
  skippedCards?: ReadonlySet<string>;
}) {
  const metadata = message.metadata;
  const legacy = metadata?.structuredContent;
  const isAction = metadata?.messageKind === "action";
  const hidden = Boolean(metadata?.invalidReason);
  const parts = message.parts ?? [];
  const textBlocks = parts.filter(isTextPart);
  const nonEmptyText = textBlocks.filter((part) => part.text.trim().length > 0);
  const totalText = nonEmptyText.reduce((sum, part) => sum + part.text.length, 0);
  const context = metadata?.context ?? ({ workspace: "learning", experienceMode: "learn" } satisfies AssistantContextSnapshot);

  if (message.role === "user") {
    const text = textBlocks.map((part) => part.text).join("\n");
    const marker = metadata?.stopped ? <StoppedMarker /> : null;
    if (isAction) {
      // Completion is a system event, not a chat bubble; button choices such as
      // "带我从最简单的开始" remain learner messages.
      if (/^完成(?:小练习|动手任务)[：:]/.test(text)) return <><div className="ef-assistant-completion-row" data-role="event"><Check size={14} aria-hidden="true" /><span>{text}</span></div>{marker}</>;
      return <><div className="ef-home-message-row" data-role="user">
        <Bubble from="user" meta={formatTime(metadata?.createdAt)}><p className="ef-home-copy">{text}</p></Bubble>
      </div>{marker}</>;
    }
    return <><div className="ef-home-message-row" data-role="user">
      <Bubble from="user" meta={formatTime(metadata?.createdAt)}><p className="ef-home-copy">{text}</p></Bubble>
    </div>{marker}</>;
  }

  let textIndex = 0;
  const ordered: Array<{ kind: "text" | "card"; node: ReactNode }> = [];
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
    if (part.type === "tool-displayCard") {
      if (skippedCards?.has(`${message.id}:${partIndex}`)) continue;
      const output = (part as { output?: unknown }).output;
      ordered.push({ kind: "card", node: <AssistantCardView key={`card-${partIndex}`} output={output} session={session} actions={actions} /> });
    }
  }

  const pendingToolPart = streaming && totalText === 0
    ? parts.find((part) => part.type.startsWith("tool-") && part.type !== "tool-displayCard")
    : undefined;
  const pendingTool = Boolean(pendingToolPart);
  if (!isAction && pendingToolPart) {
    const toolName = pendingToolPart.type.slice("tool-".length);
    const toolLabel: Record<string, string> = {
      getNavigationDecision: "正在确认下一步",
      getCourseContext: "正在查看课程",
      getLearnerState: "正在查看学习进度",
      getMicroContext: "正在查看小练习",
      getAssignmentContext: "正在查看任务",
      getMaterialContext: "正在查看资料",
      searchKnowledge: "正在查找要点",
      searchCourses: "正在查找课程",
      planLearningGoal: "正在整理目标"
    };
    ordered.push({ kind: "text", node: <EventRow key="tool-progress" icon={<Sparkles size={15} />} title={toolLabel[toolName] ?? "正在准备回答…"} className="ef-assistant-tool-progress" /> });
  }

  if (!isAction && !pendingTool && !metadata?.stopped && nonEmptyText.length === 0 && !ordered.some((entry) => entry.kind === "card")) {
    ordered.push({ kind: "text", node: <AssistantText key="fallback" meta={formatTime(metadata?.createdAt)}>
      <p className="ef-home-copy ef-home-muted">{streaming ? "正在回复…" : "这次没有生成回复，请重试。"}</p>
    </AssistantText> });
  }
  const cardNodes = ordered.filter((entry) => entry.kind === "card").map((entry) => entry.node);
  const content = ordered.map((entry) => entry.node);

  return <>
    <div className={`ef-assistant-turn${isAction ? " is-action" : ""}`} data-role="assistant" data-message-id={message.id} data-message-kind={metadata?.messageKind ?? "utterance"}>
      {isAction && totalText ? <AssistantText meta={formatTime(metadata?.createdAt)}>
        <AssistantMarkdown text={textBlocks.map((part) => part.text).join("\n")} streaming={streaming} />
      </AssistantText> : null}
      {isAction ? cardNodes : content}
    </div>
    {legacy ? <LegacyStructuredCard content={legacy} messageId={message.id} actions={actions} context={context} /> : null}
    {metadata?.stopped ? <StoppedMarker /> : null}
  </>;
}

function LegacyStructuredCard({ content, messageId, actions, context }: { content: AssistantStructuredContent; messageId: string; actions: AssistantCardActions; context: AssistantContextSnapshot }) {
  if (content.type === "course_search") return <LegacyCourseSearch content={content} messageId={messageId} actions={actions} context={context} />;
  if (content.type === "course_creation_brief") return <LegacyBrief content={content} messageId={messageId} actions={actions} context={context} />;
  return null;
}

function LegacyCourseSearch({ content, messageId, actions, context }: { content: CourseSearchTimelineContent; messageId: string; actions: AssistantCardActions; context: AssistantContextSnapshot }) {
  const matches = content.plan.matches.slice(0, 3);
  const [busy, setBusy] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);
  const [refinement, setRefinement] = useState("");
  const [error, setError] = useState("");
  async function useCourse(courseId: string) {
    if (!actions.useCourse || busy) return;
    setBusy(`use:${courseId}`); setError("");
    try { const selected = await actions.useCourse(messageId, courseId, context); actions.openCourse(selected); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "课程选择失败，请重试。"); }
    finally { setBusy(null); }
  }
  async function prepare(sourceCourseId?: string) {
    if (!actions.prepareBrief || busy) return;
    setBusy(sourceCourseId ? `brief:${sourceCourseId}` : "brief"); setError("");
    try { await actions.prepareBrief(messageId, { ...(sourceCourseId ? { sourceCourseId } : {}), referenceMaterialIntent: "none" }, context); setRefining(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "创建需求整理失败，请重试。"); }
    finally { setBusy(null); }
  }
  async function refine() {
    if (!actions.refineGoal || !refinement.trim() || busy) return;
    setBusy("refine"); setError("");
    try { await actions.refineGoal(messageId, refinement.trim(), context); setRefinement(""); setRefining(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "继续寻找失败，请重试。"); }
    finally { setBusy(null); }
  }
  return <ConversationCard size="s" label="课程匹配结果">
    <div className="ef-home-structured-card">
      <div className="ef-home-structured-head"><Target size={15} aria-hidden="true" /><strong>课程匹配</strong><Pill tone="brand">{matches.length} 门</Pill></div>
      <p>{content.intentSummary}</p>
      <ul>{matches.map((match) => <li key={match.courseId}>
        <button type="button" onClick={() => actions.openCourse(match.courseId)}><span><strong>{match.courseTitle}</strong><small>目标覆盖 {Math.round(match.targetCoverage * 100)}% · 必要范围 {Math.round(match.requiredCoverage * 100)}%</small></span><span aria-hidden="true">→</span></button>
        {actions.useCourse ? <div className="ef-legacy-goal-actions">
          <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" disabled={Boolean(busy)} onClick={() => void useCourse(match.courseId)}>{busy === `use:${match.courseId}` ? "正在加入…" : "使用这门课程"}</button>
          {actions.prepareBrief ? <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" disabled={Boolean(busy)} onClick={() => void prepare(match.courseId)}>基于这门课程创建</button> : null}
        </div> : null}
      </li>)}</ul>
      {!matches.length ? <p className="ef-home-muted">当前没有匹配的课程，可以继续和助手讨论目标。</p> : null}
      {error ? <p className="ef-home-error" role="alert">{error}</p> : null}
      {actions.refineGoal || actions.prepareBrief ? <div className="ef-legacy-goal-footer">
        {actions.refineGoal ? <button type="button" className="ef-ui-btn ef-ui-btn--ghost ef-ui-btn--32" disabled={Boolean(busy)} onClick={() => setRefining((value) => !value)}>继续寻找</button> : null}
        {actions.prepareBrief ? <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" disabled={Boolean(busy)} onClick={() => void prepare()}>创建个性化学习路线</button> : null}
      </div> : null}
      {refining ? <div className="ef-legacy-goal-refine">
        <label><span>这些结果哪里不符合你的预期？</span><textarea value={refinement} onChange={(event) => setRefinement(event.target.value)} placeholder="例如：太理论了，我希望一个月内做出项目" /></label>
        <div className="ef-legacy-goal-actions"><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" disabled={!refinement.trim() || Boolean(busy)} onClick={() => void refine()}>{busy === "refine" ? "重新搜索中…" : "重新搜索"}</button><button type="button" className="ef-ui-btn ef-ui-btn--ghost ef-ui-btn--32" onClick={() => setRefining(false)}>取消</button></div>
      </div> : null}
    </div>
  </ConversationCard>;
}

function LegacyBrief({ content, messageId, actions, context }: { content: CourseCreationBrief; messageId: string; actions: AssistantCardActions; context: AssistantContextSnapshot }) {
  const [editing, setEditing] = useState(false);
  const [adjustments, setAdjustments] = useState(content.requestedAdjustments ?? "");
  const [intent, setIntent] = useState<"none" | "upload_in_creator">(content.referenceMaterialIntent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function prepare() {
    if (!actions.prepareBrief || busy) return;
    setBusy(true); setError("");
    try {
      await actions.prepareBrief(content.planningMessageId, { ...(content.sourceCourseId ? { sourceCourseId: content.sourceCourseId } : {}), ...(adjustments.trim() ? { requestedAdjustments: adjustments.trim() } : {}), referenceMaterialIntent: intent }, context);
      setEditing(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "创建需求整理失败，请重试。"); }
    finally { setBusy(false); }
  }
  return <ConversationCard size="s" label="课程创建简报">
    <div className="ef-home-structured-card">
      <div className="ef-home-structured-head"><strong>课程创建简报</strong></div>
      <p>{content.goal}</p>
      <p className="ef-home-muted">目标要点 {content.targetKnowledge.length} 项 · 参考{content.referenceMaterialIntent === "upload_in_creator" ? "资料将在创建页上传" : "资料暂无"}</p>
      <div className="ef-legacy-goal-actions">
        {actions.prepareBrief ? <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" disabled={busy} onClick={() => setEditing((value) => !value)}>{editing ? "收起修改" : "修改需求"}</button> : null}
        <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => actions.openBrief(messageId)}>进入课程创建<span aria-hidden="true">→</span></button>
      </div>
      {editing ? <div className="ef-legacy-goal-refine">
        <label><span>调整学习偏好或限制</span><textarea value={adjustments} onChange={(event) => setAdjustments(event.target.value)} placeholder="例如：缩短路线、增加动手任务、调整难度" /></label>
        <fieldset><legend>参考资料</legend><label><input type="radio" checked={intent === "upload_in_creator"} onChange={() => setIntent("upload_in_creator")} />在创建页上传</label><label><input type="radio" checked={intent === "none"} onChange={() => setIntent("none")} />暂时没有</label></fieldset>
        <div className="ef-legacy-goal-actions"><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" disabled={busy} onClick={() => void prepare()}>{busy ? "正在整理…" : "重新生成简报"}</button><button type="button" className="ef-ui-btn ef-ui-btn--ghost ef-ui-btn--32" onClick={() => setEditing(false)}>取消</button></div>
      </div> : null}
      {error ? <p className="ef-home-error" role="alert">{error}</p> : null}
    </div>
  </ConversationCard>;
}

function formatTime(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "已读" : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

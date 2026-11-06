import { Sparkles, Target } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { AssistantUIMessage } from "@/features/assistant/AssistantRuntimeContext";
import type { AssistantContextSnapshot, AssistantStructuredContent, CourseCreationBrief, CourseSearchTimelineContent } from "@/features/assistant/assistantContract";
import { AssistantCardView, type AssistantCardActions } from "@/features/assistant/cards/AssistantCardView";
import { AssistantMarkdown } from "@/features/assistant/cards/AssistantMarkdown";
import { PROTOCOL_HIDDEN_MESSAGE } from "@/features/assistant/protocolGuard";
import type { MockSession } from "@/features/auth/types";
import { Bubble, ConversationCard, EventRow } from "@/shared/ui/Conversation";
import { Pill } from "@/shared/ui/Pill";
import "./assistantTimeline.css";

type TimelineTextPart = { type: "text"; text: string };

function isTextPart(part: unknown): part is TimelineTextPart {
  return Boolean(part) && typeof part === "object" && (part as { type?: string }).type === "text" && typeof (part as { text?: unknown }).text === "string";
}

export function AssistantTimeline({ messages, session, actions, sending }: {
  messages: AssistantUIMessage[];
  session: MockSession;
  actions: AssistantCardActions;
  sending: boolean;
}) {
  // A path may be nominated by both a completion reply and an explicit
  // Continue action. Keep only the newest card for that identity so one Micro
  // never renders twice in the same conversation.
  const seenMicroPaths = new Set<string>();
  const skippedCards = new Set<string>();
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    const parts = message.parts ?? [];
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = parts[partIndex];
      if (part.type !== "tool-displayCard") continue;
      const card = (part as { output?: { card?: { cardType?: string; pathId?: string } } }).output?.card;
      if (card?.cardType !== "micro" || !card.pathId) continue;
      if (seenMicroPaths.has(card.pathId)) skippedCards.add(`${message.id}:${partIndex}`);
      else seenMicroPaths.add(card.pathId);
    }
  }
  return <div className="ef-assistant-timeline" data-sending={sending ? "true" : "false"}>
    {messages.map((message, index) => <AssistantTimelineMessage
      key={message.id}
      message={message}
      session={session}
      actions={actions}
      skippedCards={skippedCards}
      streaming={sending && message.role === "assistant" && index === messages.length - 1}
    />)}
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
    if (isAction) return <div className="ef-assistant-action-user-row" data-role="user"><span>{text}</span></div>;
    return <div className="ef-home-message-row" data-role="user">
      <Bubble from="user" meta={formatTime(metadata?.createdAt)}><p className="ef-home-copy">{text}</p></Bubble>
    </div>;
  }

  let textIndex = 0;
  const ordered: Array<{ kind: "text" | "card"; node: ReactNode }> = [];
  for (const [partIndex, part] of parts.entries()) {
    if (isTextPart(part)) {
      const first = textIndex === 0;
      textIndex += 1;
      const text = hidden ? PROTOCOL_HIDDEN_MESSAGE : part.text;
      if (!text.trim()) continue;
      ordered.push({ kind: "text", node: <div className={`ef-assistant-text${first ? " is-first" : ""}`} data-role="assistant" key={`text-${partIndex}`}>
        {first ? <span className="ef-home-assistant-mark" aria-hidden="true"><Sparkles size={14} /></span> : null}
        <Bubble from="assistant" meta={first ? formatTime(metadata?.createdAt) : undefined} className={first ? "" : "is-continuation"}>
          <AssistantMarkdown text={text} streaming={streaming && partIndex === parts.length - 1} />
        </Bubble>
      </div> });
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

  if (!isAction && !pendingTool && nonEmptyText.length === 0 && !ordered.some((entry) => entry.kind === "card")) {
    ordered.push({ kind: "text", node: <div className="ef-assistant-text is-first" data-role="assistant" key="fallback">
      <span className="ef-home-assistant-mark" aria-hidden="true"><Sparkles size={14} /></span>
      <Bubble from="assistant" meta={formatTime(metadata?.createdAt)}>
        <p className="ef-home-copy ef-home-muted">{streaming ? "正在回复…" : "这次没有生成回复，请重试。"}</p>
      </Bubble>
    </div> });
  }
  const cardNodes = ordered.filter((entry) => entry.kind === "card").map((entry) => entry.node);
  const content = ordered.map((entry) => entry.node);

  return <>
    <div className={`ef-assistant-turn${isAction ? " is-action" : ""}`} data-role="assistant" data-message-kind={metadata?.messageKind ?? "utterance"}>
      {isAction && totalText ? <EventRow icon={<Sparkles size={15} />} title={<span className="ef-assistant-action-copy">{textBlocks.map((part) => part.text).join(" ")}</span>} className="ef-assistant-action-row" /> : null}
      {isAction ? cardNodes : content}
    </div>
    {legacy ? <LegacyStructuredCard content={legacy} messageId={message.id} actions={actions} context={context} /> : null}
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

import { BarChart3, BookOpen, ChevronUp, ClipboardCheck, FileText, Layers, Lightbulb, Maximize2, Network, PanelRight, Play, Route, Target, Wrench } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { applicationServices, refreshLearnerState } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import type { AssistantContextSnapshot } from "../assistantContract";
import { parseAssistantCardRef, type AssistantCardDisplay, type AssistantCardRef, type AssistantCardStatus } from "../assistantCards";
import { MicroFormSwitch, MicroSlot, useMicroEntry, useMicroHost } from "@/features/home/MicroHost";
import { buildHomeCourseProjection } from "@/features/course/path/courseLearnerProjection";
import { projectLearnedMap, summarizeFirstSegment } from "@/shared/learning/firstSegment";
import { satisfiesTeachingPrerequisite } from "@/shared/learning/teachingPrerequisites";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { ConversationCard } from "@/shared/ui/Conversation";
import { useNavigate } from "react-router-dom";
import { ObjectShell } from "@/shared/ui/ObjectShell";
import { Pill, type PillTone } from "@/shared/ui/Pill";
import { useConversationCardRegistry } from "@/shared/ui/conversationCardRegistry";
import "./assistantCards.css";

export type AssistantCardActions = {
  openCourse(courseId: string): void;
  openPractice(courseId: string, assignmentId: string): void;
  /** Open one historical Attempt's saved result; fallback is the latest. */
  openPracticeAttempt?(courseId: string, assignmentId: string, attemptId: string): void;
  openBrief(messageId: string): void;
  openMaterial(courseId: string, materialId: string, segmentId?: string): void;
  openRoutePanel?(courseId: string): void;
  openArchive?(focus?: string): void;
  recordMicroCompleted(input: { pathId: string; knowledgeId: string; courseId?: string }): void;
  useCourse?(planningMessageId: string, courseId: string, context: AssistantContextSnapshot): Promise<string>;
  refineGoal?(planningMessageId: string, refinement: string, context: AssistantContextSnapshot): Promise<void>;
  prepareBrief?(planningMessageId: string, input: { sourceCourseId?: string; requestedAdjustments?: string; referenceMaterialIntent: "none" | "upload_in_creator" }, context: AssistantContextSnapshot): Promise<void>;
};

type CardProps = {
  card: AssistantCardRef;
  display: AssistantCardDisplay;
  session: MockSession;
  actions: AssistantCardActions;
};

const toneMap: Record<NonNullable<AssistantCardStatus["tone"]>, PillTone> = {
  ok: "ok",
  warn: "warn",
  brand: "brand",
  quiet: "quiet"
};

function iconFor(type: AssistantCardRef["cardType"]): ReactNode {
  switch (type) {
    case "route": return <Route size={16} />;
    case "micro": return <BookOpen size={16} />;
    case "practice": return <Wrench size={16} />;
    case "evaluation": return <ClipboardCheck size={16} />;
    case "course_chapter": return <Layers size={16} />;
    case "course_match": return <Target size={16} />;
    case "brief": return <FileText size={16} />;
    case "knowledge": return <Lightbulb size={16} />;
    case "progress": return <BarChart3 size={16} />;
    case "material": return <FileText size={16} />;
    case "segment_summary": return <Network size={16} />;
  }
}

function Frame({ card, display, footer, tools, children, size = "s" }: {
  card: AssistantCardRef;
  display: AssistantCardDisplay;
  footer?: ReactNode;
  tools?: ReactNode;
  children?: ReactNode;
  size?: "s" | "l";
}) {
  return <ConversationCard size={size} label={`${display.kicker ?? "回答卡片"} ${display.title}`}>
    <ObjectShell
      size={size}
      icon={iconFor(card.cardType)}
      kicker={display.kicker}
      title={display.title}
      badge={display.status ? <Pill tone={toneMap[display.status.tone]} dot>{display.status.label}</Pill> : undefined}
      context={display.meta?.length ? <span>{display.meta.join(" · ")}</span> : undefined}
      tools={tools}
      footer={footer}
    >
      {display.description ? <p className="ef-assistant-card-copy">{display.description}</p> : null}
      {display.percent != null ? <div className="ef-assistant-card-progress" aria-label={`${display.percent}%`}><i style={{ width: `${Math.max(0, Math.min(100, display.percent))}%` }} /></div> : null}
      {display.steps?.length ? <ol className="ef-assistant-card-steps">
        {display.steps.map((step) => <li key={step.id} className={`is-${step.state}`}>
          <i aria-hidden="true" />
          <span><strong>{step.title}</strong>{step.meta ? <small>{step.meta}</small> : null}</span>
        </li>)}
      </ol> : null}
      {children}
    </ObjectShell>
  </ConversationCard>;
}

/** One-line collapsed card: same surface and token spacing, no competing primary action. */
function CompactCard({ card, display, icon, onAction, statusLabel = "已完成", statusTone = "ok", actionLabel = "再看一遍", note }: {
  card: AssistantCardRef;
  display: AssistantCardDisplay;
  icon: ReactNode;
  onAction: () => void;
  statusLabel?: string;
  statusTone?: NonNullable<AssistantCardStatus["tone"]>;
  actionLabel?: string;
  note?: string;
}) {
  return <ConversationCard size="s" label={`${display.kicker ?? statusLabel} ${display.title}`}>
    <div className="ef-card-compact">
      <span className="ef-card-compact-icon" aria-hidden="true">{icon}</span>
      <span className={`ef-card-compact-copy${note ? " is-inline" : ""}`}><strong>{display.title}</strong>{note ? <small>{note}</small> : null}</span>
      <Pill tone={statusTone} dot>{statusLabel}</Pill>
      <button type="button" className="ef-card-text-action" onClick={onAction}>{actionLabel}</button>
    </div>
  </ConversationCard>;
}

function actionButton(label: string, onClick: () => void) {
  return <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={onClick}>{label}</button>;
}

/** Report the one card that owns the current next step so the strip can hide. */
function useNextStepCardRegistration(frameRef: RefObject<HTMLDivElement | null>, matches: boolean) {
  const registry = useConversationCardRegistry();
  useEffect(() => {
    if (!registry || !matches) return;
    const element = frameRef.current;
    if (!element) return;
    registry.register(element);
    return () => registry.unregister(element);
  }, [matches, registry]);
}

type MicroEntry = ReturnType<typeof useMicroEntry>;

/** The latest mounted card is the inline target; Host moves the one runner here. */
function MicroFrameShell({ pathId, cardKey, cardType, children }: { pathId: string; cardKey: string; cardType: string; children: ReactNode }) {
  const { registerCard } = useMicroHost();
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    return registerCard(pathId, cardKey, node, cardType);
  }, [registerCard, pathId, cardKey, cardType]);
  return <div className="ef-assistant-micro-frame" ref={ref} data-card-type={cardType} data-path-id={pathId}>{children}</div>;
}

function MicroFormTools({ entry, title }: { entry: MicroEntry; title: string }) {
  const { setForm } = useMicroHost();
  return <span className="ef-assistant-micro-tools">
    <MicroFormSwitch current={entry.form} onChange={setForm} label={`切换 ${title} 的形态`} />
    <button type="button" className="ef-card-icon" onClick={entry.collapse} aria-label="收起小练习" title="收起"><ChevronUp size={15} aria-hidden="true" /></button>
  </span>;
}

function MicroEntryActions({ entry, label, note, extra }: { entry: MicroEntry; label: string; note?: ReactNode; extra?: ReactNode }) {
  return <div className="ef-assistant-card-foot">
    <span>{note}</span>
    <span className="ef-assistant-card-actions">
      {extra}
      <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => void entry.openWithStart("focus")}><Maximize2 size={14} aria-hidden="true" />沉浸</button>
      <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => void entry.openWithStart("side")}><PanelRight size={14} aria-hidden="true" />侧边</button>
      <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" data-micro-action="open" disabled={entry.starting} onClick={() => void entry.openWithStart()}>
        <Play size={14} aria-hidden="true" />{entry.starting ? "正在开始…" : label}
      </button>
    </span>
  </div>;
}

function MicroAway({ entry }: { entry: MicroEntry }) {
  const mode = entry.form === "focus" ? "正在沉浸模式中" : "正在右侧进行";
  const title = entry.path?.title ?? "小练习";
  return <ConversationCard size="s" label={`小练习 ${title}`}>
    <div className="ef-card-compact ef-micro-away" data-micro-away={entry.form}>
      <span className="ef-card-compact-icon" aria-hidden="true"><BookOpen size={17} /></span>
      <span className="ef-card-compact-copy"><strong>{title}</strong><small>{mode}</small></span>
      <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => entry.open("inline")}>回到对话</button>
    </div>
  </ConversationCard>;
}

/** Shared Micro/Knowledge card summary, entry points and inline placement. */
function MicroPracticeCard({ card, cardType, display, entry }: { card: AssistantCardRef; cardType: "micro" | "knowledge"; display: AssistantCardDisplay; entry: MicroEntry }) {
  const slotKey = useId();
  const { slotOwner, cardOwner, hasCardType } = useMicroHost();
  if (!entry.path) return null;
  const minutes = entry.path.estimatedMinutes;
  const total = entry.totalSteps;
  const kicker = `小练习 · 约 ${minutes} 分钟`;
  const liveDisplay: AssistantCardDisplay = {
    ...display,
    kicker,
    title: entry.path.title || display.title,
    description: entry.path.description ?? display.description,
    meta: [],
    status: entry.completed ? { label: "已完成", tone: "ok" } : entry.progress ? { label: "进行中", tone: "brand" } : { label: "未开始", tone: "quiet" }
  };
  const open = entry.active && entry.form !== "closed";
  // A completion result knowledge card and the working Micro card can both
  // reference the same path; keep the one completed line, not two.
  if (cardType === "knowledge" && entry.completed && hasCardType(entry.pathId, "micro")) return null;
  if (entry.completed && !open) {
    return <MicroFrameShell pathId={entry.pathId} cardKey={slotKey} cardType={cardType}>
      <CompactCard
        card={card}
        display={{ ...liveDisplay, kicker }}
        icon={<BookOpen size={17} />}
        onAction={() => entry.open("inline")}
      />
    </MicroFrameShell>;
  }
  const latestCard = cardOwner(entry.pathId);
  const isLatestCard = !latestCard || latestCard === slotKey;
  if (entry.active && (entry.form === "side" || entry.form === "focus") && isLatestCard) {
    return <MicroFrameShell pathId={entry.pathId} cardKey={slotKey} cardType={cardType}><MicroAway entry={entry} /></MicroFrameShell>;
  }
  const activeInline = entry.active && entry.form === "inline";
  const owner = slotOwner(entry.pathId);
  // Only the latest card owns the running DOM. Older cards keep a hidden slot
  // registered so ownership can fall back cleanly when the newest card unmounts.
  const inline = activeInline && isLatestCard && (!owner || owner === slotKey);
  const standby = activeInline && !inline ? <MicroSlot pathId={entry.pathId} slotKey={slotKey} className="ef-assistant-micro-body ef-micro-slot-standby" /> : null;
  const footer = inline ? undefined : <MicroEntryActions
    entry={entry}
    label={entry.progress ? "继续这道小练习" : "开始这道小练习"}
    note={entry.progress ? `${entry.completeSteps} / ${total} 步` : ""}
  />;
  const body = inline ? <MicroSlot pathId={entry.pathId} slotKey={slotKey} /> : standby;
  return <MicroFrameShell pathId={entry.pathId} cardKey={slotKey} cardType={cardType}>
    <Frame
      card={card}
      display={{ ...liveDisplay, description: inline ? undefined : liveDisplay.description }}
      size={inline ? "l" : "s"}
      footer={footer}
      tools={inline ? <MicroFormTools entry={entry} title={entry.path.title} /> : undefined}
    >
      {body}
    </Frame>
  </MicroFrameShell>;
}

function RouteCard({ card, display, actions, session }: CardProps) {
  const slotKey = useId();
  const action = display.action;
  const microPathId = action?.kind === "micro" ? action.pathId : undefined;
  const entry = useMicroEntry({
    pathId: microPathId,
    knowledgeId: action?.kind === "micro" ? action.knowledgeId : undefined,
    courseId: action?.kind === "micro" ? action.courseId : card.cardType === "route" ? card.courseId : undefined,
    userId: session.userId
  });
  const frameRef = useRef<HTMLDivElement>(null);
  const registry = useConversationCardRegistry();
  const { slotOwner, cardOwner, registerCard } = useMicroHost();
  const routePathId = microPathId;
  const setFrameRef = useCallback((node: HTMLDivElement | null) => {
    frameRef.current = node;
    if (!node || !routePathId) return;
    return registerCard(routePathId, slotKey, node, "route");
  }, [registerCard, routePathId, slotKey]);
  const matchesNextStep = Boolean(routePathId && registry?.nextStep?.kind === "micro" && registry.nextStep.pathId === routePathId);
  useNextStepCardRegistration(frameRef, matchesNextStep);
  if (card.cardType !== "route") return null;
  const primary = action?.kind === "micro" && entry.path
    ? <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" data-micro-action="open" disabled={entry.starting} onClick={() => void entry.openWithStart()}>
        <Play size={14} aria-hidden="true" />{entry.starting ? "正在开始…" : entry.progress ? "继续当前这一步" : action.label || "开始当前这一步"}
      </button>
    : action?.kind === "practice"
      ? actionButton(action.label || "打开动手任务", () => actions.openPractice(action.courseId, action.assignmentId))
      : action?.kind === "course"
        ? actionButton(action.label || "打开课程", () => actions.openCourse(action.courseId))
        : null;
  const collapsed = display.status?.label === "进行中" || display.status?.label === "已完成";
  const activeInline = entry.active && entry.form === "inline";
  const owner = routePathId ? slotOwner(routePathId) : null;
  const latestCard = routePathId ? cardOwner(routePathId) : null;
  const isLatestCard = !latestCard || latestCard === slotKey;
  const inline = activeInline && isLatestCard && (!owner || owner === slotKey);
  const standby = activeInline && !inline && routePathId ? <MicroSlot pathId={routePathId} slotKey={slotKey} className="ef-assistant-micro-body ef-micro-slot-standby" /> : null;
  if (entry.active && (entry.form === "side" || entry.form === "focus") && isLatestCard) {
    return <div className="ef-assistant-micro-frame" ref={setFrameRef} data-card-type="route" data-path-id={routePathId}>
      <MicroAway entry={entry} />
    </div>;
  }
  if (collapsed && !inline) return <div className="ef-assistant-micro-frame" ref={setFrameRef} data-card-type="route" data-path-id={routePathId}>
    <CompactCard
      card={card}
      display={{ ...display, title: display.title || "你的起步路线" }}
      icon={<Route size={17} />}
      statusLabel={display.status?.label ?? "进行中"}
      statusTone={display.status?.tone ?? "brand"}
      actionLabel="查看完整路线"
      note={display.meta?.[0]}
      onAction={() => actions.openRoutePanel ? actions.openRoutePanel(card.courseId) : actions.openCourse(card.courseId)}
    />
    {standby}
  </div>;
  const footer = inline ? undefined : <div className="ef-assistant-card-foot">
    <span>{display.steps?.length ?? 0} 步</span>
    <span className="ef-assistant-card-actions">
      <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => actions.openRoutePanel ? actions.openRoutePanel(card.courseId) : actions.openCourse(card.courseId)}>查看完整路线</button>
      {entry.path ? <>
        <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => void entry.openWithStart("focus")}><Maximize2 size={14} aria-hidden="true" />沉浸</button>
        <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => void entry.openWithStart("side")}><PanelRight size={14} aria-hidden="true" />侧边</button>
        {primary}
      </> : primary}
    </span>
  </div>;
  const tools = inline ? <MicroFormTools entry={entry} title={entry.path?.title ?? display.title} /> : undefined;
  const runningDisplay = entry.path
    ? { ...display, title: entry.path.title, kicker: `小练习 · 约 ${entry.path.estimatedMinutes} 分钟`, description: undefined, meta: [], steps: undefined }
    : display;
  return <div className="ef-assistant-micro-frame" ref={setFrameRef} data-card-type="route" data-path-id={routePathId}>
    <Frame
      card={card}
      display={inline ? runningDisplay : display}
      size={inline ? "l" : "l"}
      footer={footer}
      tools={tools}
    >
      {inline ? <MicroSlot pathId={entry.pathId} slotKey={slotKey} /> : standby}
    </Frame>
  </div>;
}

function PracticeCard({ card, display, actions }: CardProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const registry = useConversationCardRegistry();
  const matchesNextStep = Boolean(card.cardType === "practice" && registry?.nextStep?.kind === "practice" && registry.nextStep.assignmentId === card.assignmentId);
  useNextStepCardRegistration(frameRef, matchesNextStep);
  if (card.cardType !== "practice") return null;
  return <div className="ef-assistant-card-frame" ref={frameRef} data-card-type="practice" data-assignment-id={card.assignmentId} data-course-id={card.courseId}>
    <Frame card={card} display={display} footer={<div className="ef-assistant-card-foot"><span>{display.status?.label ?? "动手做一次"}</span><button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => actions.openPractice(card.courseId, card.assignmentId)}>{display.actionLabel ?? "打开动手任务"}</button></div>} />
  </div>;
}

function EvaluationCard({ card, display, actions }: CardProps) {
  if (card.cardType !== "evaluation") return null;
  const open = () => {
    if (card.attemptId && actions.openPracticeAttempt) actions.openPracticeAttempt(card.courseId, card.assignmentId, card.attemptId);
    else actions.openPractice(card.courseId, card.assignmentId);
  };
  return <div className="ef-assistant-card-frame" data-card-type="evaluation" data-attempt-id={card.attemptId ?? ""} data-course-id={card.courseId} data-assignment-id={card.assignmentId}>
    <Frame card={card} display={display} footer={<div className="ef-assistant-card-foot"><span>来自这次提交</span>{actionButton(display.actionLabel ?? "查看评价", open)}</div>} />
  </div>;
}

function ChapterCard({ card, display, actions }: CardProps) {
  if (card.cardType !== "course_chapter") return null;
  return <Frame card={card} display={display} size="l" footer={<div className="ef-assistant-card-foot"><span>{display.meta?.[0] ?? ""}</span>{actionButton(display.actionLabel ?? "打开这一章", () => actions.openCourse(card.courseId))}</div>} />;
}

function CourseMatchCard({ card, display, actions }: CardProps) {
  if (card.cardType !== "course_match") return null;
  return <Frame card={card} display={display} size="l" footer={<div className="ef-assistant-card-foot"><span>目标：{card.goalText}</span></div>}>
    <div className="ef-assistant-card-choices">
      {(display.items ?? []).map((item) => <button key={item.id} type="button" className="ef-assistant-card-choice" onClick={() => actions.openCourse(item.id)}>
        <span><strong>{item.title}</strong>{item.meta ? <small>{item.meta}</small> : null}</span>
        <span aria-hidden="true">→</span>
      </button>)}
    </div>
  </Frame>;
}

function KnowledgeCard({ card, display, actions, session }: CardProps) {
  const entry = useMicroEntry({
    pathId: card.cardType === "knowledge" ? card.pathId : undefined,
    knowledgeId: card.cardType === "knowledge" ? card.nodeId : undefined,
    courseId: card.cardType === "knowledge" ? card.courseId : undefined,
    userId: session.userId
  });
  const frameRef = useRef<HTMLDivElement>(null);
  const registry = useConversationCardRegistry();
  const matchesNextStep = Boolean(entry.pathId && registry?.nextStep?.kind === "micro" && registry.nextStep.pathId === entry.pathId);
  useNextStepCardRegistration(frameRef, matchesNextStep);
  if (card.cardType !== "knowledge") return null;
  if (!entry.path) {
    return <div className="ef-assistant-card-frame" ref={frameRef} data-card-type="knowledge">
      <Frame card={card} display={display} />
    </div>;
  }
  return <div ref={frameRef} className="ef-assistant-card-frame"><MicroPracticeCard card={card} cardType="knowledge" display={display} entry={entry} /></div>;
}

function ProgressCard({ card, display, actions }: CardProps) {
  if (card.cardType !== "progress") return null;
  return <Frame card={card} display={display} footer={<div className="ef-assistant-card-foot"><span>只显示正在学的课程</span><button type="button" className="ef-ui-btn ef-ui-btn--ghost ef-ui-btn--32" onClick={() => actions.openCourse(card.courseIds[0] ?? "")}>继续学习</button></div>}>
    <div className="ef-assistant-card-choices">
      {(display.items ?? []).map((item) => <button key={item.id} type="button" className="ef-assistant-card-choice" onClick={() => actions.openCourse(item.id)}>
        <span><strong>{item.title}</strong>{item.meta ? <small>{item.meta}</small> : null}</span>
        <span aria-hidden="true">→</span>
      </button>)}
    </div>
  </Frame>;
}

function MaterialCard({ card, display, actions }: CardProps) {
  if (card.cardType !== "material") return null;
  return <Frame card={card} display={display} footer={<div className="ef-assistant-card-foot"><span>只读资料</span>{actionButton(display.actionLabel ?? "查看资料", () => actions.openMaterial(card.courseId, card.materialId, card.segmentId))}</div>} />;
}

/**
 * Micro card: the Host owns the runner, so the card only supplies the summary,
 * the three entry points and the latest inline slot.
 */
function MicroCard({ card, display, session }: CardProps) {
  const entry = useMicroEntry({
    pathId: card.cardType === "micro" ? card.pathId : undefined,
    knowledgeId: card.cardType === "micro" ? card.knowledgeId : undefined,
    courseId: card.cardType === "micro" ? card.courseId : undefined,
    userId: session.userId
  });
  const frameRef = useRef<HTMLDivElement>(null);
  const registry = useConversationCardRegistry();
  const matchesNextStep = Boolean(entry.pathId && registry?.nextStep?.kind === "micro" && registry.nextStep.pathId === entry.pathId);
  useNextStepCardRegistration(frameRef, matchesNextStep);
  if (card.cardType !== "micro") return null;
  if (!entry.path) return null;
  return <div ref={frameRef} className="ef-assistant-card-frame"><MicroPracticeCard card={card} cardType="micro" display={display} entry={entry} /></div>;
}

function SegmentSummaryCard({ card, session, actions }: { card: AssistantCardRef; session: MockSession; actions: AssistantCardActions }) {
  const navigate = useNavigate();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const unsubscribeProgress = applicationServices.learningProgressRepository.subscribe(() => setRevision((value) => value + 1));
    const unsubscribeKnowledge = applicationServices.userKnowledgeRepository.subscribe(() => setRevision((value) => value + 1));
    return () => { unsubscribeProgress(); unsubscribeKnowledge(); };
  }, []);
  const model = useMemo(() => {
    if (card.cardType !== "segment_summary") return null;
    const runtime = applicationServices.courseRepository.getCourse(card.courseId);
    if (!runtime) return null;
    const records = applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId);
    const courseState = applicationServices.learningProgressRepository.getCourseState(session.userId, card.courseId);
    const projection = buildHomeCourseProjection({
      runtime,
      records,
      courseState,
      microFor: (nodeId) => {
        const path = applicationServices.microLearningRepository.getPath(nodeId, { courseId: card.courseId, mode: "learn" });
        return path ? { pathId: path.id, title: path.title, estimatedMinutes: path.estimatedMinutes } : undefined;
      }
    });
    const summary = summarizeFirstSegment(projection.segment);
    const graph = applicationServices.knowledgeRepository.getVisibleGraph(userKnowledgeAccess(session.userId));
    const titles = new Map(summary.learnedSteps.map((step) => [step.nodeId, step.title]));
    const map = projectLearnedMap({
      learnedNodeIds: summary.learnedNodeIds,
      orderedNodeIds: projection.orderedNodeIds,
      titles,
      edges: graph.edges,
      width: 560,
      height: 150
    });
    const chapter = projection.chapters.find((item) => item.id === projection.currentChapterId);
    return { projection, summary, map, chapter };
  }, [card, revision, session.userId]);
  if (card.cardType !== "segment_summary" || !model) return null;
  const { summary, map, chapter } = model;
  const focus = summary.learnedNodeIds[summary.learnedNodeIds.length - 1];
  const display: AssistantCardDisplay = {
    title: "第一段完成",
    kicker: "第一段小结",
    status: { label: "已完成", tone: "ok" }
  };
  return <Frame
    card={card}
    display={display}
    size="l"
    footer={<div className="ef-assistant-card-foot">
      <span>{chapter ? `${chapter.title} · ${chapter.learnedCount} / ${chapter.nodeIds.length}` : "第一段"}</span>
      <span className="ef-assistant-card-actions">
        <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => actions.openRoutePanel ? actions.openRoutePanel(card.courseId) : navigate(`/courses/${encodeURIComponent(card.courseId)}`)}>查看完整路线</button>
        <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => actions.openArchive ? actions.openArchive(focus ? `knowledge:${focus}` : "me") : navigate(`/archive${focus ? `?focus=knowledge:${encodeURIComponent(focus)}` : "?focus=me"}`)}>打开完整星图</button>
      </span>
    </div>}
  >
    <div className="ef-assistant-summary-stats">
      <span><b>{summary.learnedSteps.length}</b><small>个要点已学</small></span>
      <span><b>{summary.passedTasks.length}</b><small>个任务已通过</small></span>
      {chapter ? <span><b>{chapter.learnedCount} / {chapter.nodeIds.length}</b><small>{chapter.title}</small></span> : null}
    </div>
    <div className="ef-assistant-summary-map">
      <svg width={map.width} height={map.height} viewBox={`0 0 ${map.width} ${map.height}`} role="img" aria-label={`我的学习地图：已学 ${summary.learnedSteps.length} 个要点`}>
        {map.edges.map((edge) => {
          const source = map.nodes.find((node) => node.id === edge.source);
          const target = map.nodes.find((node) => node.id === edge.target);
          return source && target ? <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} className="ef-assistant-map-edge" /> : null;
        })}
        {map.nodes.map((node) => <g key={node.id}>
          <circle cx={node.x} cy={node.y} r={9} className="ef-assistant-map-node" />
          <text x={node.x} y={node.y + 24} className="ef-assistant-map-label">{node.lines.map((line, lineIndex) => <tspan key={line} x={node.x} dy={lineIndex ? 15 : 0}>{line}</tspan>)}</text>
        </g>)}
      </svg>
      {!map.nodes.length ? <p className="ef-assistant-card-copy">还没有可显示的已学要点。</p> : null}
    </div>
  </Frame>;
}

function BriefCard({ messageId, display, actions }: { messageId?: string; display: AssistantCardDisplay; actions: AssistantCardActions }) {
  return <Frame card={{ cardType: "brief", messageId: messageId ?? "legacy" }} display={display} footer={<div className="ef-assistant-card-foot"><span>未创建课程</span>{actionButton("进入课程创建", () => { if (messageId) actions.openBrief(messageId); })}</div>} />;
}

/** Shared entry for every card part in the conversation timeline. */
export function AssistantCardView({ output, session, actions }: { output: unknown; session: MockSession; actions: AssistantCardActions }) {
  const source = output && typeof output === "object" ? output as Record<string, unknown> : {};
  const cardKey = JSON.stringify(source.card ?? null);
  const card = useMemo(() => parseAssistantCardRef(source.card), [cardKey]);
  const display = source.display && typeof source.display === "object" ? source.display as AssistantCardDisplay : null;
  const hydrated = useHydratedCard(card, display, session);
  if (!card || !hydrated) return null;
  const props: CardProps = { card, display: hydrated, session, actions };
  switch (card.cardType) {
    case "route": return <RouteCard {...props} />;
    case "practice": return <PracticeCard {...props} />;
    case "evaluation": return <EvaluationCard {...props} />;
    case "course_chapter": return <ChapterCard {...props} />;
    case "course_match": return <CourseMatchCard {...props} />;
    case "knowledge": return <KnowledgeCard {...props} />;
    case "progress": return <ProgressCard {...props} />;
    case "material": return <MaterialCard {...props} />;
    case "micro": return <MicroCard {...props} />;
    case "brief": return <BriefCard messageId={card.messageId} display={hydrated} actions={actions} />;
    case "segment_summary": return <SegmentSummaryCard card={card} session={session} actions={actions} />;
  }
}

/** Live responses carry server display data; history re-reads current state. */
function useHydratedCard(card: AssistantCardRef | null, initial: AssistantCardDisplay | null, session: MockSession): AssistantCardDisplay | null {
  const [display, setDisplay] = useState<AssistantCardDisplay | null>(initial);
  const [revision, setRevision] = useState(0);
  useEffect(() => { setDisplay(initial); }, [initial]);
  useEffect(() => {
    const update = () => setRevision((value) => value + 1);
    const unsubscribers = [
      applicationServices.learningProgressRepository.subscribe(update),
      applicationServices.userKnowledgeRepository.subscribe(update),
      applicationServices.microLearningRepository.subscribe(update)
    ];
    return () => { for (const unsubscribe of unsubscribers) unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!card) return;
    let live = true;
    void hydrateCard(card, session).then((next) => {
      if (!live || !next) return;
      setDisplay(next);
      window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("eduflow:conversation-card-hydrated")));
    }).catch(() => undefined);
    return () => { live = false; };
  }, [card, revision, session]);
  return display;
}

async function hydrateCard(card: AssistantCardRef, session: MockSession): Promise<AssistantCardDisplay | null> {
  const runtimes = applicationServices.courseRepository.listCourseRuntimes();
  const runtimeFor = (courseId: string) => runtimes.find((runtime) => runtime.course.id === courseId);
  const records = applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId);
  const statusByNode = new Map(records.map((record) => [record.nodeId, record.status]));
  switch (card.cardType) {
    case "micro": {
      const path = applicationServices.microLearningRepository.getPath(card.knowledgeId, { ...(card.courseId ? { courseId: card.courseId } : {}), mode: "learn", pathId: card.pathId });
      if (!path) return null;
      const progress = applicationServices.microLearningRepository.getPathProgress(card.pathId);
      const completed = progress?.status === "completed";
      return {
        title: path.title, kicker: "小练习", description: path.description,
        meta: [`约 ${path.estimatedMinutes} 分钟`],
        status: completed ? { label: "已完成", tone: "ok" } : progress ? { label: "进行中", tone: "brand" } : { label: "未开始", tone: "quiet" }
      };
    }
    case "practice": {
      const runtime = runtimeFor(card.courseId);
      const assignment = runtime?.assignments.find((item) => item.id === card.assignmentId);
      if (!assignment) return null;
      const state = applicationServices.learningProgressRepository.getCourseState(session.userId, card.courseId)?.assignmentStates[card.assignmentId]?.status;
      const passed = state === "accepted" || state === "completed";
      return {
        title: assignment.title, kicker: "动手任务", description: assignment.description,
        meta: [assignment.estimatedMinutes ? `约 ${assignment.estimatedMinutes} 分钟` : "动手做一次"],
        status: statusLabel(state),
        actionLabel: passed ? "查看结果" : state === "needs_revision" ? "补充后再交" : state === "started" ? "继续动手任务" : "打开动手任务"
      };
    }
    case "evaluation": {
      const runtime = runtimeFor(card.courseId);
      const assignment = runtime?.assignments.find((item) => item.id === card.assignmentId);
      const { result } = await applicationServices.learnerStateService.getAssignmentResult(card.courseId, card.assignmentId, undefined, card.attemptId);
      if (!assignment || !result) return null;
      const outcome = result.outcome;
      return {
        title: assignment.title, kicker: "动手任务评价",
        description: typeof result.feedback?.message === "string" ? result.feedback.message : undefined,
        meta: [result.attemptNumber ? `第 ${result.attemptNumber} 次提交` : "这次提交"],
        status: outcome === "passed" ? { label: "已通过", tone: "ok" } : outcome === "failed" ? { label: "需要修改", tone: "warn" } : { label: "评价中", tone: "quiet" },
        actionLabel: "查看评价"
      };
    }
    case "course_chapter": {
      const runtime = runtimeFor(card.courseId);
      const chapter = runtime?.chapters.find((item) => item.id === card.chapterId);
      if (!runtime || !chapter) return null;
      const lessonIds = new Set(runtime.lessons.filter((lesson) => lesson.chapterId === chapter.id).map((lesson) => lesson.id));
      const nodeIds = [...new Set(runtime.curriculumCoverages.filter((coverage) => lessonIds.has(coverage.lessonId)).map((coverage) => coverage.nodeId))];
      const done = nodeIds.filter((nodeId) => satisfiesTeachingPrerequisite(statusByNode.get(nodeId))).length;
      return {
        title: chapter.title, kicker: `第 ${chapter.order} 章`, description: chapter.outcome,
        meta: [`${nodeIds.length} 个要点`, `${done} 个已学`],
        status: done >= nodeIds.length && nodeIds.length ? { label: "已学完", tone: "ok" } : done ? { label: "在学", tone: "brand" } : { label: "未开始", tone: "quiet" },
        percent: nodeIds.length ? Math.round(done / nodeIds.length * 100) : 0, actionLabel: "打开这一章"
      };
    }
    case "course_match": {
      const targets = new Set(card.targetKnowledgeIds);
      const items = card.courseIds.flatMap((courseId) => {
        const runtime = runtimeFor(courseId);
        if (!runtime) return [];
        const covered = new Set(runtime.curriculumCoverages.map((coverage) => coverage.nodeId));
        const matched = [...targets].filter((id) => covered.has(id)).length;
        const microCount = [...targets].filter((id) => applicationServices.microLearningRepository.getPath(id, { courseId, mode: "learn" })).length;
        return [{
          id: courseId, title: runtime.course.title,
          meta: `${microCount ? `可立刻开始 · ${microCount} 个真实小练习 · ` : "暂不能立刻开始 · "}目标覆盖 ${targets.size ? Math.round(matched / targets.size * 100) : 0}%`,
          state: "quiet" as const, microCount, matched
        }];
      });
      items.sort((left, right) => Number(right.microCount > 0) - Number(left.microCount > 0) || right.microCount - left.microCount || right.matched - left.matched || left.title.localeCompare(right.title));
      if (!items.length) return null;
      return { title: "课程匹配", kicker: items.some((item) => item.microCount > 0) ? "可以马上开始的课程" : "课程匹配", items, actionLabel: "查看课程" };
    }
    case "route": {
      const runtime = runtimeFor(card.courseId);
      if (!runtime) return null;
      const decision = await applicationServices.learnerStateService.getNavigation(card.courseId);
      const courseState = applicationServices.learningProgressRepository.getCourseState(session.userId, card.courseId);
      const projection = buildHomeCourseProjection({
        runtime,
        records,
        courseState,
        decision,
        microFor: (nodeId) => {
          const path = applicationServices.microLearningRepository.getPath(nodeId, { courseId: card.courseId, mode: "learn" });
          return path ? { pathId: path.id, title: path.title, estimatedMinutes: path.estimatedMinutes } : undefined;
        },
        titleFor: (nodeId) => applicationServices.knowledgeRepository.getNode(nodeId, userKnowledgeAccess(session.userId))?.title
      });
      const segment = projection.segment;
      const current = segment.currentStep;
      const currentMicro = current?.kind === "micro" ? current : undefined;
      const currentPractice = current?.kind === "practice" ? current : undefined;
      const action = currentMicro
        ? { kind: "micro" as const, pathId: currentMicro.pathId, knowledgeId: currentMicro.nodeId, courseId: card.courseId, label: "开始当前这一步" }
        : currentPractice
          ? { kind: "practice" as const, courseId: card.courseId, assignmentId: currentPractice.assignmentId, label: "打开动手任务" }
          : { kind: "course" as const, courseId: card.courseId, label: "打开课程" };
      return {
        title: "你的起步路线",
        kicker: "起步路线",
        description: segment.complete ? "第一段已经完成。" : `${segment.steps.filter((step) => step.kind === "micro").length} 个小练习 + ${segment.steps.filter((step) => step.kind === "practice").length} 个动手任务${segment.totalMinutes ? `，约 ${segment.totalMinutes} 分钟` : ""}。`,
        meta: [`${segment.completedCount} / ${segment.steps.length} 步`, segment.boundaryNodeId ? "到第一个动手任务" : "起步内容"],
        status: segment.complete ? { label: "已完成", tone: "ok" } : segment.started ? { label: "进行中", tone: "brand" } : { label: "未开始", tone: "quiet" },
        steps: segment.steps.map((step) => ({
          id: step.id,
          title: step.title,
          state: step.status === "done" ? "done" as const : step.status === "now" ? "now" as const : "quiet" as const,
          ...(step.minutes ? { meta: `${step.kind === "practice" ? "动手任务" : "小练习"} · 约 ${step.minutes} 分钟` } : { meta: step.kind === "practice" ? "动手任务" : "小练习" })
        })),
        action
      };
    }
    case "segment_summary": {
      const runtime = runtimeFor(card.courseId);
      if (!runtime) return null;
      const projection = buildHomeCourseProjection({
        runtime,
        records,
        courseState: applicationServices.learningProgressRepository.getCourseState(session.userId, card.courseId),
        microFor: (nodeId) => {
          const path = applicationServices.microLearningRepository.getPath(nodeId, { courseId: card.courseId, mode: "learn" });
          return path ? { pathId: path.id, title: path.title, estimatedMinutes: path.estimatedMinutes } : undefined;
        }
      });
      const summary = summarizeFirstSegment(projection.segment);
      return {
        title: "第一段完成",
        kicker: "第一段小结",
        meta: [`${summary.learnedSteps.length} 个要点已学`, `${summary.passedTasks.length} 个任务已通过`],
        status: { label: "已完成", tone: "ok" }
      };
    }
    case "knowledge": {
      const node = applicationServices.knowledgeRepository.getNode(card.nodeId, userKnowledgeAccess(session.userId));
      if (!node) return null;
      const status = statusByNode.get(card.nodeId);
      const path = applicationServices.microLearningRepository.getPath(card.nodeId, {
        mode: "learn",
        ...(card.pathId ? { pathId: card.pathId } : {}),
        ...(card.courseId ? { courseId: card.courseId } : {})
      });
      return {
        title: path?.title ?? node.title, kicker: "要点", description: node.description,
        meta: [path ? `约 ${path.estimatedMinutes} 分钟` : "暂无可做的小练习"],
        status: status ? statusLabel(status === "learning" ? "in_progress" : status) : { label: "未开始", tone: "quiet" }
      };
    }
    case "progress": {
      const items = card.courseIds.flatMap((courseId) => {
        const runtime = runtimeFor(courseId);
        if (!runtime) return [];
        const nodeIds = [...new Set(runtime.curriculumCoverages.map((coverage) => coverage.nodeId))];
        const done = nodeIds.filter((nodeId) => satisfiesTeachingPrerequisite(statusByNode.get(nodeId))).length;
        return [{ id: courseId, title: runtime.course.title, meta: `${done} / ${nodeIds.length} 个要点已学`, state: done >= nodeIds.length && nodeIds.length ? "done" as const : done ? "now" as const : "quiet" as const }];
      });
      return items.length ? { title: "学习进度", kicker: "我的课程", items, actionLabel: "继续学习" } : null;
    }
    case "material": {
      const runtime = runtimeFor(card.courseId);
      const material = runtime?.materials.find((item) => item.id === card.materialId);
      if (!material) return null;
      const segment = card.segmentId ? material.segments.find((item) => item.id === card.segmentId) : undefined;
      return {
        title: material.title, kicker: "资料片段",
        description: segment ? [segment.section, segment.title].filter(Boolean).join(" · ") : material.description,
        meta: [segment?.page ? `第 ${segment.page} 页` : "学习资料"], actionLabel: "查看资料"
      };
    }
    case "brief":
      return null;
  }
}

function statusLabel(status: string | undefined): AssistantCardStatus {
  if (status === "mastered") return { label: "已掌握", tone: "ok" };
  if (status === "accepted" || status === "completed") return { label: "已通过", tone: "ok" };
  if (status === "learned") return { label: "已学", tone: "ok" };
  if (status === "practicing") return { label: "动手任务中", tone: "brand" };
  if (status === "submitted") return { label: "待评价", tone: "warn" };
  if (status === "needs_revision") return { label: "需要修改", tone: "warn" };
  if (status === "started" || status === "in_progress") return { label: "进行中", tone: "brand" };
  return { label: "未开始", tone: "quiet" };
}

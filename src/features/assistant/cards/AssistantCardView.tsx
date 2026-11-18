import { BarChart3, BookOpen, ChevronUp, ClipboardCheck, FileText, Layers, Lightbulb, Maximize2, Network, PanelRight, PenLine, Play, Route, Target, Wrench } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { applicationServices, refreshLearnerState } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import type { AssistantContextSnapshot } from "../assistantContract";
import { cardMatchesActiveObject, useActiveAssistantObject } from "../activeObject";
import { parseAssistantCardRef, type AssistantCardDisplay, type AssistantCardRef, type AssistantCardStatus } from "../assistantCards";
import type { AssistantObjectTarget } from "../objectTarget";
import { buildKnowledgeNeighborhood, miniMapRelationLabel } from "../knowledgeMiniMap";
import {
  chapterCardDisplay,
  courseMatchCardDisplay,
  evaluationCardDisplay,
  knowledgeCardDisplay,
  materialCardDisplay,
  microCardDisplay,
  miniMapCardDisplay,
  practiceCardDisplay,
  progressCardDisplay,
  routeCardDisplay
} from "../cardDisplay";
import { MicroFormSwitch, MicroSlot, useMicroEntry, useMicroHost } from "@/features/home/MicroHost";
import { buildHomeCourseProjection } from "@/features/course/path/courseLearnerProjection";
import { satisfiesTeachingPrerequisite } from "@/shared/learning/teachingPrerequisites";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { ConversationCard } from "@/shared/ui/Conversation";
import { ObjectShell } from "@/shared/ui/ObjectShell";
import { Pill, type PillTone } from "@/shared/ui/Pill";
import "./assistantCards.css";

/**
 * Cards have exactly one action: open the object they describe in the shared
 * Object Shell. There is no card-specific page entry; the panel itself offers
 * an explicit "open page" action when the surface has one.
 */
export type AssistantCardActions = {
  openObject(target: AssistantObjectTarget, origin?: DOMRect, trigger?: HTMLElement | null): void;
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
    case "submission": return <PenLine size={16} />;
    case "evaluation": return <ClipboardCheck size={16} />;
    case "course_chapter": return <Layers size={16} />;
    case "course_match": return <Target size={16} />;
    case "brief": return <FileText size={16} />;
    case "knowledge": return <Lightbulb size={16} />;
    case "progress": return <BarChart3 size={16} />;
    case "material": return <FileText size={16} />;
    case "mini_map": return <Network size={16} />;
  }
}

function Frame({ card, display, footer, tools, children, size = "s", icon }: {
  card: AssistantCardRef;
  display: AssistantCardDisplay;
  footer?: ReactNode;
  tools?: ReactNode;
  children?: ReactNode;
  size?: "s" | "l";
  icon?: ReactNode;
}) {
  return <ConversationCard size={size} label={`${display.kicker ?? "回答卡片"} ${display.title}`}>
    <ObjectShell
      size={size}
      icon={icon ?? iconFor(card.cardType)}
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
  onAction: (event: { currentTarget: EventTarget | null }) => void;
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
      <button type="button" className="ef-card-text-action" onClick={(event) => onAction(event)}>{actionLabel}</button>
    </div>
  </ConversationCard>;
}

/** The card itself is the Object Shell origin; never the viewport edge. */
function cardRect(event: { currentTarget: EventTarget | null }): DOMRect | undefined {
  const target = event.currentTarget;
  if (!(target instanceof Element)) return undefined;
  return target.closest<HTMLElement>("[data-card-type]")?.getBoundingClientRect();
}

function openTarget(event: { currentTarget: EventTarget | null }, actions: AssistantCardActions, target: AssistantObjectTarget) {
  const trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  actions.openObject(target, cardRect(event), trigger);
}

type MicroEntry = ReturnType<typeof useMicroEntry>;

/** The latest mounted card is the inline target; Host moves the one runner here. */
function MicroFrameShell({ pathId, cardKey, cardType, children }: { pathId: string; cardKey: string; cardType: string; children: ReactNode }) {
  const { registerCard } = useMicroHost();
  const active = useActiveAssistantObject();
  const isActive = cardMatchesActiveObject(active, { kind: "micro", pathId });
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    return registerCard(pathId, cardKey, node, cardType);
  }, [registerCard, pathId, cardKey, cardType]);
  return <div className={`ef-assistant-micro-frame${isActive ? " is-context-active" : ""}`} ref={ref} data-card-type={cardType} data-path-id={pathId}>{children}</div>;
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

/** Micro card: the card that opened the runner owns it; completion never hides or collapses it. */
function MicroPracticeCard({ card, display, entry, cardKey }: { card: AssistantCardRef; display: AssistantCardDisplay; entry: MicroEntry; cardKey: string }) {
  const host = useMicroHost();
  if (!entry.path) return null;
  const active = entry.active && entry.form !== "closed";
  const owner = active && host.presence?.cardKey === cardKey && host.presence?.pathId === entry.pathId;
  const total = entry.totalSteps;
  const courseTitle = courseMeta(entry, card.cardType === "micro" ? card.courseId : undefined, card.cardType === "micro" ? card.knowledgeId : undefined);
  const liveDisplay = microCardDisplay(
    { cardType: "micro", pathId: entry.pathId, knowledgeId: entry.knowledgeId, ...(entry.courseId ? { courseId: entry.courseId } : {}) },
    {
      title: entry.path.title,
      ...(entry.path.description ? { description: entry.path.description } : {}),
      estimatedMinutes: entry.path.estimatedMinutes,
      totalSteps: total,
      completedCount: entry.completeSteps,
      progressStatus: entry.completed ? "completed" : entry.progress ? "in_progress" : "not_started",
      ...(courseTitle ? { courseTitle } : {}),
      steps: microSteps(entry)
    }
  );
  if (owner && (entry.form === "side" || entry.form === "focus")) {
    return <MicroFrameShell pathId={entry.pathId} cardKey={cardKey} cardType="micro"><MicroAway entry={entry} /></MicroFrameShell>;
  }
  const inline = owner && entry.form === "inline";
  const footer = inline ? undefined : <MicroEntryActions
    entry={entry}
    label={entry.completed ? "再看一遍" : entry.progress ? "继续这道小练习" : "开始这道小练习"}
    note={entry.progress ? `${entry.completeSteps} / ${total} 步` : ""}
  />;
  return <MicroFrameShell pathId={entry.pathId} cardKey={cardKey} cardType="micro">
    <Frame
      card={card}
      display={{ ...liveDisplay, description: inline ? undefined : liveDisplay.description }}
      size={inline ? "l" : "s"}
      footer={footer}
      tools={inline ? <MicroFormTools entry={entry} title={entry.path.title} /> : undefined}
    >
      {inline ? <MicroSlot pathId={entry.pathId} slotKey={cardKey} /> : null}
    </Frame>
  </MicroFrameShell>;
}

function courseMeta(entry: MicroEntry, courseId?: string, knowledgeId?: string) {
  const direct = courseId ? applicationServices.courseRepository.getCourse(courseId) : undefined;
  if (direct) return direct.course.title;
  if (entry.courseId) return applicationServices.courseRepository.getCourse(entry.courseId)?.course.title;
  // A published path may have no course_id while its Knowledge is still taught
  // by a Course. Resolve the owning Course instead of showing a learner-facing
  // "independent" badge that has no action behind it.
  if (knowledgeId) {
    const owner = applicationServices.courseRepository.listCourseRuntimes()
      .find((runtime) => runtime.curriculumCoverages.some((coverage) => coverage.nodeId === knowledgeId));
    return owner?.course.title;
  }
  return undefined;
}

function microSteps(entry: MicroEntry) {
  if (!entry.path) return [];
  return entry.path.units.flatMap((unit) => unit.steps.map((step) => {
    const progress = applicationServices.microLearningRepository.getUnitProgress(unit.id);
    const done = entry.completed || Boolean(progress?.completedStepIds.includes(step.id));
    return { id: step.id, title: step.title, done };
  }));
}

/** The knowledge card is the Archive node, not a Micro runner. */
function KnowledgeCard({ card, display, actions }: CardProps) {
  if (card.cardType !== "knowledge") return null;
  const active = useActiveAssistantObject();
  const isActive = cardMatchesActiveObject(active, { kind: "knowledge", nodeId: card.nodeId });
  return <div className={`ef-assistant-card-frame${isActive ? " is-context-active" : ""}`} data-card-type="knowledge" data-node-id={card.nodeId}>
    <Frame
      card={card}
      display={display}
      icon={<span className="ef-assistant-knowledge-dot" aria-hidden="true" />}
      footer={<div className="ef-assistant-card-foot"><span>知识点档案</span><button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={(event) => openTarget(event, actions, { kind: "knowledge", nodeId: card.nodeId })}>{display.actionLabel ?? "查看知识点"}</button></div>}
    />
  </div>;
}

function MiniMapCard({ card, display, actions, session }: CardProps) {
  const [revision, setRevision] = useState(0);
  useEffect(() => applicationServices.userKnowledgeRepository.subscribe(() => setRevision((value) => value + 1)), []);
  const layout = useMemo(() => {
    if (card.cardType !== "mini_map") return null;
    const graph = applicationServices.knowledgeRepository.getVisibleGraph(userKnowledgeAccess(session.userId));
    return buildKnowledgeNeighborhood(graph, card.nodeId);
  }, [card, revision, session.userId]);
  const active = useActiveAssistantObject();
  if (card.cardType !== "mini_map" || !layout) return null;
  const byId = new Map(layout.nodes.map((node) => [node.id, node]));
  const isActive = cardMatchesActiveObject(active, { kind: "knowledge", nodeId: card.nodeId });
  return <div className={`ef-assistant-card-frame${isActive ? " is-context-active" : ""}`} data-card-type="mini_map" data-node-id={card.nodeId}>
    <Frame
      card={card}
      display={display}
      footer={<div className="ef-assistant-card-foot"><span>只画真实关系</span><button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={(event) => openTarget(event, actions, { kind: "knowledge", nodeId: card.nodeId })}>{display.actionLabel ?? "在档案中查看"}</button></div>}
    >
      <div className="ef-assistant-mini-map">
        <svg width="100%" viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${display.title} 的关系小地图`}>
          {layout.edges.map((edge) => {
            const source = byId.get(edge.source);
            const target = byId.get(edge.target);
            return source && target ? <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} className={`ef-assistant-map-edge is-${edge.relation}`} /> : null;
          })}
          {layout.nodes.map((node) => <g key={node.id} className={node.center ? "is-center" : ""}>
            <title>{node.title}</title>
            <circle cx={node.x} cy={node.y} r={node.center ? 9 : 6} className="ef-assistant-map-node" />
            <text x={node.labelX} y={node.labelY} textAnchor={node.anchor} className={`ef-assistant-map-label${node.center ? " is-center" : ""}`}>
              {node.lines.map((line, index) => <tspan key={index} x={node.labelX} dy={index === 0 ? 0 : 13}>{line}</tspan>)}
            </text>
          </g>)}
        </svg>
        <div className="ef-assistant-map-legend" aria-label="关系图例">
          {Object.entries(miniMapRelationLabel).map(([relation, label]) => <span key={relation}><i className={`is-${relation}`} aria-hidden="true" />{label}</span>)}
        </div>
        {!layout.nodes.length ? <p className="ef-assistant-card-copy">这个知识点还没有可显示的关系。</p> : null}
      </div>
    </Frame>
  </div>;
}

/** Route card: the card that opened the current step owns the inline runner. */
function RouteCard({ card, display, actions, session, cardKey }: CardProps & { cardKey: string }) {
  const active = useActiveAssistantObject();
  const host = useMicroHost();
  const activeClass = card.cardType === "route" && cardMatchesActiveObject(active, { kind: "route", courseId: card.courseId }) ? " is-context-active" : "";
  const action = display.action;
  const microPathId = action?.kind === "micro" ? action.pathId : undefined;
  const entry = useMicroEntry({
    pathId: microPathId,
    knowledgeId: action?.kind === "micro" ? action.knowledgeId : undefined,
    courseId: action?.kind === "micro" ? action.courseId : card.cardType === "route" ? card.courseId : undefined,
    userId: session.userId,
    cardKey
  });
  if (card.cardType !== "route") return null;
  const primary = action?.kind === "micro" && entry.path
    ? <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" data-micro-action="open" disabled={entry.starting} onClick={() => void entry.openWithStart()}>
        <Play size={14} aria-hidden="true" />{entry.starting ? "正在开始…" : entry.completed ? "再看一遍" : entry.progress ? "继续当前这一步" : action.label || "开始当前这一步"}
      </button>
    : action?.kind === "practice"
      ? <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={(event) => openTarget(event, actions, { kind: "practice", courseId: action.courseId, assignmentId: action.assignmentId })}>{action.label || "打开动手任务"}</button>
      : action?.kind === "course"
        ? <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={(event) => openTarget(event, actions, { kind: "route", courseId: action.courseId })}>{action.label || "查看完整路线"}</button>
        : null;
  const owner = Boolean(entry.active && entry.form !== "closed" && host.presence?.cardKey === cardKey && host.presence?.pathId === microPathId);
  const inline = owner && entry.form === "inline";
  if (owner && (entry.form === "side" || entry.form === "focus")) {
    return <div className={`ef-assistant-micro-frame${activeClass}`} data-card-type="route" data-course-id={card.courseId} data-path-id={microPathId}>
      <MicroAway entry={entry} />
    </div>;
  }
  const footer = inline ? undefined : <div className="ef-assistant-card-foot">
    <span>{display.steps?.length ?? 0} 步</span>
    <span className="ef-assistant-card-actions">
      <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={(event) => openTarget(event, actions, { kind: "route", courseId: card.courseId })}>查看完整路线</button>
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
  return <div className={`ef-assistant-micro-frame${activeClass}`} data-card-type="route" data-course-id={card.courseId} data-path-id={microPathId}>
    <Frame
      card={card}
      display={inline ? runningDisplay : display}
      size="l"
      footer={footer}
      tools={tools}
    >
      {inline ? <MicroSlot pathId={entry.pathId} slotKey={cardKey} /> : null}
    </Frame>
  </div>;
}

function PracticeCard({ card, display, actions }: CardProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const active = useActiveAssistantObject();
  if (card.cardType !== "practice") return null;
  const isActive = cardMatchesActiveObject(active, { kind: "practice", courseId: card.courseId, assignmentId: card.assignmentId });
  if (card.compact) {
    return <div className={`ef-assistant-card-frame${isActive ? " is-context-active" : ""}`} ref={frameRef} data-card-type="practice" data-compact="true" data-assignment-id={card.assignmentId} data-course-id={card.courseId}>
      <CompactCard
        card={card}
        display={display}
        icon={<Wrench size={17} />}
        onAction={(event) => openTarget(event, actions, { kind: "practice", courseId: card.courseId, assignmentId: card.assignmentId })}
        statusLabel={display.status?.label ?? "已更新"}
        statusTone={display.status?.tone ?? "ok"}
        actionLabel={display.actionLabel ?? "查看任务"}
        note={display.meta?.[0]}
      />
    </div>;
  }
  return <div className={`ef-assistant-card-frame${isActive ? " is-context-active" : ""}`} ref={frameRef} data-card-type="practice" data-assignment-id={card.assignmentId} data-course-id={card.courseId}>
    <Frame card={card} display={display} footer={<div className="ef-assistant-card-foot"><span>{display.status?.label ?? "动手做一次"}</span><button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={(event) => openTarget(event, actions, { kind: "practice", courseId: card.courseId, assignmentId: card.assignmentId })}>{display.actionLabel ?? "打开动手任务"}</button></div>} />
  </div>;
}

function SubmissionCard({ card, display, actions }: CardProps) {
  const active = useActiveAssistantObject();
  if (card.cardType !== "submission") return null;
  const isActive = cardMatchesActiveObject(active, { kind: "practice", courseId: card.courseId, assignmentId: card.assignmentId });
  return <div className={`ef-assistant-card-frame${isActive ? " is-context-active" : ""}`} data-card-type="submission" data-assignment-id={card.assignmentId} data-course-id={card.courseId}>
    <Frame card={card} display={display} footer={<div className="ef-assistant-card-foot"><span>{display.status?.label ?? "可提交"}</span><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={(event) => openTarget(event, actions, { kind: "practice", courseId: card.courseId, assignmentId: card.assignmentId })}>{display.actionLabel ?? "打开提交表单"}</button></div>} />
  </div>;
}

function EvaluationCard({ card, display, actions }: CardProps) {
  const active = useActiveAssistantObject();
  if (card.cardType !== "evaluation") return null;
  const isActive = cardMatchesActiveObject(active, { kind: "practice", courseId: card.courseId, assignmentId: card.assignmentId });
  return <div className={`ef-assistant-card-frame${isActive ? " is-context-active" : ""}`} data-card-type="evaluation" data-attempt-id={card.attemptId ?? ""} data-course-id={card.courseId} data-assignment-id={card.assignmentId}>
    <Frame card={card} display={display} footer={<div className="ef-assistant-card-foot"><span>来自这次提交</span><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={(event) => openTarget(event, actions, { kind: "practice", courseId: card.courseId, assignmentId: card.assignmentId, ...(card.attemptId ? { attemptId: card.attemptId } : {}) })}>{display.actionLabel ?? "查看评价"}</button></div>} />
  </div>;
}

function ChapterCard({ card, display, actions }: CardProps) {
  const active = useActiveAssistantObject();
  if (card.cardType !== "course_chapter") return null;
  const isActive = cardMatchesActiveObject(active, { kind: "route", courseId: card.courseId });
  return <div className={`ef-assistant-card-frame${isActive ? " is-context-active" : ""}`} data-card-type="course_chapter" data-course-id={card.courseId} data-chapter-id={card.chapterId}><Frame card={card} display={display} size="l" footer={<div className="ef-assistant-card-foot"><span>{display.meta?.[0] ?? ""}</span><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={(event) => openTarget(event, actions, { kind: "route", courseId: card.courseId, chapterId: card.chapterId })}>{display.actionLabel ?? "打开这一章"}</button></div>} /></div>;
}

function CourseMatchCard({ card, display, actions }: CardProps) {
  if (card.cardType !== "course_match") return null;
  return <div className="ef-assistant-card-frame" data-card-type="course_match"><Frame card={card} display={display} size="l" footer={<div className="ef-assistant-card-foot"><span>目标：{card.goalText}</span></div>}>
    <div className="ef-assistant-card-choices">
      {(display.items ?? []).map((item) => <button key={item.id} type="button" className="ef-assistant-card-choice" onClick={(event) => openTarget(event, actions, { kind: "route", courseId: item.id })}>
        <span><strong>{item.title}</strong>{item.meta ? <small>{item.meta}</small> : null}</span>
        <span aria-hidden="true">→</span>
      </button>)}
    </div>
  </Frame></div>;
}

function ProgressCard({ card, display, actions }: CardProps) {
  if (card.cardType !== "progress") return null;
  return <div className="ef-assistant-card-frame" data-card-type="progress"><Frame card={card} display={display} footer={<div className="ef-assistant-card-foot"><span>只显示正在学的课程</span><button type="button" className="ef-ui-btn ef-ui-btn--ghost ef-ui-btn--32" onClick={(event) => openTarget(event, actions, { kind: "records" })}>查看记录</button>{card.courseIds[0] ? <button type="button" className="ef-ui-btn ef-ui-btn--ghost ef-ui-btn--32" onClick={(event) => openTarget(event, actions, { kind: "route", courseId: card.courseIds[0] })}>继续学习</button> : null}</div>}>
    <div className="ef-assistant-card-choices">
      {(display.items ?? []).map((item) => <button key={item.id} type="button" className="ef-assistant-card-choice" onClick={(event) => openTarget(event, actions, { kind: "route", courseId: item.id })}>
        <span><strong>{item.title}</strong>{item.meta ? <small>{item.meta}</small> : null}</span>
        <span aria-hidden="true">→</span>
      </button>)}
    </div>
  </Frame></div>;
}

function MaterialCard({ card, display, actions }: CardProps) {
  const active = useActiveAssistantObject();
  if (card.cardType !== "material") return null;
  const isActive = cardMatchesActiveObject(active, { kind: "material", courseId: card.courseId, materialId: card.materialId });
  return <div className={`ef-assistant-card-frame${isActive ? " is-context-active" : ""}`} data-card-type="material" data-course-id={card.courseId} data-material-id={card.materialId}><Frame card={card} display={display} footer={<div className="ef-assistant-card-foot"><span>只读资料</span><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={(event) => openTarget(event, actions, { kind: "material", courseId: card.courseId, materialId: card.materialId, ...(card.segmentId ? { segmentId: card.segmentId } : {}) })}>{display.actionLabel ?? "查看资料"}</button></div>} /></div>;
}

/** Micro card: the Host owns the runner; this card owns the inline slot. */
function MicroCard({ card, display, session, cardKey }: CardProps & { cardKey: string }) {
  const entry = useMicroEntry({
    pathId: card.cardType === "micro" ? card.pathId : undefined,
    knowledgeId: card.cardType === "micro" ? card.knowledgeId : undefined,
    courseId: card.cardType === "micro" ? card.courseId : undefined,
    userId: session.userId,
    cardKey
  });
  if (card.cardType !== "micro" || !entry.path) return null;
  return <div className="ef-assistant-card-frame"><MicroPracticeCard card={card} display={display} entry={entry} cardKey={cardKey} /></div>;
}

function BriefCard({ messageId, display, actions }: { messageId?: string; display: AssistantCardDisplay; actions: AssistantCardActions }) {
  const active = useActiveAssistantObject();
  const isActive = Boolean(messageId) && cardMatchesActiveObject(active, { kind: "brief", messageId: messageId! });
  return <div className={`ef-assistant-card-frame${isActive ? " is-context-active" : ""}`} data-card-type="brief" data-message-id={messageId ?? ""}>
    <Frame card={{ cardType: "brief", messageId: messageId ?? "legacy" }} display={display} footer={<div className="ef-assistant-card-foot"><span>未创建课程</span><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={(event) => { if (messageId) openTarget(event, actions, { kind: "brief", messageId }); }}>查看课程简介</button></div>} />
  </div>;
}

/** Shared entry for every card part in the conversation timeline. */
export function AssistantCardView({ output, session, actions, cardKey: ownerKey }: { output: unknown; session: MockSession; actions: AssistantCardActions; cardKey?: string }) {
  const source = output && typeof output === "object" ? output as Record<string, unknown> : {};
  const cardIdentity = JSON.stringify(source.card ?? null);
  const identity = ownerKey ?? cardIdentity;
  const card = useMemo(() => parseAssistantCardRef(source.card), [cardIdentity]);
  const display = source.display && typeof source.display === "object" ? source.display as AssistantCardDisplay : null;
  const hydrated = useHydratedCard(card, display, session);
  if (!card || !hydrated) return null;
  const props: CardProps = { card, display: hydrated, session, actions };
  switch (card.cardType) {
    case "route": return <RouteCard {...props} cardKey={identity} />;
    case "practice": return <PracticeCard {...props} />;
    case "submission": return <SubmissionCard {...props} />;
    case "evaluation": return <EvaluationCard {...props} />;
    case "course_chapter": return <ChapterCard {...props} />;
    case "course_match": return <CourseMatchCard {...props} />;
    case "knowledge": return <KnowledgeCard {...props} />;
    case "mini_map": return <MiniMapCard {...props} />;
    case "progress": return <ProgressCard {...props} />;
    case "material": return <MaterialCard {...props} />;
    case "micro": return <MicroCard {...props} cardKey={identity} />;
    case "brief": return <BriefCard messageId={card.messageId} display={hydrated} actions={actions} />;
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
  const courseForKnowledge = (knowledgeId: string) => runtimes.find((runtime) => runtime.curriculumCoverages.some((coverage) => coverage.nodeId === knowledgeId));
  const records = applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId);
  const statusByNode = new Map(records.map((record) => [record.nodeId, record.status]));
  switch (card.cardType) {
    case "micro": {
      const path = applicationServices.microLearningRepository.getPath(card.knowledgeId, { ...(card.courseId ? { courseId: card.courseId } : {}), mode: "learn", pathId: card.pathId });
      if (!path) return null;
      const courseId = card.courseId ?? courseForKnowledge(card.knowledgeId)?.course.id;
      const course = courseId ? applicationServices.courseRepository.getCourse(courseId) : undefined;
      const progress = applicationServices.microLearningRepository.getPathProgress(card.pathId);
      const totalSteps = path.units.reduce((total, unit) => total + unit.steps.length, 0);
      const completedCount = progress?.status === "completed"
        ? totalSteps
        : path.units.reduce((total, unit) => total + (applicationServices.microLearningRepository.getUnitProgress(unit.id)?.completedStepIds.length ?? 0), 0);
      return microCardDisplay(card, {
        title: path.title,
        ...(path.description ? { description: path.description } : {}),
        estimatedMinutes: path.estimatedMinutes,
        totalSteps,
        completedCount,
        progressStatus: progress?.status ?? "not_started",
        ...(course?.course.title ? { courseTitle: course.course.title } : {}),
        steps: path.units.flatMap((unit) => unit.steps.map((step) => ({
          id: step.id,
          title: step.title,
          done: progress?.status === "completed" || Boolean(applicationServices.microLearningRepository.getUnitProgress(unit.id)?.completedStepIds.includes(step.id))
        })))
      });
    }
    case "practice":
    case "submission": {
      const runtime = runtimeFor(card.courseId);
      const assignment = runtime?.assignments.find((item) => item.id === card.assignmentId);
      if (!assignment) return null;
      const state = applicationServices.learningProgressRepository.getCourseState(session.userId, card.courseId)?.assignmentStates[card.assignmentId]?.status;
      return practiceCardDisplay(card.cardType, {
        title: assignment.title,
        ...(assignment.description ? { description: assignment.description } : {}),
        ...(assignment.estimatedMinutes != null ? { estimatedMinutes: assignment.estimatedMinutes } : {}),
        knowledgeCount: runtime?.assignmentCoverages.filter((coverage) => coverage.assignmentId === card.assignmentId).length ?? 0,
        status: state
      });
    }
    case "evaluation": {
      const runtime = runtimeFor(card.courseId);
      const assignment = runtime?.assignments.find((item) => item.id === card.assignmentId);
      const { result } = await applicationServices.learnerStateService.getAssignmentResult(card.courseId, card.assignmentId, undefined, card.attemptId);
      if (!assignment || !result) return null;
      const criteria = result.feedback?.criteria ?? [];
      return evaluationCardDisplay({
        assignmentTitle: assignment.title,
        ...(result.attemptNumber ? { attemptNumber: result.attemptNumber } : {}),
        outcome: result.outcome,
        ...(typeof result.feedback?.message === "string" ? { feedbackMessage: result.feedback.message } : {}),
        criteriaPassed: criteria.filter((criterion) => criterion.passed).length,
        criteriaTotal: criteria.length
      });
    }
    case "course_chapter": {
      const runtime = runtimeFor(card.courseId);
      const chapter = runtime?.chapters.find((item) => item.id === card.chapterId);
      if (!runtime || !chapter) return null;
      const lessonIds = new Set(runtime.lessons.filter((lesson) => lesson.chapterId === chapter.id).map((lesson) => lesson.id));
      const nodeIds = [...new Set(runtime.curriculumCoverages.filter((coverage) => lessonIds.has(coverage.lessonId)).map((coverage) => coverage.nodeId))];
      return chapterCardDisplay({
        title: chapter.title,
        order: chapter.order,
        ...(chapter.outcome ? { outcome: chapter.outcome } : {}),
        nodeCount: nodeIds.length,
        learnedCount: nodeIds.filter((nodeId) => satisfiesTeachingPrerequisite(statusByNode.get(nodeId))).length
      });
    }
    case "course_match": {
      const targetTitles = card.targetKnowledgeIds.flatMap((nodeId) => {
        const node = applicationServices.knowledgeRepository.getNode(nodeId, userKnowledgeAccess(session.userId));
        return node ? [node.title] : [];
      });
      return courseMatchCardDisplay(card, {
        goalText: card.goalText,
        targetKnowledgeIds: card.targetKnowledgeIds,
        targetTitles,
        courses: card.courseIds.flatMap((courseId) => {
          const runtime = runtimeFor(courseId);
          if (!runtime) return [];
          return [{
            id: courseId,
            title: runtime.course.title,
            coveredNodeIds: new Set(runtime.curriculumCoverages.map((coverage) => coverage.nodeId)),
            microNodeIds: new Set(card.targetKnowledgeIds.filter((nodeId) => Boolean(applicationServices.microLearningRepository.getPath(nodeId, { courseId, mode: "learn" }))))
          }];
        })
      });
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
      return routeCardDisplay({ courseId: card.courseId, courseTitle: runtime.course.title, segment: projection.segment });
    }
    case "knowledge": {
      const node = applicationServices.knowledgeRepository.getNode(card.nodeId, userKnowledgeAccess(session.userId));
      if (!node) return null;
      return knowledgeCardDisplay({
        title: node.title,
        ...(node.description ? { description: node.description } : {}),
        scope: node.scope,
        status: statusByNode.get(card.nodeId) ?? "explore"
      });
    }
    case "mini_map": {
      const node = applicationServices.knowledgeRepository.getNode(card.nodeId, userKnowledgeAccess(session.userId));
      if (!node) return null;
      const graph = applicationServices.knowledgeRepository.getVisibleGraph(userKnowledgeAccess(session.userId));
      const edgeCount = graph.edges.filter((edge) => edge.source === card.nodeId || edge.target === card.nodeId).length;
      return miniMapCardDisplay({ title: node.title, edgeCount });
    }
    case "progress": {
      const learnedNodeIds = new Set(records.filter((record) => satisfiesTeachingPrerequisite(record.status)).map((record) => record.nodeId));
      const display = progressCardDisplay({
        courses: card.courseIds.flatMap((courseId) => {
          const runtime = runtimeFor(courseId);
          if (!runtime) return [];
          return [{
            id: courseId,
            title: runtime.course.title,
            nodeIds: [...new Set(runtime.curriculumCoverages.map((coverage) => coverage.nodeId))],
            learnedNodeIds
          }];
        })
      });
      return display;
    }
    case "material": {
      const runtime = runtimeFor(card.courseId);
      const material = runtime?.materials.find((item) => item.id === card.materialId);
      if (!material) return null;
      const segment = card.segmentId ? material.segments.find((item) => item.id === card.segmentId) : undefined;
      return materialCardDisplay({
        title: material.title,
        ...(material.description ? { description: material.description } : {}),
        ...(segment?.section ? { segmentSection: segment.section } : {}),
        ...(segment?.title ? { segmentTitle: segment.title } : {}),
        ...(segment?.page == null ? {} : { page: segment.page })
      });
    }
    case "brief":
      return null;
  }
}

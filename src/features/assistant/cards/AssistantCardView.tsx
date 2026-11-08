import { BarChart3, BookOpen, ChevronUp, ClipboardCheck, FileText, Layers, Lightbulb, Maximize2, Network, PanelRight, PenLine, Play, Route, Target, Wrench } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { applicationServices, refreshLearnerState } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import type { AssistantContextSnapshot } from "../assistantContract";
import { cardMatchesActiveObject, useActiveAssistantObject } from "../activeObject";
import { parseAssistantCardRef, type AssistantCardDisplay, type AssistantCardRef, type AssistantCardStatus } from "../assistantCards";
import { knowledgeStateLabel, knowledgeStateTone } from "@/shared/learning/knowledgePresentation";
import { buildKnowledgeNeighborhood } from "../knowledgeMiniMap";
import { MicroFormSwitch, MicroSlot, useMicroEntry, useMicroHost } from "@/features/home/MicroHost";
import { buildHomeCourseProjection } from "@/features/course/path/courseLearnerProjection";
import { satisfiesTeachingPrerequisite } from "@/shared/learning/teachingPrerequisites";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { ConversationCard } from "@/shared/ui/Conversation";
import { ObjectShell } from "@/shared/ui/ObjectShell";
import { Pill, type PillTone } from "@/shared/ui/Pill";
import "./assistantCards.css";

export type AssistantCardActions = {
  openCourse(courseId: string): void;
  openPractice(courseId: string, assignmentId: string, origin?: DOMRect): void;
  /** Open one historical Attempt's saved result; fallback is the latest. */
  openPracticeAttempt?(courseId: string, assignmentId: string, attemptId: string): void;
  openBrief(messageId: string): void;
  openMaterial(courseId: string, materialId: string, segmentId?: string): void;
  openRoutePanel?(courseId: string, origin?: DOMRect): void;
  openArchive?(focus?: string): void;
  /** Knowledge cards open the Archive detail panel beside the conversation. */
  openKnowledgePanel?(nodeId: string, origin?: DOMRect): void;
  openRecords?(): void;
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
  onAction: (origin?: DOMRect) => void;
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
      <button type="button" className="ef-card-text-action" onClick={(event) => onAction(cardRect(event))}>{actionLabel}</button>
    </div>
  </ConversationCard>;
}

function actionButton(label: string, onClick: () => void) {
  return <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={onClick}>{label}</button>;
}

/** The card itself is the Object Shell origin; never the viewport edge. */
function cardRect(event: { currentTarget: EventTarget | null }): DOMRect | undefined {
  const target = event.currentTarget;
  if (!(target instanceof Element)) return undefined;
  return target.closest<HTMLElement>("[data-card-type]")?.getBoundingClientRect();
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
  const minutes = entry.path.estimatedMinutes;
  const total = entry.totalSteps;
  const kicker = `小练习 · 约 ${minutes} 分钟`;
  const liveDisplay: AssistantCardDisplay = {
    ...display,
    kicker,
    title: entry.path.title || display.title,
    description: entry.path.description ?? display.description,
    meta: [courseMeta(entry), `${entry.completeSteps} / ${total} 步`].filter(Boolean) as string[],
    status: entry.completed ? { label: "已完成", tone: "ok" } : entry.progress ? { label: "进行中", tone: "brand" } : { label: "未开始", tone: "quiet" },
    steps: display.steps?.length ? display.steps : microSteps(entry)
  };
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

function courseMeta(entry: MicroEntry) {
  const course = entry.courseId ? applicationServices.courseRepository.getCourse(entry.courseId) : undefined;
  return course?.course.title ?? (entry.courseId ? "课程" : "独立学习");
}

function microSteps(entry: MicroEntry): NonNullable<AssistantCardDisplay["steps"]> {
  if (!entry.path) return [];
  return entry.path.units.flatMap((unit) => unit.steps.map((step) => {
    const progress = applicationServices.microLearningRepository.getUnitProgress(unit.id);
    const done = entry.completed || Boolean(progress?.completedStepIds.includes(step.id));
    return { id: step.id, title: step.title, state: done ? "done" as const : "quiet" as const };
  })).slice(0, 12);
}

/** The knowledge card is the Archive node, not a Micro runner. */
function KnowledgeCard({ card, display, actions }: CardProps) {
  if (card.cardType !== "knowledge") return null;
  const active = useActiveAssistantObject();
  const isActive = cardMatchesActiveObject(active, { kind: "knowledge", nodeId: card.nodeId });
  const open = actions.openKnowledgePanel
    ? (event: { currentTarget: EventTarget | null }) => actions.openKnowledgePanel?.(card.nodeId, cardRect(event))
    : actions.openArchive ? () => actions.openArchive?.(`knowledge:${card.nodeId}`) : undefined;
  return <div className={`ef-assistant-card-frame${isActive ? " is-context-active" : ""}`} data-card-type="knowledge" data-node-id={card.nodeId}>
    <Frame
      card={card}
      display={display}
      icon={<span className="ef-assistant-knowledge-dot" aria-hidden="true" />}
      footer={<div className="ef-assistant-card-foot"><span>知识点档案</span><button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={open}>{display.actionLabel ?? "查看知识点"}</button></div>}
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
  if (card.cardType !== "mini_map" || !layout) return null;
  const byId = new Map(layout.nodes.map((node) => [node.id, node]));
  return <div className="ef-assistant-card-frame" data-card-type="mini_map" data-node-id={card.nodeId}>
    <Frame
      card={card}
      display={display}
      footer={<div className="ef-assistant-card-foot"><span>只画真实关系</span><button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => actions.openArchive?.(`knowledge:${card.nodeId}`)}>{display.actionLabel ?? "在档案中查看"}</button></div>}
    >
      <div className="ef-assistant-mini-map">
        <svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={`${display.title} 的关系小地图`}>
          {layout.edges.map((edge) => {
            const source = byId.get(edge.source);
            const target = byId.get(edge.target);
            return source && target ? <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} className={`ef-assistant-map-edge is-${edge.relation}`} /> : null;
          })}
          {layout.nodes.map((node) => <g key={node.id} className={node.center ? "is-center" : ""}>
            <circle cx={node.x} cy={node.y} r={node.center ? 9 : 6} className="ef-assistant-map-node" />
            {node.center ? <text x={node.x} y={node.y + 24} className="ef-assistant-map-label">{display.title}</text> : null}
          </g>)}
        </svg>
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
      ? <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={(event) => actions.openPractice(action.courseId, action.assignmentId, cardRect(event))}>{action.label || "打开动手任务"}</button>
      : action?.kind === "course"
        ? actionButton(action.label || "打开课程", () => actions.openCourse(action.courseId))
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
      <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={(event) => actions.openRoutePanel ? actions.openRoutePanel(card.courseId, cardRect(event)) : actions.openCourse(card.courseId)}>查看完整路线</button>
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
        onAction={(origin) => actions.openPractice(card.courseId, card.assignmentId, origin)}
        statusLabel={display.status?.label ?? "已更新"}
        statusTone={display.status?.tone ?? "ok"}
        actionLabel={display.actionLabel ?? "查看任务"}
        note={display.meta?.[0]}
      />
    </div>;
  }
  return <div className={`ef-assistant-card-frame${isActive ? " is-context-active" : ""}`} ref={frameRef} data-card-type="practice" data-assignment-id={card.assignmentId} data-course-id={card.courseId}>
    <Frame card={card} display={display} footer={<div className="ef-assistant-card-foot"><span>{display.status?.label ?? "动手做一次"}</span><button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={(event) => actions.openPractice(card.courseId, card.assignmentId, cardRect(event))}>{display.actionLabel ?? "打开动手任务"}</button></div>} />
  </div>;
}

function SubmissionCard({ card, display, actions }: CardProps) {
  const active = useActiveAssistantObject();
  if (card.cardType !== "submission") return null;
  const isActive = cardMatchesActiveObject(active, { kind: "practice", courseId: card.courseId, assignmentId: card.assignmentId });
  return <div className={`ef-assistant-card-frame${isActive ? " is-context-active" : ""}`} data-card-type="submission" data-assignment-id={card.assignmentId} data-course-id={card.courseId}>
    <Frame card={card} display={display} footer={<div className="ef-assistant-card-foot"><span>{display.status?.label ?? "可提交"}</span><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={(event) => actions.openPractice(card.courseId, card.assignmentId, cardRect(event))}>{display.actionLabel ?? "打开提交表单"}</button></div>} />
  </div>;
}

function EvaluationCard({ card, display, actions }: CardProps) {
  const active = useActiveAssistantObject();
  if (card.cardType !== "evaluation") return null;
  const isActive = cardMatchesActiveObject(active, { kind: "practice", courseId: card.courseId, assignmentId: card.assignmentId });
  const open = (origin?: DOMRect) => {
    if (card.attemptId && actions.openPracticeAttempt) actions.openPracticeAttempt(card.courseId, card.assignmentId, card.attemptId);
    else actions.openPractice(card.courseId, card.assignmentId, origin);
  };
  return <div className={`ef-assistant-card-frame${isActive ? " is-context-active" : ""}`} data-card-type="evaluation" data-attempt-id={card.attemptId ?? ""} data-course-id={card.courseId} data-assignment-id={card.assignmentId}>
    <Frame card={card} display={display} footer={<div className="ef-assistant-card-foot"><span>来自这次提交</span><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={(event) => open(cardRect(event))}>{display.actionLabel ?? "查看评价"}</button></div>} />
  </div>;
}

function ChapterCard({ card, display, actions }: CardProps) {
  if (card.cardType !== "course_chapter") return null;
  return <div className="ef-assistant-card-frame" data-card-type="course_chapter" data-course-id={card.courseId} data-chapter-id={card.chapterId}><Frame card={card} display={display} size="l" footer={<div className="ef-assistant-card-foot"><span>{display.meta?.[0] ?? ""}</span>{actionButton(display.actionLabel ?? "打开这一章", () => actions.openCourse(card.courseId))}</div>} /></div>;
}

function CourseMatchCard({ card, display, actions }: CardProps) {
  if (card.cardType !== "course_match") return null;
  return <div className="ef-assistant-card-frame" data-card-type="course_match"><Frame card={card} display={display} size="l" footer={<div className="ef-assistant-card-foot"><span>目标：{card.goalText}</span></div>}>
    <div className="ef-assistant-card-choices">
      {(display.items ?? []).map((item) => <button key={item.id} type="button" className="ef-assistant-card-choice" onClick={() => actions.openCourse(item.id)}>
        <span><strong>{item.title}</strong>{item.meta ? <small>{item.meta}</small> : null}</span>
        <span aria-hidden="true">→</span>
      </button>)}
    </div>
  </Frame></div>;
}

function ProgressCard({ card, display, actions }: CardProps) {
  if (card.cardType !== "progress") return null;
  return <div className="ef-assistant-card-frame" data-card-type="progress"><Frame card={card} display={display} footer={<div className="ef-assistant-card-foot"><span>只显示正在学的课程</span><button type="button" className="ef-ui-btn ef-ui-btn--ghost ef-ui-btn--32" onClick={() => actions.openRecords?.()}>查看记录</button><button type="button" className="ef-ui-btn ef-ui-btn--ghost ef-ui-btn--32" onClick={() => actions.openCourse(card.courseIds[0] ?? "")}>继续学习</button></div>}>
    <div className="ef-assistant-card-choices">
      {(display.items ?? []).map((item) => <button key={item.id} type="button" className="ef-assistant-card-choice" onClick={() => actions.openCourse(item.id)}>
        <span><strong>{item.title}</strong>{item.meta ? <small>{item.meta}</small> : null}</span>
        <span aria-hidden="true">→</span>
      </button>)}
    </div>
  </Frame></div>;
}

function MaterialCard({ card, display, actions }: CardProps) {
  if (card.cardType !== "material") return null;
  return <div className="ef-assistant-card-frame" data-card-type="material" data-course-id={card.courseId} data-material-id={card.materialId}><Frame card={card} display={display} footer={<div className="ef-assistant-card-foot"><span>只读资料</span>{actionButton(display.actionLabel ?? "查看资料", () => actions.openMaterial(card.courseId, card.materialId, card.segmentId))}</div>} /></div>;
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
  return <Frame card={{ cardType: "brief", messageId: messageId ?? "legacy" }} display={display} footer={<div className="ef-assistant-card-foot"><span>未创建课程</span>{actionButton("进入课程创建", () => { if (messageId) actions.openBrief(messageId); })}</div>} />;
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
  const records = applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId);
  const statusByNode = new Map(records.map((record) => [record.nodeId, record.status]));
  switch (card.cardType) {
    case "micro": {
      const path = applicationServices.microLearningRepository.getPath(card.knowledgeId, { ...(card.courseId ? { courseId: card.courseId } : {}), mode: "learn", pathId: card.pathId });
      if (!path) return null;
      const progress = applicationServices.microLearningRepository.getPathProgress(card.pathId);
      const completed = progress?.status === "completed";
      const course = card.courseId ? applicationServices.courseRepository.getCourse(card.courseId) : undefined;
      const totalSteps = path.units.reduce((total, unit) => total + unit.steps.length, 0);
      const doneSteps = path.units.reduce((total, unit) => total + (applicationServices.microLearningRepository.getUnitProgress(unit.id)?.completedStepIds.length ?? 0), 0);
      return {
        title: path.title, kicker: "小练习", description: path.description,
        meta: [`约 ${path.estimatedMinutes} 分钟`, `${completed ? totalSteps : doneSteps} / ${totalSteps} 步`, course?.course.title ?? "独立学习"],
        status: completed ? { label: "已完成", tone: "ok" } : progress ? { label: "进行中", tone: "brand" } : { label: "未开始", tone: "quiet" },
        steps: path.units.flatMap((unit) => unit.steps.map((step) => ({
          id: step.id,
          title: step.title,
          state: completed || Boolean(applicationServices.microLearningRepository.getUnitProgress(unit.id)?.completedStepIds.includes(step.id)) ? "done" as const : "quiet" as const
        }))).slice(0, 12),
        actionLabel: completed ? "再看一遍" : progress ? "继续" : "开始"
      };
    }
    case "practice":
    case "submission": {
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
        title: runtime.course.title,
        kicker: "课程路线 · 起步",
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
    case "knowledge": {
      const node = applicationServices.knowledgeRepository.getNode(card.nodeId, userKnowledgeAccess(session.userId));
      if (!node) return null;
      const status = (statusByNode.get(card.nodeId) ?? "explore") as keyof typeof knowledgeStateLabel;
      return {
        title: node.title, kicker: "知识点", description: node.description,
        meta: [node.scope === "global" ? "公开知识" : node.scope === "tenant" ? "组织知识" : "个人知识"],
        status: { label: knowledgeStateLabel[status] ?? knowledgeStateLabel.explore, tone: knowledgeStateTone(status) },
        actionLabel: "查看知识点"
      };
    }
    case "mini_map": {
      const node = applicationServices.knowledgeRepository.getNode(card.nodeId, userKnowledgeAccess(session.userId));
      if (!node) return null;
      const graph = applicationServices.knowledgeRepository.getVisibleGraph(userKnowledgeAccess(session.userId));
      const count = graph.edges.filter((edge) => edge.source === card.nodeId || edge.target === card.nodeId).length;
      return { title: node.title, kicker: "小地图", description: "这张图只画这个知识点周围真实存在的关系。", meta: [`${count} 条关系`], actionLabel: "在档案中查看" };
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

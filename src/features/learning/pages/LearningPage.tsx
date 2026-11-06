import { ArrowRight, History, PanelRight, Play, Sparkles } from "lucide-react";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { applicationServices } from "@/app/services/applicationServices";
import { useAssistantRuntime } from "@/features/assistant/AssistantRuntimeContext";
import type { MockSession } from "@/features/auth/types";
import { archiveHref } from "@/features/archive/model/atlasParams";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { createMicroLearningNavigation, type MicroLearningPath } from "@/features/learning/micro/microLearning";
import { microImmersiveHref } from "@/features/learning/micro/microSurface";
import { PracticeObject } from "@/features/course/practice/PracticeObject";
import { InlineMicro } from "@/features/home/InlineMicro";
import { HomeConversation } from "@/features/home/HomeConversation";
import { HomeRoutePanel } from "@/features/home/HomeRoutePanel";
import { MyPanel } from "@/features/home/MyPanel";
import { EMPTY_HOME_MAINLINE_CONFIG, type HomeMainlineConfig } from "@/features/home/HomeMainlineConfigRepository";
import { deriveHomeView, resolveHomeNextStep, shouldShowStarter, type HomeNextStep } from "@/features/home/homeMainline";
import { buildHomeCourseProjection, type HomeMicroAsset } from "@/features/course/path/courseLearnerProjection";
import type { CourseRouteStepAction } from "@/features/course/path/CourseRoutePanel";
import { buildHomeAssistantContext } from "@/features/home/homeAssistantContext";
import { openPanelParams, openWorkspaceParams, removeWorkspaceParam } from "@/features/home/learningWorkspace";
import { panelParamAction, reduceRightPanel, type RightPanel } from "@/features/home/rightPanel";
import type { NavigationDecision } from "@/shared/learning/navigation";
import type { AssistantCardActions } from "@/features/assistant/cards/AssistantCardView";
import { shortDisplayName } from "@/shared/ui/displayName";
import { HomeComposer } from "@/shared/ui/HomeComposer";
import "@/features/home/home.css";

type PracticeWorkspace = Extract<RightPanel, { kind: "practice" }>;
type MicroWorkspace = Extract<RightPanel, { kind: "micro" }>;

export function LearningPage({ session, onLogout: _onLogout }: { session: MockSession; onLogout(): void }) {
  const navigate = useNavigate();
  const assistant = useAssistantRuntime();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rightPanel, dispatchRightPanel] = useReducer(reduceRightPanel, searchParams.get("panel") === "1" ? { kind: "my" } as RightPanel : { kind: "none" } as RightPanel);
  const [practiceCache, setPracticeCache] = useState<PracticeWorkspace | null>(null);
  const [pendingMicroOpen, setPendingMicroOpen] = useState<string | null>(null);
  const panelOpen = rightPanel.kind === "my";
  const routePanelOpen = rightPanel.kind === "route";
  const workspace: MicroWorkspace | PracticeWorkspace | null = rightPanel.kind === "micro" || rightPanel.kind === "practice" ? rightPanel : null;
  const [config, setConfig] = useState<HomeMainlineConfig>(EMPTY_HOME_MAINLINE_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [navigationDecision, setNavigationDecision] = useState<NavigationDecision | null>(null);
  const [navigationError, setNavigationError] = useState(false);
  const [resumed, setResumed] = useState(() => {
    try { return window.sessionStorage.getItem(`eduflow:home:resumed:${session.userId}`) === "1"; }
    catch { return false; }
  });
  const practiceParam = searchParams.get("practice");
  const microParam = searchParams.get("micro");
  const panelToggleRef = useRef<HTMLButtonElement>(null);
  const forceNewSessionRef = useRef(false);
  const resolvedPracticeParam = useRef<string | null>(null);
  const resolvedMicroParam = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    setConfigLoaded(false);
    void applicationServices.homeMainlineConfigRepository.load().then((value) => { if (live) { setConfig(value); setConfigLoaded(true); } });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    try { window.sessionStorage.setItem(`eduflow:home:resumed:${session.userId}`, resumed ? "1" : "0"); } catch { /* storage may be unavailable */ }
  }, [resumed, session.userId]);

  useEffect(() => {
    if (assistant.activeSessionId) forceNewSessionRef.current = false;
  }, [assistant.activeSessionId]);

  useEffect(() => applicationServices.learningProgressRepository.subscribe(() => setRevision((value) => value + 1)), []);
  useEffect(() => applicationServices.userKnowledgeRepository.subscribe(() => setRevision((value) => value + 1)), []);
  useEffect(() => applicationServices.microLearningRepository.subscribe(() => setRevision((value) => value + 1)), []);

  const panelParam = searchParams.get("panel") === "1";
  const lastPanelParam = useRef(panelParam);
  useEffect(() => {
    // Only URL changes may drive My; internal panel switches also rewrite the
    // URL, but must not bounce back to My while the task/route panel opens.
    const action = panelParamAction(lastPanelParam.current, panelParam, rightPanel.kind);
    lastPanelParam.current = panelParam;
    if (action) dispatchRightPanel(action);
  }, [panelParam, rightPanel.kind]);

  const records = useMemo(() => applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId), [revision, session.userId]);
  const graph = useMemo(() => applicationServices.knowledgeRepository.getVisibleGraph(userKnowledgeAccess(session.userId)), [revision, session.userId]);
  const runtimes = useMemo(() => applicationServices.courseRepository.listCourseRuntimes(), [revision]);
  const activeCourses = useMemo(() => runtimes.flatMap((runtime) => {
    const state = applicationServices.learningProgressRepository.getCourseState(session.userId, runtime.course.id);
    return state.isActive ? [{ runtime, state }] : [];
  }).sort((left, right) => (right.state.updatedAt ?? "").localeCompare(left.state.updatedAt ?? "") || left.runtime.course.title.localeCompare(right.runtime.course.title)), [runtimes, revision, session.userId]);

  const starterRuntime = config.starterCourseId ? applicationServices.courseRepository.getCourse(config.starterCourseId) : undefined;
  const focusRuntime = activeCourses[0]?.runtime ?? starterRuntime;
  const focusCourseId = focusRuntime?.course.id;
  const focusCourseState = focusCourseId
    ? applicationServices.learningProgressRepository.getCourseState(session.userId, focusCourseId)
    : undefined;

  useEffect(() => {
    if (!focusCourseId) { setNavigationDecision(null); return; }
    let live = true;
    setNavigationError(false);
    void applicationServices.learnerStateService.getNavigation(focusCourseId)
      .then((decision) => { if (live) setNavigationDecision(decision); })
      .catch(() => { if (live) { setNavigationDecision(null); setNavigationError(true); } });
    return () => { live = false; };
  }, [focusCourseId, revision]);

  const projection = useMemo(() => {
    if (!focusRuntime || !focusCourseState) return null;
    const titles = new Map(graph.nodes.map((node) => [node.id, node.title]));
    return buildHomeCourseProjection({
      runtime: focusRuntime,
      records,
      courseState: focusCourseState,
      decision: navigationDecision,
      microFor: (nodeId): HomeMicroAsset | undefined => {
        const path = applicationServices.microLearningRepository.getPath(nodeId, { courseId: focusRuntime.course.id, mode: "learn" });
        return path ? { pathId: path.id, title: path.title, estimatedMinutes: path.estimatedMinutes } : undefined;
      },
      titleFor: (nodeId) => titles.get(nodeId)
    });
  }, [focusCourseState, focusRuntime, graph.nodes, navigationDecision, records]);

  const nextStep = useMemo(() => {
    if (!navigationDecision || !focusRuntime) return null;
    const action = navigationDecision.nextAction;
    const micro = action.nodeId
      ? applicationServices.microLearningRepository.getPath(action.nodeId, {
          courseId: focusRuntime.course.id,
          mode: "learn",
          ...(action.resourceKind === "micro" && action.resourceId ? { pathId: action.resourceId } : {})
        })
      : null;
    return resolveHomeNextStep({ decision: navigationDecision, runtime: focusRuntime, microTitle: micro?.title, microMinutes: micro?.estimatedMinutes });
  }, [focusRuntime, navigationDecision]);

  const hasLearningRecord = records.some((record) => record.status !== "explore");
  const hasConversation = assistant.chatMessages.length > 0;
  const hasRouteCard = assistant.chatMessages.some((message) => (message.parts ?? []).some((part) => {
    if (part.type !== "tool-displayCard") return false;
    const card = (part as { output?: { card?: { cardType?: string } } }).output?.card;
    return card?.cardType === "route";
  }));
  const openMicroPathIds = new Set(assistant.chatMessages.flatMap((message) => (message.parts ?? []).flatMap((part) => {
    if (part.type !== "tool-displayCard") return [];
    const card = (part as { output?: { card?: { cardType?: string; pathId?: string } } }).output?.card;
    if (card?.cardType !== "micro" || !card.pathId) return [];
    return applicationServices.microLearningRepository.getPathProgress(card.pathId)?.status === "completed" ? [] : [card.pathId];
  })));
  const view = deriveHomeView({ hasLearningRecord, hasConversation, resumed });
  const segment = projection?.segment;
  const showStarter = shouldShowStarter({ configuredCourseId: config.starterCourseId, hasCourse: Boolean(starterRuntime), segmentStarted: Boolean(segment?.started) }) && configLoaded && !hasRouteCard;
  const starterExample = config.examples.find((example) => example.kind === "start");
  const freshExamples = config.examples.filter((example) => example.kind !== "start");
  const recent = useMemo(() => [...records]
    .filter((record) => record.status !== "explore")
    .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))[0], [records]);
  const recentTitle = recent ? (projection?.titleByNode.get(recent.nodeId) ?? graph.nodes.find((node) => node.id === recent.nodeId)?.title ?? recent.nodeId) : undefined;

  useEffect(() => {
    if (view !== "learning" || !pendingMicroOpen) return;
    const fire = () => window.dispatchEvent(new CustomEvent("eduflow:open-micro", { detail: { pathId: pendingMicroOpen } }));
    const first = window.setTimeout(fire, 180);
    const retry = window.setTimeout(() => {
      if (!document.querySelector(".ef-assistant-micro-body")) fire();
      setPendingMicroOpen(null);
    }, 800);
    return () => { window.clearTimeout(first); window.clearTimeout(retry); };
  }, [pendingMicroOpen, view]);

  useEffect(() => {
    if (!microParam) { resolvedMicroParam.current = null; return; }
    if (resolvedMicroParam.current === microParam) return;
    const [knowledgeId, pathId, ...courseParts] = microParam.split(":");
    const courseId = courseParts.join(":") || undefined;
    if (!knowledgeId || !pathId) return;
    const path = applicationServices.microLearningRepository.getPath(knowledgeId, { courseId, mode: "learn", pathId });
    if (path) {
      setSearchParams((current) => {
        if (!current.has("panel")) return current;
        const next = new URLSearchParams(current);
        next.delete("panel");
        return next;
      }, { replace: true });
      dispatchRightPanel({ type: "open-micro", panel: { kind: "micro", knowledgeId, courseId, pathId, path } });
      resolvedMicroParam.current = microParam;
    }
  }, [microParam, revision]);

  useEffect(() => {
    if (!practiceParam) { resolvedPracticeParam.current = null; return; }
    if (resolvedPracticeParam.current === practiceParam) return;
    const [courseId, assignmentId] = practiceParam.split(":");
    if (!courseId || !assignmentId) return;
    const runtime = applicationServices.courseRepository.getCourse(courseId);
    const assignment = runtime?.assignments.find((item) => item.id === assignmentId);
    if (runtime && assignment) {
      setSearchParams((current) => {
        if (!current.has("panel")) return current;
        const next = new URLSearchParams(current);
        next.delete("panel");
        return next;
      }, { replace: true });
      const panel = { kind: "practice" as const, courseId, assignmentId, title: assignment.title };
      setPracticeCache(panel);
      dispatchRightPanel({ type: "open-practice", panel });
      resolvedPracticeParam.current = practiceParam;
    }
  }, [practiceParam, runtimes]);

  useEffect(() => {
    if (!panelOpen && !workspace && !routePanelOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (workspace) { closeWorkspace(); return; }
      if (routePanelOpen) { dispatchRightPanel({ type: "close" }); return; }
      if (panelOpen) { setPanel(false); panelToggleRef.current?.focus(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panelOpen, workspace, routePanelOpen]);

  function assistantContext() {
    return buildHomeAssistantContext({
      selectedCourseId: focusCourseId,
      currentKnowledgeId: nextStep?.knowledgeId,
      workspace,
      removedContextIds: []
    });
  }

  function markResumed() { setResumed(true); }

  async function send(message: string) {
    markResumed();
    return assistant.send(message, assistantContext());
  }

  const cardActions: AssistantCardActions = {
    openCourse: (courseId) => navigate(`/courses/${encodeURIComponent(courseId)}`),
    openPractice: (courseId, assignmentId) => {
      const runtime = runtimes.find((item) => item.course.id === courseId);
      const assignment = runtime?.assignments.find((item) => item.id === assignmentId);
      if (!assignment) return;
      markResumed();
      void openPractice(courseId, assignmentId, assignment.title);
    },
    openBrief: (messageId) => navigate(`/courses/create?briefId=${encodeURIComponent(messageId)}`),
    openMaterial: (courseId, materialId, segmentId) => navigate(`/courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(materialId)}${segmentId ? `?segment=${encodeURIComponent(segmentId)}` : ""}`),
    openRoutePanel: (courseId) => {
      if (courseId !== focusCourseId) { navigate(`/courses/${encodeURIComponent(courseId)}`); return; }
      showRoutePanel();
    },
    openArchive: (focus) => navigate(archiveHref({ focus: focus === "me" || !focus ? "me" : focus as `knowledge:${string}` })),
    recordMicroCompleted: (input) => {
      void assistant.recordAction({ kind: "micro-completed", ...input }, assistantContext());
    },
    useCourse: (planningMessageId, courseId, context) => assistant.useExistingCourse(planningMessageId, courseId, context),
    refineGoal: (planningMessageId, refinement, context) => assistant.refineGoal(planningMessageId, refinement, context),
    prepareBrief: (planningMessageId, input, context) => assistant.prepareCourseBrief({ planningMessageId, ...input }, context)
  };

  function showRoutePanel() {
    dispatchRightPanel({ type: "open-route" });
    if (searchParams.has("panel")) {
      const next = new URLSearchParams(searchParams);
      next.delete("panel");
      setSearchParams(next, { replace: true });
    }
  }

  function setPanel(open: boolean) {
    dispatchRightPanel({ type: open ? "open-my" : "close" });
    const base = open ? openPanelParams(searchParams, workspace?.kind) : new URLSearchParams(searchParams);
    if (!open) base.delete("panel");
    setSearchParams(base, { replace: true });
  }

  function showWorkspace(next: MicroWorkspace | PracticeWorkspace) {
    const params = openWorkspaceParams(searchParams);
    params.delete("micro");
    params.delete("practice");
    if (params.toString() !== searchParams.toString()) setSearchParams(params, { replace: true });
    if (next.kind === "practice") { setPracticeCache(next); dispatchRightPanel({ type: "open-practice", panel: next }); }
    else dispatchRightPanel({ type: "open-micro", panel: next });
  }

  function closeWorkspace() {
    if (!workspace) return;
    const next = removeWorkspaceParam(searchParams, workspace.kind);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    dispatchRightPanel({ type: "close" });
  }

  async function openPractice(courseId: string, assignmentId: string, title: string) {
    await assistant.recordAction({ kind: "practice-opened", courseId, assignmentId, forceNewSession: forceNewSessionRef.current }, assistantContext());
    forceNewSessionRef.current = false;
    showWorkspace({ kind: "practice", courseId, assignmentId, title });
  }

  async function openMicroInConversation(step: HomeNextStep) {
    if (!step.pathId || !step.knowledgeId) return false;
    markResumed();
    if (!openMicroPathIds.has(step.pathId)) {
      await assistant.recordAction({
        kind: "micro-opened",
        pathId: step.pathId,
        knowledgeId: step.knowledgeId,
        courseId: step.courseId,
        resuming: Boolean(applicationServices.microLearningRepository.getPathProgress(step.pathId)),
        forceNewSession: forceNewSessionRef.current
      }, assistantContext());
      forceNewSessionRef.current = false;
    }
    setPendingMicroOpen(step.pathId);
    return true;
  }

  async function startStarter() {
    if (!config.starterCourseId) return;
    markResumed();
    dispatchRightPanel({ type: "close" });
    await assistant.recordAction({ kind: "route-started", courseId: config.starterCourseId }, assistantContext());
  }

  async function continueNext() {
    if (assistant.loading || assistant.sending) return;
    markResumed();
    if (!assistant.activeSessionId && assistant.sessions[0]) await assistant.selectSession(assistant.sessions[0].id);
    if (!nextStep) {
      if (showStarter) void startStarter();
      else if (projection) { showRoutePanel(); }
      else { dispatchRightPanel({ type: "open-my" }); }
      return;
    }
    if (nextStep.kind === "micro" && await openMicroInConversation(nextStep)) return;
    if (nextStep.kind === "practice" && nextStep.assignmentId) {
      await openPractice(nextStep.courseId, nextStep.assignmentId, nextStep.title);
      return;
    }
    navigate(`/courses/${encodeURIComponent(nextStep.courseId)}`);
  }

  function openRouteStep(action: CourseRouteStepAction) {
    dispatchRightPanel({ type: "close" });
    markResumed();
    if (action.kind === "micro" && action.pathId) {
      const path = applicationServices.microLearningRepository.getPath(action.nodeId, { courseId: focusCourseId, mode: "learn", pathId: action.pathId });
      if (path) {
        void openMicroInConversation({ courseId: focusCourseId, courseTitle: focusRuntime?.course.title ?? "", kind: "micro", title: path.title, nodeId: action.nodeId, knowledgeId: action.nodeId, pathId: path.id, minutes: path.estimatedMinutes });
        return;
      }
    }
    if (action.kind === "practice" && action.assignmentId && focusCourseId) {
      openPractice(focusCourseId, action.assignmentId, action.step.title);
      return;
    }
    if (focusCourseId) navigate(`/courses/${encodeURIComponent(focusCourseId)}`);
  }

  function openPracticeNext(step: { nodeId?: string; resourceKind: string; resourceId?: string; microPathId?: string; title: string }) {
    if (!focusCourseId) return;
    closeWorkspace();
    if (step.microPathId && step.nodeId) {
      void assistant.recordAction({ kind: "micro-opened", pathId: step.microPathId, knowledgeId: step.nodeId, courseId: focusCourseId, resuming: true }, assistantContext());
      return;
    }
    if (step.resourceKind === "assignment" && step.resourceId) {
      void openPractice(focusCourseId, step.resourceId, step.title);
      return;
    }
    navigate(`/courses/${encodeURIComponent(focusCourseId)}`);
  }

  function newConversation() {
    markResumed();
    forceNewSessionRef.current = true;
    void assistant.selectSession(null);
    dispatchRightPanel({ type: "close" });
  }

  function selectSession(sessionId: string) {
    forceNewSessionRef.current = false;
    markResumed();
    void assistant.selectSession(sessionId);
    dispatchRightPanel({ type: "close" });
  }

  const showNextStrip = Boolean(nextStep) && !(showStarter && !segment?.started) && !(hasRouteCard && !segment?.started) && rightPanel.kind !== "route" && rightPanel.kind !== "practice";
  const currentSegmentMicroInProgress = Boolean(nextStep?.pathId
    && segment?.started
    && segment.currentStep?.kind === "micro"
    && segment.currentStep.pathId === nextStep.pathId
    && applicationServices.microLearningRepository.getPathProgress(nextStep.pathId));
  const nextMicroProgress = nextStep?.pathId ? applicationServices.microLearningRepository.getPathProgress(nextStep.pathId) : undefined;
  const nextPracticeStatus = nextStep?.assignmentId ? focusCourseState?.assignmentStates[nextStep.assignmentId]?.status : undefined;
  const nextPracticeStarted = Boolean(nextPracticeStatus && ["started", "submitted", "needs_revision"].includes(nextPracticeStatus));
  const nextStepStarted = currentSegmentMicroInProgress
    || nextMicroProgress?.status === "in_progress"
    || nextPracticeStarted;
  const nextStripLabel = nextPracticeStatus === "needs_revision" ? "需要修改" : nextStepStarted ? "正在做" : "下一步";
  const nextStripAction = nextStep?.kind === "practice"
    ? nextPracticeStatus === "needs_revision" ? "补充后再交" : nextPracticeStarted ? "继续" : "开始"
    : "继续";
  const progressChapter = projection?.chapters.find((chapter) => chapter.id === projection.currentChapterId);
  const routeProgress = segment?.complete && progressChapter
    ? `${progressChapter.learnedCount}/${progressChapter.nodeIds.length}`
    : segment ? `${segment.completedCount}/${segment.steps.length}` : "";
  const composer = <HomeComposer contexts={[]} onRemoveContext={() => undefined} onSubmit={(value) => void send(value)} disabled={assistant.sending || assistant.loading} hint={<span>Enter 发送 · Shift + Enter 换行</span>} />;

  const nextStrip = nextStep && showNextStrip ? <div className="ef-home-next-strip" aria-label="下一步">
    <span className="ef-home-next-label">{nextStripLabel}</span>
    <span className="ef-home-next-copy"><strong>{nextStep.title}</strong><small>{nextStep.kind === "micro" ? "小练习" : "动手任务"}{nextStep.minutes ? ` · 约 ${nextStep.minutes} 分钟` : ""}</small></span>
    <button type="button" className="ef-home-text-action" onClick={showRoutePanel}>路线 {routeProgress}</button>
    <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={() => void continueNext()}>{nextStripAction}<ArrowRight size={14} /></button>
  </div> : navigationError ? <p className="ef-home-next-error" role="alert">下一步暂时无法读取。<button type="button" onClick={() => setRevision((value) => value + 1)}>重试</button></p> : null;

  const starterChip = showStarter && starterExample ? <div className="ef-home-example-row">
    <button type="button" className="ef-ui-chip" onClick={() => void startStarter()}><Sparkles size={13} aria-hidden="true" />{starterExample.label}</button>
  </div> : null;

  return <main className={`ef-home ${panelOpen ? "has-panel" : ""} ${workspace ? "has-workspace" : ""} ${routePanelOpen ? "has-route" : ""}`} data-view={view} data-workspace={workspace?.kind ?? ""} data-strip={showNextStrip ? "1" : undefined}>
    {view !== "fresh" ? <header className="ef-home-head">
      <div className="ef-home-head-copy">
        <span className="ef-home-date">{formatToday()}</span>
        <h1>{greeting()}，{shortDisplayName(session.name)}</h1>
      </div>
      <button ref={panelToggleRef} type="button" className={`ef-home-panel-toggle ${panelOpen ? "is-open" : ""}`} aria-pressed={panelOpen} aria-controls="ef-my-panel" onClick={() => setPanel(!panelOpen)}><PanelRight size={16} aria-hidden="true" />我的</button>
    </header> : null}

    {view === "fresh" ? <section className="ef-home-fresh" aria-label="开始对话">
      <div className="ef-home-fresh-inner">
        <h1>想聊点什么？</h1>
        <p className="ef-home-fresh-sub">可以问问题、说说想学什么，或者只是随便看看。</p>
        {composer}
        {config.examples.length ? <div className="ef-home-example-row" aria-label="示例">
          {config.examples.map((example) => <button key={example.id} type="button" className="ef-ui-chip" onClick={() => { if (example.kind === "start") void startStarter(); else void send(example.prompt); }}>{example.kind === "start" ? <Sparkles size={13} aria-hidden="true" /> : null}{example.label}</button>)}
        </div> : null}
      </div>
    </section> : view === "returning" ? <section className="ef-home-return" aria-label="继续学习">
      <div className="ef-home-return-inner">
        <div className="ef-home-return-copy">
          <h1>欢迎回来</h1>
          <p>{recentTitle ? `上次学到「${recentTitle}」，接着往下走。` : "接着上次的路线继续。"}</p>
        </div>
        <div className="ef-home-return-card">
          <span className="ef-home-return-icon" aria-hidden="true"><Play size={18} /></span>
          <span className="ef-home-return-copy-step">
            <small>{nextStep ? (nextStep.kind === "micro" ? "下一步 · 小练习" : "下一步 · 动手任务") : showStarter ? "从最简单的开始" : "查看路线"}{nextStep?.minutes ? ` · 约 ${nextStep.minutes} 分钟` : ""}</small>
            <strong>{nextStep?.title ?? starterExample?.label ?? "打开你的学习路线"}</strong>
          </span>
          <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={() => void continueNext()} disabled={assistant.loading || assistant.sending}>{assistant.loading ? "正在准备…" : "继续"}<ArrowRight size={14} /></button>
        </div>
        {composer}
        <div className="ef-home-return-links">
          <button type="button" className="ef-home-text-action" onClick={() => setPanel(true)}><History size={13} aria-hidden="true" />查看历史对话</button>
          <button type="button" className="ef-home-text-action" onClick={newConversation}>新对话</button>
        </div>
      </div>
    </section> : <div className="ef-home-work">
      <div className="ef-home-column">
        <HomeConversation
          messages={assistant.chatMessages}
          session={session}
          cardActions={cardActions}
          loading={assistant.loading}
          sending={assistant.sending}
          error={assistant.error}
          contexts={[]}
          onRemoveContext={() => undefined}
          onSend={send}
          suggestions={[]}
          previewPerson={null}
          onRetry={() => void assistant.retry()}
          composerHeader={<>{nextStrip}{starterChip}</>}
        />
      </div>
    </div>}

    {routePanelOpen && projection && focusRuntime ? <HomeRoutePanel
      courseTitle={focusRuntime.course.title}
      projection={projection}
      decision={navigationDecision}
      onClose={() => dispatchRightPanel({ type: "close" })}
      onOpenTree={() => navigate(`/courses/${encodeURIComponent(focusRuntime.course.id)}?view=course`)}
      onStart={openRouteStep}
    /> : null}

    {panelOpen ? <MyPanel
      session={session}
      open
      loading={assistant.loading}
      onClose={() => { setPanel(false); panelToggleRef.current?.focus(); }}
      sessions={assistant.sessions}
      activeSessionId={assistant.activeSessionId}
      onNewConversation={newConversation}
      onSelectSession={selectSession}
    /> : null}

    {workspace?.kind === "micro" ? <div className="ef-home-workspace" aria-label="小练习工作区">
      <InlineMicro path={workspace.path} knowledgeId={workspace.knowledgeId} courseId={workspace.courseId} session={session} surface="panel" onClose={closeWorkspace} onExpand={() => {
        const target = microImmersiveHref(workspace.knowledgeId, { courseId: workspace.courseId, pathId: workspace.pathId, returnTo: "/" });
        navigate(target.to, { state: target.state });
      }} />
    </div> : null}

    {practiceCache ? <div className={`ef-home-workspace${rightPanel.kind === "practice" ? "" : " is-hidden"}`} aria-label="动手任务工作区" aria-hidden={rightPanel.kind === "practice" ? undefined : true}>
      <PracticeObject
        key={`${practiceCache.courseId}:${practiceCache.assignmentId}`}
        session={session}
        courseId={practiceCache.courseId}
        assignmentId={practiceCache.assignmentId}
        size="panel"
        assistantSessionId={assistant.activeSessionId ?? undefined}
        onSubmitted={(attemptId) => { void assistant.recordAction({ kind: "practice-submitted", courseId: practiceCache.courseId, assignmentId: practiceCache.assignmentId, attemptId }, assistantContext()); }}
        onResultPassed={() => { void assistant.recordAction({ kind: "segment-cleared", courseId: practiceCache.courseId, assignmentId: practiceCache.assignmentId }, assistantContext()); }}
        onOpenNextStep={openPracticeNext}
        onClose={closeWorkspace}
        onOpenImmersive={() => navigate(`/courses/${encodeURIComponent(practiceCache.courseId)}/assignments/${encodeURIComponent(practiceCache.assignmentId)}`, { state: { returnTo: "/" } })}
        onReturn={closeWorkspace}
      />
    </div> : null}
  </main>;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function formatToday() {
  return new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
}

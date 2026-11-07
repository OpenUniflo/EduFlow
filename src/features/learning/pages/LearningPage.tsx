import { ArrowRight, PanelRight, Sparkles } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { applicationServices, refreshLearnerState } from "@/app/services/applicationServices";
import { useAssistantRuntime } from "@/features/assistant/AssistantRuntimeContext";
import type { MockSession } from "@/features/auth/types";
import { archiveHref } from "@/features/archive/model/atlasParams";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { PracticeObject } from "@/features/course/practice/PracticeObject";
import { ConversationHistory } from "@/features/home/ConversationHistory";
import { HomeConversation } from "@/features/home/HomeConversation";
import { MicroHostLayer, MicroHostProvider, useMicroHostController } from "@/features/home/MicroHost";
import { formatMicroParam, parseMicroParam, parseMicroView } from "@/features/home/microPresence";
import { HomeRoutePanel } from "@/features/home/HomeRoutePanel";
import { MyPanel } from "@/features/home/MyPanel";
import { EMPTY_HOME_MAINLINE_CONFIG, type HomeMainlineConfig } from "@/features/home/HomeMainlineConfigRepository";
import { deriveHomeView, resolveHomeNextStep, routeStripLabel, shouldShowStarter, type HomeNextStep } from "@/features/home/homeMainline";
import { buildHomeCourseProjection, type HomeMicroAsset } from "@/features/course/path/courseLearnerProjection";
import type { CourseRouteStepAction } from "@/features/course/path/CourseRoutePanel";
import { buildHomeAssistantContext } from "@/features/home/homeAssistantContext";
import { openPanelParams, openWorkspaceParams, removeWorkspaceParam } from "@/features/home/learningWorkspace";
import { panelParamAction, reduceRightPanel, type RightPanel } from "@/features/home/rightPanel";
import type { NavigationDecision } from "@/shared/learning/navigation";
import type { AssistantCardActions } from "@/features/assistant/cards/AssistantCardView";
import { HomeComposer } from "@/shared/ui/HomeComposer";
import "@/features/home/home.css";

type PracticeWorkspace = Extract<RightPanel, { kind: "practice" }>;

export function LearningPage({ session, onLogout: _onLogout }: { session: MockSession; onLogout(): void }) {
  const navigate = useNavigate();
  const assistant = useAssistantRuntime();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rightPanel, dispatchRightPanel] = useReducer(reduceRightPanel, searchParams.get("panel") === "1" ? { kind: "my" } as RightPanel : { kind: "none" } as RightPanel);
  const [practiceCache, setPracticeCache] = useState<PracticeWorkspace | null>(null);
  const [routeMode, setRouteMode] = useState<"side" | "page">("side");
  const panelOpen = rightPanel.kind === "my";
  const routePanelOpen = rightPanel.kind === "route";
  const routePageOpen = routePanelOpen && routeMode === "page";
  const workspace: PracticeWorkspace | null = rightPanel.kind === "practice" ? rightPanel : null;
  const [config, setConfig] = useState<HomeMainlineConfig>(EMPTY_HOME_MAINLINE_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [navigationDecision, setNavigationDecision] = useState<NavigationDecision | null>(null);
  const [navigationError, setNavigationError] = useState(false);
  const narrow = useMediaQuery("(max-width: 900px)");
  const historyPreferenceKey = `eduflow:home:history:${session.userId}`;
  const [historyPreference, setHistoryPreference] = useState(() => readHistoryPreference(historyPreferenceKey));
  const [historyOpen, setHistoryOpen] = useState(() => !window.matchMedia("(max-width: 900px)").matches && readHistoryPreference(historyPreferenceKey));
  const [historyAutoClosed, setHistoryAutoClosed] = useState(false);
  const historyStageRef = useRef<HTMLDivElement>(null);
  const manualHistoryDuringPanel = useRef(false);
  const urlSessionApplied = useRef<string | null>(null);
  const urlSessionSelecting = useRef(false);
  const practiceParam = searchParams.get("practice");
  const microParam = searchParams.get("micro");
  const panelToggleRef = useRef<HTMLButtonElement>(null);
  const forceNewSessionRef = useRef(false);
  const resolvedPracticeParam = useRef<string | null>(null);
  const resolvedMicroParam = useRef<string | null>(null);
  const microHost = useMicroHostController({
    session,
    conversationKey: assistant.activeSessionId ?? null,
    recordCompleted: (input) => {
      void assistant.recordAction({ kind: "micro-completed", ...input }, assistantContext());
    }
  });
  const microForm = microHost.presence?.form ?? "closed";
  // Immersive is a modal over the form it came from. Keep that form's layout
  // (including a side slot's reserved width) so opening/closing the dialog
  // never animates the history column or reflows the page behind the scrim.
  const microLayoutForm = microForm === "focus" ? microHost.presence?.returnForm ?? "inline" : microForm;
  const sideMicro = microLayoutForm === "side";
  const panelVisible = rightPanel.kind !== "none" || sideMicro;

  useEffect(() => {
    try { window.localStorage.setItem(historyPreferenceKey, historyPreference ? "1" : "0"); } catch { /* storage may be unavailable */ }
  }, [historyPreference, historyPreferenceKey]);

  // Narrow screens always start with the history drawer closed; on a wide
  // screen the learner's own preference returns (unless a panel auto-closed it).
  useEffect(() => {
    if (narrow) { setHistoryOpen(false); setHistoryAutoClosed(false); return; }
    setHistoryOpen(historyPreference && !historyAutoClosed);
  }, [narrow, historyPreference, historyAutoClosed]);

  useEffect(() => {
    if (!routePanelOpen) setRouteMode("side");
  }, [routePanelOpen]);

  // Closing every right panel restores an auto-collapsed history column, but
  // never a column the learner collapsed on purpose.
  useEffect(() => {
    if (panelVisible) return;
    manualHistoryDuringPanel.current = false;
    setHistoryAutoClosed(false);
  }, [panelVisible]);

  // A right panel may leave the conversation under 640px. Check the real
  // conversation column after layout; a manual expand during that panel wins.
  useLayoutEffect(() => {
    if (narrow || !panelVisible) return;
    const stage = historyStageRef.current;
    if (!stage) return;
    const fit = () => {
      if (!historyOpen || manualHistoryDuringPanel.current) return;
      const timeline = stage.querySelector<HTMLElement>(".ef-home-timeline");
      const width = timeline?.getBoundingClientRect().width ?? stage.clientWidth;
      if (width < 640) { setHistoryOpen(false); setHistoryAutoClosed(true); }
    };
    fit();
    // The panel's box and the conversation column commit in different frames.
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [panelVisible, narrow, historyOpen, rightPanel.kind, sideMicro]);

  const sessionParam = searchParams.get("session");
  useEffect(() => {
    if (assistant.loading) return;
    if (!sessionParam) { urlSessionApplied.current = null; return; }
    if (sessionParam === urlSessionApplied.current) return;
    urlSessionApplied.current = sessionParam;
    if (sessionParam === assistant.activeSessionId) return;
    urlSessionSelecting.current = true;
    void assistant.selectSession(sessionParam).finally(() => { urlSessionSelecting.current = false; });
  }, [assistant.activeSessionId, assistant.loading, assistant.selectSession, sessionParam]);

  // The session URL is a deep link: switching, deleting and "新对话" keep it
  // truthful without pushing a new browser entry for every switch.
  useEffect(() => {
    if (assistant.loading || urlSessionSelecting.current) return;
    const current = searchParams.get("session");
    if (current && urlSessionApplied.current !== current) return;
    if ((current ?? null) === (assistant.activeSessionId ?? null)) return;
    const next = new URLSearchParams(searchParams);
    if (assistant.activeSessionId) next.set("session", assistant.activeSessionId);
    else next.delete("session");
    setSearchParams(next, { replace: true });
  }, [assistant.activeSessionId, assistant.loading, searchParams, setSearchParams]);

  useEffect(() => {
    let live = true;
    setConfigLoaded(false);
    void applicationServices.homeMainlineConfigRepository.load().then((value) => { if (live) { setConfig(value); setConfigLoaded(true); } });
    return () => { live = false; };
  }, []);

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
  const hasConversation = assistant.chatMessages.length > 0 || Boolean(assistant.activeSessionId) || assistant.sessions.length > 0;
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
  const view = deriveHomeView({ hasLearningRecord, hasConversation });
  const segment = projection?.segment;
  const showStarter = shouldShowStarter({ configuredCourseId: config.starterCourseId, hasCourse: Boolean(starterRuntime), segmentStarted: Boolean(segment?.started) }) && configLoaded && !hasRouteCard;
  const starterExample = config.examples.find((example) => example.kind === "start");
  useEffect(() => {
    if (!microParam) { resolvedMicroParam.current = null; return; }
    if (resolvedMicroParam.current === microParam) return;
    const input = parseMicroParam(microParam);
    if (!input) return;
    const path = applicationServices.microLearningRepository.getPath(input.knowledgeId, {
      mode: "learn",
      pathId: input.pathId,
      ...(input.courseId ? { courseId: input.courseId } : {})
    });
    if (!path) return;
    // Inline is the natural restore when the card is still in the conversation;
    // a timeout below falls back to the side workspace only when it is absent.
    const view = parseMicroView(searchParams.get("view")) ?? "inline";
    resolvedMicroParam.current = microParam;
    dispatchRightPanel({ type: "close" });
    if (searchParams.has("panel") || searchParams.has("practice")) {
      const next = new URLSearchParams(searchParams);
      next.delete("panel");
      next.delete("practice");
      setSearchParams(next, { replace: true });
    }
    microHost.open(input, view);
  }, [microParam, revision, searchParams, setSearchParams, microHost.open]);

  // One address for the one running instance: form and path are shareable, and
  // an immersive reload restores the dialog. Closed removes the address.
  useEffect(() => {
    const presence = microHost.presence;
    if (!presence) return;
    const value = presence.form === "closed" ? null : formatMicroParam(presence);
    // Inline has no address of its own; a reload opens the same path in the side
    // workspace instead of pointing at a card that may not exist yet.
    // Only immersive needs an address of its own. A plain micro address means
    // "back into the card if it exists", never a forced side view.
    const view = presence.form === "focus" ? "focus" : null;
    const currentMicro = searchParams.get("micro");
    const currentView = searchParams.get("view");
    if (value === currentMicro && view === currentView) return;
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set("micro", value);
      if (view) next.set("view", view); else next.delete("view");
    } else { next.delete("micro"); next.delete("view"); }
    // Keep the applied value while a close is clearing the address. Resetting
    // it here lets a stale render re-open the path (especially a just-completed
    // immersive dialog) before `microParam` becomes null. The null branch above
    // clears it once the address is actually gone.
    const nextMicro = next.get("micro");
    if (nextMicro) resolvedMicroParam.current = nextMicro;
    setSearchParams(next, { replace: true });
  }, [microHost.presence, searchParams, setSearchParams]);

  // A restored inline practice first waits for its conversation card. Only
  // when no card ever mounts does it use the side workspace instead.
  useEffect(() => {
    const presence = microHost.presence;
    if (!presence || presence.form !== "inline" || assistant.loading) return;
    if (microHost.slotOwner(presence.pathId)) return;
    const timer = window.setTimeout(() => {
      if (!microHost.slotOwner(presence.pathId)) microHost.setForm("side");
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [microHost.presence, microHost.slotOwner, microHost.slotVersion, microHost.setForm, assistant.loading]);

  const previousPanelKind = useRef(rightPanel.kind);
  useEffect(() => {
    const previous = previousPanelKind.current;
    previousPanelKind.current = rightPanel.kind;
    if (rightPanel.kind !== "none" && previous === "none" && microHost.presence?.form === "side") microHost.dismissSide();
  }, [rightPanel.kind, microHost.presence?.form, microHost.dismissSide]);

  // A side Micro and My/the route/a task are mutually exclusive. When the
  // side form is chosen while one of them is open, the side form wins.
  useEffect(() => {
    if (microForm !== "side" || rightPanel.kind === "none") return;
    dispatchRightPanel({ type: "close" });
    if (searchParams.has("panel") || searchParams.has("practice")) {
      const next = new URLSearchParams(searchParams);
      next.delete("panel");
      next.delete("practice");
      setSearchParams(next, { replace: true });
    }
  }, [microForm, rightPanel.kind, searchParams, setSearchParams]);

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
    if (!panelOpen && !workspace && !routePanelOpen && microForm !== "side") return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // The modal dialog owns Esc through its cancel event.
      if (microForm === "focus") return;
      if (microForm === "side") { microHost.close(); return; }
      if (workspace) { closeWorkspace(); return; }
      if (routePanelOpen) { dispatchRightPanel({ type: "close" }); return; }
      if (panelOpen) { setPanel(false); panelToggleRef.current?.focus(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panelOpen, workspace, routePanelOpen, microForm, microHost.close]);

  function assistantContext() {
    const presence = microHost.presence;
    const microWorkspace = presence
      ? { kind: "micro" as const, pathId: presence.pathId, knowledgeId: presence.knowledgeId, ...(presence.courseId ? { courseId: presence.courseId } : {}) }
      : null;
    return buildHomeAssistantContext({
      selectedCourseId: focusCourseId,
      currentKnowledgeId: nextStep?.knowledgeId,
      workspace: microWorkspace ?? workspace,
      removedContextIds: []
    });
  }

  async function send(message: string) {
    return assistant.send(message, assistantContext());
  }

  const cardActions: AssistantCardActions = {
    openCourse: (courseId) => navigate(`/courses/${encodeURIComponent(courseId)}`),
    openPractice: (courseId, assignmentId) => {
      const runtime = runtimes.find((item) => item.course.id === courseId);
      const assignment = runtime?.assignments.find((item) => item.id === assignmentId);
      if (!assignment) return;
      void openPractice(courseId, assignmentId, assignment.title);
    },
    openPracticeAttempt: (courseId, assignmentId, attemptId) => {
      navigate(`/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}?attemptId=${encodeURIComponent(attemptId)}`, { state: { returnTo: "/" } });
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
    microHost.dismissSide();
    dispatchRightPanel({ type: "open-route" });
    if (searchParams.has("panel")) {
      const next = new URLSearchParams(searchParams);
      next.delete("panel");
      setSearchParams(next, { replace: true });
    }
  }

  function setPanel(open: boolean) {
    if (open) microHost.dismissSide();
    dispatchRightPanel({ type: open ? "open-my" : "close" });
    const base = open ? openPanelParams(searchParams, workspace?.kind) : new URLSearchParams(searchParams);
    if (!open) base.delete("panel");
    setSearchParams(base, { replace: true });
  }

  function showWorkspace(next: PracticeWorkspace) {
    const params = openWorkspaceParams(searchParams);
    params.delete("micro");
    params.delete("practice");
    if (params.toString() !== searchParams.toString()) setSearchParams(params, { replace: true });
    setPracticeCache(next);
    dispatchRightPanel({ type: "open-practice", panel: next });
  }

  function closeWorkspace() {
    if (!workspace) return;
    const next = removeWorkspaceParam(searchParams, workspace.kind);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    dispatchRightPanel({ type: "close" });
  }

  function announceLearnerActionStart() {
    // A fresh Micro/Assignment begins a new scroll-follow judgement window.
    window.dispatchEvent(new Event("eduflow:learner-action-start"));
  }

  async function openPractice(courseId: string, assignmentId: string, title: string) {
    announceLearnerActionStart();
    microHost.dismissSide();
    await assistant.recordAction({ kind: "practice-opened", courseId, assignmentId, forceNewSession: forceNewSessionRef.current }, assistantContext());
    forceNewSessionRef.current = false;
    showWorkspace({ kind: "practice", courseId, assignmentId, title });
  }

  async function openMicroInConversation(step: HomeNextStep) {
    if (!step.pathId || !step.knowledgeId) return false;
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
    const path = applicationServices.microLearningRepository.getPath(step.knowledgeId, {
      mode: "learn",
      pathId: step.pathId,
      ...(step.courseId ? { courseId: step.courseId } : {})
    });
    if (path && !applicationServices.microLearningRepository.getPathProgress(path.id)) {
      try {
        await applicationServices.microLearningRepository.start(path.id, step.courseId);
        void refreshLearnerState(session.userId).catch(() => undefined);
      } catch {
        /* the runner still opens and shows its own retry state */
      }
    }
    microHost.open({
      pathId: step.pathId,
      knowledgeId: step.knowledgeId,
      ...(step.courseId ? { courseId: step.courseId } : {})
    });
    return true;
  }

  async function startStarter() {
    if (!config.starterCourseId) return;
    dispatchRightPanel({ type: "close" });
    await assistant.recordAction({ kind: "route-started", courseId: config.starterCourseId }, assistantContext());
  }

  async function continueNext() {
    if (assistant.loading || assistant.sending) return;
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
      microHost.open({ pathId: step.microPathId, knowledgeId: step.nodeId, courseId: focusCourseId });
      return;
    }
    if (step.resourceKind === "assignment" && step.resourceId) {
      void openPractice(focusCourseId, step.resourceId, step.title);
      return;
    }
    navigate(`/courses/${encodeURIComponent(focusCourseId)}`);
  }

  function toggleHistory(open: boolean) {
    setHistoryPreference(open);
    setHistoryAutoClosed(false);
    manualHistoryDuringPanel.current = open && panelVisible;
    setHistoryOpen(open);
  }

  function newConversation() {
    // "新对话" on an already empty draft must not create another empty one.
    if (!assistant.activeSessionId && assistant.chatMessages.length === 0) {
      dispatchRightPanel({ type: "close" });
      return;
    }
    forceNewSessionRef.current = true;
    void assistant.selectSession(null);
    dispatchRightPanel({ type: "close" });
  }

  function selectSession(sessionId: string) {
    forceNewSessionRef.current = false;
    void assistant.selectSession(sessionId);
    dispatchRightPanel({ type: "close" });
  }

  function openMyCourse(courseId: string) {
    setPanel(false);
    navigate(`/courses/${encodeURIComponent(courseId)}`);
  }

  function openMyPractice(courseId: string, assignmentId: string, title: string) {
    setPanel(false);
    void openPractice(courseId, assignmentId, title);
  }

  function openMyRecent(nodeId: string) {
    setPanel(false);
    const path = activeCourses.map(({ runtime }) => applicationServices.microLearningRepository.getPath(nodeId, { courseId: runtime.course.id, mode: "learn" })).find(Boolean)
      ?? applicationServices.microLearningRepository.getPath(nodeId, { mode: "learn" });
    if (path) {
      microHost.open({ pathId: path.id, knowledgeId: nodeId, ...(focusCourseId ? { courseId: focusCourseId } : {}) });
      return;
    }
    if (focusCourseId) navigate(`/courses/${encodeURIComponent(focusCourseId)}`);
    else navigate("/records");
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
  const nextStepCard = useMemo(() => nextStep?.kind === "micro" && nextStep.pathId
    ? { kind: "micro" as const, pathId: nextStep.pathId }
    : nextStep?.kind === "practice" && nextStep.assignmentId
      ? { kind: "practice" as const, assignmentId: nextStep.assignmentId }
      : null, [nextStep?.kind, nextStep?.pathId, nextStep?.assignmentId]);
  const conversationTitle = assistant.activeSessionTitle.trim() || assistant.sessions.find((item) => item.id === assistant.activeSessionId)?.title?.trim() || "新对话";
  const progressChapter = projection?.chapters.find((chapter) => chapter.id === projection.currentChapterId);
  // The first segment keeps its route-card denominator until it is complete;
  // only then does the label become the broader course route.
  const routeProgress = routeStripLabel(segment, progressChapter);
  const composer = <HomeComposer contexts={[]} onRemoveContext={() => undefined} onSubmit={(value) => void send(value)} onStop={() => void assistant.stop()} disabled={assistant.loading || (assistant.sending && !assistant.replying)} replying={assistant.replying && !assistant.loading} hint={<span>Enter 发送 · Shift + Enter 换行</span>} />;

  const nextStrip = nextStep && showNextStrip ? <div className="ef-home-next-strip" aria-label="下一步">
    <span className="ef-home-next-label">{nextStripLabel}</span>
    <span className="ef-home-next-copy"><strong>{nextStep.title}</strong><small>{nextStep.kind === "micro" ? "小练习" : "动手任务"}{nextStep.minutes ? ` · 约 ${nextStep.minutes} 分钟` : ""}</small></span>
    <button type="button" className="ef-home-text-action" onClick={showRoutePanel}>{routeProgress}</button>
    <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={() => void continueNext()}>{nextStripAction}<ArrowRight size={14} /></button>
  </div> : navigationError ? <p className="ef-home-next-error" role="alert">下一步暂时无法读取。<button type="button" onClick={() => setRevision((value) => value + 1)}>重试</button></p> : null;

  const starterEntry = showStarter && starterExample ? <div className="ef-home-example-row">
    <button type="button" className="ef-ui-chip" onClick={() => void startStarter()}><Sparkles size={13} aria-hidden="true" />{starterExample.label}</button>
  </div> : null;
  const promptExamples = config.examples.filter((example) => example.kind !== "start");
  const emptyExamples = promptExamples.map((example) => ({ id: example.id, label: example.label, onSelect: () => void send(example.prompt) }));

  return <MicroHostProvider host={microHost}><main className={`ef-home ${panelOpen ? "has-panel" : ""} ${workspace || sideMicro ? "has-workspace" : ""} ${routePanelOpen ? "has-route" : ""} ${routePageOpen ? "is-route-page" : ""}`} data-view={view} data-history={historyOpen ? "open" : "closed"} data-micro-form={microForm} data-workspace={sideMicro ? "micro" : workspace?.kind ?? ""} data-route-page={routePageOpen ? "1" : undefined} data-strip={showNextStrip ? "1" : undefined}>
    <button ref={panelToggleRef} type="button" className={`ef-home-panel-toggle ${panelOpen ? "is-open" : ""}`} aria-pressed={panelOpen} aria-controls="ef-my-panel" onClick={() => setPanel(!panelOpen)}><PanelRight size={16} aria-hidden="true" />我的</button>

    {view === "fresh" ? <section className="ef-home-fresh" aria-label="开始对话">
      <div className="ef-home-fresh-inner">
        <h1>想聊点什么？</h1>
        <p className="ef-home-fresh-sub">可以问问题、说说想学什么，或者只是随便看看。</p>
        {starterEntry}
        {composer}
        {promptExamples.length ? <div className="ef-home-example-row" aria-label="示例">
          {promptExamples.map((example) => <button key={example.id} type="button" className="ef-ui-chip" onClick={() => void send(example.prompt)}>{example.label}</button>)}
        </div> : null}
      </div>
    </section> : <div className="ef-home-body">
      <ConversationHistory
        open={historyOpen}
        narrow={narrow}
        sessions={assistant.sessions}
        activeSessionId={assistant.activeSessionId}
        query={assistant.sessionsQuery}
        hasMore={assistant.sessionsHasMore}
        loadingMore={assistant.sessionsLoadingMore}
        loading={assistant.loading}
        onSearch={assistant.searchSessions}
        onLoadMore={assistant.loadMoreSessions}
        onNew={newConversation}
        onSelect={selectSession}
        onRename={assistant.renameSession}
        onDelete={assistant.deleteSession}
        onCollapse={() => toggleHistory(false)}
      />
      <div className="ef-home-work">
        <div className="ef-home-column" ref={historyStageRef}>
          <HomeConversation
            messages={assistant.chatMessages}
            session={session}
            cardActions={cardActions}
            loading={assistant.loading}
            sending={assistant.sending}
            replying={assistant.replying}
            onStop={() => void assistant.stop()}
            error={assistant.error}
            contexts={[]}
            onRemoveContext={() => undefined}
            onSend={send}
            suggestions={[]}
            emptyExamples={emptyExamples}
            emptyTitle="想聊点什么？"
            emptyDescription="可以问问题、说说想学什么，或者只是随便看看。"
            starterEntry={starterEntry}
            previewPerson={null}
            onRetry={() => void assistant.retry()}
            composerHeader={nextStrip}
            hasNextStepStrip={Boolean(nextStep && showNextStrip)}
            nextStepCard={nextStepCard}
            title={conversationTitle}
            conversationKey={assistant.activeSessionId}
            onExpandHistory={historyOpen ? undefined : () => toggleHistory(true)}
            layoutEpoch={`${historyOpen}|${panelVisible}|${rightPanel.kind}|${sideMicro}`}
          />
        </div>
      </div>
    </div>}

    {routePanelOpen && projection && focusRuntime ? <HomeRoutePanel
      courseTitle={focusRuntime.course.title}
      projection={projection}
      decision={navigationDecision}
      onModeChange={setRouteMode}
      onClose={() => dispatchRightPanel({ type: "close" })}
      onOpenTree={() => navigate(`/courses/${encodeURIComponent(focusRuntime.course.id)}?view=course`)}
      onStart={openRouteStep}
    /> : null}

    {panelOpen ? <MyPanel
      session={session}
      open
      loading={assistant.loading}
      onClose={() => { setPanel(false); panelToggleRef.current?.focus(); }}
      onOpenCourse={openMyCourse}
      onOpenPractice={openMyPractice}
      onOpenRecent={openMyRecent}
    /> : null}

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

    <MicroHostLayer host={microHost} session={session} />
  </main></MicroHostProvider>;
}

function readHistoryPreference(key: string) {
  try { return window.localStorage.getItem(key) !== "0"; } catch { return true; }
}

/** Small media-query subscription used only for the narrow overlay drawer. */
function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window === "undefined" ? false : window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

import { PanelRight } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { applicationServices, refreshLearnerState } from "@/app/services/applicationServices";
import { useAssistantRuntime } from "@/features/assistant/AssistantRuntimeContext";
import type { MockSession } from "@/features/auth/types";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { ConversationHistory } from "@/features/home/ConversationHistory";
import { HomeConversation } from "@/features/home/HomeConversation";
import { MicroHostLayer, MicroHostProvider, useMicroHostController } from "@/features/home/MicroHost";
import { formatMicroParam, parseMicroParam, parseMicroView } from "@/features/home/microPresence";
import { MyPanel } from "@/features/home/MyPanel";
import { EMPTY_HOME_MAINLINE_CONFIG, type HomeMainlineConfig } from "@/features/home/HomeMainlineConfigRepository";
import { deriveHomeView, resolveHomeNextStep, type HomeNextStep } from "@/features/home/homeMainline";
import { buildHomeCourseProjection, type HomeMicroAsset } from "@/features/course/path/courseLearnerProjection";
import type { CourseRouteStepAction } from "@/features/course/path/CourseRoutePanel";
import { buildHomeAssistantContext } from "@/features/home/homeAssistantContext";
import { openPanelParams, openWorkspaceParams, removeWorkspaceParam } from "@/features/home/learningWorkspace";
import { panelParamAction, panelBackLabel, previousRightPanel, reduceRightPanel, initialRightPanelState, type RightPanel } from "@/features/home/rightPanel";
import { rightPanelFromParams, rightPanelParams } from "@/features/home/panelParams";
import { ObjectPanelSwitch } from "@/features/home/ObjectPanelSwitch";
import { panelForTarget } from "@/features/home/panelForTarget";
import { ActiveAssistantObjectContext, activeObjectKey, type ActiveAssistantObject } from "@/features/assistant/activeObject";
import type { AssistantObjectTarget } from "@/features/assistant/objectTarget";
import { decodePracticeLink } from "@/shared/learning/practiceLink";
import { useReducedMotion } from "motion/react";
import { expandPanelFromRect, contractPanelToRect } from "@/shared/ui/panelMorph";
import type { NavigationDecision } from "@/shared/learning/navigation";
import type { AssistantCardActions } from "@/features/assistant/cards/AssistantCardView";
import { HomeComposer, type ComposerAttachment, type ComposerExtras } from "@/shared/ui/HomeComposer";
import { uploadEvidence } from "@/features/evidence/evidenceClient";
import { attachmentCountMessage, attachmentFileError, attachmentRoom } from "@/shared/assistant/attachments";
import { shouldHandleShellEscape } from "@/shared/ui/escapeLayer";
import "@/features/home/home.css";

type PracticeWorkspace = Extract<RightPanel, { kind: "practice" }>;

export function LearningPage({ session, onLogout: _onLogout }: { session: MockSession; onLogout(): void }) {
  const navigate = useNavigate();
  const assistant = useAssistantRuntime();
  const [searchParams, setSearchParams] = useSearchParams();
  const [panelHistory, dispatchRightPanel] = useReducer(reduceRightPanel, rightPanelFromParams(searchParams), initialRightPanelState);
  const rightPanel = panelHistory.current;
  const previousPanel = previousRightPanel(panelHistory);
  const [practiceCache, setPracticeCache] = useState<PracticeWorkspace | null>(null);
  const [routeMode, setRouteMode] = useState<"side" | "page">("side");
  const [panelOrigin, setPanelOrigin] = useState<DOMRect | null>(null);
  const [dismissedObjectKey, setDismissedObjectKey] = useState<string | null>(null);
  const reducedMotion = Boolean(useReducedMotion());
  const practicePanelRef = useRef<HTMLDivElement>(null);
  const practiceClosing = useRef(false);
  const panelOpen = rightPanel.kind === "my";
  const routePanelOpen = rightPanel.kind === "route";
  const routeCourseId = rightPanel.kind === "route" ? rightPanel.courseId : null;
  const knowledgeNodeId = rightPanel.kind === "knowledge" ? rightPanel.nodeId : null;
  const knowledgePanelOpen = Boolean(knowledgeNodeId);
  const materialPanel = rightPanel.kind === "material" ? rightPanel : null;
  const recordsPanelOpen = rightPanel.kind === "records";
  const briefPanel = rightPanel.kind === "brief" ? rightPanel : null;
  const routePageOpen = routePanelOpen && routeMode === "page";
  const workspace: PracticeWorkspace | null = rightPanel.kind === "practice" ? rightPanel : null;
  const [config, setConfig] = useState<HomeMainlineConfig>(EMPTY_HOME_MAINLINE_CONFIG);
  const [revision, setRevision] = useState(0);
  const [navigationDecision, setNavigationDecision] = useState<NavigationDecision | null>(null);
  const [routeDecision, setRouteDecision] = useState<NavigationDecision | null>(null);
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
  const panelTriggerRef = useRef<HTMLElement | null>(null);
  const panelLayoutGraceUntil = useRef(0);
  const objectPanelRef = useRef<HTMLDivElement>(null);
  const resolvedPracticeParam = useRef<string | null>(null);
  const resolvedMicroParam = useRef<string | null>(null);
  const microHost = useMicroHostController({
    session,
    conversationKey: assistant.activeSessionId ?? null
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
    let timer = 0;
    const fit = () => {
      if (!historyOpen || manualHistoryDuringPanel.current) return;
      // Opening a panel first measures and grows it from the card's current
      // rectangle. The history column collapses only after that morph, so the
      // card never moves underneath the panel's start position (M-07).
      const wait = panelLayoutGraceUntil.current - performance.now();
      if (wait > 0) {
        if (!timer) timer = window.setTimeout(() => { timer = 0; fit(); }, Math.ceil(wait) + 16);
        return;
      }
      const timeline = stage.querySelector<HTMLElement>(".ef-home-timeline");
      const width = timeline?.getBoundingClientRect().width ?? stage.clientWidth;
      if (width < 640) { setHistoryOpen(false); setHistoryAutoClosed(true); }
    };
    fit();
    // The panel's box and the conversation column commit in different frames.
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => { window.clearTimeout(timer); observer.disconnect(); };
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
    void applicationServices.homeMainlineConfigRepository.load().then((value) => { if (live) { setConfig(value); } });
    return () => { live = false; };
  }, []);

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

  // A restored practice panel needs its object cache before the shell mounts.
  useEffect(() => {
    if (rightPanel.kind === "practice" && !practiceCache) setPracticeCache(rightPanel);
  }, [practiceCache, rightPanel]);

  // The open panel is part of the conversation address, so a browser back or
  // a refresh restores the same panel (including its segment/attempt/step).
  useEffect(() => {
    const next = rightPanelParams(searchParams, rightPanel);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [rightPanel, searchParams, setSearchParams]);

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
  const routeRuntime = routeCourseId ? applicationServices.courseRepository.getCourse(routeCourseId) : undefined;
  const routeCourseState = routeCourseId
    ? applicationServices.learningProgressRepository.getCourseState(session.userId, routeCourseId)
    : undefined;

  useEffect(() => {
    if (!focusCourseId) { setNavigationDecision(null); return; }
    let live = true;
    void applicationServices.learnerStateService.getNavigation(focusCourseId)
      .then((decision) => { if (live) setNavigationDecision(decision); })
      .catch(() => { if (live) setNavigationDecision(null); });
    return () => { live = false; };
  }, [focusCourseId, revision]);

  useEffect(() => {
    if (!routePanelOpen || !routeCourseId) { setRouteDecision(null); return; }
    let live = true;
    void applicationServices.learnerStateService.getNavigation(routeCourseId)
      .then((decision) => { if (live) setRouteDecision(decision); })
      .catch(() => { if (live) setRouteDecision(null); });
    return () => { live = false; };
  }, [routePanelOpen, routeCourseId, revision]);

  const graphTitles = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node.title])), [graph.nodes]);
  const projection = useMemo(() => {
    if (!focusRuntime || !focusCourseState) return null;
    return projectHomeCourse(focusRuntime, focusCourseState, records, graphTitles, navigationDecision);
  }, [focusCourseState, focusRuntime, graphTitles, navigationDecision, records]);
  const routeProjection = useMemo(() => {
    if (!routeRuntime || !routeCourseState) return null;
    return projectHomeCourse(routeRuntime, routeCourseState, records, graphTitles, routeDecision);
  }, [graphTitles, records, routeCourseState, routeDecision, routeRuntime]);

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

  const activeObject = useMemo<ActiveAssistantObject | null>(() => {
    const presence = microHost.presence;
    if (presence && presence.form !== "closed") {
      const inlineMounted = presence.cardKey
        ? Boolean(microHost.cardSlot(presence.pathId, presence.cardKey))
        : Boolean(microHost.slotOwner(presence.pathId));
      if (presence.form === "inline" && !inlineMounted) return null;
      const path = applicationServices.microLearningRepository.getPath(presence.knowledgeId, {
        mode: "learn",
        pathId: presence.pathId,
        ...(presence.courseId ? { courseId: presence.courseId } : {})
      });
      return {
        kind: "micro",
        pathId: presence.pathId,
        knowledgeId: presence.knowledgeId,
        ...(presence.courseId ? { courseId: presence.courseId } : {}),
        title: path?.title ?? "小练习"
      };
    }
    if (rightPanel.kind === "knowledge") {
      const node = applicationServices.knowledgeRepository.getNode(rightPanel.nodeId, userKnowledgeAccess(session.userId));
      return { kind: "knowledge", nodeId: rightPanel.nodeId, title: node?.title ?? "知识点" };
    }
    if (rightPanel.kind === "practice") {
      const assignment = applicationServices.courseRepository.getCourse(rightPanel.courseId)?.assignments.find((item) => item.id === rightPanel.assignmentId);
      return { kind: "practice", courseId: rightPanel.courseId, assignmentId: rightPanel.assignmentId, title: rightPanel.title || assignment?.title || "动手任务" };
    }
    if (rightPanel.kind === "route") return { kind: "route", courseId: rightPanel.courseId, title: routeRuntime?.course.title ?? "课程路线" };
    if (rightPanel.kind === "material") {
      const material = applicationServices.courseRepository.getCourse(rightPanel.courseId)?.materials.find((item) => item.id === rightPanel.materialId);
      return { kind: "material", courseId: rightPanel.courseId, materialId: rightPanel.materialId, title: material?.title ?? "资料" };
    }
    if (rightPanel.kind === "records") return { kind: "records", title: "学习记录" };
    if (rightPanel.kind === "brief") {
      const message = assistant.messages.find((item) => item.id === rightPanel.messageId);
      const brief = message?.structuredContent?.type === "course_creation_brief" ? message.structuredContent : null;
      return { kind: "brief", messageId: rightPanel.messageId, title: brief?.goal ?? "课程简介" };
    }
    return null;
  }, [assistant.messages, microHost.cardSlot, microHost.presence, microHost.slotOwner, microHost.slotVersion, rightPanel, routeRuntime]);
  const activeObjectIdentity = activeObjectKey(activeObject);
  const objectContextVisible = Boolean(activeObject) && activeObjectIdentity !== dismissedObjectKey;
  const contexts = objectContextVisible && activeObject ? [{ id: "active-object", label: activeObject.title }] : [];

  const cardAssignmentKeys = useMemo(() => assistant.chatMessages.flatMap((message) => (message.parts ?? []).flatMap((part) => {
    if (part.type !== "tool-displayCard") return [];
    const card = (part as { output?: { card?: { cardType?: string; courseId?: string; assignmentId?: string } } }).output?.card;
    if ((card?.cardType === "practice" || card?.cardType === "evaluation") && card.courseId && card.assignmentId) return [`${card.courseId}:${card.assignmentId}`];
    return [];
  })), [assistant.chatMessages]);

  const hasLearningRecord = records.some((record) => record.status !== "explore");
  const hasConversation = assistant.chatMessages.length > 0 || Boolean(assistant.activeSessionId) || assistant.sessions.length > 0;
  const view = deriveHomeView({ hasLearningRecord, hasConversation });
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
    const cardKey = searchParams.get("card") ?? undefined;
    resolvedMicroParam.current = microParam;
    dispatchRightPanel({ type: "close" });
    if (searchParams.has("panel") || searchParams.has("practice")) {
      const next = new URLSearchParams(searchParams);
      next.delete("panel");
      next.delete("practice");
      setSearchParams(next, { replace: true });
    }
    microHost.open({ ...input, ...(cardKey ? { cardKey } : {}) }, view);
  }, [microParam, revision, searchParams, setSearchParams, microHost.open]);

  // One address for the one running instance: form and path are shareable, and
  // an immersive reload restores the dialog. Closed removes the address.
  useEffect(() => {
    const presence = microHost.presence;
    if (!presence) return;
    const value = presence.form === "closed" ? null : formatMicroParam(presence);
    // The form and the owning conversation card are part of the address, so a
    // reload restores the same card (inline), side workspace or immersive form.
    const view = presence.form === "closed" ? null : presence.form;
    const card = presence.form === "closed" ? null : presence.cardKey ?? null;
    const currentMicro = searchParams.get("micro");
    const currentView = searchParams.get("view");
    const currentCard = searchParams.get("card");
    if (value === currentMicro && view === currentView && card === currentCard) return;
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set("micro", value);
      if (view) next.set("view", view); else next.delete("view");
      if (card) next.set("card", card); else next.delete("card");
    } else { next.delete("micro"); next.delete("view"); next.delete("card"); }
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
    if (microHost.cardSlot(presence.pathId, presence.cardKey) || (!presence.cardKey && microHost.slotOwner(presence.pathId))) return;
    const timer = window.setTimeout(() => {
      if (!microHost.cardSlot(presence.pathId, presence.cardKey) && (presence.cardKey || !microHost.slotOwner(presence.pathId))) microHost.setForm("side");
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [microHost.presence, microHost.cardSlot, microHost.slotOwner, microHost.slotVersion, microHost.setForm, assistant.loading]);

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
    const link = decodePracticeLink(practiceParam);
    if (!link) return;
    const { courseId, assignmentId } = link;
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

  // One Escape path for every Object Shell. A modal layer — native dialog or
  // an aria-modal overlay such as a submit/withdraw confirmation — owns the
  // key and closes itself; the shell behind it stays open. This is checked at
  // keydown time, so listener registration order cannot close the panel first.
  useEffect(() => {
    if (!panelVisible && !workspace && microForm === "closed") return;
    function onKeyDown(event: KeyboardEvent) {
      if (!shouldHandleShellEscape(event)) return;
      if (microForm === "focus") return;
      if (microForm === "side") { microHost.close(); return; }
      if (workspace) { closeWorkspace(); return; }
      if (rightPanel.kind !== "none") { closeActivePanel(); return; }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeActivePanel, closeWorkspace, microForm, microHost.close, panelVisible, rightPanel.kind, workspace]);

  function assistantContext() {
    const presence = microHost.presence;
    const microWorkspace = presence
      ? { kind: "micro" as const, pathId: presence.pathId, knowledgeId: presence.knowledgeId, ...(presence.courseId ? { courseId: presence.courseId } : {}) }
      : null;
    return buildHomeAssistantContext({
      selectedCourseId: focusCourseId,
      currentKnowledgeId: nextStep?.knowledgeId,
      workspace: microWorkspace ?? workspace,
      removedContextIds: [],
      activeObject,
      objectContextVisible
    });
  }

  const [freshAttachments, setFreshAttachments] = useState<ComposerAttachment[]>([]);
  const [freshAttachmentError, setFreshAttachmentError] = useState("");

  async function addFreshFiles(files: File[]) {
    setFreshAttachmentError("");
    const room = attachmentRoom(freshAttachments.filter((attachment) => !attachment.uploading).length);
    if (room <= 0) { setFreshAttachmentError(attachmentCountMessage()); return; }
    const accepted: Array<{ file: File; key: string }> = [];
    for (const file of files.slice(0, room)) {
      const fileError = attachmentFileError(file);
      if (fileError) { setFreshAttachmentError(fileError); continue; }
      accepted.push({ file, key: `upload:${crypto.randomUUID()}` });
    }
    if (!accepted.length) return;
    setFreshAttachments((current) => [...current, ...accepted.map(({ file, key }) => ({ id: key, name: file.name, uploading: true }))]);
    for (const { file, key } of accepted) {
      try {
        const sourceId = await uploadEvidence(file, {});
        setFreshAttachments((current) => current.map((attachment) => attachment.id === key ? { id: sourceId, name: file.name } : attachment));
      } catch (uploadFailure) {
        setFreshAttachments((current) => current.filter((attachment) => attachment.id !== key));
        setFreshAttachmentError(uploadFailure instanceof Error ? uploadFailure.message : "文件上传失败，请重试。");
      }
    }
  }

  async function send(message: string, extras?: ComposerExtras & { attachments?: ComposerAttachment[] }) {
    let draft: { note?: string; link?: string } | undefined;
    if (activeObject?.kind === "practice") {
      try {
        const raw = window.sessionStorage.getItem(`eduflow.practice-draft:${session.userId}:${activeObject.courseId}:${activeObject.assignmentId}`);
        if (raw) {
          const parsed = JSON.parse(raw) as { note?: unknown; link?: unknown };
          const note = typeof parsed.note === "string" ? parsed.note.slice(0, 8_000) : undefined;
          const link = typeof parsed.link === "string" ? parsed.link.slice(0, 2_000) : undefined;
          if (note || link) draft = { ...(note ? { note } : {}), ...(link ? { link } : {}) };
        }
      } catch { /* an unsaved draft is optional context, never authority */ }
    }
    return assistant.send(message, assistantContext(), {
      ...(extras?.attachments?.length ? { attachments: extras.attachments.map((attachment) => ({ id: attachment.id, name: attachment.name })) } : {}),
      ...(extras?.mentions?.length ? { mentions: extras.mentions.map((mention) => mention.value) } : {}),
      ...(extras?.links?.length ? { links: extras.links } : {}),
      ...(draft ? { draft } : {})
    });
  }

  const openPanelRef = useRef<(detail: Record<string, unknown>) => void>(() => undefined);
  useEffect(() => {
    const handler = (event: Event) => openPanelRef.current((event as CustomEvent<Record<string, unknown>>).detail ?? {});
    window.addEventListener("eduflow:open-panel", handler);
    return () => window.removeEventListener("eduflow:open-panel", handler);
  }, []);
  openPanelRef.current = (detail) => {
    const panel = String(detail.panel ?? "");
    const courseId = typeof detail.courseId === "string" ? detail.courseId : focusCourseId;
    if (panel === "assignment") {
      const assignmentId = typeof detail.assignmentId === "string" ? detail.assignmentId : undefined;
      const runtime = runtimes.find((item) => item.course.id === courseId);
      const assignment = assignmentId ? runtime?.assignments.find((item) => item.id === assignmentId) : undefined;
      if (courseId && assignmentId && assignment) { openObject({ kind: "practice", courseId, assignmentId }); return; }
    }
    if (panel === "route" && courseId) { openObject({ kind: "route", courseId }); return; }
    if (panel === "material" && courseId && typeof detail.materialId === "string") {
      openObject({ kind: "material", courseId, materialId: detail.materialId, ...(typeof detail.segmentId === "string" ? { segmentId: detail.segmentId } : {}) });
      return;
    }
    if (panel === "records") { openObject({ kind: "records" }); return; }
    if (panel === "my") { setPanel(true); return; }
    if (panel === "map") {
      const nodeId = typeof detail.nodeId === "string" ? detail.nodeId : undefined;
      if (nodeId) openObject({ kind: "knowledge", nodeId });
      else setPanel(true);
    }
  };

  const cardActions: AssistantCardActions = {
    openObject: (target, origin, trigger) => openObject(target, origin, trigger),
    useCourse: (planningMessageId, courseId, context) => assistant.useExistingCourse(planningMessageId, courseId, context),
    refineGoal: (planningMessageId, refinement, context) => assistant.refineGoal(planningMessageId, refinement, context),
    prepareBrief: (planningMessageId, input, context) => assistant.prepareCourseBrief({ planningMessageId, ...input }, context)
  };

  /** The one card action: open the object it names in the shared Object Shell. */
  function openObject(target: AssistantObjectTarget, origin?: DOMRect, trigger?: HTMLElement | null) {
    panelTriggerRef.current = trigger ?? null;
    setPanelOrigin(origin ?? null);
    setDismissedObjectKey(null);
    microHost.dismissSide();
    panelLayoutGraceUntil.current = performance.now() + 500;
    const nextPanel = panelForTarget(target);
    if (nextPanel.kind === "route") {
      const focusNodeId = nextPanel.nodeId ?? firstNodeForChapter(nextPanel.courseId, nextPanel.chapterId);
      showRoutePanel(nextPanel.courseId, origin, focusNodeId, nextPanel.chapterId);
      return;
    }
    if (nextPanel.kind === "practice") {
      const runtime = runtimes.find((item) => item.course.id === nextPanel.courseId);
      const assignment = runtime?.assignments.find((item) => item.id === nextPanel.assignmentId);
      if (!assignment) return;
      void openPractice(nextPanel.courseId, nextPanel.assignmentId, nextPanel.title || assignment.title, origin, nextPanel.attemptId);
      return;
    }
    dispatchRightPanel({ type: "open-panel", panel: nextPanel });
    if (searchParams.has("panel")) {
      const next = new URLSearchParams(searchParams);
      next.delete("panel");
      setSearchParams(next, { replace: true });
    }
  }

  /** The route panel opens at a chapter's first step when a chapter card asks. */
  function firstNodeForChapter(courseId: string, chapterId?: string) {
    if (!chapterId) return undefined;
    const runtime = runtimes.find((item) => item.course.id === courseId);
    if (!runtime) return undefined;
    const lessonIds = new Set(runtime.lessons.filter((lesson) => lesson.chapterId === chapterId).map((lesson) => lesson.id));
    return runtime.curriculumCoverages.find((coverage) => lessonIds.has(coverage.lessonId))?.nodeId;
  }

  function showRoutePanel(courseId = focusCourseId, origin?: DOMRect, nodeId?: string, chapterId?: string) {
    if (!courseId) return;
    microHost.dismissSide();
    setPanelOrigin(origin ?? null);
    panelLayoutGraceUntil.current = performance.now() + 500;
    dispatchRightPanel({ type: "open-route", courseId, ...(nodeId ? { nodeId } : {}), ...(chapterId ? { chapterId } : {}) });
    setDismissedObjectKey(null);
    if (searchParams.has("panel")) {
      const next = new URLSearchParams(searchParams);
      next.delete("panel");
      setSearchParams(next, { replace: true });
    }
  }

  function goBackPanel() {
    if (previousPanel.kind === "none") return;
    dispatchRightPanel({ type: "back" });
    setDismissedObjectKey(null);
  }

  function closeActivePanel() {
    if (rightPanel.kind === "none") return;
    if (rightPanel.kind === "my") {
      setPanel(false);
      panelToggleRef.current?.focus({ preventScroll: true });
      return;
    }
    dispatchRightPanel({ type: "close" });
    window.requestAnimationFrame(() => {
      const trigger = panelTriggerRef.current;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
  }

  function setPanel(open: boolean) {
    if (open) {
      // Preserve the trigger of an object My opens over, so Back can contract
      // to the card that started it. My itself opens from its top toggle.
      if (rightPanel.kind === "none") panelTriggerRef.current = panelToggleRef.current;
      microHost.dismissSide();
    }
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
    const finish = () => {
      const next = removeWorkspaceParam(searchParams, workspace.kind);
      if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
      dispatchRightPanel({ type: "close" });
    };
    if (practiceClosing.current) return;
    practiceClosing.current = true;
    const origin = panelTriggerRef.current?.isConnected ? panelTriggerRef.current.getBoundingClientRect() : panelOrigin;
    void contractPanelToRect(practicePanelRef.current, origin, reducedMotion).then(() => {
      practiceClosing.current = false;
      finish();
      const trigger = panelTriggerRef.current;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
  }

  function announceLearnerActionStart() {
    // A fresh Micro/Assignment begins a new scroll-follow judgement window.
    window.dispatchEvent(new Event("eduflow:learner-action-start"));
  }

  async function openPractice(courseId: string, assignmentId: string, title: string, origin?: DOMRect, attemptId?: string) {
    announceLearnerActionStart();
    microHost.dismissSide();
    setPanelOrigin(origin ?? null);
    setDismissedObjectKey(null);
    panelLayoutGraceUntil.current = performance.now() + 500;
    practiceClosing.current = false;
    showWorkspace({ kind: "practice", courseId, assignmentId, title, ...(attemptId ? { attemptId } : {}) });
  }

  async function openMicroInConversation(step: HomeNextStep) {
    if (!step.pathId || !step.knowledgeId) return false;
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

  function openRouteStep(action: CourseRouteStepAction, courseId: string) {
    dispatchRightPanel({ type: "close" });
    const courseRuntime = applicationServices.courseRepository.getCourse(courseId);
    if (action.kind === "micro" && action.pathId) {
      const path = applicationServices.microLearningRepository.getPath(action.nodeId, { courseId, mode: "learn", pathId: action.pathId });
      if (path) {
        void openMicroInConversation({ courseId, courseTitle: courseRuntime?.course.title ?? "", kind: "micro", title: path.title, nodeId: action.nodeId, knowledgeId: action.nodeId, pathId: path.id, minutes: path.estimatedMinutes });
        return;
      }
    }
    if (action.kind === "practice" && action.assignmentId) {
      openPractice(courseId, action.assignmentId, action.step.title);
      return;
    }
    navigate(`/courses/${encodeURIComponent(courseId)}`);
  }

  function openPracticeNext(step: { nodeId?: string; resourceKind: string; resourceId?: string; microPathId?: string; title: string }) {
    if (!focusCourseId) return;
    closeWorkspace();
    if (step.microPathId && step.nodeId) {
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
    void assistant.selectSession(null);
    dispatchRightPanel({ type: "close" });
  }

  function selectSession(sessionId: string) {
    void assistant.selectSession(sessionId);
    dispatchRightPanel({ type: "close" });
  }

  function openMyCourse(courseId: string, origin?: DOMRect) {
    showRoutePanel(courseId, origin);
  }

  function openMyPractice(courseId: string, assignmentId: string, title: string, origin?: DOMRect) {
    void openPractice(courseId, assignmentId, title, origin);
  }

  function openMyRecent(nodeId: string) {
    setPanel(false);
    // Recent learning is not limited to the active Course: resolve the path
    // inside the Course that actually owns it before falling back to Global.
    const owned = runtimes.flatMap((runtime) => {
      const path = applicationServices.microLearningRepository.getPath(nodeId, { courseId: runtime.course.id, mode: "learn" });
      return path ? [{ runtime, path }] : [];
    })[0];
    const path = owned?.path ?? applicationServices.microLearningRepository.getPath(nodeId, { mode: "learn" });
    if (path) {
      microHost.open({ pathId: path.id, knowledgeId: nodeId, ...(owned ? { courseId: owned.runtime.course.id } : {}) });
      return;
    }
    if (owned) { showRoutePanel(owned.runtime.course.id); return; }
    if (focusCourseId) navigate(`/courses/${encodeURIComponent(focusCourseId)}`);
    else navigate("/records");
  }

  function removeContext(id: string) {
    if (id !== "active-object" || !activeObjectIdentity) return;
    setDismissedObjectKey(activeObjectIdentity);
  }

  const conversationTitle = assistant.activeSessionTitle.trim() || assistant.sessions.find((item) => item.id === assistant.activeSessionId)?.title?.trim() || "新对话";
  const composer = <HomeComposer
    contexts={contexts}
    onRemoveContext={removeContext}
    onSubmit={(value, extras) => void send(value, { ...extras, attachments: freshAttachments.filter((attachment) => !attachment.uploading) }).then((ok) => { if (ok) { setFreshAttachments([]); setFreshAttachmentError(""); } })}
    onStop={() => void assistant.stop()}
    disabled={assistant.loading || (assistant.sending && !assistant.replying)}
    replying={assistant.replying && !assistant.loading}
    attachments={freshAttachments}
    onAddFiles={(files) => void addFreshFiles(files)}
    onRemoveAttachment={(id) => setFreshAttachments((current) => current.filter((attachment) => attachment.id !== id))}
    attachmentError={freshAttachmentError}
    uploadingAttachments={freshAttachments.some((attachment) => attachment.uploading)}
    placeholder="问知识点、看路线、读资料，或拖入 .txt / .md / .csv 交任务"
    hint={<span>Enter 发送 · Shift + Enter 换行 · @ 提及 · / 功能</span>}
  />;

  useEffect(() => {
    if (rightPanel.kind !== "practice" || !practiceCache || practiceClosing.current) return;
    const origin = panelTriggerRef.current?.isConnected ? panelTriggerRef.current.getBoundingClientRect() : panelOrigin;
    void expandPanelFromRect(practicePanelRef.current, origin, reducedMotion);
  }, [panelOrigin, practiceCache, reducedMotion, rightPanel.kind]);

  // Knowledge, material, records and brief panels grow from the same card
  // rectangle through the same morph helper as the route/task panels.
  useEffect(() => {
    if (!["knowledge", "material", "records", "brief"].includes(rightPanel.kind)) return;
    const origin = panelTriggerRef.current?.isConnected ? panelTriggerRef.current.getBoundingClientRect() : panelOrigin;
    void expandPanelFromRect(objectPanelRef.current, origin, reducedMotion);
  }, [activeObjectIdentity, panelOrigin, reducedMotion, rightPanel.kind]);

  const emptyExamples = config.examples.map((example) => ({ id: example.id, label: example.label, onSelect: () => void send(example.prompt) }));

  return <ActiveAssistantObjectContext.Provider value={activeObject}><MicroHostProvider host={microHost}><main onPointerDownCapture={(event) => { if ((event.target as Element | null)?.closest?.(".ef-assistant-micro-frame, .ef-home-route-panel, .ef-home-workspace, .ef-home-knowledge-panel-host, .ef-home-object-panel-host")) setDismissedObjectKey(null); }} className={`ef-home ${panelOpen ? "has-panel" : ""} ${workspace || sideMicro ? "has-workspace" : ""} ${routePanelOpen ? "has-route" : ""} ${knowledgePanelOpen ? "has-knowledge" : ""} ${materialPanel ? "has-material" : ""} ${recordsPanelOpen ? "has-records" : ""} ${briefPanel ? "has-brief" : ""} ${routePageOpen ? "is-route-page" : ""}`} data-view={view} data-history={historyOpen ? "open" : "closed"} data-micro-form={microForm} data-workspace={sideMicro ? "micro" : workspace?.kind ?? ""} data-route-page={routePageOpen ? "1" : undefined}>
    <button ref={panelToggleRef} type="button" className={`ef-home-panel-toggle ${panelOpen ? "is-open" : ""}`} aria-pressed={panelOpen} aria-controls="ef-my-panel" onClick={() => setPanel(!panelOpen)}><PanelRight size={16} aria-hidden="true" />我的</button>

    {view === "fresh" ? <section className="ef-home-fresh" aria-label="开始对话">
      <div className="ef-home-fresh-inner">
        <h1>想聊点什么？</h1>
        <p className="ef-home-fresh-sub">可以问问题、说说想学什么，或者只是随便看看。</p>
        {composer}
        {emptyExamples.length ? <div className="ef-home-example-row" aria-label="示例">
          {emptyExamples.map((example) => <button key={example.id} type="button" className="ef-ui-chip" onClick={example.onSelect}>{example.label}</button>)}
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
            contexts={contexts}
            onRemoveContext={removeContext}
            onSend={send}
            suggestions={[]}
            emptyExamples={emptyExamples}
            emptyTitle="想聊点什么？"
            emptyDescription="可以问问题、说说想学什么，或者只是随便看看。"
            previewPerson={null}
            onRetry={() => void assistant.retry()}
            title={conversationTitle}
            conversationKey={assistant.activeSessionId}
            onExpandHistory={historyOpen ? undefined : () => toggleHistory(true)}
            layoutEpoch={`${historyOpen}|${panelVisible}|${rightPanel.kind}|${sideMicro}`}
          />
        </div>
      </div>
    </div>}

    {panelOpen ? <MyPanel
      session={session}
      open
      loading={assistant.loading}
      onClose={() => { setPanel(false); panelToggleRef.current?.focus(); }}
      onBack={previousPanel.kind === "none" ? undefined : goBackPanel}
      backLabel={panelBackLabel(previousPanel)}
      onOpenCourse={openMyCourse}
      onOpenPractice={openMyPractice}
      onOpenRecent={openMyRecent}
      extraAssignmentKeys={cardAssignmentKeys}
    /> : null}

    <ObjectPanelSwitch
      panel={rightPanel}
      session={session}
      messages={assistant.messages}
      onClose={closeActivePanel}
      onOpenCourse={(courseId) => navigate(`/courses/${encodeURIComponent(courseId)}`)}
      onSelectNode={(nodeId) => dispatchRightPanel({ type: "open-knowledge", nodeId })}
      route={routePanelOpen && routeProjection && routeRuntime && routeCourseId && rightPanel.kind === "route" ? {
        panel: rightPanel,
        runtime: routeRuntime,
        projection: routeProjection,
        decision: routeDecision,
        onModeChange: setRouteMode,
        originRect: panelOrigin,
        originElement: panelTriggerRef.current,
        ...(previousPanel.kind !== "none" ? { onBack: goBackPanel, backLabel: panelBackLabel(previousPanel) } : {}),
        onStart: (action) => openRouteStep(action, routeCourseId),
        onInteract: () => setDismissedObjectKey(null)
      } : null}
      practice={practiceCache ? {
        panel: practiceCache,
        assistantSessionId: assistant.activeSessionId ?? undefined,
        onOpenNextStep: openPracticeNext,
        onClose: closeWorkspace,
        surface: {
          ref: practicePanelRef,
          className: `ef-home-workspace${rightPanel.kind === "practice" ? "" : " is-hidden"}`,
          onPointerDown: () => setDismissedObjectKey(null)
        }
      } : null}
      surfaces={{
        knowledge: { className: "ef-home-knowledge-panel-host", ref: objectPanelRef },
        material: { className: "ef-home-object-panel-host", ref: objectPanelRef },
        records: { className: "ef-home-object-panel-host", ref: objectPanelRef },
        brief: { className: "ef-home-object-panel-host", ref: objectPanelRef }
      }}
    />

    <MicroHostLayer host={microHost} session={session} />
  </main></MicroHostProvider></ActiveAssistantObjectContext.Provider>;
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

/** One projection for the focus Course and any Course opened in the route panel. */
function projectHomeCourse(
  runtime: NonNullable<ReturnType<typeof applicationServices.courseRepository.getCourse>>,
  courseState: ReturnType<typeof applicationServices.learningProgressRepository.getCourseState>,
  records: ReturnType<typeof applicationServices.userKnowledgeRepository.getUserKnowledge>,
  titles: ReadonlyMap<string, string>,
  decision: NavigationDecision | null
) {
  return buildHomeCourseProjection({
    runtime,
    records,
    courseState,
    ...(decision ? { decision } : {}),
    microFor: (nodeId): HomeMicroAsset | undefined => {
      const path = applicationServices.microLearningRepository.getPath(nodeId, { courseId: runtime.course.id, mode: "learn" });
      return path ? { pathId: path.id, title: path.title, estimatedMinutes: path.estimatedMinutes } : undefined;
    },
    titleFor: (nodeId) => titles.get(nodeId)
  });
}

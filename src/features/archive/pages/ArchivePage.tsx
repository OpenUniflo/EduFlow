import { Lock, Network, RefreshCcw } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { applicationServices } from "@/app/services/applicationServices";
import { useAssistantRuntime } from "@/features/assistant/AssistantRuntimeContext";
import type { AssistantContextSnapshot } from "@/features/assistant/assistantContract";
import { authGateState } from "@/features/auth/authRedirect";
import type { MockSession } from "@/features/auth/types";
import { buildCourseGraphData, type CourseGraphData } from "@/features/course/runtime/courseRuntime";
import { isCourseVisibleToViewer } from "@/features/course/runtime/courseVisibility";
import { rememberCourseEnterSnapshot, rememberCourseOrigin, readArchiveCourseView, rememberArchiveCourseView } from "@/features/course/immersive/courseTransition";
import { summarizeLearnerState } from "@/features/course/immersive/learnerStateProjection";
import { useDomainGovernance } from "@/features/knowledge/domain/domainStore";
import { globalKnowledgeAccess, userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import type { FollowedPerson } from "@/features/profile/people/PeopleRepository";
import { ArchivePeopleBar } from "../components/ArchivePeopleBar";
import { ArchivePersonPanel, ArchivePeopleSharePanel, type PanelPerson } from "../components/ArchivePeoplePanels";
import { ArchiveAssistantPanel, GuestAssistantCard } from "../components/ArchiveAssistantPanel";
import { ArchiveCourseFocusBar, ArchiveDraftFocusBar, ArchiveLevelChip, ArchiveNodePanel } from "../components/ArchiveChrome";
import { SceneZoomToolbar } from "@/shared/scene/SceneZoomToolbar";
import { ArchiveSearchPanel } from "../components/ArchiveSearchPanel";
import type { ArchiveAtlasSceneHandle } from "../components/ArchiveAtlasScene";
import { archiveCourseKnowledgeIds, buildArchiveModel, searchArchive, type ArchiveModel } from "../model/atlasModel";
import { communityByNodeId, detectAtlasCommunities } from "../model/atlasCommunities";
import { readAtlas3DLayoutCache, type Atlas3DLayout } from "../model/atlas3dLayout";
import { requestAtlas3DLayout } from "../model/atlas3dLayoutClient";
import { requestPersonLayout } from "../model/personLayoutClient";
import type { PersonLayout } from "../model/personLayout";
import { buildCoursePlane, buildDraftPlane, type CoursePlaneLayout } from "../model/coursePlaneLayout";
import { deriveAssistantPresentation, type ArchiveAssistantPresentation } from "../model/assistantPresentation";
import { parseArchiveSearch, type ArchivePanel } from "../model/atlasParams";
import "./archive.css";
import "./archive3d.css";

const ArchiveAtlasScene = lazy(() => import("../components/ArchiveAtlasScene"));

// The learner course page is route-lazy. Warm the exact same chunk while the
// course plane is focused, then hold the Archive card snapshot on screen until
// it has loaded so navigation never shows an empty route fallback.
let courseImmersiveChunk: Promise<unknown> | null = null;
function preloadCourseImmersive() {
  courseImmersiveChunk ??= import("@/features/course/immersive/CourseImmersivePage");
  return courseImmersiveChunk;
}

const EMPTY_PRESENTATION: ArchiveAssistantPresentation = {
  state: "idle",
  candidateIds: [],
  targetIds: [],
  prerequisiteIds: [],
  draftIds: [],
  draftDepth: new Map(),
  matchCount: 0
};

type SceneMode = "default" | "person" | "course" | "draft";

function plannedWeeks(text: string | undefined, knowledgeCount: number) {
  const match = text?.match(/([0-9]+|[一二三四五六七八九十]+)\s*周/);
  if (match) {
    const numeric = Number(match[1]);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const chinese: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    if (chinese[match[1]]) return chinese[match[1]];
  }
  return Math.max(1, Math.ceil(knowledgeCount / 4));
}

function shortName(person: FollowedPerson) {
  return person.displayName.replace(/^示例\s*·\s*/, "");
}

function useArchiveData(session: MockSession | null, refreshToken: number) {
  const governance = useDomainGovernance();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const unsubscribers = [
      applicationServices.userKnowledgeRepository.subscribe(() => setRevision((value) => value + 1)),
      applicationServices.learningProgressRepository.subscribe(() => setRevision((value) => value + 1)),
      applicationServices.microLearningRepository.subscribe(() => setRevision((value) => value + 1))
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const runtimes = useMemo(() => {
    try {
      return applicationServices.courseRepository.listCourseRuntimes().filter((runtime) => isCourseVisibleToViewer(runtime.course, session?.userId));
    } catch {
      return [];
    }
  }, [revision, refreshToken, session?.userId]);
  const courseStates = useMemo(() => {
    if (!session) return new Map();
    return new Map(runtimes.map((runtime) => [runtime.course.id, applicationServices.learningProgressRepository.getCourseState(session.userId, runtime.course.id)]));
  }, [refreshToken, revision, runtimes, session]);
  const graph = useMemo(() => session
    ? applicationServices.knowledgeRepository.getVisibleGraph(userKnowledgeAccess(session.userId))
    : applicationServices.knowledgeRepository.getVisibleGraph(globalKnowledgeAccess), [refreshToken, revision, session]);
  const records = useMemo(() => session ? applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId) : [], [refreshToken, revision, session]);
  const built = useMemo(() => {
    try {
      return { model: buildArchiveModel({ graph, governance, runtimes, records, courseStates }) };
    } catch (error) {
      return { model: null, error };
    }
  }, [courseStates, governance, graph, records, runtimes]);
  const cachedLayout = useMemo(
    () => built.model ? readAtlas3DLayoutCache(built.model.nodes, built.model.edges) : null,
    [built.model]
  );
  const [layoutResult, setLayoutResult] = useState<{ model: ArchiveModel; layout: Atlas3DLayout; elapsed: number; cached: boolean; usedWorker: boolean } | null>(null);
  useEffect(() => {
    if (!built.model) return;
    if (cachedLayout) {
      const perf = (window as unknown as { __archivePerf?: Record<string, number> }).__archivePerf ?? {};
      perf.defaultLayoutMs = 0;
      perf.defaultLayoutCached = 1;
      perf.defaultLayoutWorker = 0;
      (window as unknown as { __archivePerf?: Record<string, number> }).__archivePerf = perf;
      console.info("[archive] default 3D layout 0.0ms (cache)");
      return;
    }
    let live = true;
    const start = performance.now();
    const request = requestAtlas3DLayout(built.model.nodes, built.model.edges);
    void request.promise.then((layout) => {
      if (!live) return;
      const elapsed = performance.now() - start;
      setLayoutResult({ model: built.model!, layout, elapsed, cached: request.cached, usedWorker: request.usedWorker });
      const perf = (window as unknown as { __archivePerf?: Record<string, number> }).__archivePerf ?? {};
      perf.defaultLayoutMs = Math.round(elapsed * 10) / 10;
      perf.defaultLayoutCached = request.cached ? 1 : 0;
      perf.defaultLayoutWorker = request.usedWorker ? 1 : 0;
      (window as unknown as { __archivePerf?: Record<string, number> }).__archivePerf = perf;
      console.info(`[archive] default 3D layout ${elapsed.toFixed(1)}ms (${request.usedWorker ? "worker" : "main"})`);
    }).catch((layoutError) => {
      if (live) console.error("Atlas layout failed", layoutError);
    });
    return () => { live = false; };
  }, [built.model, cachedLayout]);
  const layout = layoutResult?.model === built.model ? layoutResult.layout : cachedLayout;
  const layoutElapsed = layoutResult?.model === built.model ? layoutResult.elapsed : 0;
  const layoutCached = layoutResult?.model === built.model ? layoutResult.cached : Boolean(cachedLayout);
  return { model: built.model, layout, layoutElapsed, layoutCached, error: built.error, revision, runtimes, graph, records, courseStates };
}

function ArchiveAssistantBridge({ session, model, context, seedGoal, open, onOpenChange, onPresentation, onOpenBrief }: {
  session: MockSession;
  model: ArchiveModel;
  context: AssistantContextSnapshot;
  seedGoal: { key: string; goal: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPresentation: (presentation: ArchiveAssistantPresentation) => void;
  onOpenBrief: (briefMessageId: string) => void;
}) {
  const runtime = useAssistantRuntime();
  const presentation = useMemo(() => deriveAssistantPresentation({ messages: runtime.messages, model, sending: runtime.sending, error: runtime.error }), [model, runtime.error, runtime.messages, runtime.sending]);
  useEffect(() => { onPresentation(presentation); }, [onPresentation, presentation]);
  return <ArchiveAssistantPanel session={session} model={model} context={context} presentation={presentation} seedGoal={seedGoal} open={open} onOpenChange={onOpenChange} onOpenBrief={onOpenBrief} />;
}

export function ArchivePage({ session, onRetry }: { session: MockSession | null; onRetry?: () => Promise<void> }) {
  const navigate = useNavigate();
  const location = useLocation();
  const reducedMotion = Boolean(useReducedMotion());
  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = useMemo(() => parseArchiveSearch(location.search), [location.search]);
  const [refreshToken, setRefreshToken] = useState(0);
  const { model, layout, layoutCached, error: dataError, revision, runtimes, graph, records, courseStates } = useArchiveData(session, refreshToken);
  const sceneRef = useRef<ArchiveAtlasSceneHandle>(null);
  const [percent, setPercent] = useState(100);
  const [level, setLevel] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(urlState.panel === "search");
  const [query, setQuery] = useState(urlState.search);
  const [focusedCourseId, setFocusedCourseId] = useState<string | null>(urlState.focus.type === "course" ? urlState.focus.id : null);
  const [selectedPeopleIds, setSelectedPeopleIds] = useState<string[]>(urlState.comparePersonIds);
  const [people, setPeople] = useState<readonly FollowedPerson[]>([]);
  const [peopleError, setPeopleError] = useState("");
  const [socialOpen, setSocialOpen] = useState(urlState.panel === "people" || urlState.panel === "share");
  const [personPanelCollapsed, setPersonPanelCollapsed] = useState(false);
  const [assistant, setAssistant] = useState<ArchiveAssistantPresentation>(EMPTY_PRESENTATION);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [leavingForCourse, setLeavingForCourse] = useState(false);
  const [seedGoal, setSeedGoal] = useState<{ key: string; goal: string } | null>(null);
  const [personLayout, setPersonLayout] = useState<PersonLayout | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const courseFramedRef = useRef(false);
  const [coursePlane, setCoursePlane] = useState<CoursePlaneLayout | null>(null);
  const [draftPlane, setDraftPlane] = useState<CoursePlaneLayout | null>(null);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState("");
  const [lastGoodAt, setLastGoodAt] = useState<number | null>(null);
  const previousPeopleKey = useRef("");
  const personFocusIdsRef = useRef<string[]>([]);
  const initialisedRef = useRef(false);
  const coursePlaneKeyRef = useRef("");

  const error = !online || Boolean(dataError);
  const hasHistory = Boolean(model?.hasLearningHistory);
  const communities = useMemo(() => model ? detectAtlasCommunities(model.nodes, model.edges) : [], [model]);
  const communityByNode = useMemo(() => communityByNodeId(communities), [communities]);
  const focusedCourse = useMemo(() => model?.courses.find((course) => course.id === focusedCourseId) ?? null, [focusedCourseId, model]);
  const focusedRuntime = useMemo(() => runtimes.find((runtime) => runtime.course.id === focusedCourseId) ?? null, [focusedCourseId, runtimes]);
  const focusedGraphData = useMemo<CourseGraphData | null>(() => {
    if (!focusedRuntime) return null;
    try {
      return buildCourseGraphData(focusedRuntime, session ? courseStates.get(focusedRuntime.course.id) : undefined, graph, records);
    } catch {
      return null;
    }
  }, [courseStates, focusedRuntime, graph, records, session]);
  // Both the Archive course bar and the course page read the same projection:
  // learned/practicing/mastered all count as 已学.
  const focusedLearned = useMemo(() => focusedGraphData
    ? summarizeLearnerState(records, focusedGraphData.knowledgeNodes.map((node) => node.id)).counts.acquired
    : 0, [focusedGraphData, records]);
  const draftActive = Boolean(session) && assistant.state === "brief" && assistant.draftIds.length > 0 && !focusedCourse;
  const selectedNode = model && selectedId ? model.nodeById.get(selectedId) ?? null : null;
  const searchResults = useMemo(() => model ? searchArchive(model, query, people) : null, [model, people, query]);
  const courseNodeIds = useMemo(() => model && focusedCourse ? archiveCourseKnowledgeIds(model, focusedCourse.id) : new Set<string>(), [focusedCourse, model]);
  const draftNodeIds = useMemo(() => new Set(draftActive ? assistant.draftIds : []), [assistant.draftIds, draftActive]);
  const selectedPeople = useMemo<PanelPerson[]>(() => {
    if (!model) return [];
    return selectedPeopleIds.flatMap((id) => {
      if (id === "me") return [{ id: "me", name: "我", accent: "me", nodeIds: new Set(model.mineNodeIds) }];
      const person = people.find((candidate) => candidate.id === id);
      if (!person) return [];
      return [{ id: person.id, name: shortName(person), accent: person.accent, nodeIds: new Set(person.sharedKnowledgeIds ?? []), person }];
    });
  }, [model, people, selectedPeopleIds]);
  const personMembers = useMemo(() => new Set(selectedPeople.flatMap((person) => Array.from(person.nodeIds))), [selectedPeople]);
  const sceneMode: SceneMode = focusedCourse && coursePlane ? "course" : draftActive && draftPlane ? "draft" : selectedPeopleIds.length ? "person" : "default";
  const scenePositions = sceneMode === "person" ? personLayout?.positions ?? null : null;
  const scenePlanePositions = focusedCourse ? coursePlane?.positions ?? null : draftActive ? draftPlane?.positions ?? null : null;
  const scenePlaneIds = focusedCourse ? courseNodeIds : draftActive ? draftNodeIds : new Set<string>();
  const scenePlaneChapters = focusedCourse ? coursePlane?.chapters ?? [] : draftActive ? draftPlane?.chapters ?? [] : [];
  const scenePlaneDependencies = focusedCourse ? coursePlane?.dependencies ?? [] : draftActive ? draftPlane?.dependencies ?? [] : [];
  const scenePlaneCardSize = focusedCourse
    ? coursePlane ? { width: coursePlane.cardWidth, height: coursePlane.cardHeight } : null
    : draftActive && draftPlane ? { width: draftPlane.cardWidth, height: draftPlane.cardHeight } : null;
  const scenePlaneTargetIds = useMemo(
    () => new Set((focusedRuntime?.targetKnowledge ?? []).map((target) => target.nodeId)),
    [focusedRuntime]
  );
  const personPanelOpen = Boolean(session) && selectedPeopleIds.length > 0 && !socialOpen;
  // The top-left slot holds one panel at a time: search and the assistant both
  // make the person / people-share panel yield to a small strip, and the
  // previous expanded state returns as soon as both overlays are closed.
  const searchYieldsPanel = searchOpen && (personPanelOpen || (Boolean(session) && socialOpen));
  const personPanelCollapsedForOverlay = personPanelOpen && (personPanelCollapsed || searchOpen || assistantOpen);
  // When search takes the slot, frame the scene to the wider search panel.
  const leftInset = personPanelOpen ? (searchOpen ? 386 : personPanelCollapsed || assistantOpen ? 156 : 360) : 0;

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  // A new assistant result reopens the assistant and takes the slot from search.
  useEffect(() => {
    if (assistant.state === "idle") return;
    setAssistantOpen(true);
    setSearchOpen(false);
    setQuery("");
  }, [assistant.state]);

  useEffect(() => {
    if (model && !error) setLastGoodAt(Date.now());
  }, [error, model]);

  useEffect(() => {
    if (!session) { setPeople([]); return; }
    let live = true;
    const repository = applicationServices.preview?.peopleRepository;
    if (!repository) { setPeopleError("关注关系尚未接入。"); return; }
    void repository.listFollowed(session.userId).then((items) => { if (live) { setPeople(items); setPeopleError(""); } }).catch(() => { if (live) setPeopleError("关注的人暂时无法加载。"); });
    return () => { live = false; };
  }, [session]);

  useEffect(() => {
    if (!model || initialisedRef.current) return;
    initialisedRef.current = true;
    if (urlState.focus.type === "course") {
      setFocusedCourseId(urlState.focus.id);
      setPersonPanelCollapsed(false);
    } else if (urlState.focus.type === "knowledge" && model.nodeById.has(urlState.focus.id)) {
      setSelectedId(urlState.focus.id);
      sceneRef.current?.shiftForDetail(true);
    } else if (urlState.focus.type === "me") {
      setSelectedPeopleIds(["me"]);
    }
    if (urlState.panel === "search") setSearchOpen(true);
    if (urlState.panel === "people" || urlState.panel === "share") setSocialOpen(true);
    if (urlState.comparePersonIds.length) setSelectedPeopleIds(urlState.comparePersonIds);
  }, [model, urlState]);

  // Person-centred layout: deterministic and cached; large graphs move to a worker.
  useEffect(() => {
    if (!layout || !model || !selectedPeopleIds.length) { setPersonLayout(null); return; }
    let live = true;
    const start = performance.now();
    const request = requestPersonLayout({
      structureKey: layout.structureKey,
      defaultPositions: layout.positions,
      nodes: model.nodes,
      edges: model.edges,
      memberIds: personMembers
    });
    void request.promise.then((next) => {
      if (!live) return;
      const elapsed = performance.now() - start;
      setPersonLayout(next);
      const perf = (window as unknown as { __archivePerf?: Record<string, number> }).__archivePerf ?? {};
      perf.personLayoutMs = Math.round(elapsed * 10) / 10;
      if (!perf.personLayoutFirstMs) perf.personLayoutFirstMs = Math.round(elapsed * 10) / 10;
      (window as unknown as { __archivePerf?: Record<string, number> }).__archivePerf = perf;
      console.info(`[archive] person layout ${elapsed.toFixed(1)}ms (${request.usedWorker ? "worker" : "main"})`);
      personFocusIdsRef.current = [...next.memberIds, ...Object.entries(next.hopByNodeId).filter(([, hop]) => hop <= 1).map(([id]) => id)];
    }).catch((layoutError) => {
      if (live) console.error("Person layout failed", layoutError);
    });
    return () => { live = false; };
  }, [layout, model, selectedPeopleIds.join(","), personMembers]);

  // Course plane uses the existing ELK course projection.
  useEffect(() => {
    if (!focusedGraphData) { setCoursePlane(null); coursePlaneKeyRef.current = ""; return; }
    const key = `${focusedGraphData.courseId}:${focusedGraphData.revision}`;
    if (coursePlaneKeyRef.current === key && coursePlane) return;
    coursePlaneKeyRef.current = key;
    let live = true;
    setCoursePlane(null);
    void buildCoursePlane(focusedGraphData).then((plane) => {
      if (!live) return;
      setCoursePlane(plane);
    }).catch((planeError) => {
      if (live) console.error("Course plane layout failed", planeError);
    });
    return () => { live = false; };
  }, [focusedGraphData]);

  // N08 brief: the draft Knowledge set is laid out by the same ELK projection.
  useEffect(() => {
    if (!draftActive || !model) { setDraftPlane(null); return; }
    let live = true;
    void buildDraftPlane({ ids: assistant.draftIds, edges: model.edges, titles: new Map(model.nodes.map((node) => [node.id, node.title])) }).then((plane) => {
      if (live) setDraftPlane(plane);
    }).catch((planeError) => {
      if (live) console.error("Draft plane layout failed", planeError);
    });
    return () => { live = false; };
  }, [assistant.draftIds, draftActive, model]);

  const selectedNodeRef = useRef(false);
  selectedNodeRef.current = Boolean(selectedNode);
  const fitCourseInView = useCallback(() => {
    if (!focusedCourse && !draftActive) return;
    if (!sceneReady) return;
    sceneRef.current?.fitCourse({
      left: leftInset + 12,
      right: selectedNodeRef.current ? 392 : 12,
      top: 188,
      bottom: 96
    });
  }, [draftActive, focusedCourse, leftInset, sceneReady]);

  const fitPersonFocus = useCallback(() => {
    if (!sceneReady || !personFocusIdsRef.current.length) return;
    sceneRef.current?.fitIds(personFocusIdsRef.current, {
      padding: 1.32,
      insets: { left: leftInset + 12, right: 12, top: 78, bottom: 96 }
    });
  }, [leftInset, sceneReady]);

  // Container/window resize: re-frame whichever of the three layouts is
  // active. The scene debounces its ResizeObserver before calling this.
  const refitCurrentView = useCallback(() => {
    if (!sceneReady) return;
    if (focusedCourse || draftActive) { fitCourseInView(); return; }
    if (selectedPeopleIds.length && personFocusIdsRef.current.length) { fitPersonFocus(); return; }
    sceneRef.current?.fitAll({ padding: 1.08, insets: selectedNodeRef.current ? { right: 392 } : undefined });
  }, [draftActive, fitCourseInView, fitPersonFocus, focusedCourse, sceneReady, selectedPeopleIds.length]);

  // Person focus frames the core inside the free area and re-frames whenever
  // the person panel opens, collapses or switches to its strip.
  useEffect(() => {
    if (!sceneReady || focusedCourse || draftActive || !selectedPeopleIds.length || !personLayout || !personFocusIdsRef.current.length) return;
    const timer = window.setTimeout(() => fitPersonFocus(), 50);
    return () => window.clearTimeout(timer);
  }, [draftActive, fitPersonFocus, focusedCourse, personLayout, sceneReady, selectedPeopleIds.length]);

  useEffect(() => {
    if (!sceneReady || !focusedCourse || !scenePlanePositions || courseFramedRef.current) return;
    courseFramedRef.current = true;
    // Returning from the course restores the exact pre-entry course-plane
    // camera; a cold deep link gets a fresh fit instead. Selection later must
    // only pan for the detail panel, never reframe or shrink the plane.
    const saved = readArchiveCourseView(focusedCourse.id);
    const timer = window.setTimeout(() => {
      if (saved) sceneRef.current?.applyCourseView(saved, !reducedMotion);
      else fitCourseInView();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [fitCourseInView, focusedCourse, reducedMotion, scenePlanePositions, sceneReady]);

  useEffect(() => {
    if (!sceneReady) return;
    sceneRef.current?.shiftForDetail(Boolean(selectedId));
  }, [sceneReady, selectedId]);

  useEffect(() => {
    if (selectedPeopleIds.length) return;
    if (previousPeopleKey.current) {
      previousPeopleKey.current = "";
      setPersonPanelCollapsed(false);
      sceneRef.current?.fitAll();
    }
    previousPeopleKey.current = selectedPeopleIds.join(",");
  }, [selectedPeopleIds]);

  useEffect(() => {
    previousPeopleKey.current = selectedPeopleIds.join(",");
  }, [selectedPeopleIds]);

  const context = useMemo<AssistantContextSnapshot>(() => ({
    workspace: "explore",
    experienceMode: "learn",
    ...(focusedCourse ? { courseId: focusedCourse.id } : {}),
    ...(selectedId ? { knowledgeId: selectedId } : {})
  } as AssistantContextSnapshot), [focusedCourse, selectedId]);

  const handlePresentation = useCallback((next: ArchiveAssistantPresentation) => {
    setAssistant(next);
  }, []);

  const setPanelParam = useCallback((panel: ArchivePanel) => {
    const next = new URLSearchParams(searchParams);
    if (panel) next.set("panel", panel);
    else next.delete("panel");
    if (panel !== "search") next.delete("search");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const openSearch = useCallback(() => {
    setAssistantOpen(false);
    setSearchOpen(true);
    setPanelParam("search");
  }, [setPanelParam]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery("");
    setPanelParam(null);
  }, [setPanelParam]);

  const handleAssistantOpenChange = useCallback((next: boolean) => {
    setAssistantOpen(next);
    if (!next) return;
    setSearchOpen(false);
    setQuery("");
    setPanelParam(null);
  }, [setPanelParam]);

  const openCourse = useCallback((courseId: string, origin?: DOMRect, focusKnowledgeId?: string) => {
    if (!courseId || leavingForCourse) return;
    // Capture the exact course-plane cards and camera before the Archive panels
    // fade. The entry overlay replays those rectangles, and returning restores
    // the same camera instead of refitting a clipped plane.
    rememberCourseOrigin(courseId, origin);
    const enterSnapshot = sceneRef.current?.captureCoursePlaneSnapshot() ?? null;
    rememberCourseEnterSnapshot(courseId, enterSnapshot);
    rememberArchiveCourseView(courseId, sceneRef.current?.getCourseView());
    const query = focusKnowledgeId ? `?focus=${encodeURIComponent(`knowledge:${focusKnowledgeId}`)}` : "";
    setLeavingForCourse(true);
    // Keep the Archive cards visible until the course chunk has loaded; only
    // then navigate. This removes the empty lazy-route fallback frame.
    void preloadCourseImmersive().catch(() => undefined).then(() => {
      window.setTimeout(() => navigate(`/courses/${encodeURIComponent(courseId)}${query}`), 120);
    });
  }, [leavingForCourse, navigate]);

  const focusCourse = useCallback((courseId: string) => {
    if (!courseId) return;
    courseFramedRef.current = false;
    void preloadCourseImmersive().catch(() => undefined);
    setSelectedId(null);
    sceneRef.current?.shiftForDetail(false);
    setFocusedCourseId(courseId);
    setSearchOpen(false);
    setSocialOpen(false);
    const next = new URLSearchParams(searchParams);
    next.set("focus", `course:${courseId}`);
    next.delete("panel");
    next.delete("search");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const clearCourseFocus = useCallback(() => {
    courseFramedRef.current = false;
    setFocusedCourseId(null);
    setCoursePlane(null);
    const next = new URLSearchParams(searchParams);
    next.delete("focus");
    setSearchParams(next, { replace: true });
    window.setTimeout(() => {
      if (selectedPeopleIds.length && personFocusIdsRef.current.length) {
        sceneRef.current?.fitIds(personFocusIdsRef.current, {
          padding: 1.32,
          insets: { left: leftInset + 12, right: 12, top: 78, bottom: 96 }
        });
      } else sceneRef.current?.fitAll({ padding: 1.08 });
    }, 80);
  }, [leftInset, searchParams, selectedPeopleIds.length, setSearchParams]);

  const selectNode = useCallback((id: string | null) => {
    setSelectedId(id);
    sceneRef.current?.shiftForDetail(Boolean(id));
    if (id) {
      const next = new URLSearchParams(searchParams);
      next.set("focus", `knowledge:${id}`);
      setSearchParams(next, { replace: true });
    } else {
      const next = new URLSearchParams(searchParams);
      if (focusedCourse) next.set("focus", `course:${focusedCourse.id}`);
      else if (next.get("focus")?.startsWith("knowledge:")) next.delete("focus");
      setSearchParams(next, { replace: true });
    }
  }, [focusedCourse, searchParams, setSearchParams]);

  const focusNodeCamera = useCallback((id: string) => {
    if (!model) return;
    const ids = new Set<string>([id]);
    model.edges.forEach((edge) => {
      if (edge.source === id) ids.add(edge.target);
      if (edge.target === id) ids.add(edge.source);
    });
    communityByNode.get(id)?.nodeIds.forEach((nodeId) => ids.add(nodeId));
    window.setTimeout(() => sceneRef.current?.fitIds(ids, { padding: 1.7 }), 50);
  }, [communityByNode, model]);

  const clearPeople = useCallback(() => {
    setSelectedPeopleIds([]);
    setPersonPanelCollapsed(false);
    setSocialOpen(false);
    const next = new URLSearchParams(searchParams);
    next.delete("compare");
    next.delete("panel");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const toggleMe = useCallback((shift: boolean) => {
    setSelectedId(null);
    sceneRef.current?.shiftForDetail(false);
    setPersonPanelCollapsed(false);
    setSocialOpen(false);
    setSelectedPeopleIds((current) => {
      if (shift) return current.includes("me") ? current.filter((id) => id !== "me") : current.length >= 3 ? current : [...current, "me"];
      return current.length === 1 && current[0] === "me" ? [] : ["me"];
    });
  }, []);

  const togglePerson = useCallback((person: FollowedPerson, shift: boolean) => {
    setSelectedId(null);
    sceneRef.current?.shiftForDetail(false);
    setPersonPanelCollapsed(false);
    setSocialOpen(false);
    setSelectedPeopleIds((current) => {
      if (shift) return current.includes(person.id) ? current.filter((id) => id !== person.id) : current.length >= 3 ? current : [...current, person.id];
      return current.length === 1 && current[0] === person.id ? [] : [person.id];
    });
  }, []);

  const compareWithMe = useCallback((personId: string) => {
    setSocialOpen(false);
    setSelectedId(null);
    sceneRef.current?.shiftForDetail(false);
    setPersonPanelCollapsed(false);
    setSelectedPeopleIds(Array.from(new Set(["me", personId])).slice(0, 3));
  }, []);

  const handlePersonSelect = useCallback((person: FollowedPerson) => {
    setSocialOpen(false);
    setSelectedId(null);
    sceneRef.current?.shiftForDetail(false);
    setPersonPanelCollapsed(false);
    setSelectedPeopleIds([person.id]);
  }, []);

  const closeDetailOrFocus = useCallback(() => {
    if (selectedId) { selectNode(null); return; }
    if (focusedCourse) { clearCourseFocus(); return; }
    if (searchOpen) { closeSearch(); return; }
    if (draftActive) return;
    if (selectedPeopleIds.length) { clearPeople(); return; }
  }, [clearCourseFocus, clearPeople, closeSearch, draftActive, focusedCourse, searchOpen, selectedId, selectNode, selectedPeopleIds.length]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openSearch(); return; }
      if (event.key === "Escape") {
        event.preventDefault();
        if (socialOpen) { setSocialOpen(false); return; }
        closeDetailOrFocus();
        return;
      }
      if (typing) return;
      if (event.key === "/") { event.preventDefault(); openSearch(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeDetailOrFocus, openSearch, socialOpen]);

  useEffect(() => {
    if (assistant.state === "idle") return;
    if (assistant.state === "brief") return;
    if (assistant.candidateIds.length) window.setTimeout(() => sceneRef.current?.fitIds(assistant.candidateIds, { padding: 1.9 }), 60);
  }, [assistant.candidateIds, assistant.state]);

  const retry = useCallback(async () => {
    if (retrying) return;
    setRetrying(true);
    setRetryMessage("");
    try {
      await onRetry?.();
      setRefreshToken((value) => value + 1);
      setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
      setRetryMessage(typeof navigator !== "undefined" && !navigator.onLine ? "仍处于离线状态，请检查网络后重试。" : "已重新加载星图。");
    } catch {
      setRetryMessage("重试失败，请检查网络后再试。");
    } finally {
      setRetrying(false);
    }
  }, [onRetry, retrying]);

  const learners = useMemo(() => {
    if (!selectedNode) return [];
    return [
      { name: "我", color: "var(--p-me)", has: selectedNode.isMine },
      ...people.map((person) => ({ name: shortName(person), color: `var(--p-${person.accent})`, has: Boolean(person.sharedKnowledgeIds?.includes(selectedNode.id)) }))
    ];
  }, [people, selectedNode]);

  if (!model) {
    return (
      <main className="ef-archive" data-boundary="error">
        <section className="ef-archive-error-card">
          <Network size={26} aria-hidden />
          <h1>星图加载失败</h1>
          <p>知识图谱暂时无法读取。请检查网络后重试。</p>
          <button type="button" className="ef-ui-btn ef-ui-btn--primary" onClick={() => void retry()} disabled={retrying}>{retrying ? "重试中…" : "重试"}</button>
          {retryMessage ? <small role="status">{retryMessage}</small> : null}
        </section>
      </main>
    );
  }

  if (!layout) {
    return (
      <main className="ef-archive" data-boundary="loading" data-layout-ms="pending">
        <section className="ef-archive-loading-card" role="status" aria-live="polite">
          <span className="ef-archive-loading-spinner" aria-hidden />
          <h1>正在生成星图</h1>
          <p>正在按知识关系计算三维布局，完成后会自动进入档案。</p>
          <small>{layoutCached ? "已读取缓存，正在准备画面…" : "首次进入需要计算一次，之后会直接命中缓存。"}</small>
        </section>
      </main>
    );
  }

  const personView: "me" | "person" | "compare" = selectedPeople.length > 1 ? "compare" : selectedPeople[0]?.id === "me" ? "me" : "person";
  const assistantDraft = draftActive && draftPlane;

  return (
    <main className={`ef-archive ${leavingForCourse ? "is-leaving-course" : ""}`} data-boundary={error ? "error" : !session ? "guest" : hasHistory ? "ready" : "empty"} data-focus={focusedCourse ? "course" : assistantDraft ? "draft" : selectedPeopleIds.length ? "person" : "default"} data-layout-ms={personLayout ? "ready" : undefined}>
      <Suspense fallback={<div className="ef-atlas-loading">正在生成星图…</div>}>
        <ArchiveAtlasScene
          ref={sceneRef}
          nodes={model.nodes}
          edges={model.edges}
          basePositions={layout.positions}
          mode={sceneMode}
          modePositions={scenePositions}
          planePositions={scenePlanePositions}
          planeChapters={scenePlaneChapters}
          planeDependencies={scenePlaneDependencies}
          planeNodeIds={scenePlaneIds}
          planeTargetIds={scenePlaneTargetIds}
          planeCardSize={scenePlaneCardSize}
          people={selectedPeople}
          communities={communities}
          selectedId={selectedId}
          searchIds={searchOpen ? searchResults?.mapHitIds ?? [] : []}
          assistantIds={assistant.state === "searching" || assistant.state === "results" ? assistant.candidateIds : []}
          draftIds={assistant.draftIds}
          reducedMotion={reducedMotion}
          onSelectNode={(id) => { if (id) selectNode(id); else closeDetailOrFocus(); }}
          onLevelChange={setLevel}
          onZoomChange={setPercent}
          onActivatePlaneNode={(id) => { if (focusedCourse) selectNode(id); }}
          onBlank={closeDetailOrFocus}
          onReady={() => setSceneReady(true)}
          onResize={refitCurrentView}
        />
      </Suspense>

      {!session ? (
        <div className="ef-atlas-guest">
          <button type="button" className="ef-atlas-guest-login" onClick={() => navigate("/login", { state: authGateState(location) })}>登录</button>
          <span><Lock size={11} aria-hidden />未登录 · 仅公开知识</span>
        </div>
      ) : (
        <ArchivePeopleBar
          sessionName={session.name}
          people={people}
          selectedIds={selectedPeopleIds}
          onToggleMe={toggleMe}
          onTogglePerson={togglePerson}
          onOpenPeople={() => setSocialOpen((value) => !value)}
          onOpenSearch={() => { if (searchOpen) closeSearch(); else openSearch(); }}
        />
      )}

      {socialOpen && session ? (
        <ArchivePeopleSharePanel
          people={people}
          sessionName={session.name}
          collapsed={searchOpen || assistantOpen}
          onExpandStrip={() => { if (searchOpen) closeSearch(); if (assistantOpen) handleAssistantOpenChange(false); }}
          onClose={() => setSocialOpen(false)}
          onView={handlePersonSelect}
          onCompare={(person) => compareWithMe(person.id)}
        />
      ) : null}

      {personPanelOpen && !socialOpen ? (
        <ArchivePersonPanel
          model={model}
          people={selectedPeople}
          view={personView}
          sessionName={session?.name ?? "我"}
          collapsed={personPanelCollapsedForOverlay}
          onCollapse={() => setPersonPanelCollapsed(true)}
          onExpandStrip={() => { if (searchOpen) closeSearch(); if (assistantOpen) handleAssistantOpenChange(false); setPersonPanelCollapsed(false); }}
          onFocusCourse={focusCourse}
          onCompare={compareWithMe}
          onOpenPeople={() => setSocialOpen(true)}
          onOpenCourse={(id) => openCourse(id)}
        />
      ) : null}

      {searchOpen ? (
        <ArchiveSearchPanel
          belowStrip={searchYieldsPanel}
          query={query}
          results={searchResults}
          searching={false}
          onQueryChange={(value) => {
            setQuery(value);
            const next = new URLSearchParams(searchParams);
            next.set("panel", "search");
            if (value) next.set("search", value); else next.delete("search");
            setSearchParams(next, { replace: true });
          }}
          onClose={closeSearch}
          onSelectNode={(id) => { selectNode(id); focusNodeCamera(id); }}
          onFocusCourse={focusCourse}
          onOpenCourse={openCourse}
          onSelectPerson={handlePersonSelect}
          onAskAssistant={(goal) => { closeSearch(); handleAssistantOpenChange(true); setSeedGoal({ key: `${Date.now()}`, goal }); }}
        />
      ) : null}

      {focusedCourse && coursePlane ? <ArchiveCourseFocusBar course={focusedCourse} learned={focusedLearned} leftInset={leftInset} onOpen={(origin) => openCourse(focusedCourse.id, origin)} /> : null}
      {assistantDraft && assistant.brief ? <ArchiveDraftFocusBar title={assistant.brief.goal} knowledgeCount={assistant.draftIds.length} weeks={plannedWeeks(assistant.brief.requestedAdjustments, assistant.draftIds.length)} leftInset={leftInset} /> : null}

      {selectedNode && !assistantDraft ? (
        <ArchiveNodePanel
          node={selectedNode}
          model={model}
          edges={model.edges}
          topicName={communityByNode.get(selectedNode.id)?.name ?? "未分类"}
          learners={learners}
          onClose={() => selectNode(null)}
          onSelectNode={(id) => { selectNode(id); if (!focusedCourse) focusNodeCamera(id); }}
          onOpenCourse={openCourse}
          focusedCourseId={focusedCourse && courseNodeIds.has(selectedNode.id) ? focusedCourse.id : null}
          onOpenFocusCourse={focusedCourse ? (knowledgeId) => openCourse(focusedCourse.id, undefined, knowledgeId) : undefined}
        />
      ) : null}

      {focusedCourse ? null : <ArchiveLevelChip level={level} />}
      <SceneZoomToolbar
        className="ef-atlas-zoom ef-ui-glass ef-ui-glass--regular"
        percent={percent}
        disabled={error}
        onZoomIn={() => sceneRef.current?.zoomBy(0.82)}
        onZoomOut={() => sceneRef.current?.zoomBy(1.22)}
        onFit={() => {
          if (focusedCourse || assistantDraft) sceneRef.current?.fitCourse({ left: leftInset + 12, right: 12, top: 188, bottom: 96 });
          else sceneRef.current?.resetView();
        }}
        onFront={() => sceneRef.current?.frontView()}
      />

      <div className="ef-atlas-legend" aria-live="polite">
        {!session ? <span><i className="is-public" aria-hidden />公开知识 {model.stats.totalNodes}</span> : null}
        {session && !selectedPeopleIds.length ? <span><i className="is-me" aria-hidden />我的知识 {model.stats.mine}</span> : null}
        {selectedPeople.length ? selectedPeople.map((person) => <span key={person.id}><i style={{ background: `var(--p-${person.accent})` }} aria-hidden />{person.name} {person.nodeIds.size}</span>) : null}
        {assistant.state === "results" || assistant.state === "searching" ? <span><i className="is-hit" aria-hidden />助手命中 {assistant.candidateIds.length}</span> : null}
        {searchOpen && searchResults ? <span><i className="is-hit" aria-hidden />搜索命中 {searchResults.mapHitIds.length}</span> : null}
      </div>

      {session ? (
        <ArchiveAssistantBridge
          session={session}
          model={model}
          context={context}
          seedGoal={seedGoal}
          open={assistantOpen}
          onOpenChange={handleAssistantOpenChange}
          onPresentation={handlePresentation}
          onOpenBrief={() => navigate("/")}
        />
      ) : (
        <GuestAssistantCard onLogin={() => navigate("/login", { state: authGateState(location) })} onRegister={() => navigate("/register", { state: authGateState(location) })} />
      )}

      {error ? (
        <div className="ef-atlas-error-banner" role="alert">
          <RefreshCcw size={15} aria-hidden />
          <span><b>星图加载失败 · 请检查网络</b><small>{lastGoodAt ? `上次缓存 ${new Date(lastGoodAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : "当前没有可用缓存"}</small></span>
          <button type="button" onClick={() => void retry()} disabled={retrying}>{retrying ? "重试中…" : "重试"}</button>
          {retryMessage ? <em>{retryMessage}</em> : null}
        </div>
      ) : null}

      {peopleError ? <p className="ef-archive-people-error" role="status">{peopleError}</p> : null}

      <span className="ef-atlas-sr-only">{model.stats.totalNodes} 个知识 · {model.stats.totalEdges} 条关系 · 布局不随选择改变</span>
    </main>
  );
}

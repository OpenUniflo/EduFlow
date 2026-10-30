import { ArrowRight, BookOpen, Lock, Network, RefreshCcw, Search, Sparkles, Users } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { applicationServices } from "@/app/services/applicationServices";
import { useAssistantRuntime } from "@/features/assistant/AssistantRuntimeContext";
import { Avatar } from "@/shared/ui/Avatar";
import { PreviewBadge } from "@/shared/ui/PreviewBadge";
import type { AssistantContextSnapshot } from "@/features/assistant/assistantContract";
import { authGateState } from "@/features/auth/authRedirect";
import type { MockSession } from "@/features/auth/types";
import { isCourseVisibleToViewer } from "@/features/course/runtime/courseVisibility";
import { buildCourseGraphData } from "@/features/course/runtime/courseRuntime";
import { useDomainGovernance } from "@/features/knowledge/domain/domainStore";
import { globalKnowledgeAccess, userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import type { FollowedPerson } from "@/features/profile/people/PeopleRepository";
import { ArchiveAtlas, type ArchiveAtlasHandle, type ArchiveCameraTarget, type AtlasComparePerson } from "../components/ArchiveAtlas";
import { ArchiveAssistantPanel, GuestAssistantCard } from "../components/ArchiveAssistantPanel";
import { ArchiveCourseFocusBar, ArchiveCourseMini, ArchiveDraftPills, ArchiveKnowledgeList, ArchiveLegend, ArchiveNodePanel, ArchiveZoomControls } from "../components/ArchiveChrome";
import { ArchiveCourseTreeLegend, ArchiveCourseTreeOverlay, ArchiveDraftTreeLegend, ArchiveDraftTreeOverlay } from "../components/ArchiveTreeOverlay";
import { ArchiveCoursePanel } from "../components/ArchiveCoursePanel";
import { ArchivePeopleBar } from "../components/ArchivePeopleBar";
import { ArchiveSearchPanel } from "../components/ArchiveSearchPanel";
import { ArchiveCompareCard, ArchiveCompareNodeCard, ArchiveNodeHoverCard, ArchiveNotificationsDialog, ArchivePeerCard, ArchivePeopleDialog, ArchivePeoplePicker, type PeopleDialogTab } from "../components/ArchiveSocialDialogs";
import { getArchiveLayout } from "../model/atlasLayout";
import { rememberCourseOrigin } from "@/features/course/immersive/courseTransition";
import { archiveCourseKnowledgeIds, archivePeopleKnowledgeIds, buildArchiveModel, searchArchive, type ArchiveEdge, type ArchiveModel } from "../model/atlasModel";
import { deriveAssistantPresentation, type ArchiveAssistantPresentation } from "../model/assistantPresentation";
import { archiveHref, parseArchiveSearch, type ArchivePanel } from "../model/atlasParams";
import "./archive.css";

const EMPTY_PRESENTATION: ArchiveAssistantPresentation = {
  state: "idle",
  candidateIds: [],
  targetIds: [],
  prerequisiteIds: [],
  draftIds: [],
  draftDepth: new Map(),
  matchCount: 0
};

type ActiveMode = "default" | "search" | "course" | "peer" | "assistant" | "draft" | "knowledge";

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
  const layoutResult = useMemo(() => {
    if (!built.model) return { layout: null };
    try {
      return { layout: getArchiveLayout(built.model.nodes, built.model.edges) };
    } catch (error) {
      return { layout: null, error };
    }
  }, [built.model]);
  return { model: built.model, layout: layoutResult.layout, error: built.error ?? layoutResult.error, revision, runtimes, graph, records, courseStates };
}

function ArchiveAssistantBridge({ session, model, context, seedGoal, onPresentation, onOpenBrief, onActiveChange }: {
  session: MockSession;
  model: ArchiveModel;
  context: AssistantContextSnapshot;
  seedGoal: { key: string; goal: string } | null;
  onPresentation: (presentation: ArchiveAssistantPresentation) => void;
  onOpenBrief: (briefMessageId: string) => void;
  onActiveChange: (active: boolean) => void;
}) {
  const runtime = useAssistantRuntime();
  const presentation = useMemo(() => deriveAssistantPresentation({ messages: runtime.messages, model, sending: runtime.sending, error: runtime.error }), [model, runtime.error, runtime.messages, runtime.sending]);
  useEffect(() => { onPresentation(presentation); }, [onPresentation, presentation]);
  return <ArchiveAssistantPanel session={session} model={model} context={context} presentation={presentation} seedGoal={seedGoal} onOpenBrief={onOpenBrief} onActiveChange={onActiveChange} />;
}

export function ArchivePage({ session, onRetry }: { session: MockSession | null; onRetry?: () => Promise<void> }) {
  const navigate = useNavigate();
  const location = useLocation();
  const reducedMotion = Boolean(useReducedMotion());
  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = useMemo(() => parseArchiveSearch(location.search), [location.search]);
  const [refreshToken, setRefreshToken] = useState(0);
  const { model, layout, error: dataError, revision, runtimes, graph, records, courseStates } = useArchiveData(session, refreshToken);
  const atlasRef = useRef<ArchiveAtlasHandle>(null);
  const [cameraTarget, setCameraTarget] = useState<ArchiveCameraTarget | null>(null);
  const [percent, setPercent] = useState(100);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hovered, setHovered] = useState<{ id: string; point: { x: number; y: number } } | null>(null);
  const [activeMode, setActiveMode] = useState<ActiveMode>("default");
  const [searchOpen, setSearchOpen] = useState(urlState.panel === "search");
  const [query, setQuery] = useState(urlState.search);
  const [focusedCourseId, setFocusedCourseId] = useState(urlState.focus.type === "course" ? urlState.focus.id : null);
  const [selectedPeopleIds, setSelectedPeopleIds] = useState<string[]>(urlState.comparePersonIds);
  const [people, setPeople] = useState<readonly FollowedPerson[]>([]);
  const [peopleError, setPeopleError] = useState("");
  const [peopleDialog, setPeopleDialog] = useState<PeopleDialogTab | null>(urlState.panel === "people" ? "following" : urlState.panel === "share" ? "share" : null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(urlState.panel === "notifications");
  const [listOpen, setListOpen] = useState(false);
  const [coursePanelExpanded, setCoursePanelExpanded] = useState(false);
  const [courseTreeMode, setCourseTreeMode] = useState<"skill" | "practice">("skill");
  const [listMode, setListMode] = useState(false);
  const [assistant, setAssistant] = useState<ArchiveAssistantPresentation>(EMPTY_PRESENTATION);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [seedGoal, setSeedGoal] = useState<{ key: string; goal: string } | null>(null);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const handleCameraState = useCallback((value: number) => setPercent(value), []);
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState("");
  const [lastGoodAt, setLastGoodAt] = useState<number | null>(null);
  const assistantDraftActive = Boolean(session) && assistant.state === "brief" && activeMode !== "course" && activeMode !== "peer" && activeMode !== "search";
  const assistantSearchActive = Boolean(session) && (assistant.state === "searching" || assistant.state === "results") && activeMode !== "course" && activeMode !== "peer" && activeMode !== "search";
  const initializedRef = useRef(false);
  const lastUrlRef = useRef("");

  const error = !online || Boolean(dataError);
  const hasHistory = Boolean(model?.hasLearningHistory);
  const focusedCourse = useMemo(() => model?.courses.find((course) => course.id === focusedCourseId) ?? null, [focusedCourseId, model]);
  const focusedRuntime = useMemo(() => runtimes.find((runtime) => runtime.course.id === focusedCourseId) ?? null, [focusedCourseId, runtimes]);
  const focusedGraphData = useMemo(() => {
    if (!focusedRuntime) return null;
    try {
      return buildCourseGraphData(focusedRuntime, session ? courseStates.get(focusedRuntime.course.id) : undefined, graph, records);
    } catch {
      return null;
    }
  }, [courseStates, focusedRuntime, graph, records, session]);
  const courseTreeCounts = useMemo(() => {
    if (!focusedGraphData) return null;
    const counts = { learned: 0, learning: 0, current: 0, target: 0, pending: 0 };
    focusedGraphData.knowledgeNodes.forEach((node) => {
      if (node.status === "completed") counts.learned += 1;
      else if (node.status === "learning") counts.learning += 1;
      else if (node.status === "available") counts.target += 1;
      else counts.pending += 1;
    });
    counts.current = Math.min(1, counts.learning);
    return counts;
  }, [focusedGraphData]);
  const draftDepthCounts = useMemo(() => {
    const counts = { one: 0, two: 0, three: 0 };
    assistant.draftIds.forEach((id) => {
      const depth = Math.max(1, Math.min(3, (assistant.draftDepth.get(id) ?? 0) + 1));
      if (depth === 1) counts.one += 1;
      else if (depth === 2) counts.two += 1;
      else counts.three += 1;
    });
    return counts;
  }, [assistant.draftDepth, assistant.draftIds]);
  const courseNodes = useMemo(() => model && focusedCourse ? archiveCourseKnowledgeIds(model, focusedCourse.id) : new Set<string>(), [focusedCourse, model]);
  const comparePeople = useMemo<AtlasComparePerson[]>(() => {
    if (!model) return [];
    const map = archivePeopleKnowledgeIds(people.filter((person) => selectedPeopleIds.includes(person.id)));
    return selectedPeopleIds.flatMap((id) => {
      const person = people.find((candidate) => candidate.id === id);
      if (!person) return [];
      return [{ id: person.id, name: person.displayName.replace(/^示例\s*·\s*/, ""), accent: person.accent, color: "", nodeIds: map.get(person.id) ?? new Set() }];
    });
  }, [model, people, selectedPeopleIds]);
  const assistantCandidateSet = useMemo(() => new Set(assistant.candidateIds), [assistant.candidateIds]);
  const assistantDraftSet = useMemo(() => new Set(assistant.draftIds), [assistant.draftIds]);
  const searchResults = useMemo(() => model ? searchArchive(model, query, people) : null, [model, people, query]);
  const selectedNode = model && selectedId ? model.nodeById.get(selectedId) ?? null : null;
  const selectedPeople = useMemo(() => people.filter((person) => selectedPeopleIds.includes(person.id)), [people, selectedPeopleIds]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

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
    if (error) { setListMode(true); return; }
    setListMode(false);
  }, [error]);

  useEffect(() => { setQuery(urlState.search); }, [urlState.search]);
  useEffect(() => {
    if (urlState.panel === "search") { setSearchOpen(true); setActiveMode("search"); }
    else if (urlState.panel === "people") { setPeopleDialog("following"); }
    else if (urlState.panel === "share") { setPeopleDialog("share"); }
    else if (urlState.panel === "notifications") { setNotificationsOpen(true); }
    if (urlState.focus.type === "course") { setFocusedCourseId(urlState.focus.id); setActiveMode("course"); }
    if (urlState.focus.type === "me") { setActiveMode("default"); }
    if (urlState.focus.type === "knowledge") { setSelectedId(urlState.focus.id); setActiveMode("knowledge"); }
    if (urlState.comparePersonIds.length) { setSelectedPeopleIds(urlState.comparePersonIds); setActiveMode("peer"); }
  }, [urlState]);

  const context = useMemo<AssistantContextSnapshot>(() => ({
    workspace: "explore",
    experienceMode: "learn",
    ...(focusedCourse ? { courseId: focusedCourse.id } : {}),
    ...(selectedId ? { knowledgeId: selectedId } : {}),
  } as AssistantContextSnapshot), [focusedCourse, selectedId, selectedPeopleIds]);

  const handlePresentation = useCallback((next: ArchiveAssistantPresentation) => {
    setAssistant(next);
    if (next.state === "brief") setActiveMode((current) => current === "course" || current === "peer" ? current : "draft");
    else if (next.state === "searching" || next.state === "results") setActiveMode((current) => current === "course" || current === "peer" ? current : "assistant");
  }, []);

  const setPanelParam = useCallback((panel: ArchivePanel) => {
    const next = new URLSearchParams(searchParams);
    if (panel) next.set("panel", panel);
    else next.delete("panel");
    if (panel !== "search") next.delete("search");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setActiveMode("search");
    setPanelParam("search");
  }, [setPanelParam]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery("");
    setActiveMode(selectedPeopleIds.length ? "peer" : focusedCourseId ? "course" : "default");
    setPanelParam(null);
  }, [focusedCourseId, selectedPeopleIds.length, setPanelParam]);

  const openCourse = useCallback((courseId: string, origin?: DOMRect) => {
    if (!courseId) return;
    rememberCourseOrigin(courseId, origin);
    navigate(`/courses/${encodeURIComponent(courseId)}`);
  }, [navigate]);
  const openCourseChapters = useCallback((courseId: string) => {
    if (!courseId) return;
    navigate(`/courses/${encodeURIComponent(courseId)}#curriculum`);
  }, [navigate]);

  const focusCourse = useCallback((courseId: string) => {
    setFocusedCourseId(courseId);
    setActiveMode("course");
    setSearchOpen(false);
    setSelectedPeopleIds([]);
    const next = new URLSearchParams(searchParams);
    next.set("focus", `course:${courseId}`);
    next.delete("panel");
    next.delete("search");
    next.delete("compare");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const clearCourseFocus = useCallback(() => {
    setFocusedCourseId(null);
    setActiveMode("default");
    const next = new URLSearchParams(searchParams);
    next.delete("focus");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const selectNode = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) {
      setActiveMode((current) => current === "search" ? current : "knowledge");
      const next = new URLSearchParams(searchParams);
      next.set("focus", `knowledge:${id}`);
      setSearchParams(next, { replace: true });
    } else {
      setActiveMode((current) => current === "search" ? "search" : current === "course" ? "course" : current === "peer" ? "peer" : "default");
      const next = new URLSearchParams(searchParams);
      next.delete("focus");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handlePersonSelect = useCallback((person: FollowedPerson) => {
    setSelectedPeopleIds([person.id]);
    setActiveMode("peer");
    setPeopleDialog(null);
    const next = new URLSearchParams(searchParams);
    next.delete("panel");
    next.set("compare", person.id);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const toggleComparePerson = useCallback((person: FollowedPerson) => {
    setSelectedPeopleIds((current) => {
      if (current.includes(person.id)) return current.filter((id) => id !== person.id);
      return current.length >= 3 ? current : [...current, person.id];
    });
    setActiveMode("peer");
    setPeopleDialog(null);
  }, []);

  useEffect(() => {
    if (!model || !layout || initializedRef.current) return;
    initializedRef.current = true;
    if (urlState.focus.type === "course") {
      const focusId = urlState.focus.id;
      const ids = archiveCourseKnowledgeIds(model, focusId);
      setCameraTarget({ key: `course:${focusId}`, type: "ids", ids: Array.from(ids), padding: 82, maxScaleRatio: 1.3 });
      setActiveMode("course");
      return;
    }
    if (urlState.focus.type === "knowledge" && model.nodeById.has(urlState.focus.id)) {
      const focusId = urlState.focus.id;
      const neighbors = new Set([focusId]);
      model.edges.forEach((edge) => {
        if (edge.source === focusId) neighbors.add(edge.target);
        if (edge.target === focusId) neighbors.add(edge.source);
      });
      setCameraTarget({ key: `knowledge:${focusId}`, type: "ids", ids: Array.from(neighbors), padding: 150, maxScaleRatio: 2.3 });
      setActiveMode("knowledge");
      return;
    }
    if (urlState.panel === "search" && urlState.search) {
      setCameraTarget({ key: "initial-search", type: "all", padding: 90 });
      setActiveMode("search");
      return;
    }
    if (urlState.comparePersonIds.length) { setActiveMode("peer"); return; }
    setCameraTarget({ key: "initial", type: model.hasLearningHistory ? "mine" : "all", padding: model.hasLearningHistory ? 72 : 54 });
    setActiveMode("default");
  }, [layout, model, urlState]);

  useEffect(() => {
    if (!model || !layout) return;
    const key = `${activeMode}:${focusedCourseId ?? ""}:${selectedPeopleIds.join(",")}:${assistant.candidateIds.join(",")}:${assistant.draftIds.join(",")}:${selectedId ?? ""}:${query}:${revision}:${model.stats.totalNodes}`;
    if (lastUrlRef.current === key) return;
    lastUrlRef.current = key;
    if (assistantDraftActive) {
      const ids = assistant.draftIds;
      setCameraTarget({ key: `draft:${ids.join(",")}`, type: ids.length ? "ids" : "all", ids, padding: 130, maxScaleRatio: 1.35 });
    } else if (assistantSearchActive) {
      const ids = assistant.candidateIds;
      setCameraTarget({ key: `assistant:${ids.join(",")}`, type: ids.length ? "ids" : "all", ids, padding: 130, maxScaleRatio: 1.85 });
    } else if (activeMode === "course" && focusedCourse) {
      setCameraTarget({ key: `course:${focusedCourse.id}`, type: "ids", ids: Array.from(courseNodes), padding: 82, maxScaleRatio: 1.3 });
    } else if (activeMode === "search") {
      const ids = searchResults?.mapHitIds ?? [];
      setCameraTarget({ key: `search:${ids.join(",")}:${query}`, type: ids.length ? "ids" : "all", ids, padding: 120, maxScaleRatio: 1.85 });
    } else if (activeMode === "peer" && selectedPeopleIds.length) {
      const union = new Set(model.mineNodeIds);
      comparePeople.forEach((person) => person.nodeIds.forEach((id) => union.add(id)));
      setCameraTarget({ key: `peer:${selectedPeopleIds.join(",")}`, type: "ids", ids: Array.from(union), padding: 90, maxScaleRatio: 1.18 });
    } else if (activeMode === "draft") {
      const ids = assistant.draftIds;
      setCameraTarget({ key: `draft:${ids.join(",")}`, type: ids.length ? "ids" : "all", ids, padding: 130, maxScaleRatio: 1.35 });
    } else if (activeMode === "assistant") {
      const ids = assistant.candidateIds;
      setCameraTarget({ key: `assistant:${ids.join(",")}`, type: ids.length ? "ids" : "all", ids, padding: 130, maxScaleRatio: 1.85 });
    } else if (activeMode === "knowledge" && selectedId) {
      const neighbors = new Set([selectedId]);
      model.edges.forEach((edge) => {
        if (edge.source === selectedId) neighbors.add(edge.target);
        if (edge.target === selectedId) neighbors.add(edge.source);
      });
      setCameraTarget({ key: `knowledge:${selectedId}`, type: "ids", ids: Array.from(neighbors), padding: 170, maxScaleRatio: 2.3 });
    } else {
      setCameraTarget({ key: `default:${model.hasLearningHistory ? "mine" : "all"}:${revision}`, type: model.hasLearningHistory ? "mine" : "all", padding: model.hasLearningHistory ? 72 : 54 });
    }
  }, [activeMode, assistant.candidateIds, assistant.draftIds, assistantDraftActive, assistantSearchActive, comparePeople, courseNodes, focusedCourse, focusedCourseId, layout, model, query, revision, searchResults, selectedId, selectedPeopleIds, selectedPeopleIds.length]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openSearch(); return; }
      if (typing) return;
      if (event.key.toLowerCase() === "l") { event.preventDefault(); setListOpen((value) => !value); return; }
      if (event.key === "/") { event.preventDefault(); openSearch(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openSearch]);

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

  const focusMode = assistantDraftActive ? "draft" : activeMode === "search" || assistantSearchActive ? "search" : activeMode === "course" ? "course" : activeMode === "peer" ? "peer" : activeMode === "draft" ? "draft" : "all";
  const mapFocusMode = focusMode === "search" && activeMode === "search" && (!query.trim() || searchResults?.empty) ? "all" : focusMode;
  const searchHitIds = mapFocusMode === "search" ? (activeMode === "search" ? searchResults?.mapHitIds ?? [] : assistant.candidateIds) : [];
  const hoveredNode = hovered && model ? model.nodeById.get(hovered.id) : null;
  const hoverPeople = hoveredNode && comparePeople.length ? comparePeople.map((person) => ({ name: person.name, has: person.nodeIds.has(hoveredNode.id), color: person.accent === "orange" ? "var(--p-orange)" : person.accent === "cyan" ? "var(--p-cyan)" : person.accent === "rose" ? "var(--p-rose)" : "var(--p-me)" })) : [];
  const dialogPeople = people;
  const peerPerson = selectedPeopleIds.length === 1 ? people.find((person) => person.id === selectedPeopleIds[0]) ?? null : null;

  if (!model || !layout) {
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

  return (
    <main className="ef-archive" data-boundary={error ? "error" : !session ? "guest" : hasHistory ? "ready" : "empty"} data-focus={mapFocusMode}>
      <ArchiveAtlas
        ref={atlasRef}
        nodes={model.nodes}
        edges={model.edges}
        layout={layout}
        cameraTarget={cameraTarget}
        focusMode={mapFocusMode}
        mineNodeIds={model.mineNodeIds}
        selectedId={selectedId}
        hoveredId={hovered?.id ?? null}
        searchHitIds={searchHitIds}
        courseNodeIds={courseNodes}
        draftNodeIds={assistantDraftSet}
        draftDepth={assistant.draftDepth}
        comparePeople={comparePeople}
        dimmed={error}
        reducedMotion={reducedMotion}
        onCameraStateChange={handleCameraState}
        onSelectNode={selectNode}
        onHoverNode={(id, point) => setHovered(id && point ? { id, point } : null)}
      />

      {focusedCourse && focusedGraphData && !error ? (
        <ArchiveCourseTreeOverlay graphData={focusedGraphData} mode={courseTreeMode} onSelectKnowledge={(id) => setSelectedId(id)} />
      ) : null}

      {assistantDraftActive && assistant.draftIds.length ? (
        <ArchiveDraftTreeOverlay ids={assistant.draftIds} depth={assistant.draftDepth} model={model} onSelectKnowledge={(id) => setSelectedId(id)} />
      ) : null}

      {!session ? <button type="button" className="ef-archive-login" onClick={() => navigate("/login", { state: authGateState(location) })}>登录</button> : null}

      {session ? (
        <ArchivePeopleBar
          sessionName={session.name}
          people={people}
          selectedIds={selectedPeopleIds}
          onFitMe={() => { setSelectedPeopleIds([]); setActiveMode("default"); atlasRef.current?.fitMine(); }}
          onRemove={(id) => { setSelectedPeopleIds((current) => current.filter((value) => value !== id)); if (selectedPeopleIds.length <= 1) setActiveMode("default"); }}
          onOpenPicker={() => setPickerOpen(true)}
          onOpenReplace={() => setReplaceOpen((value) => !value)}
          onOpenPeople={() => setPeopleDialog("following")}
        />
      ) : null}

      {error ? (
        <div className="ef-archive-error-banner" role="alert">
          <RefreshCcw size={15} aria-hidden />
          <span><b>星图加载失败 · 请检查网络</b><small>{lastGoodAt ? `上次缓存 ${new Date(lastGoodAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}，可用列表查看` : "当前没有可用缓存"}</small></span>
          <button type="button" onClick={() => void retry()} disabled={retrying}>{retrying ? "重试中…" : "重试"}</button>
          {retryMessage ? <em>{retryMessage}</em> : null}
        </div>
      ) : null}

      {searchOpen ? (
        <ArchiveSearchPanel
          query={query}
          results={searchResults}
          searching={false}
          onQueryChange={(value) => { setQuery(value); setActiveMode("search"); if (value.trim()) { const next = new URLSearchParams(searchParams); next.set("panel", "search"); next.set("search", value); setSearchParams(next, { replace: true }); } }}
          onClose={closeSearch}
          onSelectNode={(id) => { setSelectedId(id); setActiveMode("search"); }}
          onFocusCourse={focusCourse}
          onOpenCourse={openCourse}
          onSelectPerson={handlePersonSelect}
          onAskAssistant={(goal) => { closeSearch(); setSeedGoal({ key: `${Date.now()}`, goal }); setActiveMode("assistant"); }}
        />
      ) : peerPerson ? (
        <ArchivePeerCard person={peerPerson} model={model} onClose={() => { setSelectedPeopleIds([]); setActiveMode("default"); }} onCompare={() => { setActiveMode("peer"); setPeopleDialog(null); }} onOpenCourse={openCourse} />
      ) : selectedPeopleIds.length > 1 ? (
        <ArchiveCompareCard model={model} sessionName={session?.name ?? "我"} peopleCount={selectedPeopleIds.length} onShare={() => setPeopleDialog("share")} onVisibility={() => setPeopleDialog("share")} onFitMine={() => atlasRef.current?.fitMine()} />
      ) : assistantOpen && assistant.state !== "idle" ? null : !error && session && hasHistory && percent <= 108 && activeMode === "default" && !coursePanelExpanded ? (
        <ArchiveCourseMini
          model={model}
          onExpand={() => setCoursePanelExpanded(true)}
          onFocusCourse={focusCourse}
          onOpenCourse={openCourse}
        />
      ) : (
        <ArchiveCoursePanel
          model={model}
          focusedCourseId={focusedCourseId}
          guest={!session}
          listMode={listMode}
          error={error}
          onFocusCourse={focusCourse}
          onOpenCourse={openCourse}
          onOpenChapters={openCourseChapters}
          onOpenSearch={openSearch}
          onOpenAssistant={() => setSeedGoal({ key: `${Date.now()}`, goal: "" })}
          onToggleList={() => setListMode((value) => !value)}
          onLocateMe={() => atlasRef.current?.fitMine()}
          onSelectCached={(id) => { selectNode(id); atlasRef.current?.fitNode(id); }}
          hasHistory={hasHistory}
          onRetry={() => void retry()}
        />
      )}

      {focusedCourse && !error ? (
        <ArchiveCourseFocusBar
          course={focusedCourse}
          mode={courseTreeMode}
          learned={courseTreeCounts?.learned ?? 0}
          total={focusedCourse.knowledgeCount}
          onMode={setCourseTreeMode}
          onOpen={(origin) => openCourse(focusedCourse.id, origin)}
          onClose={clearCourseFocus}
        />
      ) : null}

      {assistantDraftActive && assistant.brief ? (
        <ArchiveDraftPills title={assistant.brief.goal} knowledgeCount={assistant.draftIds.length} weeks={plannedWeeks(assistant.brief.requestedAdjustments, assistant.draftIds.length)} />
      ) : null}

      {selectedNode && !searchOpen && selectedPeopleIds.length > 1 ? (
        <ArchiveCompareNodeCard
          node={selectedNode}
          people={selectedPeople}
          sessionName={session?.name ?? "我"}
          onClose={() => selectNode(null)}
          onAskAssistant={(goal) => { setSelectedId(null); setSeedGoal({ key: `${Date.now()}`, goal }); setAssistantOpen(true); }}
        />
      ) : selectedNode && !searchOpen ? (
        <ArchiveNodePanel node={selectedNode} model={model} edges={model.edges} onClose={() => selectNode(null)} onSelectNode={(id) => selectNode(id)} onOpenCourse={openCourse} />
      ) : null}

      {hoveredNode && hovered && !selectedNode ? (
        <div className="ef-archive-hover-anchor" style={{ left: Math.min(hovered.point.x + 14, 1040), top: Math.min(hovered.point.y + 14, 680) }}>
          <ArchiveNodeHoverCard title={hoveredNode.title} domain={hoveredNode.domainTitle} domainColor={hoveredNode.color} people={hoverPeople} canLearn={Boolean(comparePeople.length)} onLearn={() => selectNode(hoveredNode.id)} />
        </div>
      ) : null}

      {focusedCourse && courseTreeCounts ? (
        <ArchiveCourseTreeLegend treeMode={courseTreeMode} counts={courseTreeCounts} />
      ) : assistantDraftActive ? (
        <ArchiveDraftTreeLegend counts={draftDepthCounts} />
      ) : (
        <ArchiveLegend model={model} focusMode={mapFocusMode} hasPeople={selectedPeopleIds.length > 0} hitCount={searchHitIds.length} publicOnly={!session || !hasHistory} people={comparePeople.map((person) => ({ name: person.name, accent: person.accent }))} />
      )}

      <ArchiveZoomControls
        percent={percent}
        canLocate={hasHistory && Boolean(session)}
        listOpen={listOpen}
        onZoomIn={() => atlasRef.current?.zoomBy(1.2)}
        onZoomOut={() => atlasRef.current?.zoomBy(0.84)}
        onLocate={() => atlasRef.current?.fitMine()}
        onFitAll={() => atlasRef.current?.fitAll()}
        onToggleList={() => setListOpen((value) => !value)}
        disabled={error}
      />

      {session ? (
        <ArchiveAssistantBridge session={session} model={model} context={context} seedGoal={seedGoal} onPresentation={handlePresentation} onOpenBrief={() => navigate("/")} onActiveChange={(active) => {
          setAssistantOpen(active);
          if (!active) setActiveMode((current) => current === "draft" || current === "assistant" ? "default" : current);
          else setActiveMode(assistant.state === "brief" ? "draft" : assistant.state === "idle" ? "default" : "assistant");
        }} />
      ) : (
        <GuestAssistantCard onLogin={() => navigate("/login", { state: authGateState(location) })} onRegister={() => navigate("/register", { state: authGateState(location) })} />
      )}

      <ArchiveKnowledgeList open={listOpen} model={model} selectedId={selectedId} onSelect={(id) => { selectNode(id); atlasRef.current?.fitNode(id); }} onClose={() => setListOpen(false)} />

      {replaceOpen && selectedPeople.length ? (
        <div className="ef-archive-replace-menu" role="dialog" aria-label="替换谁">
          <header><b>替换谁</b><span>先移出一位</span><PreviewBadge /></header>
          {selectedPeople.map((person) => (
            <button type="button" key={person.id} onClick={() => { setSelectedPeopleIds((current) => current.filter((id) => id !== person.id)); setReplaceOpen(false); setPickerOpen(true); }}>
              <Avatar name={person.displayName.replace(/^示例\s*·\s*/, "").slice(0, 1)} size={24} personColor={person.accent} decorative />
              <span>{person.displayName.replace(/^示例\s*·\s*/, "")}</span>
              <em>替换</em>
            </button>
          ))}
        </div>
      ) : null}

      <ArchivePeoplePicker open={pickerOpen} people={people} selectedIds={selectedPeopleIds} onClose={() => setPickerOpen(false)} onToggle={toggleComparePerson} onFinish={() => setPickerOpen(false)} />

      <ArchivePeopleDialog open={Boolean(peopleDialog)} tab={peopleDialog ?? "following"} people={dialogPeople} selectedIds={selectedPeopleIds} model={model} sessionName={session?.name ?? "我"} onClose={() => { setPeopleDialog(null); setPanelParam(null); }} onTab={(tab) => setPeopleDialog(tab)} onToggleCompare={toggleComparePerson} onViewPerson={handlePersonSelect} />

      <ArchiveNotificationsDialog open={notificationsOpen} onClose={() => { setNotificationsOpen(false); setPanelParam(null); }} />

      {peopleError ? <p className="ef-archive-people-error" role="status">{peopleError}</p> : null}


    </main>
  );
}

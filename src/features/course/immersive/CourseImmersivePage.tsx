import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, Clock3, Edit3, FileText, Layers3, List, Lock, LogIn, Maximize2, Minus, Network, Plus, RotateCcw, Route, Sparkles, Target, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useReducedMotion } from "motion/react";
import { applicationServices, refreshLearnerState } from "@/app/services/applicationServices";
import { EduFlowAssistant } from "@/features/assistant/components/EduFlowAssistant";
import { authGateState } from "@/features/auth/authRedirect";
import type { MockSession } from "@/features/auth/types";
import { canDesignCourse } from "@/features/auth/capabilities";
import { coursePresentationContext } from "@/features/assistant/presentationContext";
import { useOptionalUserCourseState } from "@/features/learning/progress/progressService";
import { createMicroLearningNavigation, type MicroLearningProvider } from "@/features/learning/micro/microLearning";
import { buildMaterialDeepLink } from "@/features/material/materialNavigation";
import { sortMaterials } from "@/features/material/materialOrdering";
import { globalKnowledgeAccess, userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { satisfiesTeachingPrerequisite } from "@/shared/learning/teachingPrerequisites";
import { routeDiff } from "@/shared/learning/routeDiff";
import { ObjectShell } from "@/shared/ui/ObjectShell";
import { Pill } from "@/shared/ui/Pill";
import { PreviewBadge } from "@/shared/ui/PreviewBadge";
import { buildCourseGraphData } from "../runtime/courseRuntime";
import { isCourseVisibleToViewer } from "../runtime/courseVisibility";
import { buildProjectCapabilityModel } from "../capability/projectCapability";
import { useRoutePlanning } from "../capability/useRoutePlanning";
import type { CoursePeerPresence } from "./courseSocial";
import type { CourseAssignment, CourseSkillTreeNode } from "../types";
import {
  buildCapabilitySceneLayout,
  buildImmersiveCourseLayout,
  flattenCapabilityLayout,
  layoutVerticalRouteFlow,
  loadImmersiveCourseLayout,
  routeNodePoints,
  type ImmersiveCapabilityLayout,
  type ImmersiveCourseLayout,
  type ImmersiveKnowledgeNode,
  type VerticalRouteStep
} from "./immersiveLayout";
import {
  CourseImmersiveStage,
  type CourseImmersiveStageHandle,
  type SemanticZoom,
  type StageBeam,
  type StageChapter,
  type StageEdge,
  type StageNode
} from "./CourseImmersiveStage";
import { clearCourseOrigin, courseTransitionCss, readCourseOrigin } from "./courseTransition";
import { learnerLabel, learnerStageStatus, summarizeLearnerState, type LearnerNodeState } from "./learnerStateProjection";
import "./immersive.css";

type Presentation = "skill" | "practice" | "route" | "capability";
type Pose = "front" | "rotated" | "flat";

function learnerTone(state: LearnerNodeState | undefined) {
  if (state?.category === "acquired") return "acquired";
  if (state?.category === "learning") return "brand";
  return "quiet";
}

function selectedPathFocus(search: string) {
  const params = new URLSearchParams(search);
  const focus = params.get("focus");
  if (!focus) return null;
  return focus.replace(/^(?:knowledge|chapter):/, "");
}

function orderCourseNodes(nodes: readonly CourseSkillTreeNode[]) {
  return [...nodes].sort((left, right) => left.primaryCoverage.lessonOrder - right.primaryCoverage.lessonOrder || left.primaryCoverage.order - right.primaryCoverage.order || left.id.localeCompare(right.id));
}

export default function CourseImmersivePage({ session, microLearningProvider }: { session: MockSession | null; onLogout: () => void; microLearningProvider?: MicroLearningProvider }) {
  const { courseId = "", chapterId: routeChapterId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const reducedMotion = Boolean(useReducedMotion());
  const authenticated = Boolean(session);
  const storedRuntime = applicationServices.courseRepository.getCourse(courseId);
  const runtime = storedRuntime && isCourseVisibleToViewer(storedRuntime.course, session?.userId, canDesignCourse(session)) ? storedRuntime : null;
  const [knowledgeRevision, setKnowledgeRevision] = useState(0);
  useEffect(() => applicationServices.userKnowledgeRepository.subscribe(() => setKnowledgeRevision((value) => value + 1)), []);
  const learnerKnowledge = useMemo(() => session ? applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId) : [], [session, knowledgeRevision]);
  const userCourseState = useOptionalUserCourseState(session?.userId, courseId);
  const baseKnowledgeGraph = useMemo(() => applicationServices.knowledgeRepository.getVisibleGraph(session ? userKnowledgeAccess(session.userId) : globalKnowledgeAccess), [session, knowledgeRevision]);
  const graphData = useMemo(() => {
    if (!runtime) return null;
    try { return buildCourseGraphData(runtime, userCourseState, baseKnowledgeGraph, learnerKnowledge); } catch { return null; }
  }, [baseKnowledgeGraph, learnerKnowledge, runtime, userCourseState]);
  const [courseLayout, setCourseLayout] = useState<ImmersiveCourseLayout | null>(null);
  const [layoutError, setLayoutError] = useState("");
  useEffect(() => {
    if (!graphData) { setCourseLayout(null); return; }
    let live = true;
    setLayoutError("");
    void loadImmersiveCourseLayout(graphData)
      .then((tree) => { if (live) setCourseLayout(buildImmersiveCourseLayout(graphData, tree)); })
      .catch((error) => { if (live) setLayoutError(error instanceof Error ? error.message : "课程结构布局失败"); });
    return () => { live = false; };
  }, [graphData]);
  const knowledgeKey = `${session?.userId ?? "anonymous"}:` + JSON.stringify(learnerKnowledge.map((record) => [record.nodeId, record.status, record.updatedAt]).sort());
  const routeControl = useRoutePlanning(courseId, authenticated, knowledgeKey);
  const capabilityModel = useMemo(() => {
    if (!runtime) return null;
    try { return buildProjectCapabilityModel(baseKnowledgeGraph, runtime, learnerKnowledge); } catch { return null; }
  }, [baseKnowledgeGraph, learnerKnowledge, runtime]);
  const capabilityLayout = useMemo(() => courseLayout && capabilityModel ? buildCapabilitySceneLayout(courseLayout, capabilityModel) : null, [capabilityModel, courseLayout]);
  const masteredNodeIds = useMemo(() => learnerKnowledge.filter((record) => record.status === "mastered").map((record) => record.nodeId), [learnerKnowledge]);
  const flattenedLayout = useMemo(() => capabilityLayout && capabilityModel
    ? flattenCapabilityLayout(capabilityLayout, capabilityModel, { acquiredNodeIds: masteredNodeIds })
    : null, [capabilityLayout, capabilityModel, masteredNodeIds]);
  const courseFitBounds = useMemo(() => {
    const knowledge = courseLayout?.nodes.filter((node): node is ImmersiveKnowledgeNode => node.kind === "knowledge") ?? [];
    if (!knowledge.length) return undefined;
    return {
      x: Math.max(360, ...knowledge.flatMap((node) => [Math.abs(node.x - node.width / 2), Math.abs(node.x + node.width / 2)])),
      y: Math.max(260, ...knowledge.flatMap((node) => [Math.abs(node.y - node.height / 2), Math.abs(node.y + node.height / 2)]))
    };
  }, [courseLayout]);

  const [presentation, setPresentation] = useState<Presentation>("skill");
  const [pose, setPose] = useState<Pose>("front");
  const [zoom, setZoom] = useState<SemanticZoom>("mid");
  const [zoomPercent, setZoomPercent] = useState(100);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<StageNode["kind"] | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [coLearners, setCoLearners] = useState<readonly CoursePeerPresence[]>([]);
  const [routePanelOpen, setRoutePanelOpen] = useState(false);
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [perf, setPerf] = useState<{ fps: number; nodes: number; dom: number } | null>(null);
  const stageRef = useRef<CourseImmersiveStageHandle>(null);
  const autoSelectedRef = useRef(false);
  const origin = useMemo(() => readCourseOrigin(courseId), [courseId]);
  const [entering, setEntering] = useState(Boolean(origin) && !reducedMotion);
  const [leaving, setLeaving] = useState(false);
  const [leavingStyle, setLeavingStyle] = useState<ReturnType<typeof courseTransitionCss>>(null);
  const perfEnabled = useMemo(() => new URLSearchParams(location.search).get("perf") === "1", [location.search]);

  const authenticatedView = Boolean(session);
  if (import.meta.env.DEV) (window as unknown as { __efRouteControl?: unknown }).__efRouteControl = routeControl;
  const courseChapters = graphData?.chapters ?? [];
  const courseNodes = graphData?.knowledgeNodes ?? [];
  const learnerState = useMemo(() => summarizeLearnerState(learnerKnowledge, courseNodes.map((node) => node.id)), [courseNodes, learnerKnowledge]);
  const learnerById = useMemo(() => new Map(learnerState.nodes.map((node) => [node.nodeId, node])), [learnerState.nodes]);
  const learnerFor = useCallback((id: string): LearnerNodeState => learnerById.get(id) ?? { nodeId: id, status: null, category: "pending", label: "待学", current: false }, [learnerById]);
  const displayNodes = useMemo(() => courseNodes.map((node) => {
    const learner = learnerFor(node.id);
    if (authenticatedView) {
      return { ...node, learner, displayStatus: learnerStageStatus(learner.category), displayLabel: learner.label };
    }
    const reachable = node.status !== "locked";
    return { ...node, learner, displayStatus: reachable ? "available" : "locked", displayLabel: reachable ? "可学" : "未解锁" };
  }), [authenticatedView, courseNodes, learnerFor]);
  const knowledgeTitleById = useMemo(() => new Map(baseKnowledgeGraph.nodes.map((node) => [node.id, node.title])), [baseKnowledgeGraph]);
  const completedCount = learnerState.counts.acquired;
  const progress = learnerState.counts.total ? Math.round((completedCount / learnerState.counts.total) * 100) : 0;
  const assignmentCount = runtime?.assignments.length ?? 0;
  const focusKnowledgeForZoom = useMemo(() => displayNodes.find((node) => node.id === selectedId)
    ?? displayNodes.find((node) => node.learner.current)
    ?? displayNodes.find((node) => node.learner.category === "learning")
    ?? displayNodes.find((node) => node.learner.category === "pending")
    ?? displayNodes[0], [displayNodes, selectedId]);
  const nearChapterPair = useMemo(() => {
    const chapters = courseLayout?.chapters ?? [];
    if (!focusKnowledgeForZoom) return [];
    const index = Math.max(0, chapters.findIndex((chapter) => chapter.id === focusKnowledgeForZoom.chapterId));
    return chapters.slice(index, Math.min(chapters.length, index + 2));
  }, [courseLayout, focusKnowledgeForZoom]);
  const nearChapterIds = useMemo(() => new Set(nearChapterPair.map((chapter) => chapter.id)), [nearChapterPair]);
  const nearCenterY = useMemo(() => nearChapterPair.length
    ? nearChapterPair.reduce((sum, chapter) => sum + chapter.y, 0) / nearChapterPair.length
    : 0, [nearChapterPair]);
  const nearCenterX = useMemo(() => nearChapterPair.length
    ? nearChapterPair.reduce((sum, chapter) => sum + chapter.x, 0) / nearChapterPair.length
    : 0, [nearChapterPair]);
  const nearSpread = 1.45;
  const nearActive = zoom === "near" && presentation !== "route" && presentation !== "capability";
  const projectNear = useCallback((point: { x: number; y: number; z?: number }) => (nearActive
    ? { x: point.x - nearCenterX, y: nearCenterY + (point.y - nearCenterY) * nearSpread, z: point.z ?? 0 }
    : { x: point.x, y: point.y, z: point.z ?? 0 }), [nearActive, nearCenterX, nearCenterY]);
  if (import.meta.env.DEV) (window as unknown as { __efNear?: unknown }).__efNear = { nearActive, nearCenterX, nearCenterY, selectedId, pair: nearChapterPair.map((chapter) => [chapter.id, chapter.x, chapter.y]) };

  useEffect(() => {
    if (origin && !reducedMotion) {
      setEntering(true);
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setEntering(false)));
      clearCourseOrigin(courseId);
      return () => cancelAnimationFrame(frame);
    }
    if (origin) clearCourseOrigin(courseId);
    setEntering(false);
  }, [courseId, origin, reducedMotion]);

  useEffect(() => {
    if (!graphData) return;
    const requested = selectedPathFocus(location.search);
    if (requested) {
      const node = graphData.knowledgeNodes.find((item) => item.id === requested);
      const chapter = graphData.chapters.find((item) => item.id === requested);
      if (node) { setSelectedId(node.id); setSelectedKind("knowledge"); return; }
      if (chapter) { setSelectedId(chapter.id); setSelectedKind("chapter"); return; }
    }
    if (routeChapterId) {
      const chapter = graphData.chapters.find((item) => item.id === routeChapterId);
      if (chapter) { setSelectedId(chapter.id); setSelectedKind("chapter"); return; }
    }
    if (!autoSelectedRef.current) {
      autoSelectedRef.current = true;
      const current = learnerState.counts.currentId
        ? graphData.knowledgeNodes.find((node) => node.id === learnerState.counts.currentId)
        : graphData.knowledgeNodes.find((node) => learnerFor(node.id).category === "learning") ?? graphData.knowledgeNodes.find((node) => learnerFor(node.id).category === "pending");
      if (current) { setSelectedId(current.id); setSelectedKind("knowledge"); }
    }
  }, [graphData, learnerFor, learnerState.counts.currentId, location.search, routeChapterId]);

  const impactRequested = useRef(false);
  const impactModeRef = useRef("");
  const routeControlRef = useRef(routeControl);
  routeControlRef.current = routeControl;
  useEffect(() => {
    if (!session) return;
    const params = new URLSearchParams(location.search);
    const mode = params.get("view") === "project" || params.has("routeImpact") ? `${location.search}` : "";
    if (!mode || impactModeRef.current === mode) return;
    impactModeRef.current = mode;
    setPresentation("capability");
    setPose(params.has("routeImpact") ? "rotated" : "front");
  }, [location.search, session]);
  useEffect(() => {
    if (!session || impactRequested.current) return;
    const params = new URLSearchParams(location.search);
    if (!params.has("routeImpact") || !routeControl.view?.activeVersion || routeControl.busy) return;
    impactRequested.current = true;
    void routeControlRef.current.previewImpact();
  }, [location.search, routeControl.busy, routeControl.view?.activeVersion, session]);

  useEffect(() => {
    if (selectedKind !== "knowledge" || !selectedId || !session) { setCoLearners([]); return; }
    const chapter = courseChapters.find((item) => item.id === courseNodes.find((node) => node.id === selectedId)?.chapterId);
    if (!chapter) { setCoLearners([]); return; }
    let live = true;
    const repository = applicationServices.preview?.courseSocialRepository;
    if (!repository) { setCoLearners([]); return; }
    void repository.listCoLearners({ courseId, sectionTitle: chapter.title }).then((people) => { if (live) setCoLearners(people); }).catch(() => { if (live) setCoLearners([]); });
    return () => { live = false; };
  }, [courseChapters, courseId, courseNodes, selectedId, selectedKind, session]);

  useEffect(() => {
    function keyboard(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable=true]")) return;
      const key = event.key.toLowerCase();
      if (key === "1") { setPresentation("skill"); setPose("front"); }
      else if (key === "2") { setPresentation("practice"); setPose("front"); }
      else if (key === "3") { setRoutePanelOpen(true); setPresentation("route"); setPose("front"); }
      else if (key === "c") { if (capabilityLayout) { setPresentation("capability"); setPose("front"); setEditPanelOpen(false); } }
      else if (key === "f") { if (capabilityLayout && authenticated && routeControl.view?.activeVersion) { enterFlatten(); } }
      else if (key === "r") { setPose((value) => value === "rotated" ? "front" : "rotated"); }
      else if (key === "0") { stageRef.current?.resetPose(); setPose("front"); }
      else if (key === "+" || key === "=") { stageRef.current?.zoomIn(); }
      else if (key === "-") { stageRef.current?.zoomOut(); }
      else if (key === "escape") {
        if (listOpen) setListOpen(false);
        else if (selectedId) setSelectedId(null);
        else void exitScene();
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  });

  function enterFlatten() {
    if (!authenticated || !capabilityLayout) return;
    setPresentation("capability");
    setPose("flat");
    setEditPanelOpen(true);
    setRoutePanelOpen(false);
    setSelectedId(null);
    if (!routeControl.editing) routeControl.begin();
  }

  function leaveFlatten() {
    if (routeControl.editing) {
      if (routeControl.dirty && !window.confirm("放弃尚未采用的路线调整？正式路线不会改变。")) return;
      routeControl.discardDraft();
    }
    setEditPanelOpen(false);
    setPose("front");
  }

  function selectNode(id: string, kind: StageNode["kind"]) {
    setSelectedId(id);
    setSelectedKind(kind === "assignment" ? "assignment" : kind === "capability" ? "capability" : kind === "chapter" || kind === "route-chapter" ? "chapter" : "knowledge");
  }

  function openLogin() {
    navigate("/login", { state: authGateState(location) });
  }

  async function launchMicro(node: CourseSkillTreeNode) {
    if (!session) { openLogin(); return; }
    if (!runtime || node.status === "locked" || !microLearningProvider?.getLesson(node.id, { courseId: runtime.course.id })) return;
    const target = createMicroLearningNavigation(node.id, { courseId: runtime.course.id, returnTo: `${location.pathname}${location.search}` });
    navigate(target.to, { state: target.state });
  }

  async function launchAssignment(assignment: CourseAssignment) {
    if (!session) { openLogin(); return; }
    if (!runtime) return;
    navigate(`/courses/${runtime.course.id}/assignments/${assignment.id}`);
  }

  async function launchMaterial(materialId: string, node: CourseSkillTreeNode) {
    if (!session) { openLogin(); return; }
    if (!runtime) return;
    const segmentId = node.materialContexts.find((context) => context.materialId === materialId)?.primarySegmentId ?? userCourseState?.materialStates[materialId]?.recentSegmentId;
    if (node.status !== "locked") {
      await applicationServices.learnerStateService.startMaterial(runtime.course.id, materialId, node.id);
      await refreshLearnerState(session.userId);
    }
    navigate(buildMaterialDeepLink({ courseId: runtime.course.id, materialId, segmentId }));
  }

  async function exitScene(pointer?: { x: number; y: number }) {
    if (leaving) return;
    setLeaving(true);
    const target = origin ?? (pointer ? { left: pointer.x - 80, top: pointer.y - 40, width: 160, height: 80 } : null);
    if (!reducedMotion) {
      setLeavingStyle(courseTransitionCss(target));
      await new Promise((resolve) => window.setTimeout(resolve, 600));
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    }
    if (window.history.length > 1) navigate(-1);
    else navigate("/archive");
  }

  // Presentation-only projections of the one ELK layout.
  const currentKnowledge = selectedId ? displayNodes.find((node) => node.id === selectedId) ?? null : null;
  const currentAssignment = selectedId && runtime ? runtime.assignments.find((assignment) => assignment.id === selectedId) ?? null : null;
  const currentChapter = selectedId ? courseChapters.find((chapter) => chapter.id === selectedId) ?? null : null;
  const selectedLayoutKnowledge = selectedId ? courseLayout?.nodes.find((node): node is ImmersiveKnowledgeNode => node.kind === "knowledge" && node.id === selectedId) ?? null : null;
  const currentCapability = selectedId ? capabilityLayout?.nodes.find((node) => node.id === selectedId) ?? null : null;

  const baseStageChapters: StageChapter[] = useMemo(() => {
    if (!courseLayout) return [];
    if (presentation === "capability" && editPanelOpen) return [];
    return courseLayout.chapters
      .filter((chapter) => !nearActive || nearChapterIds.has(chapter.id))
      .map((chapter) => {
        const chapterNodes = displayNodes.filter((node) => node.chapterId === chapter.id);
        const acquired = chapterNodes.filter((node) => node.learner.category === "acquired").length;
        return {
          ...chapter,
          x: projectNear(chapter).x,
          y: projectNear(chapter).y,
          height: nearActive ? chapter.height * nearSpread : chapter.height,
          meta: presentation === "practice" ? `${chapter.assignmentCount} 个实训` : authenticatedView ? `${acquired}/${chapterNodes.length} 已学` : `${chapterNodes.length} 个知识`
        };
      });
  }, [authenticatedView, courseLayout, displayNodes, editPanelOpen, nearActive, nearChapterIds, nearSpread, presentation, projectNear]);

  const routeProjection = useMemo(() => {
    if (!graphData) return { nodes: [] as StageNode[], beams: [] as StageBeam[], chapters: [] as StageChapter[], allIds: [] as string[], titles: {} as Record<string, string>, usingActiveRoute: false };
    const active = routeControl.view?.activeVersion;
    const usingActiveRoute = Boolean(active && active.snapshot.valid && active.snapshot.orderedNodeIds.length);
    const ordered = active?.snapshot.orderedNodeIds?.length
      ? active.snapshot.orderedNodeIds
      : orderCourseNodes(graphData.knowledgeNodes).map((node) => node.id);
    const titles = active?.snapshot.titles ?? {};
    const currentIndex = learnerState.counts.currentId ? ordered.indexOf(learnerState.counts.currentId) : -1;
    const start = Math.max(0, Math.min(ordered.length - 8, currentIndex >= 0 ? currentIndex - 2 : 0));
    const visibleIds = ordered.slice(start, start + 8);
    const chapterById = new Map(graphData.chapters.map((chapter) => [chapter.id, chapter]));
    const steps: VerticalRouteStep[] = visibleIds.map((id) => {
      const knowledge = graphData.knowledgeNodes.find((node) => node.id === id);
      const chapter = chapterById.get(knowledge?.chapterId ?? "supplemental");
      return {
        id,
        chapterId: chapter?.id ?? "supplemental",
        chapterTitle: chapter?.title ?? "补充前置能力",
        chapterNumber: chapter?.displayNumber ?? 0
      };
    });
    const flow = layoutVerticalRouteFlow(steps, 920);
    const headerNodes: StageNode[] = flow.headers.map((header) => {
      const chapter = chapterById.get(header.chapterId);
      const nodesInChapter = graphData.knowledgeNodes.filter((node) => node.chapterId === header.chapterId);
      const learned = nodesInChapter.filter((node) => learnerById.get(node.id)?.category === "acquired").length;
      return {
        id: header.id,
        kind: "route-chapter",
        title: header.title,
        chapterId: header.chapterId,
        x: header.x,
        y: header.y,
        z: 0,
        width: header.width,
        height: header.height,
        meta: `${header.stepCount} 步`,
        detail: chapter ? `${learned}/${nodesInChapter.length} 已学 · ${header.stepCount} 步` : "课程外"
      } satisfies StageNode;
    });
    const nodes: StageNode[] = visibleIds.map((id, windowIndex) => {
      const knowledge = graphData.knowledgeNodes.find((node) => node.id === id);
      const position = flow.positions.get(id) ?? { x: 0, y: 0 };
      const learner = learnerById.get(id);
      const state = authenticatedView ? learnerStageStatus(learner?.category ?? "pending") : "available";
      const label = authenticatedView ? learner?.label ?? learnerLabel("pending") : "可学";
      const index = start + windowIndex;
      const micro = microLearningProvider?.getLesson(id, { courseId });
      const practice = knowledge?.assignmentCount ?? 0;
      const material = knowledge?.materialContexts[0];
      const detail = knowledge
        ? [micro ? `微学习 · ${micro.estimatedMinutes ?? 8} 分钟` : null, material ? "资料" : null, practice ? `实践 ${practice}` : null].filter(Boolean).join(" · ")
        : "补充前置能力";
      return {
        id,
        kind: "route",
        title: knowledge?.title ?? titles[id] ?? id,
        x: position.x,
        y: position.y,
        z: 0,
        width: 300,
        height: 54,
        index: index + 1,
        status: state,
        current: authenticatedView && id === learnerState.counts.currentId && usingActiveRoute,
        meta: usingActiveRoute ? `${label} · 第 ${index + 1} 步` : `${label} · 课程顺序`,
        detail
      };
    });
    const points = nodes.map((node) => ({ x: node.x, y: node.y, z: 4 }));
    return {
      nodes: [...headerNodes, ...nodes],
      chapters: [] as StageChapter[],
      allIds: ordered,
      titles,
      usingActiveRoute,
      beams: points.length > 1 ? [{ id: "route-current", kind: "current" as const, points }] : []
    };
  }, [authenticatedView, courseId, graphData, learnerById, learnerState.counts.currentId, microLearningProvider, routeControl.view?.activeVersion]);

  const capabilityScene = useMemo(() => {
    if (!capabilityLayout) return null;
    const flattened = editPanelOpen && flattenedLayout ? flattenedLayout : capabilityLayout;
    const flat = editPanelOpen || pose === "flat";
    const columnByNode = new Map((flattened.columns ?? []).flatMap((column) => column.nodeIds.map((id) => [id, column.kind] as const)));
    const readiness = new Set(capabilityModel?.currentKnowledgeIds ?? []);
    const nodes: StageNode[] = flattened.nodes.map((node) => {
      const column = flat ? columnByNode.get(node.id) : undefined;
      const learner = learnerById.get(node.id);
      const meta = column === "acquired" ? "已获得 · 路径起点"
        : column === "target" ? "课程目标"
        : column === "intermediate" ? (readiness.has(node.id) ? "已具备 · 中间能力" : "中间能力")
        : column === "far" ? (readiness.has(node.id) ? "已具备 · 更远支撑" : "更远支撑")
        : node.bridge ? "课程外支撑能力" : node.current ? "已获得 · 路径起点" : node.course ? "课程目标" : "中间能力";
      const detail = column === "far" ? "更远的事实依赖"
        : column === "target" ? "尚未获得 · 路线目标"
        : column === "acquired" ? "已掌握"
        : column === "intermediate" ? (readiness.has(node.id) ? "已具备 · 待掌握" : "支撑路径")
        : node.bridge ? "位于课程知识后方" : node.current ? "已具备" : node.course ? "课程知识" : "支撑路径";
      return {
        id: node.id, kind: "capability", title: knowledgeTitleById.get(node.id) ?? node.title,
        x: node.x, y: node.y, z: node.z, width: node.width, height: node.height,
        status: authenticatedView ? learnerStageStatus(learner?.category ?? "pending") : "available",
        current: authenticatedView ? Boolean(learner?.current) : false,
        bridge: node.bridge, meta, detail
      };
    });
    const active = routeControl.view?.activeVersion;
    const preview = routeControl.preview?.valid ? routeControl.preview.route : null;
    const currentIds = active?.snapshot.orderedNodeIds ?? [];
    const beams: StageBeam[] = [];
    const courseIds = new Set(flattened.nodes.filter((node) => node.course).map((node) => node.id));
    const visibleInFront = !editPanelOpen && pose === "front";
    const currentSet = new Set(visibleInFront ? currentIds.filter((id) => courseIds.has(id)) : currentIds);
    if (flat) {
      // In the layered editor the route follows its factual edge segments in the
      // gaps between columns. A single centre-to-centre polyline would cut
      // through the nodes it passes.
      flattened.edges.filter((edge) => currentSet.has(edge.source) && currentSet.has(edge.target)).forEach((edge) => {
        beams.push({ id: `capability-current:${edge.id}`, kind: "current", points: edge.points });
      });
    } else {
      const currentPoints = routeNodePoints(flattened, [...currentSet]);
      if (currentPoints.length > 1) beams.push({ id: "capability-current", kind: "current", points: currentPoints });
    }
    if (preview) {
      const previewSet = new Set(visibleInFront ? preview.orderedNodeIds.filter((id) => courseIds.has(id)) : preview.orderedNodeIds);
      if (flat) {
        const currentEdgeIds = new Set(flattened.edges.filter((edge) => currentSet.has(edge.source) && currentSet.has(edge.target)).map((edge) => edge.id));
        const previewEdges = flattened.edges.filter((edge) => previewSet.has(edge.source) && previewSet.has(edge.target));
        const changedEdges = previewEdges.filter((edge) => !currentEdgeIds.has(edge.id));
        // New/changed relationships get the green band. A removal-only preview
        // still shows the surviving route so the band always follows real edge
        // segments instead of a single centre-to-centre polyline.
        (changedEdges.length ? changedEdges : previewEdges).forEach((edge) => {
          beams.push({ id: `capability-preview:${edge.id}`, kind: "preview", points: edge.points });
        });
      } else {
        const previewPoints = routeNodePoints(flattened, [...previewSet]);
        if (previewPoints.length > 1) beams.push({ id: "capability-preview", kind: "preview", points: previewPoints });
      }
    }
    const edges: StageEdge[] = flattened.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, points: edge.points }));
    const routeSet = new Set([...currentIds, ...(preview?.orderedNodeIds ?? [])]);
    if (editPanelOpen && flattened.columns?.length) {
      const minY = Math.min(...nodes.map((node) => node.y));
      flattened.columns.forEach((column) => {
        nodes.push({
          id: `flatten-column:${column.kind}`,
          kind: "route-chapter",
          title: column.label,
          x: column.x,
          y: minY - 64,
          z: 0,
          width: 156,
          height: 26,
          meta: `${column.count} 项能力`
        });
      });
    }
    return { layout: flattened, nodes, beams, edges, routeSet };
  }, [authenticatedView, capabilityLayout, capabilityModel?.currentKnowledgeIds, editPanelOpen, flattenedLayout, knowledgeTitleById, learnerById, pose, routeControl.preview, routeControl.view?.activeVersion]);

  const stageNodes = useMemo(() => {
    if (presentation === "route") return routeProjection.nodes;
    if ((presentation === "capability" || editPanelOpen) && capabilityScene) return capabilityScene.nodes;
    if (!courseLayout) return [] as StageNode[];
    // Practice mode renders the assignment layer; skill mode never mounts the
    // hidden assignment cards. This keeps the DOM overlay proportional to the
    // layer that is actually in front.
    const sourceNodes = presentation === "practice"
      ? courseLayout.nodes
      : courseLayout.nodes.filter((node) => node.kind === "knowledge");
    return sourceNodes
      .filter((node) => !nearActive || nearChapterIds.has(node.chapterId))
      .map((node) => {
        const projected = projectNear(node);
        if (node.kind === "knowledge") {
          const display = displayNodes.find((item) => item.id === node.id);
          const status = display?.displayStatus ?? (authenticatedView ? learnerStageStatus("pending") : "available");
          const micro = microLearningProvider?.getLesson(node.id, { courseId });
          const materialContext = node.node.materialContexts[0];
          const material = materialContext && runtime ? runtime.materials.find((item) => item.id === materialContext.materialId) : null;
          const segment = material && materialContext ? material.segments.find((item) => item.id === materialContext.primarySegmentId) : null;
          const firstAssignment = runtime?.assignments.find((assignment) => node.node.assignmentIds.includes(assignment.id));
          const practiceMinutes = firstAssignment?.estimatedMinutes;
          const practice = node.node.assignmentCount;
          const actions: ReactNode[] = [];
          if (micro) actions.push(<span key="micro">{status === "completed" ? "复习" : "微学习"} · {micro.estimatedMinutes ?? 8} 分钟</span>);
          if (material) actions.push(<span key="material">资料{segment?.page ? ` p.${String(segment.page).padStart(2, "0")}` : ""}</span>);
          if (practice) actions.push(<span key="practice">实践{practiceMinutes ? ` · ${practiceMinutes} 分钟` : ` · ${practice} 项`}</span>);
          return {
            id: node.id,
            kind: "knowledge",
            title: node.title,
            x: projected.x,
            y: projected.y,
            z: projected.z,
            width: node.width,
            height: node.height,
            status,
            current: authenticatedView && Boolean(display?.learner.current),
            meta: display?.displayLabel ?? learnerLabel("pending"),
            detail: actions.length ? <span className="ef-imm-actions">{actions}</span> : null
          } satisfies StageNode;
        }
        return {
          id: node.id,
          kind: "assignment",
          title: node.title,
          x: projected.x,
          y: projected.y,
          z: projected.z,
          width: node.width,
          height: node.height,
          status: node.status,
          meta: String(node.assignment.order + 1).padStart(2, "0"),
          tone: ((node.assignment.order % 3) + 1) as 1 | 2 | 3,
          chapterId: node.chapterId
        } satisfies StageNode;
      });
  }, [authenticatedView, capabilityScene, courseId, courseLayout, displayNodes, editPanelOpen, microLearningProvider, nearActive, nearChapterIds, presentation, projectNear, routeProjection.nodes, runtime]);
  const upstreamIds = useMemo(() => {
    const found = new Set<string>();
    if (!courseLayout || !selectedId) return found;
    const incoming = new Map<string, string[]>();
    courseLayout.edges.forEach((edge) => {
      if (edge.kind !== "knowledge") return;
      incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
    });
    const queue = [selectedId];
    found.add(selectedId);
    for (let index = 0; index < queue.length; index += 1) {
      for (const source of incoming.get(queue[index]) ?? []) {
        if (found.has(source)) continue;
        found.add(source);
        queue.push(source);
      }
    }
    return found;
  }, [courseLayout, selectedId]);

  const stageEdges: StageEdge[] = useMemo(() => {
    if (presentation === "route") return [];
    if ((presentation === "capability" || editPanelOpen) && capabilityScene) {
      if (presentation === "capability" && !editPanelOpen && pose === "front") {
        const courseIds = new Set(capabilityScene.layout.nodes.filter((node) => node.course).map((node) => node.id));
        return capabilityScene.edges.filter((edge) => Boolean(edge.source && edge.target && courseIds.has(edge.source) && courseIds.has(edge.target)));
      }
      return capabilityScene.edges;
    }
    if (!courseLayout) return [];
    return courseLayout.edges
      .filter((edge) => !nearActive || (nearChapterIds.has(edge.source) && nearChapterIds.has(edge.target)))
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        kind: edge.kind === "chapter" ? "chapter" : "plain",
        points: edge.points.map(projectNear),
        highlighted: edge.kind === "knowledge" && (upstreamIds.has(edge.source) && upstreamIds.has(edge.target) || edge.source === selectedId || edge.target === selectedId)
      }));
  }, [capabilityScene, courseLayout, editPanelOpen, nearActive, nearChapterIds, pose, presentation, projectNear, selectedId, upstreamIds]);

  const selectedStageKnowledge = currentKnowledge;
  const selectedCapabilityState = currentCapability ? learnerById.get(currentCapability.id) : undefined;
  const selectedLearner = selectedStageKnowledge?.learner ?? selectedCapabilityState;
  const selectedLabel = currentChapter ? `${currentChapter.lessonCount} 课` : currentAssignment ? "实训" : authenticatedView ? selectedLearner?.label ?? learnerLabel("pending") : "可学";
  const selectedTone = currentChapter ? "brand" : currentAssignment ? "quiet" : authenticatedView ? learnerTone(selectedLearner) : "target";
  const selectedNodeAssignments = selectedStageKnowledge && runtime ? selectedStageKnowledge.assignmentIds.flatMap((id) => runtime.assignments.find((assignment) => assignment.id === id) ?? []) : [];
  const selectedMaterials = selectedStageKnowledge && runtime ? selectedStageKnowledge.materialIds.flatMap((id) => runtime.materials.find((material) => material.id === id) ?? []) : [];
  const selectedMicro = selectedStageKnowledge ? microLearningProvider?.getLesson(selectedStageKnowledge.id, { courseId }) : null;

  const selectedCard = selectedId ? (
    <ObjectShell
      size="s"
      className="ef-imm-object"
      icon={<Network size={15} />}
      kicker={selectedKind === "chapter" ? "课程篇章" : selectedKind === "assignment" || currentAssignment ? "课程实训" : "知识节点"}
      title={currentChapter?.title ?? currentAssignment?.title ?? currentCapability?.title ?? selectedStageKnowledge?.title ?? currentKnowledge?.title ?? "课程结构"}
      badge={<Pill tone={selectedTone}>{selectedLabel}{selectedLearner?.current && authenticatedView ? " · 当前" : ""}</Pill>}
      context={<span>{selectedStageKnowledge ? `第 ${selectedStageKnowledge.lesson} 课 · ${courseChapters.find((chapter) => chapter.id === selectedStageKnowledge.chapterId)?.title ?? ""}` : currentChapter ? `第 ${currentChapter.displayNumber} 章 · ${displayNodes.filter((node) => node.chapterId === currentChapter.id).length} 个知识` : currentAssignment ? `${currentAssignment.estimatedMinutes ?? 30} 分钟 · 课程实践` : currentCapability?.bridge ? "支撑课程知识的深层能力" : currentCapability ? "项目能力模型" : ""}</span>}
      tools={<button type="button" className="ef-imm-card-close" onClick={() => setSelectedId(null)} aria-label="关闭节点卡片"><X size={15} /></button>}
      footer={
        <div className="ef-imm-card-foot">
          {!session ? <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={openLogin}><LogIn size={13} />登录后开始学习</button> : null}
          {session && selectedStageKnowledge && selectedMicro ? <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" disabled={selectedStageKnowledge.status === "locked"} onClick={() => void launchMicro(selectedStageKnowledge)}><Sparkles size={13} />开始微学习{selectedMicro.estimatedMinutes ? ` · ${selectedMicro.estimatedMinutes} 分钟` : ""}</button> : null}
          {session && selectedNodeAssignments[0] ? <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => void launchAssignment(selectedNodeAssignments[0])}><FileText size={13} />实践</button> : null}
          {session && selectedMaterials[0] && selectedStageKnowledge ? <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => void launchMaterial(selectedMaterials[0].id, selectedStageKnowledge)}><BookOpen size={13} />资料</button> : null}
          {currentChapter ? <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => setSelectedId(null)}>关闭</button> : null}
        </div>
      }
    >
      {!session ? <div className="ef-imm-guest-note"><Lock size={13} /><span>公开课程结构只读。登录后记录你的学习进度与路线。</span></div> : null}
      {selectedStageKnowledge ? <>
        <div className="ef-imm-card-facts">
          <span><b>{selectedStageKnowledge.assignmentCount}</b> 项实践</span>
          <span><b>{selectedStageKnowledge.materialContexts.length}</b> 份资料</span>
          <span><b>{selectedStageKnowledge.knowledgeProgress}%</b> 掌握</span>
        </div>
        {coLearners.length ? <div className="ef-imm-social"><div><span className="ef-imm-social-avatars">{coLearners.slice(0, 3).map((person) => <i key={person.id} title={person.displayName} />)}</span><span>{coLearners.length} 位关注的人也在这一节</span></div><PreviewBadge /></div> : null}
      </> : null}
      {currentChapter ? <>
        <div className="ef-imm-card-progress"><span>学习进度</span><strong>{currentChapter.knowledgeProgress}%</strong><i><b style={{ width: `${currentChapter.knowledgeProgress}%` }} /></i></div>
        <p className="ef-imm-card-copy">{currentChapter.description}</p>
        <div className="ef-imm-card-facts"><span><b>{currentChapter.lessonCount}</b> 课</span><span><b>{displayNodes.filter((node) => node.chapterId === currentChapter.id).length}</b> 知识</span><span><b>{currentChapter.assignmentSummary.assignmentCount}</b> 实训</span></div>
      </> : null}
      {currentAssignment ? <>
        <p className="ef-imm-card-copy">{currentAssignment.description}</p>
        <div className="ef-imm-card-facts"><span><b>{currentAssignment.estimatedMinutes ?? 30}</b> 分钟</span><span><b>{currentAssignment.mode}</b> 执行</span><span><b>{currentAssignment.acceptanceCriteria.length}</b> 验收</span></div>
      </> : null}
      {currentCapability?.bridge ? <p className="ef-imm-card-copy">该能力不在课程本身中，它是课程知识的事实前置。正面视角隐藏，旋转后出现在更深的平面。</p> : null}
    </ObjectShell>
  ) : null;

  // Presentation frame changes (capability, flat editor, route) always start
  // from the fitted frame; skill/practice shadow swaps and semantic zoom keep it.
  const fitFrame = presentation === "route" ? "route" : editPanelOpen ? "flat" : presentation === "capability" ? "capability" : "course";
  useEffect(() => {
    if (!courseLayout) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => stageRef.current?.fit()); });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
  }, [courseLayout?.revision, fitFrame]);

  if (!runtime || !graphData) {
    return <main className="ef-imm-page ef-imm-empty"><PlanningMessage title="课程不存在" copy={`没有找到课程 “${courseId}”，或该课程没有公开的学习结构。`} onBack={() => navigate("/archive")} /></main>;
  }
  if (layoutError) {
    return <main className="ef-imm-page ef-imm-empty"><PlanningMessage title="课程结构加载失败" copy={layoutError} onBack={() => navigate("/archive")} /></main>;
  }

  const currentPose: Pose = editPanelOpen ? "flat" : pose;
  const sceneMode: "course" | "capability" | "flat" | "route" = presentation === "route" ? "route" : editPanelOpen ? "flat" : presentation === "capability" ? "capability" : "course";
  const activeRoute = routeControl.view?.activeVersion ?? null;
  const nearKnowledgeCount = nearChapterPair.reduce((count, chapter) => count + displayNodes.filter((node) => node.chapterId === chapter.id).length, 0);
  const scopePill = presentation === "route"
    ? { title: "个人路线", meta: `${activeRoute?.snapshot.valid ? `V${activeRoute.versionNumber} · ` : ""}${routeProjection.allIds.length} 步` }
    : presentation === "practice"
      ? { title: "实训树", meta: nearActive && nearChapterPair.length ? `${nearChapterPair.map((chapter) => `第 ${chapter.displayNumber} 章`).join(" · ")} · ${assignmentCount} 个实训` : `${assignmentCount} 个实训 · ${courseChapters.length} 章` }
      : nearActive && nearChapterPair.length
        ? { title: nearChapterPair.length > 1 ? `第 ${nearChapterPair[0].displayNumber}–${nearChapterPair[nearChapterPair.length - 1].displayNumber} 章` : `第 ${nearChapterPair[0].displayNumber} 章`, meta: `${nearKnowledgeCount} 个知识` }
        : { title: "课程全景", meta: `${courseChapters.length} 章 · ${courseNodes.length} 个知识` };
  const centerSelection = selectedStageKnowledge ? { knowledgeId: selectedStageKnowledge.id } : selectedId ? { knowledgeId: selectedId } : {};
  const preview = routeControl.preview?.valid ? routeControl.preview : null;
  const diff = activeRoute && preview?.valid ? routeDiff(activeRoute.snapshot, preview.route) : null;

  return (
    <main className={`ef-imm-page ${entering ? "is-entering" : ""} ${leaving ? "is-leaving" : ""}`} data-presentation={presentation} data-pose={currentPose}>
      <div className="ef-imm-transition" style={leaving ? leavingStyle ?? undefined : entering ? courseTransitionCss(origin) ?? undefined : { opacity: 0, transform: "translate(0, 0) scale(1)" }} aria-hidden="true" />
      <header className="ef-imm-top">
        <div className="ef-imm-top-left">
          <button type="button" className="ef-imm-icon-btn" onClick={() => void exitScene()} aria-label="返回上一页"><ArrowLeft size={18} /></button>
          <span className="ef-imm-crumb"><span>课程</span><b>{runtime.course.title}</b></span>
          {!session ? <span className="ef-imm-public-pill"><Lock size={12} />公开课程 · {courseChapters.length} 章 · {courseNodes.length} 个知识</span> : <span className="ef-imm-progress-pill"><b>{progress}%</b><i><b style={{ width: `${progress}%` }} /></i><span>已学 {completedCount} / {courseNodes.length}</span></span>}
        </div>
        <nav className="ef-imm-segmented" aria-label="课程视角" role="tablist">
          {([["skill", "技能树"], ["practice", "实训树"], ["route", "路线"]] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={presentation === value && !editPanelOpen} className={presentation === value && !editPanelOpen ? "is-on" : ""} onClick={() => { setPresentation(value); setEditPanelOpen(false); setPose("front"); setSelectedId(value === "practice" && selectedStageKnowledge ? (selectedNodeAssignments[0]?.id ?? runtime?.assignmentCoverages.find((coverage) => coverage.nodeId === selectedStageKnowledge.id)?.assignmentId ?? null) : null); if (value === "route") setRoutePanelOpen(true); }}>{label}</button>)}
          {session ? <button type="button" role="tab" aria-selected={presentation === "capability"} className={presentation === "capability" ? "is-on" : ""} onClick={() => { if (!capabilityLayout) return; setPresentation("capability"); setEditPanelOpen(false); setPose("front"); setSelectedId(null); }}><Network size={13} />能力模型</button> : null}
        </nav>
        <div className="ef-imm-top-right">
          {!session ? <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={openLogin}><LogIn size={14} />登录</button> : null}
          <button type="button" className="ef-imm-exit" onClick={() => void exitScene()}><ArrowLeft size={14} />退出沉浸<span>Esc</span></button>
        </div>
      </header>

      {(presentation === "skill" || presentation === "practice" || presentation === "route") && !editPanelOpen && <div className="ef-imm-scope-pill"><Layers3 size={13} /><b>{scopePill.title}</b><span>{scopePill.meta}</span></div>}

      <div className={`ef-imm-stage-wrap ${routePanelOpen || editPanelOpen ? "has-panel" : ""}`}>
        <CourseImmersiveStage
          ref={stageRef}
          className="ef-imm-stage-main"
          nodes={stageNodes}
          chapters={presentation === "route" ? [] : baseStageChapters}
          edges={stageEdges}
          beams={presentation === "route" ? routeProjection.beams : (presentation === "capability" || editPanelOpen) ? capabilityScene?.beams ?? [] : []}
          mode={sceneMode}
          layer={presentation === "practice" ? "practice" : "skill"}
          pose={currentPose}
          selectedId={selectedId}
          reducedMotion={reducedMotion}
          onSelect={selectNode}
          onBackground={() => setSelectedId(null)}
          onPoseChange={(next) => { setPose(next === "flat" ? "flat" : next); }}
          onSemanticZoom={(next, percent) => { setZoom((current) => current === next ? current : next); setZoomPercent((current) => current === percent ? current : percent); }}
          onFps={(fps, nodeCount, domCount) => {
            const value = { fps, nodes: nodeCount, dom: domCount };
            setPerf(value);
            (window as unknown as { __eduflowP4Perf?: typeof value }).__eduflowP4Perf = value;
          }}
          selectedCard={selectedCard}
          fitKey={`${courseId}:${courseLayout?.revision ?? ""}:${sceneMode}:${editPanelOpen ? "edit" : "view"}:${routeControl.view?.activeVersion?.id ?? "no-route"}`}
          fitBounds={sceneMode === "course" ? courseFitBounds : undefined}
          aria-label={`${runtime.course.title} 三维课程场景`}
        />
        {session ? <div className="ef-imm-status-legend" role="group" aria-label={`课程学习状态图例：已学 ${learnerState.counts.acquired}，在学 ${learnerState.counts.learning}，待学 ${learnerState.counts.pending}，合计 ${learnerState.counts.total}；当前标记 ${learnerState.counts.current}，目标标记 ${learnerState.counts.target}，不计入合计`}>
          <span className="ef-imm-status-legend-states">
            <span><i className="is-learned" />已学 {learnerState.counts.acquired}</span>
            <span><i className="is-learning" />在学 {learnerState.counts.learning}</span>
            <span><i className="is-pending" />待学 {learnerState.counts.pending}</span>
            <span className="ef-imm-status-legend-total">合计 <b>{learnerState.counts.total}</b></span>
          </span>
          <span className="ef-imm-status-legend-markers" aria-label="不计入状态合计的呈现标记">
            <span title="当前学习节点标记，不计入状态合计"><i className="is-current" />当前 {learnerState.counts.current}</span>
            <span title="课程/路线目标维度，与状态可重叠，不计入状态合计"><i className="is-target" />目标 {learnerState.counts.target}</span>
            <small>标记不计入</small>
          </span>
        </div> : <div className="ef-imm-status-legend is-public" role="status"><Lock size={12} /><span>公开课程 · 可学 {courseNodes.length} · 登录后查看学习状态</span></div>}
        <div className="ef-imm-controls" role="group" aria-label="场景控制">
          <button type="button" onClick={() => stageRef.current?.zoomIn()} aria-label="放大场景"><Plus size={16} /></button>
          <button type="button" onClick={() => stageRef.current?.zoomOut()} aria-label="缩小场景"><Minus size={16} /></button>
          <button type="button" onClick={() => stageRef.current?.fit()} aria-label="适配全图"><Maximize2 size={16} /></button>
          <span>{zoomPercent}%</span>
          <button type="button" className={currentPose === "rotated" ? "is-on" : ""} onClick={() => { const next = currentPose === "rotated" ? "front" : "rotated"; setPose(next); stageRef.current?.setPose(next); }} aria-label="旋转场景" aria-pressed={currentPose === "rotated"}><RotateCcw size={16} /></button>
          {presentation === "capability" && !editPanelOpen ? <button type="button" onClick={enterFlatten} disabled={!authenticated || !activeRoute} aria-label="编辑路线"><Edit3 size={16} /></button> : null}
          {editPanelOpen ? <button type="button" onClick={leaveFlatten} aria-label="回到 3D"><RotateCcw size={16} /></button> : null}
        </div>
        <button type="button" className="ef-imm-list-toggle" onClick={() => setListOpen(true)} aria-expanded={listOpen}><List size={15} />结构列表</button>
      </div>

      {listOpen ? <aside className="ef-imm-structure-list" aria-label="课程结构列表">
        <header><div><span>替代视图</span><h2>课程结构</h2></div><button type="button" onClick={() => setListOpen(false)} aria-label="关闭结构列表"><X size={16} /></button></header>
        <div className="ef-imm-list-body">
          {courseChapters.map((chapter) => <section key={chapter.id}>
            <button type="button" className="ef-imm-list-chapter" onClick={() => selectNode(chapter.id, "chapter")}>第 {chapter.displayNumber} 章 · {chapter.title}<small>{displayNodes.filter((node) => node.chapterId === chapter.id).length} 个知识 · {chapter.assignmentSummary.assignmentCount} 项实践</small></button>
            <div>{displayNodes.filter((node) => node.chapterId === chapter.id).map((node) => <button type="button" key={node.id} onClick={() => selectNode(node.id, "knowledge")}><i className={`status-${node.displayStatus}`} />{node.title}<small>{node.displayLabel}</small></button>)}</div>
          </section>)}
          {presentation === "practice" || presentation === "route" ? <section><h3>实践</h3>{runtime.assignments.map((assignment) => <button type="button" key={assignment.id} onClick={() => selectNode(assignment.id, "assignment")}><FileText size={13} />{assignment.title}<small>{assignment.estimatedMinutes ?? 30} 分钟</small></button>)}</section> : null}
        </div>
      </aside> : null}

      {presentation === "route" && routePanelOpen ? <aside className="ef-imm-side-panel ef-imm-route-panel" aria-label="课程路线与调整预览">
        <header><div><span>个人路线</span><h2>{activeRoute && activeRoute.snapshot.valid ? `我的路线 V${activeRoute.versionNumber}` : "课程顺序"}</h2><p>{activeRoute && !activeRoute.snapshot.valid ? "正式路线暂无有效步骤 · 显示课程顺序" : `${routeProjection.nodes.filter((node) => node.kind === "route").length} 步 · ${diff ? "预览调整中" : "按执行顺序"}`}</p></div><button type="button" onClick={() => setRoutePanelOpen(false)} aria-label="关闭路线面板"><X size={16} /></button></header>
        {!session ? <div className="ef-imm-panel-note"><Lock size={14} />公开课程按课程顺序展示。登录后生成并保存你的个人路线版本。</div> : null}
        {session && activeRoute ? <div className="ef-imm-version-row"><Pill tone={activeRoute.snapshot.valid ? "brand" : "warn"}>V{activeRoute.versionNumber}{activeRoute.snapshot.valid ? "" : " · 待调整"}</Pill><span>{activeRoute.snapshot.valid ? `${activeRoute.snapshot.selectedNodeIds.length} 项能力 · ${activeRoute.snapshot.executionSteps?.length ?? 0} 个执行步骤` : "当前没有可执行能力；进入路线编辑后预览并采用"}</span></div> : null}
        <div className="ef-imm-route-steps">{routeProjection.nodes.filter((node) => node.kind === "route").slice(0, 14).map((node, index) => <button type="button" key={node.id} onClick={() => selectNode(node.id, "knowledge")} aria-current={node.current ? "step" : undefined}><b>{String(index + 1).padStart(2, "0")}</b><span>{node.title}<small>{node.meta}</small></span><ChevronRight size={13} /></button>)}</div>
        {session && diff ? <section className="ef-imm-preview-card">
          <PreviewBadge />
          <h3>调整预览 · 尚未采用</h3>
          <div className="ef-imm-preview-stats"><span><b>{preview?.route.orderedNodeIds.length ?? 0}</b>步骤</span><span><b>+{diff.addedNodeIds.length}</b>新增</span><span><b>−{diff.removedNodeIds.length}</b>移除</span></div>
          <ul>{diff.addedNodeIds.slice(0, 5).map((id) => <li key={id} className="is-added">+ {runtime.course.id === id ? id : (routeControl.view?.activeVersion?.snapshot.titles[id] ?? graphData.knowledgeNodes.find((node) => node.id === id)?.title ?? id)}</li>)}{diff.removedNodeIds.slice(0, 4).map((id) => <li key={id} className="is-removed">− {routeControl.view?.activeVersion?.snapshot.titles[id] ?? id}</li>)}</ul>
        </section> : null}
        {session && activeRoute ? <div className="ef-imm-panel-actions">
          <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" disabled={routeControl.busy} onClick={() => void routeControl.previewImpact()}>预览调整</button>
          <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" disabled={routeControl.busy || !preview?.valid || !preview.execution?.complete} onClick={() => void routeControl.adopt()}>采用预览</button>
          <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={enterFlatten}><Edit3 size={13} />进入路线编辑</button>
        </div> : null}
        {routeControl.error ? <p className="ef-imm-error" role="alert">{routeControl.error}</p> : null}
      </aside> : null}

      {editPanelOpen && capabilityScene ? <aside className="ef-imm-side-panel ef-imm-edit-panel" aria-label="路线编辑">
        <header><div><span>能力模型 · 编辑路线</span><h2>调整路线</h2><p>{routeControl.view?.activeVersion ? `基于 V${routeControl.view.activeVersion.versionNumber}` : "当前没有正式路线"}</p></div><button type="button" onClick={leaveFlatten} aria-label="关闭路线编辑"><X size={16} /></button></header>
        <div className="ef-imm-edit-tools">
          <button type="button" className={routeControl.tool === "include" ? "is-on" : ""} onClick={() => routeControl.setTool("include")} aria-pressed={routeControl.tool === "include"}>必须经过</button>
          <button type="button" className={routeControl.tool === "exclude" ? "is-on" : ""} onClick={() => routeControl.setTool("exclude")} aria-pressed={routeControl.tool === "exclude"}>不经过</button>
        </div>
        <section className="ef-imm-draft-constraints"><h3>约束</h3>
          {routeControl.draft.includeNodeIds.length ? <ul>{routeControl.draft.includeNodeIds.map((id) => <li key={id}>必须经过 · {capabilityScene.nodes.find((node) => node.id === id)?.title ?? id}<button type="button" aria-label={`移除必须经过 ${id}`} onClick={() => routeControl.removeNodeConstraint(id)}>×</button></li>)}</ul> : <p>尚未添加「必须经过」。</p>}
          {routeControl.draft.excludeNodeIds.length ? <ul>{routeControl.draft.excludeNodeIds.map((id) => <li key={id}>不经过 · {capabilityScene.nodes.find((node) => node.id === id)?.title ?? id}<button type="button" aria-label={`移除不经过 ${id}`} onClick={() => routeControl.removeNodeConstraint(id)}>×</button></li>)}</ul> : <p>尚未添加「不经过」。</p>}
        </section>
        {currentCapability ? <section className="ef-imm-node-inspector"><h3>{currentCapability.title}</h3><p>{currentCapability.bridge ? "课程外支撑能力" : currentCapability.current ? "已具备 · 可作为路线起点" : currentCapability.course ? "课程目标" : "中间能力"}</p><div><button type="button" disabled={routeControl.busy} onClick={() => routeControl.mark(currentCapability.id, "include")}>必须经过</button><button type="button" disabled={routeControl.busy} onClick={() => routeControl.mark(currentCapability.id, "exclude")}>不经过</button><button type="button" disabled={routeControl.busy} onClick={() => routeControl.undoNode(currentCapability.id)}>撤销</button></div></section> : <p className="ef-imm-panel-note">点击场景中的能力节点，选择「必须经过」或「不经过」。</p>}
        {diff ? <section className="ef-imm-preview-card"><PreviewBadge /><h3>预览变化</h3><div className="ef-imm-preview-stats"><span><b>+{diff.addedNodeIds.length}</b>新增</span><span><b>−{diff.removedNodeIds.length}</b>移除</span><span><b>+{diff.addedEdgeIds.length}</b>关系</span></div><ul>{diff.addedNodeIds.map((id) => <li key={id} className="is-added">+ {capabilityScene.nodes.find((node) => node.id === id)?.title ?? id}</li>)}{diff.removedNodeIds.map((id) => <li key={id} className="is-removed">− {capabilityScene.nodes.find((node) => node.id === id)?.title ?? id}</li>)}</ul></section> : null}
        {routeControl.preview && !routeControl.preview.valid ? <section className="ef-imm-preview-card is-conflict"><PreviewBadge /><h3>需要处理的结构冲突</h3><ul>{routeControl.preview.conflicts.slice(0, 5).map((conflict, index) => <li key={`${conflict.kind}:${index}`} className="is-removed">{conflict.rootNodeId ? `目标 ${capabilityScene.nodes.find((node) => node.id === conflict.rootNodeId)?.title ?? conflict.rootNodeId} ` : "知识前置"}：{conflict.kind === "target_without_acquired_path" ? "当前已具备能力没有通向它的路径" : conflict.kind === "include_exclude" ? "不能同时加入与排除" : conflict.kind === "excluded_hard_prerequisite" ? "必须前置被排除" : "关系不属于当前目标路径"}</li>)}</ul>{routeControl.preview.conflicts.some((conflict) => conflict.rootNodeId) ? <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => { const first = routeControl.preview?.valid ? null : routeControl.preview?.conflicts.find((conflict) => conflict.rootNodeId); if (first?.rootNodeId) routeControl.mark(first.rootNodeId, "exclude"); }}>排除第一个冲突目标</button> : null}</section> : null}
        {routeControl.preview?.valid && routeControl.preview.execution?.issues.length ? <section className="ef-imm-preview-card is-conflict"><h3>需要选择真实支撑路径</h3><p>预览发现已选能力之间缺少真实关系。常见于排除了某条支撑路径，或新目标只能经由尚未选中的真实关系到达；系统不会自动把推荐关系加进路线。请选择一条候选真实关系，或撤销对应的排除。</p><ul>{routeControl.preview.execution.issues.map((issue) => <li key={`${issue.kind}:${issue.nodeId ?? issue.edgeId}`} className="is-removed">{issue.reason}{issue.candidateEdgeIds?.length ? <button type="button" className="ef-imm-inline-btn" onClick={() => routeControl.chooseEdge(issue.candidateEdgeIds![0], true)}>选择支撑</button> : null}</li>)}</ul></section> : null}
        {routeControl.error ? <p className="ef-imm-error" role="alert">{routeControl.error}</p> : null}
        <footer className="ef-imm-panel-actions">
          <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" disabled={routeControl.busy} onClick={() => routeControl.replan()}>预览调整结果</button>
          <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" disabled={routeControl.busy || !preview?.valid || !preview.execution?.complete} onClick={() => void routeControl.adopt()}>采用新路线</button>
        </footer>
      </aside> : null}

      {perfEnabled && perf ? <div className="ef-imm-perf" role="status">FPS {perf.fps} · 场景 {perf.nodes} · DOM {perf.dom}</div> : null}

      {session ? <EduFlowAssistant className="ef-imm-assistant" context={{ ...coursePresentationContext({ courseId: runtime.course.id, presentation: presentation === "capability" ? "capability" : presentation === "route" ? "path" : "graph", design: false, routeVersionId: routeControl.view?.activeVersion?.id, graph: centerSelection, path: centerSelection, capability: centerSelection }), userRole: session.role, capabilities: session.capabilities }} contextLabel={runtime.course.title} drawerOpen={false} /> : null}
    </main>
  );
}

function PlanningMessage({ title, copy, onBack }: { title: string; copy: string; onBack(): void }) {
  return <section className="ef-imm-empty-card"><Target size={26} /><h1>{title}</h1><p>{copy}</p><button type="button" className="ef-ui-btn ef-ui-btn--primary" onClick={onBack}>返回档案 <ArrowRight size={14} /></button></section>;
}

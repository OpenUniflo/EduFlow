import {
  ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, Clock3, Edit3, FileText, Layers3,
  ListChecks, LocateFixed, Lock, LogIn, Network, Route, Sparkles, Target, X
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useReducedMotion } from "motion/react";
import { applicationServices, refreshLearnerState } from "@/app/services/applicationServices";
import { EduFlowAssistant } from "@/features/assistant/components/EduFlowAssistant";
import { authGateState } from "@/features/auth/authRedirect";
import type { MockSession } from "@/features/auth/types";
import { canDesignCourse } from "@/features/auth/capabilities";
import { coursePresentationContext } from "@/features/assistant/presentationContext";
import { useOptionalUserCourseState } from "@/features/learning/progress/progressService";
import { createMicroLearningNavigation, type MicroLearningProvider, type MicroLesson } from "@/features/learning/micro/microLearning";
import { buildMaterialDeepLink } from "@/features/material/materialNavigation";
import { globalKnowledgeAccess, userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { routeDiff } from "@/shared/learning/routeDiff";
import { SceneZoomToolbar } from "@/shared/scene/SceneZoomToolbar";
import { ObjectShell } from "@/shared/ui/ObjectShell";
import { Pill } from "@/shared/ui/Pill";
import { buildCourseGraphData } from "../runtime/courseRuntime";
import { isCourseVisibleToViewer } from "../runtime/courseVisibility";
import { buildProjectCapabilityModel } from "../capability/projectCapability";
import { useRoutePlanning } from "../capability/useRoutePlanning";
import { routeConflictCopy } from "../capability/routeConflictCopy";
import { evaluatorOptions } from "../practice/practiceModel";
import type { CourseAssignment, CourseSkillTreeNode, UserAssignmentStatus } from "../types";
import { buildCoursePlane, type CoursePlaneLayout } from "@/features/archive/model/coursePlaneLayout";
import {
  buildCapabilitySceneLayout,
  flattenCapabilityLayout,
  layoutCapabilityFlattenLayout,
  routeNodePoints,
  type ImmersiveCapabilityLayout,
  type ImmersiveCourseLayout,
  type ImmersiveKnowledgeNode
} from "./immersiveLayout";
import {
  CourseImmersiveStage,
  type CourseImmersiveStageHandle,
  type SemanticZoom,
  type StageBeam,
  type StageChapter,
  type StageEdge,
  type StageNode,
  type StageViewState
} from "./CourseImmersiveStage";
import { TiltedCourseStage } from "./TiltedCourseStage";
import {
  assignmentKnowledgeMap,
  basePracticeCards,
  buildPlaneCourseLayout,
  buildPracticeCards,
  buildRouteTrack,
  buildWindingRoute,
  courseSelectionRelations,
  primaryKnowledgeByAssignment,
  resolveFacetSelection,
  routeStepNumber,
  type CoursePracticeCard,
  type CourseSelection,
  type WindingStep,
  type WindingStepInput
} from "./courseTreeLayout";
import { CourseRouteView } from "./CourseRouteView";
import {
  clearCourseEnterSnapshot,
  courseTransitionCss,
  readCourseEnterSnapshot,
  readCourseOrigin,
  type CourseEnterSnapshot
} from "./courseTransition";
import { learnerCategory, learnerLabel, learnerStageStatus, summarizeLearnerState, type LearnerNodeState } from "./learnerStateProjection";
import "./immersive.css";

type Tab = "course" | "route";
type Pose = "front" | "rotated" | "flat";
type EnterPhase = "none" | "start" | "run" | "settle" | "done";

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

function assignmentStatusLabel(status: UserAssignmentStatus | "mixed") {
  if (status === "accepted" || status === "completed") return "已完成";
  if (status === "submitted") return "待评价";
  if (status === "needs_revision") return "需修改";
  if (status === "started" || status === "in-progress") return "进行中";
  if (status === "mixed") return "部分完成";
  return "未开始";
}

function assignmentStatusTone(status: UserAssignmentStatus | "mixed"): "acquired" | "brand" | "warn" | "quiet" {
  if (status === "accepted" || status === "completed") return "acquired";
  if (status === "started" || status === "in-progress" || status === "submitted") return "brand";
  if (status === "needs_revision") return "warn";
  return "quiet";
}

function practiceMinutes(node: CourseSkillTreeNode, runtime: NonNullable<ReturnType<typeof applicationServices.courseRepository.getCourse>>) {
  const first = runtime.assignments.find((assignment) => node.assignmentIds.includes(assignment.id));
  return first?.estimatedMinutes;
}

function practiceCode(runtime: NonNullable<ReturnType<typeof applicationServices.courseRepository.getCourse>>, assignmentId: string) {
  const assignment = runtime.assignments.find((item) => item.id === assignmentId);
  return assignment ? String(assignment.order + 1).padStart(2, "0") : "";
}

export default function CourseImmersivePage({ session, microLearningProvider }: { session: MockSession | null; onLogout: () => void; microLearningProvider?: MicroLearningProvider }) {
  const { courseId = "" } = useParams();
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
  const knowledgeTitleById = useMemo(() => new Map(baseKnowledgeGraph.nodes.map((node) => [node.id, node.title])), [baseKnowledgeGraph]);

  // One layout authority: the Archive course plane. The async ELK promise is
  // shared with the Archive, so entering right after course focus is warm.
  const [plane, setPlane] = useState<CoursePlaneLayout | null>(null);
  const [layoutError, setLayoutError] = useState("");
  useEffect(() => {
    if (!graphData) { setPlane(null); return; }
    let live = true;
    setLayoutError("");
    void buildCoursePlane(graphData)
      .then((next) => { if (live) setPlane(next); })
      .catch((error) => { if (live) setLayoutError(error instanceof Error ? error.message : "课程结构布局失败"); });
    return () => { live = false; };
  }, [graphData]);
  const courseLayout: ImmersiveCourseLayout | null = useMemo(() => graphData && plane ? buildPlaneCourseLayout(graphData, plane) : null, [graphData, plane]);

  const knowledgeKey = `${session?.userId ?? "anonymous"}:` + JSON.stringify(learnerKnowledge.map((record) => [record.nodeId, record.status, record.updatedAt]).sort());
  const routeControl = useRoutePlanning(courseId, authenticated, knowledgeKey);
  const capabilityModel = useMemo(() => {
    if (!runtime) return null;
    try { return buildProjectCapabilityModel(baseKnowledgeGraph, runtime, learnerKnowledge); } catch { return null; }
  }, [baseKnowledgeGraph, learnerKnowledge, runtime]);
  const capabilityLayout = useMemo(() => courseLayout && capabilityModel ? buildCapabilitySceneLayout(courseLayout, capabilityModel) : null, [capabilityModel, courseLayout]);
  const acquiredNodeIds = useMemo(() => learnerKnowledge.filter((record) => learnerCategory(record.status) === "acquired").map((record) => record.nodeId), [learnerKnowledge]);
  // Capabilities live outside the Course Knowledge set, so `learnerById` (a
  // Course-only projection) cannot answer their state. The Capability Model's
  // formal entry set is the authority; union the durable UKS as a fallback for
  // an acquired record that is not a model entry.
  const capabilityAcquiredIds = useMemo(() => {
    const ids = new Set(capabilityModel?.currentKnowledgeIds ?? []);
    acquiredNodeIds.forEach((id) => ids.add(id));
    return ids;
  }, [acquiredNodeIds, capabilityModel]);
  const targetNodeIds = useMemo(() => runtime?.targetKnowledge?.map((target) => target.nodeId) ?? [], [runtime]);
  const targetNodeSet = useMemo(() => new Set(targetNodeIds), [targetNodeIds]);
  const flattenedLayout = useMemo(() => capabilityLayout && capabilityModel
    ? flattenCapabilityLayout(capabilityLayout, capabilityModel, { acquiredNodeIds, targetNodeIds })
    : null, [acquiredNodeIds, capabilityLayout, capabilityModel, targetNodeIds]);

  const [tab, setTab] = useState<Tab>("course");
  const [swapped, setSwapped] = useState(false);
  // A turned-plane click selects exactly the facet under the pointer. Only the
  // front stage keeps the P4R2 behaviour of resolving practice <-> knowledge
  // when the layer changes.
  const [selectionPinned, setSelectionPinned] = useState(false);
  const [routeOn, setRouteOn] = useState(true);
  const [pose, setPose] = useState<Pose>("front");
  const [, setZoom] = useState<SemanticZoom>("mid");
  const [zoomPercent, setZoomPercent] = useState(100);
  const [selection, setSelection] = useState<CourseSelection | null>(null);
  const [flat, setFlat] = useState(false);
  const [capRailVisible, setCapRailVisible] = useState(false);
  const [capListOpen, setCapListOpen] = useState(false);
  const [capsHoverId, setCapsHoverId] = useState<string | null>(null);
  const [capsQuery, setCapsQuery] = useState("");
  const [perf, setPerf] = useState<{ fps: number; nodes: number; dom: number } | null>(null);
  useEffect(() => {
    if (!capRailVisible || flat || tab !== "course") setCapListOpen(false);
  }, [capRailVisible, flat, tab]);

  useEffect(() => {
    if (flat || tab !== "course") setCapRailVisible(false);
  }, [flat, tab]);
  const stageRef = useRef<CourseImmersiveStageHandle>(null);
  const pageRef = useRef<HTMLElement>(null);
  const routeReturnView = useRef<StageViewState | null>(null);
  const autoSelectedRef = useRef(false);
  const origin = useMemo(() => readCourseOrigin(courseId), [courseId]);
  const enterSnapshot = useRef<CourseEnterSnapshot | null>(readCourseEnterSnapshot(courseId)).current;
  const [enterPhase, setEnterPhase] = useState<EnterPhase>(enterSnapshot?.cards.length && !reducedMotion ? "start" : "done");
  const [enterTargets, setEnterTargets] = useState<Record<string, { left: number; top: number; width: number; height: number }>>({});
  const [enterFrame, setEnterFrame] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [entering, setEntering] = useState(Boolean(enterSnapshot?.cards.length) && !reducedMotion);
  const [leaving, setLeaving] = useState(false);
  const [leavingStyle, setLeavingStyle] = useState<ReturnType<typeof courseTransitionCss>>(null);
  const perfEnabled = useMemo(() => new URLSearchParams(location.search).get("perf") === "1", [location.search]);
  if (import.meta.env.DEV) (window as unknown as { __efRouteControl?: unknown }).__efRouteControl = routeControl;

  const courseChapters = graphData?.chapters ?? [];
  const courseNodes = graphData?.knowledgeNodes ?? [];
  const learnerState = useMemo(() => summarizeLearnerState(learnerKnowledge, courseNodes.map((node) => node.id)), [courseNodes, learnerKnowledge]);
  const learnerById = useMemo(() => new Map(learnerState.nodes.map((node) => [node.nodeId, node])), [learnerState.nodes]);
  const learnerFor = useCallback((id: string): LearnerNodeState => learnerById.get(id) ?? { nodeId: id, status: null, category: "pending", label: "待学", current: false }, [learnerById]);
  const recordById = useMemo(() => new Map(learnerKnowledge.map((record) => [record.nodeId, record])), [learnerKnowledge]);
  const displayNodes = useMemo(() => courseNodes.map((node) => {
    const learner = learnerFor(node.id);
    if (authenticated) return { ...node, learner, displayStatus: learnerStageStatus(learner.category), displayLabel: learner.label };
    const reachable = node.status !== "locked";
    return { ...node, learner, displayStatus: reachable ? "available" : "locked", displayLabel: reachable ? "可学" : "未解锁" };
  }), [authenticated, courseNodes, learnerFor]);

  const practiceByKnowledge = useMemo(() => graphData ? buildPracticeCards(graphData) : new Map<string, CoursePracticeCard>(), [graphData]);
  const assignmentKnowledge = useMemo(() => graphData ? assignmentKnowledgeMap(graphData) : new Map<string, string[]>(), [graphData]);
  const primaryKnowledge = useMemo(() => graphData ? primaryKnowledgeByAssignment(graphData) : new Map<string, string>(), [graphData]);
  const knowledgeAssignments = useMemo(() => {
    const map = new Map<string, string[]>();
    assignmentKnowledge.forEach((ids, assignmentId) => ids.forEach((id) => map.set(id, [...(map.get(id) ?? []), assignmentId])));
    return map;
  }, [assignmentKnowledge]);
  const capabilitySupports = useMemo(() => {
    const map = new Map<string, string[]>();
    capabilityLayout?.bridgeNodes.forEach((node) => {
      const supports = [...(node.directSupports ?? []), ...(node.indirectSupports ?? [])];
      if (supports.length) map.set(node.id, supports);
    });
    return map;
  }, [capabilityLayout]);
  const capabilitySupportCounts = useMemo(() => {
    const map = new Map<string, { direct: number; indirect: number }>();
    capabilityLayout?.bridgeNodes.forEach((node) => {
      map.set(node.id, { direct: node.directSupports?.length ?? 0, indirect: node.indirectSupports?.length ?? 0 });
    });
    return map;
  }, [capabilityLayout]);
  const assignmentById = useMemo(() => new Map((runtime?.assignments ?? []).map((assignment) => [assignment.id, assignment])), [runtime]);
  // Route source: only the adopted, server-validated version; otherwise the
  // canonical curriculum order with an explicit explanation.
  const activeRoute = routeControl.view?.activeVersion ?? null;
  const routeReady = !authenticated || routeControl.view !== null;
  const usingActiveRoute = Boolean(activeRoute?.snapshot.valid && activeRoute.snapshot.orderedNodeIds.length);
  const courseOrder = useMemo(() => orderCourseNodes(courseNodes).map((node) => node.id), [courseNodes]);
  const routeOrder = useMemo(() => usingActiveRoute ? activeRoute!.snapshot.orderedNodeIds : courseOrder, [activeRoute, courseOrder, usingActiveRoute]);
  const routeIndexById = useMemo(() => new Map(routeOrder.map((id, index) => [id, index])), [routeOrder]);
  const routeCurrentId = useMemo(() => {
    if (!authenticated) return null;
    return routeOrder.find((id) => learnerFor(id).category !== "acquired") ?? learnerState.counts.currentId ?? null;
  }, [authenticated, learnerFor, learnerState.counts.currentId, routeOrder]);
  const assignmentKnowledgeIds = useCallback((selectionValue: CourseSelection | null) => {
    if (!selectionValue) return [] as string[];
    if (selectionValue.kind === "knowledge") return [selectionValue.id];
    if (selectionValue.kind === "group") return [selectionValue.id];
    if (selectionValue.kind === "practice") return assignmentKnowledge.get(selectionValue.id) ?? [];
    return capabilitySupports.get(selectionValue.id) ?? [];
  }, [assignmentKnowledge, capabilitySupports]);

  const effectiveSelection = useMemo(() => selection ? (selectionPinned ? selection : resolveFacetSelection({
    selection,
    knowledgeInFront: !swapped,
    practiceByKnowledge,
    assignmentKnowledge,
    primaryKnowledge
  })) : null, [assignmentKnowledge, practiceByKnowledge, primaryKnowledge, selection, selectionPinned, swapped]);
  const selectionRelations = useMemo(() => courseSelectionRelations({
    selection: effectiveSelection,
    knowledgeIds: courseNodes.map((node) => node.id),
    dependencyEdges: courseLayout?.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })) ?? [],
    assignmentsByKnowledge: knowledgeAssignments,
    assignmentKnowledge,
    capabilitySupports,
    routeOrder: routeOrder.filter((id) => courseNodes.some((node) => node.id === id)),
    supportEdges: capabilityModel?.supportEdges,
    acquiredNodeIds,
    modelNodeIds: capabilityModel?.orderedNodeIds
  }), [acquiredNodeIds, assignmentKnowledge, capabilityModel, capabilitySupports, courseLayout?.edges, courseNodes, effectiveSelection, knowledgeAssignments, routeOrder]);

  const openLogin = useCallback(() => navigate("/login", { state: authGateState(location) }), [location, navigate]);
  const launchMicro = useCallback(async (node: CourseSkillTreeNode) => {
    if (!session) { openLogin(); return; }
    if (!runtime || node.status === "locked") return;
    const micro = microLearningProvider?.getLesson(node.id, { courseId: runtime.course.id }) ?? microLearningProvider?.getLesson(node.id);
    if (!micro) return;
    const target = createMicroLearningNavigation(node.id, { courseId: runtime.course.id, returnTo: `${location.pathname}${location.search}` });
    navigate(target.to, { state: target.state });
  }, [courseId, location.pathname, location.search, microLearningProvider, navigate, openLogin, runtime, session]);
  const launchAssignment = useCallback(async (assignment: CourseAssignment) => {
    if (!session) { openLogin(); return; }
    if (!runtime) return;
    navigate(`/courses/${runtime.course.id}/assignments/${assignment.id}`);
  }, [navigate, openLogin, runtime, session]);
  const launchMaterial = useCallback(async (materialId: string, node: CourseSkillTreeNode) => {
    if (!session) { openLogin(); return; }
    if (!runtime) return;
    const segmentId = node.materialContexts.find((context) => context.materialId === materialId)?.primarySegmentId ?? userCourseState?.materialStates[materialId]?.recentSegmentId;
    if (node.status !== "locked") {
      await applicationServices.learnerStateService.startMaterial(runtime.course.id, materialId, node.id);
      await refreshLearnerState(session.userId);
    }
    navigate(buildMaterialDeepLink({ courseId: runtime.course.id, materialId, segmentId }));
  }, [navigate, openLogin, runtime, session, userCourseState]);

  const startKnowledge = useCallback((node: CourseSkillTreeNode) => {
    if (!session) { openLogin(); return; }
    const micro = microLearningProvider?.getLesson(node.id, { courseId }) ?? microLearningProvider?.getLesson(node.id);
    if (micro) { void launchMicro(node); return; }
    const assignment = runtime?.assignments.find((item) => node.assignmentIds.includes(item.id));
    if (assignment) void launchAssignment(assignment);
  }, [courseId, launchAssignment, launchMicro, microLearningProvider, openLogin, runtime, session]);

  const microFor = useCallback((knowledgeId: string): MicroLesson | null => {
    const node = displayNodes.find((item) => item.id === knowledgeId);
    return microLearningProvider?.getLesson(knowledgeId, { courseId: node?.chapterId ? courseId : undefined }) ?? microLearningProvider?.getLesson(knowledgeId) ?? null;
  }, [courseId, displayNodes, microLearningProvider]);

  // Focus from Archive click / deep link / chapter route.
  useEffect(() => {
    if (!graphData) return;
    const requested = selectedPathFocus(location.search);
    if (requested) {
      const node = graphData.knowledgeNodes.find((item) => item.id === requested);
      const chapter = graphData.chapters.find((item) => item.id === requested);
      if (node) { setSelection({ kind: "knowledge", id: node.id }); setSelectionPinned(false); return; }
      if (chapter) { setSelection(null); setSelectionPinned(false); return; }
    }
  }, [graphData, location.search]);

  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const rect = page.getBoundingClientRect();
    setEnterFrame({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  }, []);

  useEffect(() => {
    if (!enterSnapshot?.cards.length) return;
    if (reducedMotion) {
      setEnterPhase("done");
      setEntering(false);
      clearCourseEnterSnapshot(courseId);
      return;
    }
    if (!courseLayout) return;
    let cancelled = false;
    let runTimer = 0;
    let finishTimer = 0;
    let settleTimer = 0;
    let retryTimer = 0;
    let attempts = 0;
    const finish = () => {
      if (cancelled) return;
      setEnterPhase("done");
      setEntering(false);
      clearCourseEnterSnapshot(courseId);
    };
    let lastSignature = "";
    let stableSamples = 0;
    const measure = () => {
      if (cancelled) return;
      attempts += 1;
      const targets: Record<string, { left: number; top: number; width: number; height: number }> = {};
      enterSnapshot.cards.forEach((card) => {
        // Exclude the entry overlay, which mirrors the same ids while it is on
        // screen; the real stage card is the measurement target.
        const element = document.querySelector<HTMLElement>(`[data-stage-node="true"][data-stage-id="${CSS.escape(card.id)}"]`);
        if (!element) return;
        const rect = element.getBoundingClientRect();
        if (rect.width > 2 && rect.height > 2) targets[card.id] = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      });
      // Do not start the hand-off until the real course cards exist. Until then
      // the Archive snapshot stays fully visible, so the page can never blank
      // while the graph/ELK layout is still resolving.
      const ready = Object.keys(targets).length >= Math.min(10, enterSnapshot.cards.length)
        && document.querySelectorAll(".ef-imm-chapter-label").length > 0;
      if (!ready && attempts < 30) {
        retryTimer = window.setTimeout(measure, 90);
        return;
      }
      // The first stage frame can measure before the shell/stage resize has
      // settled (356px narrower, different fit). Only commit rectangles that
      // are stable across consecutive frames; otherwise the overlay lands on
      // stale coordinates and the real cards jump at settle.
      const signature = enterSnapshot.cards.map((card) => {
        const rect = targets[card.id];
        return rect ? `${card.id}:${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}` : "";
      }).join("|");
      if (signature !== lastSignature) {
        lastSignature = signature;
        stableSamples = 0;
        retryTimer = window.setTimeout(measure, 80);
        return;
      }
      stableSamples += 1;
      if (stableSamples < 2) {
        retryTimer = window.setTimeout(measure, 80);
        return;
      }
      setEnterTargets(targets);
      runTimer = window.setTimeout(() => {
        if (cancelled) return;
        setEnterPhase("run");
        // The stage stays fully hidden until the overlay reaches the exact card
        // rectangles; then both cross-fade for ~160ms. No huge mid-transition
        // frame can appear over the Archive assistant.
        finishTimer = window.setTimeout(() => {
          if (cancelled) return;
          setEnterPhase("settle");
          // Reveal the real stage in the same commit that starts fading the
          // overlay. Keeping `entering` until after the overlay hid made a
          // fully empty frame for those 220ms.
          setEntering(false);
          settleTimer = window.setTimeout(finish, 300);
        }, 700);
      }, 50);
    };
    const outer = window.setTimeout(measure, 60);
    const fallback = window.setTimeout(finish, 6000);
    return () => {
      cancelled = true;
      clearTimeout(outer);
      clearTimeout(retryTimer);
      clearTimeout(runTimer);
      clearTimeout(finishTimer);
      clearTimeout(settleTimer);
      clearTimeout(fallback);
    };
  }, [courseId, courseLayout, enterSnapshot, reducedMotion]);

  if (import.meta.env.DEV) (window as unknown as { __efEnter?: unknown }).__efEnter = {
    phase: enterPhase,
    entering,
    cards: enterSnapshot?.cards.length ?? 0,
    frame: enterFrame,
    overlayCards: typeof document === "undefined" ? 0 : document.querySelectorAll(".ef-imm-enter-card").length
  };

  const enterOverlay = enterSnapshot && enterPhase !== "done" ? (
    <div
      className={`ef-imm-enter ${enterPhase === "run" ? "is-run" : ""} ${enterPhase === "settle" ? "is-settle" : ""}`}
      aria-hidden="true"
      style={enterFrame ? { left: `${enterFrame.left}px`, top: `${enterFrame.top}px`, width: `${enterFrame.width}px`, height: `${enterFrame.height}px` } : undefined}
    >
      {enterSnapshot.cards.map((card) => {
        const target = enterPhase === "run" || enterPhase === "settle" ? enterTargets[card.id] : undefined;
        const rect = target ?? card;
        const left = (enterFrame ? rect.left - enterFrame.left : rect.left);
        const top = (enterFrame ? rect.top - enterFrame.top : rect.top);
        const scale = Math.max(0.05, rect.width / 176);
        // Uniform scale keeps the snapshot text at the same size as the real
        // course card. Height is compensated on the element so the box still
        // reaches the target rectangle without squashing the glyphs.
        return (
          <div
            key={card.id}
            className={`ef-imm-enter-card ${enterPhase === "run" || enterPhase === "settle" ? "is-run" : ""}`}
            data-status={card.status}
            style={{
              transform: `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) scale(${scale.toFixed(3)})`,
              height: `${Math.max(20, rect.height / scale).toFixed(1)}px`
            }}
          >
            <span className="ef-imm-node-dot" aria-hidden="true" />
            <span className="ef-imm-node-copy"><strong>{card.title}</strong></span>
            {card.current ? <span className="ef-imm-enter-badge">当前</span> : null}
          </div>
        );
      })}
    </div>
  ) : null;

  const exitScene = useCallback(async () => {
    if (leaving) return;
    setLeaving(true);
    if (!reducedMotion) {
      setLeavingStyle(courseTransitionCss(origin));
      await new Promise((resolve) => window.setTimeout(resolve, 380));
    }
    navigate(`/archive?focus=course:${encodeURIComponent(courseId)}`);
  }, [courseId, leaving, navigate, origin, reducedMotion]);

  const enterFlatten = useCallback(() => {
    if (!authenticated || !capabilityLayout) return;
    setFlat(true);
    setTab("course");
    setSelection(null);
    setSelectionPinned(false);
    setPose("flat");
    if (!routeControl.editing) routeControl.begin();
  }, [authenticated, capabilityLayout, routeControl]);

  const leaveFlatten = useCallback(() => {
    if (routeControl.editing) {
      if (routeControl.dirty && !window.confirm("放弃尚未采用的路线调整？正式路线不会改变。")) return;
      routeControl.discardDraft();
    }
    setFlat(false);
    setPose("front");
  }, [routeControl]);

  const switchLayer = useCallback((next: boolean) => {
    setSwapped(next);
    setSelectionPinned(false);
    // The open facet follows the mirror instead of closing. Keeping the
    // knowledge anchor means the new practice detail is the same step, and the
    // stage keeps its camera/pan (no fit is triggered by a layer switch).
    setSelection((current) => current ? resolveFacetSelection({
      selection: current,
      knowledgeInFront: !next,
      practiceByKnowledge,
      assignmentKnowledge,
      primaryKnowledge
    }) : current);
  }, [assignmentKnowledge, practiceByKnowledge, primaryKnowledge]);

  const switchTab = useCallback((next: Tab) => {
    if (next === tab && !flat) return;
    if (next === "route") {
      routeReturnView.current = stageRef.current?.getViewState() ?? null;
      setSelection(null);
      setSelectionPinned(false);
      setFlat(false);
      setTab("route");
      return;
    }
    setTab("course");
    setFlat(false);
    const saved = routeReturnView.current;
    routeReturnView.current = null;
    if (saved) window.requestAnimationFrame(() => stageRef.current?.setViewState(saved));
  }, [flat, tab]);

  useEffect(() => {
    function keyboard(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable=true]")) return;
      const key = event.key.toLowerCase();
      if (key === "escape") {
        if (selection) { setSelection(null); setSelectionPinned(false); return; }
        if (flat) { leaveFlatten(); return; }
        if (tab === "route") { setTab("course"); return; }
        void exitScene();
        return;
      }
      if (tab !== "course" || flat) return;
      if (key === "1") { switchLayer(false); setPose("front"); }
      else if (key === "2") { switchLayer(true); setPose("front"); }
      else if (key === "r") { setPose((value) => value === "rotated" ? "front" : "rotated"); }
      else if (key === "0") { stageRef.current?.resetPose(); setPose("front"); }
      else if (key === "+" || key === "=") stageRef.current?.zoomIn();
      else if (key === "-") stageRef.current?.zoomOut();
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [exitScene, flat, leaveFlatten, selection, switchLayer, tab]);

  const openKnowledge = useCallback((id: string) => {
    setTab("course");
    setSwapped(false);
    setSelectionPinned(false);
    setSelection({ kind: "knowledge", id });
  }, []);
  const openPractice = useCallback((id: string) => {
    setTab("course");
    setSwapped(true);
    setSelectionPinned(false);
    setSelection({ kind: "practice", id });
  }, []);
  const openCapability = useCallback((id: string) => {
    setTab("course");
    setSelectionPinned(false);
    setSelection({ kind: "capability", id });
  }, []);
  const openGroup = useCallback((knowledgeId: string) => {
    setTab("course");
    setSwapped(true);
    setSelectionPinned(false);
    setSelection({ kind: "group", id: knowledgeId });
  }, []);
  const routeStepInputs = useMemo<WindingStepInput[]>(() => {
    return routeOrder.map((id) => {
      const node = displayNodes.find((item) => item.id === id);
      const chapter = courseChapters.find((item) => item.id === node?.chapterId);
      const learner = learnerFor(id);
      const done = authenticated && learner.category === "acquired";
      const current = authenticated && id === routeCurrentId;
      const micro = microFor(id);
      const assignmentId = node?.assignmentIds[0];
      const assignment = assignmentId ? assignmentById.get(assignmentId) : undefined;
      return {
        id,
        title: node?.title ?? activeRoute?.snapshot.titles[id] ?? knowledgeTitleById.get(id) ?? id,
        chapterId: chapter?.id ?? "supplemental",
        chapterTitle: chapter?.title ?? "补充前置能力",
        chapterNumber: chapter?.displayNumber ?? 0,
        status: done ? "done" : current ? "current" : "locked",
        stateLabel: learner.label,
        minutes: micro?.estimatedMinutes ?? assignment?.estimatedMinutes,
        meta: assignment ? `实践 ${practiceCode(runtime!, assignment.id)}` : undefined
      };
    });
  }, [activeRoute?.snapshot.titles, assignmentById, authenticated, courseChapters, displayNodes, knowledgeTitleById, learnerFor, microFor, routeCurrentId, routeOrder, runtime]);
  const winding = useMemo(() => buildWindingRoute(routeStepInputs, 560), [routeStepInputs]);

  const routeTrack = useMemo(() => {
    const cards = new Map<string, { id: string; x: number; y: number; width: number; height: number; chapterId: string }>();
    courseLayout?.nodes.forEach((node) => {
      if (node.kind !== "knowledge") return;
      cards.set(node.id, { id: node.id, x: node.x, y: -node.y, width: node.width, height: node.height, chapterId: node.chapterId });
    });
    capabilityLayout?.bridgeNodes.forEach((node) => {
      cards.set(node.id, { id: node.id, x: node.x, y: -node.y, width: node.width, height: node.height, chapterId: "supplemental" });
    });
    const chapters = new Map<string, { id: string; x: number; y: number; width: number; height: number }>();
    courseLayout?.chapters.forEach((chapter) => chapters.set(chapter.id, { id: chapter.id, x: chapter.x, y: -chapter.y, width: chapter.width, height: chapter.height }));
    return { cards, chapters };
  }, [capabilityLayout, courseLayout]);

  const courseBeam = useMemo<StageBeam[]>(() => {
    // Skill tree and practice tree show the same route. Practice cards share
    // their Knowledge's base coordinate, so the same anchors are correct on
    // both faces; the stage moves the band with the layer offset during the
    // 420ms swap. A missing practice is the "暂无对应实训" placeholder card.
    if (!authenticated || !routeReady || !routeOn || tab !== "course" || flat) return [];
    // P4R8: the band is the execution order itself. The stage resolves each id
    // through its own drawn position (layer offset included), so a capability
    // or intermediate node without a card is still an anchor.
    if (routeOrder.length < 2) return [];
    return [{
      id: "course-route",
      kind: "current",
      points: [],
      nodeIds: [...routeOrder],
      // Course-order and adopted routes share one pulse-beam style; only the
      // status-bar copy differs.
      dimmed: Boolean(effectiveSelection) && !selectionRelations.onRoute
    }];
  }, [authenticated, effectiveSelection, flat, routeOn, routeOrder, routeReady, routeTrack, selectionRelations.onRoute, tab]);

  const currentKnowledge = effectiveSelection?.kind === "knowledge" ? displayNodes.find((node) => node.id === effectiveSelection.id) ?? null : null;
  const currentPractice = effectiveSelection?.kind === "practice" ? assignmentById.get(effectiveSelection.id) ?? null : null;
  const currentGroup = effectiveSelection?.kind === "group" ? practiceByKnowledge.get(effectiveSelection.id) ?? null : null;
  const currentCapability = effectiveSelection?.kind === "capability" ? capabilityLayout?.nodes.find((node) => node.id === effectiveSelection.id) ?? null : null;
  const selectedKnowledgeId = currentKnowledge?.id ?? (currentPractice ? primaryKnowledge.get(currentPractice.id) : currentGroup?.knowledgeId) ?? null;
  const selectedLearner = selectedKnowledgeId ? learnerById.get(selectedKnowledgeId) : undefined;

  const baseStageChapters = useMemo<StageChapter[]>(() => {
    if (!courseLayout || flat) return [];
    return courseLayout.chapters.map((chapter) => {
      const chapterNodes = displayNodes.filter((node) => node.chapterId === chapter.id);
      return {
        ...chapter,
        meta: chapter.empty
          ? `综合 · ${Math.max(1, chapter.lessonCount || chapter.assignmentCount || 1)} 项`
          : swapped ? `${chapter.assignmentCount} 实训` : authenticated ? `${chapterNodes.filter((node) => node.learner.category === "acquired").length}/${chapterNodes.length}` : `${chapterNodes.length} 知识`
      };
    });
  }, [authenticated, courseLayout, displayNodes, flat, swapped]);

  const actionRow = useCallback((node: CourseSkillTreeNode): ReactNode => {
    const actions: ReactNode[] = [];
    const micro = microLearningProvider?.getLesson(node.id, { courseId }) ?? microLearningProvider?.getLesson(node.id);
    if (micro) actions.push(<span key="micro">微学习 · {micro.estimatedMinutes ?? 8} 分钟</span>);
    const assignment = runtime?.assignments.find((item) => node.assignmentIds.includes(item.id));
    if (assignment) actions.push(<span key="practice">实践 {String(assignment.order + 1).padStart(2, "0")}{assignment.estimatedMinutes ? ` · ${assignment.estimatedMinutes} 分钟` : ""}</span>);
    const materialContext = node.materialContexts[0];
    const material = materialContext && runtime ? runtime.materials.find((item) => item.id === materialContext.materialId) : null;
    const segment = material && materialContext ? material.segments.find((item) => item.id === materialContext.primarySegmentId) : null;
    if (segment?.page) actions.push(<span key="material">资料 p.{String(segment.page).padStart(2, "0")}</span>);
    return actions.length ? <span className="ef-imm-actions">{actions}</span> : null;
  }, [courseId, microLearningProvider, runtime]);

  const actionLabels = useCallback((node: CourseSkillTreeNode): string[] => {
    const actions: string[] = [];
    const micro = microLearningProvider?.getLesson(node.id, { courseId }) ?? microLearningProvider?.getLesson(node.id);
    if (micro) actions.push(`微学习 · ${micro.estimatedMinutes ?? 8} 分钟`);
    const assignment = runtime?.assignments.find((item) => node.assignmentIds.includes(item.id));
    if (assignment) actions.push(`实践 ${String(assignment.order + 1).padStart(2, "0")}${assignment.estimatedMinutes ? ` · ${assignment.estimatedMinutes} 分钟` : ""}`);
    const materialContext = node.materialContexts[0];
    const material = materialContext && runtime ? runtime.materials.find((item) => item.id === materialContext.materialId) : null;
    const segment = material && materialContext ? material.segments.find((item) => item.id === materialContext.primarySegmentId) : null;
    if (segment?.page) actions.push(`资料 p.${String(segment.page).padStart(2, "0")}`);
    return actions;
  }, [courseId, microLearningProvider, runtime]);

  const stageNodes = useMemo<StageNode[]>(() => {
    if (flat && capabilityLayout) {
      const flattened = flattenedLayout ?? capabilityLayout;
      const columnByNode = new Map((flattened.columns ?? []).flatMap((column) => column.nodeIds.map((id) => [id, column.kind] as const)));
      const nodes: StageNode[] = flattened.nodes.map((node) => {
        const column = columnByNode.get(node.id);
        const key = `c:${node.id}`;
        const selected = effectiveSelection?.kind === "capability" && effectiveSelection.id === node.id;
        return {
          id: node.id,
          kind: "capability",
          title: knowledgeTitleById.get(node.id) ?? node.title,
          x: node.x,
          y: node.y,
          z: node.z,
          width: 150,
          height: 46,
          status: authenticated ? (capabilityAcquiredIds.has(node.id) ? "completed" : "locked") : "available",
          current: false,
          bridge: node.bridge,
          meta: column === "acquired" ? "已获得" : column === "target" ? "目标" : "中间能力",
          dim: Boolean(effectiveSelection) && !selected && !selectionRelations.capabilityIds.has(node.id),
          highlight: selectionRelations.capabilityIds.has(node.id) && !selected,
          selected
        };
      });
      if (flattened.columns?.length) {
        const minY = Math.min(...nodes.map((node) => node.y));
        flattened.columns.forEach((column) => nodes.push({
          id: `flatten-column:${column.kind}`,
          kind: "route-chapter",
          title: column.label,
          x: column.x,
          y: minY - 66,
          z: 0,
          width: 160,
          height: 28,
          meta: `· ${column.count} 项能力`
        }));
      }
      return nodes;
    }
    if (!courseLayout) return [];
    const nodes: StageNode[] = [];
    courseLayout.nodes.filter((node): node is ImmersiveKnowledgeNode => node.kind === "knowledge").forEach((node) => {
      const display = displayNodes.find((item) => item.id === node.id);
      const status = display?.displayStatus ?? (authenticated ? learnerStageStatus("pending") : "available");
      const selected = effectiveSelection?.kind === "knowledge" && effectiveSelection.id === node.id;
      const step = authenticated && routeReady && routeOn ? routeStepNumber(routeOrder, node.id) : null;
      const micro = microFor(node.id);
      const statusLine = [display?.displayLabel, micro ? `微学习 ${micro.estimatedMinutes ?? 8} 分钟` : null].filter(Boolean).join(" · ");
      nodes.push({
        id: node.id,
        kind: "knowledge",
        title: node.title,
        x: node.x,
        y: node.y,
        z: node.z,
        width: node.width,
        // Every tree card shares one height. The reflection is then exactly the
        // same size and only the 14/13 offset exposes its identity strip.
        height: 64,
        status,
        statusLine,
        meta: display?.displayLabel,
        current: authenticated && (routeReady ? node.id === routeCurrentId : Boolean(display?.learner.current)),
        target: targetNodeSet.has(node.id),
        detail: actionRow(node.node),
        actions: actionLabels(node.node),
        dim: Boolean(effectiveSelection) && !selected && !selectionRelations.mirrorKnowledgeIds.has(node.id) && !selectionRelations.knowledgeIds.has(node.id),
        mirror: Boolean(effectiveSelection) && selectionRelations.mirrorKnowledgeIds.has(node.id),
        // Only the front face is lit: in the practice tree the Knowledge sheet
        // is the reflection and the practice card owns the relation.
        highlight: !swapped && selectionRelations.knowledgeIds.has(node.id) && !selected && !selectionRelations.mirrorKnowledgeIds.has(node.id),
        selected,
        step: step ?? undefined
      });
    });
    // Empty chapters are not empty frames: the practical/lesson data explains
    // what happens there (chapter 07 in the large course).
    courseLayout.chapters.filter((chapter) => chapter.empty).forEach((chapter) => {
      const count = Math.max(1, chapter.lessonCount || chapter.assignmentCount || 1);
      nodes.push({
        id: `chapter-empty:${chapter.id}`,
        kind: "chapter-empty",
        title: `本章为综合实践 · ${count} 项`,
        x: chapter.x,
        y: chapter.y,
        z: 2,
        width: 176,
        height: 56,
        meta: chapter.outcome ?? "成果验收"
      });
    });
    // Canonical shared coordinate: the stage adds the reflection offset while
    // it animates the skill/practice swap, so React never rebuilds positions.
    basePracticeCards(practiceByKnowledge, courseLayout).forEach((card) => {
      const selected = effectiveSelection?.kind === "practice" ? card.assignmentIds.includes(effectiveSelection.id)
        : effectiveSelection?.kind === "group" ? card.knowledgeId === effectiveSelection.id : false;
      const cardSelectionPractice = card.assignmentIds.length === 1 ? card.assignmentIds[0] : null;
      const coverage = new Set(card.assignmentIds.flatMap((id) => assignmentKnowledge.get(id) ?? [])).size;
      const statusText = assignmentStatusLabel(card.status);
      nodes.push({
        id: card.id,
        kind: "assignment",
        title: card.title,
        x: card.x,
        y: card.y,
        z: card.z,
        width: card.width,
        height: 64,
        code: card.kind === "empty" ? "" : card.code,
        count: card.count,
        status: card.status === "accepted" ? "completed" : card.status === "started" || card.status === "submitted" || card.status === "needs_revision" ? "learning" : "available",
        meta: card.kind === "empty" ? "—" : card.code,
        statusLine: card.kind === "empty" ? "暂无对应实训" : `${card.kind === "shadow" ? "见主位置 · " : ""}${statusText}${coverage ? ` · 覆盖 ${coverage} 个知识` : ""}`,
        empty: card.kind === "empty" || card.kind === "shadow",
        dim: Boolean(effectiveSelection) && !selected && !selectionRelations.practiceKnowledgeIds.has(card.knowledgeId),
        // A Knowledge card and its practice reflection are two faces of one
        // node: the far face stays at normal brightness but is never
        // highlighted or separately named. When the practice tree is in
        // front, related front practice cards are the named face.
        highlight: swapped && Boolean(effectiveSelection) && !selected
          && selectionRelations.practiceKnowledgeIds.has(card.knowledgeId)
          && !selectionRelations.mirrorKnowledgeIds.has(card.knowledgeId),
        selected,
        chapterId: card.knowledgeId,
        tone: cardSelectionPractice ? ((Number(card.code) % 3 + 1) as 1 | 2 | 3) : 1
      });
    });
    if (capabilityLayout) {
      capabilityLayout.bridgeNodes.forEach((node) => {
        const selected = effectiveSelection?.kind === "capability" && effectiveSelection.id === node.id;
        nodes.push({
          id: node.id,
          kind: "capability",
          title: knowledgeTitleById.get(node.id) ?? node.title,
          x: node.x,
          y: node.y,
          z: node.z,
          width: 150,
          height: 46,
          status: authenticated ? (capabilityAcquiredIds.has(node.id) ? "completed" : "locked") : "available",
          current: false,
          bridge: true,
          meta: "前置能力",
          statusLine: "前置能力",
          detail: <span className="ef-imm-actions"><span>课程外</span></span>,
          dim: Boolean(effectiveSelection) && !selected && !selectionRelations.capabilityIds.has(node.id),
          highlight: selectionRelations.capabilityIds.has(node.id) && !selected,
          selected
        });
      });
    }
    return nodes;
  }, [actionLabels, actionRow, assignmentById, assignmentKnowledge, authenticated, capabilityAcquiredIds, capabilityLayout, courseLayout, displayNodes, effectiveSelection, flat, flattenedLayout, knowledgeTitleById, learnerById, microFor, practiceByKnowledge, routeCurrentId, routeOn, routeOrder, routeReady, selectionRelations, targetNodeSet]);

  if (import.meta.env.DEV) (window as unknown as { __efPage?: unknown }).__efPage = {
    flat,
    stageNodeCount: stageNodes.length,
    capabilityLayoutNodes: capabilityLayout?.nodes.length ?? null,
    flattenedNodes: flattenedLayout?.nodes.length ?? null,
    flattenedColumns: flattenedLayout?.columns?.map((column) => ({ kind: column.kind, label: column.label, x: column.x, y: column.y, width: column.width, count: column.count, nodeIds: column.nodeIds })) ?? [],
    flattenedPositions: Object.fromEntries((flattenedLayout?.nodes ?? []).map((node) => [node.id, { x: node.x, y: node.y, z: node.z }])),
    flattenedEdges: flattenedLayout?.edges?.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, relation: edge.relation, strength: edge.strength, points: edge.points })) ?? [],
    stageNodeKinds: [...new Set(stageNodes.map((node) => node.kind))],
    capabilities: capabilityLayout?.bridgeNodes.map((node) => ({
      id: node.id, title: node.title, x: node.x, y: node.y, z: node.z,
      direct: node.directSupports ?? [], indirect: node.indirectSupports ?? []
    })) ?? [],
    capabilityCurrentIds: capabilityModel?.currentKnowledgeIds ?? [],
    capabilityAcquiredIds: [...capabilityAcquiredIds],
    capabilityBridgeIds: capabilityLayout?.bridgeNodes.map((node) => node.id) ?? []
  };
  const stageEdges = useMemo<StageEdge[]>(() => {
    const highlightEdge = (id: string) => Boolean(effectiveSelection) && selectionRelations.edgeIds.has(id);
    const highlight = (source?: string, target?: string) => {
      if (!effectiveSelection) return false;
      if (source && (selectionRelations.knowledgeIds.has(source) || selectionRelations.capabilityIds.has(source))) return true;
      if (target && (selectionRelations.knowledgeIds.has(target) || selectionRelations.capabilityIds.has(target))) return true;
      return false;
    };
    if (flat && capabilityLayout) {
      const flattened = flattenedLayout ?? capabilityLayout;
      return flattened.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        points: edge.points,
        kind: "plain",
        highlighted: highlightEdge(edge.id)
      }));
    }
    const edges: StageEdge[] = (courseLayout?.edges ?? []).map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      points: edge.points,
      kind: "plain",
      highlighted: highlightEdge(edge.id),
      pointWeights: edge.points.map(() => 1)
    }));
    // Always supply capability support lines; the Stage fades them by the
    // actual orbit (0 in front, full by ~35°). The endpoint weights let the
    // lines follow the knowledge layer during the skill/practice swap.
    if (capabilityLayout) {
      const courseIds = new Set(capabilityLayout.courseNodes.map((node) => node.id));
      capabilityLayout.edges.forEach((edge) => {
        const bridgeEdge = capabilityLayout.bridgeNodes.some((node) => node.id === edge.source || node.id === edge.target);
        if (!bridgeEdge || edge.points.length < 2) return;
        edges.push({
          id: `cap:${edge.id}`,
          source: edge.source,
          target: edge.target,
          points: edge.points,
          kind: "capability",
          highlighted: highlightEdge(edge.id),
          pointWeights: edge.points.map((_point, index) => {
            const id = index === 0 ? edge.source : index === edge.points.length - 1 ? edge.target : edge.source;
            return courseIds.has(id) ? 1 : 0;
          })
        });
      });
    }
    // A route neighbour without a factual edge is still one hop away. Draw
    // that adjacent route segment as a lit line so the highlighted neighbour
    // never floats without a connection (P4R6).
    if (!swapped) {
      selectionRelations.routeHopPairs.forEach((pair) => {
        const points = buildRouteTrack([pair.source, pair.target], routeTrack.cards)
          .map((point) => ({ x: point.x, y: -point.y, z: point.z }));
        if (points.length < 2) return;
        edges.push({
          id: `route-hop:${pair.source}:${pair.target}`,
          source: pair.source,
          target: pair.target,
          points,
          kind: "route-hop",
          highlighted: true
        });
      });
    }
    // Practice connectors are visible only while the practice tree is in
    // front. They are short knowledge→reflection links, never a second layer
    // of full-height orthogonal lines.
    if (swapped && courseLayout) {
      const knowledgeById = new Map(courseLayout.nodes.filter((node) => node.kind === "knowledge").map((node) => [node.id, node]));
      basePracticeCards(practiceByKnowledge, courseLayout).forEach((card) => {
        if (card.kind === "empty" || card.kind === "shadow") return;
        const anchor = knowledgeById.get(card.knowledgeId);
        if (!anchor) return;
        edges.push({
          id: `practice:${card.id}`,
          source: anchor.id,
          target: card.id,
          points: [
            { x: anchor.x + anchor.width / 2 + 2, y: anchor.y, z: 2 },
            { x: card.x + card.width / 2 + 2, y: card.y, z: 2 }
          ],
          kind: "practice",
          highlighted: false
        });
      });
    }
    return edges;
  }, [capabilityLayout, courseLayout, effectiveSelection, flat, flattenedLayout, practiceByKnowledge, routeTrack, selectionRelations, swapped]);

  if (import.meta.env.DEV) {
    const modelNodes = capabilityModel?.orderedNodeIds ?? [];
    const modelEdges = capabilityModel?.supportEdges.map((edge) => edge.id) ?? [];
    const projectedNodes = capabilityLayout?.nodes.map((node) => node.id) ?? [];
    const projectedEdges = capabilityLayout?.edges.map((edge) => edge.id) ?? [];
    const renderedNodes = stageNodes.filter((node) => node.kind === "capability" || (node.kind === "knowledge" && modelNodes.includes(node.id))).map((node) => node.id);
    const renderedEdgeIds = [...new Set(stageEdges.map((edge) => edge.id.replace(/^cap:/, "")))];
    const renderedEdges = modelEdges.filter((id) => renderedEdgeIds.includes(id));
    const missingNodes = modelNodes.filter((id) => !renderedNodes.includes(id));
    const extraNodes = renderedNodes.filter((id) => !modelNodes.includes(id));
    const missingEdges = modelEdges.filter((id) => !projectedEdges.includes(id) || !renderedEdges.includes(id));
    const extraEdges = renderedEdges.filter((id) => !modelEdges.includes(id));
    (window as unknown as { __efCapabilityModelCheck?: unknown }).__efCapabilityModelCheck = {
      modelNodes, modelEdges, projectedNodes, projectedEdges, renderedNodes, renderedEdges,
      missingNodes, extraNodes, missingEdges, extraEdges,
      nodeDiff: missingNodes.length + extraNodes.length,
      edgeDiff: missingEdges.length + extraEdges.length
    };
  }

  const flatBeams = useMemo<StageBeam[]>(() => {
    if (!flat || !capabilityLayout || !capabilityModel) return [];
    const flattened = flattenedLayout ?? capabilityLayout;
    const beams: StageBeam[] = [];
    // While editing, the current route stays visible but dimmed; the preview
    // route is a second flowing band in the target colour.
    const currentPoints = routeNodePoints(flattened, routeOrder);
    if (currentPoints.length > 1) beams.push({ id: "flat-current", kind: "current", points: currentPoints, nodeIds: [...routeOrder], dimmed: true });
    const preview = routeControl.preview?.valid ? routeControl.preview.route : null;
    if (preview) {
      const previewPoints = routeNodePoints(flattened, preview.orderedNodeIds);
      if (previewPoints.length > 1) beams.push({ id: "flat-preview", kind: "preview", points: previewPoints, nodeIds: [...preview.orderedNodeIds] });
    }
    return beams;
  }, [capabilityLayout, capabilityModel, flat, flattenedLayout, routeControl.preview, routeOrder]);

  if (import.meta.env.DEV) (window as unknown as { __efFlatBeams?: unknown }).__efFlatBeams = flatBeams;

  if (!runtime || !graphData) {
    // While the course graph is still resolving, replay the captured Archive
    // cards on the page itself. Returning a bare placeholder here was the
    // blank frame between the Archive fade and the course scene mount.
    if (enterSnapshot) {
      return (
        <main ref={pageRef} className={`ef-imm-page ${entering ? "is-entering" : ""}`}>
          {enterOverlay}
          <div className="ef-imm-transition" style={{ opacity: 0 }} aria-hidden="true" />
        </main>
      );
    }
    return <main className="ef-imm-page ef-imm-empty"><PlanningMessage title="课程不存在" copy={`没有找到课程 “${courseId}”，或该课程没有公开的学习结构。`} onBack={() => navigate("/archive")} /></main>;
  }
  if (layoutError) {
    return <main className="ef-imm-page ef-imm-empty"><PlanningMessage title="课程结构加载失败" copy={layoutError} onBack={() => navigate("/archive")} /></main>;
  }

  const currentPose: Pose = flat ? "flat" : pose;
  const sceneMode: "course" | "flat" = flat ? "flat" : "course";
  // Stage cards carry their own composite id (`assignment:…:knowledge`,
  // `group:knowledge`). A detail selection uses the bare practice id, so map
  // it back before handing it to the stage; otherwise x-ray and 定位 miss.
  const selectedPracticeCard = currentPractice
    ? [...practiceByKnowledge.values()].find((card) => card.assignmentIds.includes(currentPractice.id)) ?? null
    : currentGroup;
  const selectedStageId = currentKnowledge?.id ?? selectedPracticeCard?.id ?? currentCapability?.id ?? null;
  const completedCount = learnerState.counts.acquired;
  const progress = learnerState.counts.total ? Math.round((completedCount / learnerState.counts.total) * 100) : 0;
  const currentTitle = routeCurrentId ? (displayNodes.find((node) => node.id === routeCurrentId)?.title ?? knowledgeTitleById.get(routeCurrentId) ?? routeCurrentId) : null;
  const preview = routeControl.preview?.valid ? routeControl.preview : null;
  const diff = activeRoute && preview?.valid ? routeDiff(activeRoute.snapshot, preview.route) : null;
  const selectionKnowledgeIds = assignmentKnowledgeIds(effectiveSelection);
  const selectedRecord = selectedKnowledgeId ? recordById.get(selectedKnowledgeId) : undefined;
  const knowledgeForDetail = currentKnowledge ?? (currentPractice ? displayNodes.find((node) => node.id === primaryKnowledge.get(currentPractice.id)) : currentGroup ? displayNodes.find((node) => node.id === currentGroup.knowledgeId) : null);
  const selectedStageKnowledge = knowledgeForDetail;
  const selectedMicro = selectedStageKnowledge
    ? (microLearningProvider?.getLesson(selectedStageKnowledge.id, { courseId }) ?? microLearningProvider?.getLesson(selectedStageKnowledge.id) ?? null)
    : null;
  const groupAssignments = currentGroup ? currentGroup.assignmentIds.flatMap((id) => assignmentById.get(id) ?? []) : [];
  const detailAssignments = currentPractice
    ? [currentPractice]
    : currentGroup
      ? groupAssignments
      : knowledgeForDetail
        ? knowledgeForDetail.assignmentIds.flatMap((id) => assignmentById.get(id) ?? [])
        : [];
  const prerequisiteIds = selectedKnowledgeId ? courseLayout?.edges.filter((edge) => edge.target === selectedKnowledgeId).map((edge) => edge.source) ?? [] : [];
  const capabilityIdsForKnowledge = selectedKnowledgeId ? [...capabilitySupports.entries()].filter(([, supports]) => supports.includes(selectedKnowledgeId)).map(([id]) => id) : [];
  const routeIndex = selectedKnowledgeId ? routeStepNumber(routeOrder, selectedKnowledgeId) : null;
  const selectedMaterials = knowledgeForDetail && runtime ? knowledgeForDetail.materialContexts.flatMap((context) => runtime.materials.find((material) => material.id === context.materialId) ?? []) : [];
  const primaryAssignment = detailAssignments[0];
  const capabilityTitle = currentCapability ? (knowledgeTitleById.get(currentCapability.id) ?? currentCapability.title) : null;
  const detailTitle = currentGroup ? currentGroup.title : currentPractice?.title ?? capabilityTitle ?? currentKnowledge?.title ?? "课程节点";
  const detailKicker = currentCapability ? "前置能力 · 课程外" : currentPractice || currentGroup ? "课程实训" : "知识节点";
  const detailContext = knowledgeForDetail ? `第 ${knowledgeForDetail.lesson} 课 · ${courseChapters.find((chapter) => chapter.id === knowledgeForDetail.chapterId)?.title ?? ""}` : currentCapability?.bridge ? "位于课程知识后方" : "";
  const currentCapabilityAcquired = Boolean(currentCapability && capabilityAcquiredIds.has(currentCapability.id));
  const detailLabel = currentCapability ? (authenticated ? (currentCapabilityAcquired ? "已具备" : "未具备") : "前置能力") : authenticated ? selectedLearner?.label ?? "待学" : "公开";
  const detailTone = currentCapability ? (currentCapabilityAcquired ? "acquired" : "quiet") : authenticated ? learnerTone(selectedLearner) : "target";

  const capabilityCount = capabilityLayout?.bridgeNodes.length ?? 0;
  const capabilityItems = useMemo(() => {
    if (!capabilityLayout) return [];
    return capabilityLayout.bridgeNodes.map((node) => {
      const direct = node.directSupports?.length ?? 0;
      const indirect = node.indirectSupports?.length ?? 0;
      return {
        id: node.id,
        title: knowledgeTitleById.get(node.id) ?? node.title,
        mastered: Boolean(authenticated && capabilityAcquiredIds.has(node.id)),
        direct,
        indirect,
        supports: direct + indirect
      };
    }).sort((left, right) => left.title.localeCompare(right.title, "zh-Hans-CN") || left.id.localeCompare(right.id));
  }, [authenticated, capabilityAcquiredIds, capabilityLayout, knowledgeTitleById]);
  if (import.meta.env.DEV) (window as unknown as { __efCourse?: unknown }).__efCourse = {
    capabilityItems,
    capabilityLayout,
    courseLayout,
    capabilitySupports,
    titles: Object.fromEntries(knowledgeTitleById),
    knowledgeIds: courseNodes.map((node) => node.id),
    selectionRelations: {
      knowledgeIds: [...selectionRelations.knowledgeIds],
      capabilityIds: [...selectionRelations.capabilityIds],
      practiceKnowledgeIds: [...selectionRelations.practiceKnowledgeIds],
      mirrorKnowledgeIds: [...selectionRelations.mirrorKnowledgeIds],
      edgeIds: [...selectionRelations.edgeIds],
      onRoute: selectionRelations.onRoute
    }
  };
  const supportCopy = useCallback((item: { direct: number; indirect: number }) => {
    if (item.direct && item.indirect) return `直接 ${item.direct} · 间接 ${item.indirect}`;
    if (item.direct) return `${item.direct} 个知识`;
    if (item.indirect) return `直接 0 · 间接 ${item.indirect}`;
    return "经间接路径支撑";
  }, []);
  const visibleCapabilities = capabilityItems.filter((item) => !capsQuery.trim() || item.title.toLocaleLowerCase().includes(capsQuery.trim().toLocaleLowerCase()));
  const capGroups = [
    { key: "mastered", label: "已掌握", items: visibleCapabilities.filter((item) => item.mastered) },
    { key: "learning", label: "未掌握", items: visibleCapabilities.filter((item) => !item.mastered) }
  ];

  const capabilityRail = capRailVisible && !capListOpen && !flat && tab === "course" ? (
    <button
      type="button"
      className={`ef-imm-cap-rail ${effectiveSelection ? "is-with-detail" : ""}`}
      onClick={() => setCapListOpen(true)}
      aria-label={`展开前置能力清单，共 ${capabilityCount} 项`}
      aria-expanded={false}
    >
      <span>前置能力</span>
      <b>{capabilityCount}</b>
      <ChevronRight size={14} aria-hidden="true" />
    </button>
  ) : null;

  const capabilityPanel = capListOpen && capRailVisible && !flat && tab === "course" ? (
    <aside className={`ef-imm-cap-panel ${effectiveSelection ? "is-with-detail" : ""}`} aria-label="能力层清单">
      <header>
        <div><span>前置能力 · {capabilityCount}</span><h2>能力层</h2><p>按掌握情况分组 · 支撑课程知识</p></div>
        <button type="button" onClick={() => setCapListOpen(false)} aria-label="收起能力层清单"><X size={15} /></button>
      </header>
      <input value={capsQuery} onChange={(event) => setCapsQuery(event.target.value)} type="search" placeholder="搜索能力名称…" aria-label="搜索能力名称" />
      <div className="ef-imm-cap-scroll">
        {capGroups.map((group) => (
          <section key={group.key}>
            <h3>{group.label} · {group.items.length}</h3>
            {group.items.map((item) => (
              <button
                type="button"
                key={item.id}
                className={effectiveSelection?.kind === "capability" && effectiveSelection.id === item.id ? "is-sel" : ""}
                onPointerEnter={() => setCapsHoverId(item.id)}
                onPointerLeave={() => setCapsHoverId((current) => current === item.id ? null : current)}
                onFocus={() => setCapsHoverId(item.id)}
                onBlur={() => setCapsHoverId((current) => current === item.id ? null : current)}
                onClick={() => { setSelectionPinned(false); setSelection({ kind: "capability", id: item.id }); }}
              >
                <i className={item.mastered ? "is-mastered" : ""} />
                <span>{item.title}</span>
                <small>{supportCopy(item)}</small>
              </button>
            ))}
          </section>
        ))}
        {!visibleCapabilities.length ? <p className="ef-imm-cap-empty">没有匹配的能力</p> : null}
      </div>
    </aside>
  ) : null;

  const detailPanel = effectiveSelection ? (
    <ObjectShell
      size="panel"
      className="ef-imm-detail"
      icon={currentCapability ? <Network size={16} /> : currentPractice || currentGroup ? <FileText size={16} /> : <BookOpen size={16} />}
      kicker={detailKicker}
      title={detailTitle}
      badge={<Pill tone={detailTone}>{detailLabel}{selectedLearner?.current && authenticated ? " · 当前" : ""}</Pill>}
      context={<span>{detailContext}</span>}
      tools={<button type="button" className="ef-imm-icon-btn" onClick={() => { setSelection(null); setSelectionPinned(false); }} aria-label="关闭详情"><X size={15} /></button>}
      footer={
        <>
          {!session ? <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={openLogin}><LogIn size={13} />登录后开始学习</button> : null}
          {session && (currentPractice || currentGroup) && primaryAssignment ? <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={() => void launchAssignment(primaryAssignment)}><FileText size={13} />{detailAssignments.length > 1 ? "开始实践组" : "开始实践"}</button> : null}
          {session && !currentPractice && !currentGroup && selectedStageKnowledge ? (
            selectedStageKnowledge && selectedMicro ? <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={() => startKnowledge(selectedStageKnowledge)}><Sparkles size={13} />开始微学习{selectedMicro.estimatedMinutes ? ` · ${selectedMicro.estimatedMinutes} 分钟` : ""}</button>
              : primaryAssignment ? <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={() => startKnowledge(selectedStageKnowledge)}><FileText size={13} />{detailAssignments.length > 1 ? "开始实践组" : "开始实践"}</button>
                : <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" disabled>暂无学习资源</button>
          ) : null}
          {session && !currentPractice && !currentGroup && selectedMicro && primaryAssignment && knowledgeForDetail ? <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => void launchAssignment(primaryAssignment)}><FileText size={13} />{detailAssignments.length > 1 ? "实践组" : "实践"}</button> : null}
          {session && selectedMaterials[0] && knowledgeForDetail ? <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => void launchMaterial(selectedMaterials[0].id, knowledgeForDetail)}><BookOpen size={13} />资料</button> : null}
          {session && routeIndex ? <span className="ef-imm-detail-chip">路线第 {routeIndex} 步</span> : null}
          <button type="button" className="ef-ui-btn ef-ui-btn--ghost ef-ui-btn--32 ef-imm-locate" onClick={() => { if (selectedStageId) stageRef.current?.locate(selectedStageId); }}><LocateFixed size={13} />定位</button>
        </>
      }
    >
      <div className="ef-imm-detail-chips">
        {authenticated && selectedLearner ? <span className="ef-imm-detail-chip is-accent">{selectedLearner.label}</span> : null}
        {currentPractice ? <span className="ef-imm-detail-chip">{assignmentStatusLabel(userCourseState?.assignmentStates[currentPractice.id]?.status ?? "not_started")}</span> : null}
        {currentGroup ? <span className="ef-imm-detail-chip">{groupAssignments.filter((assignment) => ["accepted", "completed"].includes(userCourseState?.assignmentStates[assignment.id]?.status ?? "")).length} / {groupAssignments.length} 已完成</span> : null}
        {currentPractice?.estimatedMinutes ? <span className="ef-imm-detail-chip">约 {currentPractice.estimatedMinutes} 分钟</span> : null}
        {currentCapability ? <span className="ef-imm-detail-chip">{currentCapabilityAcquired ? "已具备" : "未具备"}</span> : null}
        {currentCapability && capabilitySupportCounts.get(currentCapability.id) ? <span className="ef-imm-detail-chip">{supportCopy(capabilitySupportCounts.get(currentCapability.id)!)}</span> : null}
        {selectedRecord?.mastery !== undefined ? <span className="ef-imm-detail-chip">掌握度 {Math.round(selectedRecord.mastery)}%</span> : null}
      </div>

      {currentPractice || currentGroup ? (
        <section className="ef-imm-detail-section">
          <h3>要做什么</h3>
          <p>{currentPractice?.description || groupAssignments.map((assignment) => assignment.description).filter(Boolean).join("；") || "完成这组实践并提交结果。"}</p>
          {currentPractice?.requirements.length ? <ul>{currentPractice.requirements.map((item) => <li key={item}>{item}</li>)}</ul> : null}
        </section>
      ) : knowledgeForDetail ? (
        <section className="ef-imm-detail-section">
          <h3>这一节学什么</h3>
          <p>{knowledgeForDetail.description || `理解「${knowledgeForDetail.title}」的作用与常见做法，并在一个小任务里用起来。`}</p>
        </section>
      ) : null}

      {(currentPractice || currentGroup) && selectionKnowledgeIds.length ? (
        <section className="ef-imm-detail-section">
          <h3>覆盖的知识 · {selectionKnowledgeIds.length}</h3>
          {selectionKnowledgeIds.map((id) => <button type="button" key={id} className="ef-imm-detail-link" onClick={() => openKnowledge(id)}><i />{knowledgeTitleById.get(id) ?? id}</button>)}
        </section>
      ) : null}

      {currentCapability ? (
        <>
          <section className="ef-imm-detail-section">
            <h3>支撑这门课里的 · 直接 {capabilitySupportCounts.get(currentCapability.id)?.direct ?? 0} · 间接 {capabilitySupportCounts.get(currentCapability.id)?.indirect ?? 0}</h3>
            {(capabilitySupports.get(currentCapability.id) ?? []).length
              ? (capabilitySupports.get(currentCapability.id) ?? []).map((id) => <button type="button" key={id} className="ef-imm-detail-link" onClick={() => openKnowledge(id)}><i />{knowledgeTitleById.get(id) ?? id}</button>)
              : <p>尚未连接课程知识。</p>}
          </section>
          <section className="ef-imm-detail-section">
            <h3>说明</h3>
            <p>这是项目能力模型里的课程外前置能力，正面视角几乎不可见，旋转后出现在更深的平面。</p>
          </section>
        </>
      ) : null}

      {!currentCapability && (knowledgeForDetail || detailAssignments.length) ? (
        <section className="ef-imm-detail-section">
          <h3>关联实践 · {detailAssignments.length}{detailAssignments.length > 1 ? " · 实践组" : ""}</h3>
          {detailAssignments.length ? detailAssignments.map((assignment) => (
            <button type="button" key={assignment.id} className="ef-imm-detail-link" onClick={() => openPractice(assignment.id)}>
              <i />实践 {String(assignment.order + 1).padStart(2, "0")} · {assignment.title}
            </button>
          )) : <p>暂无对应实践。</p>}
        </section>
      ) : null}

      {!currentCapability ? (
        <section className="ef-imm-detail-section">
          <h3>前置</h3>
          {prerequisiteIds.length || capabilityIdsForKnowledge.length ? <>
            {prerequisiteIds.map((id) => <button type="button" key={id} className="ef-imm-detail-link" onClick={() => openKnowledge(id)}><i style={{ background: "var(--acquired)" }} />{knowledgeTitleById.get(id) ?? id}</button>)}
            {capabilityIdsForKnowledge.map((id) => <button type="button" key={id} className="ef-imm-detail-link" onClick={() => openCapability(id)}><i style={{ background: "var(--pending)" }} />{knowledgeTitleById.get(id) ?? id} · 课程外能力</button>)}
          </> : <p>没有前置要求。</p>}
        </section>
      ) : null}

      {currentPractice || currentGroup ? (
        <section className="ef-imm-detail-section">
          <h3>提交给</h3>
          <p>{evaluatorOptions.map((option) => option.label).join(" 或 ")}</p>
          {currentPractice?.requirements.length ? <ul>{currentPractice.requirements.map((item) => <li key={item}>{item}</li>)}</ul> : null}
        </section>
      ) : null}

      {selectedKnowledgeId ? (
        <section className="ef-imm-detail-section">
          <h3>我的学习证据</h3>
          {!authenticated ? <p>登录后可查看你的学习证据。</p> : selectedRecord?.evidence?.length ? (
            <ul>{selectedRecord.evidence.map((evidence) => <li key={evidence.id}>{evidence.label}{evidence.createdAt ? ` · ${new Date(evidence.createdAt).toLocaleDateString("zh-CN")}` : ""}</li>)}</ul>
          ) : <p>还没有学习记录。</p>}
        </section>
      ) : null}
    </ObjectShell>
  ) : null;

  const flatPanel = flat && capabilityLayout ? (
    <aside className="ef-imm-side-panel ef-imm-edit-panel" aria-label="路线编辑">
      <header><div><span>能力模型 · 编辑路线</span><h2>调整路线</h2><p>{activeRoute ? `基于 V${activeRoute.versionNumber}` : "当前没有正式路线"}</p></div><button type="button" onClick={leaveFlatten} aria-label="关闭路线编辑"><X size={16} /></button></header>
      <div className="ef-imm-edit-tools">
        <button type="button" className={routeControl.tool === "include" ? "is-on" : ""} onClick={() => routeControl.setTool("include")} aria-pressed={routeControl.tool === "include"}>必须经过</button>
        <button type="button" className={routeControl.tool === "exclude" ? "is-on" : ""} onClick={() => routeControl.setTool("exclude")} aria-pressed={routeControl.tool === "exclude"}>不经过</button>
      </div>
      <section className="ef-imm-draft-constraints"><h3>约束</h3>
        {routeControl.draft.includeNodeIds.length ? <ul>{routeControl.draft.includeNodeIds.map((id) => <li key={id}>必须经过 · {knowledgeTitleById.get(id) ?? id}<button type="button" aria-label={`移除必须经过 ${id}`} onClick={() => routeControl.removeNodeConstraint(id)}>×</button></li>)}</ul> : <p>尚未添加「必须经过」。</p>}
        {routeControl.draft.excludeNodeIds.length ? <ul>{routeControl.draft.excludeNodeIds.map((id) => <li key={id}>不经过 · {knowledgeTitleById.get(id) ?? id}<button type="button" aria-label={`移除不经过 ${id}`} onClick={() => routeControl.removeNodeConstraint(id)}>×</button></li>)}</ul> : <p>尚未添加「不经过」。</p>}
      </section>
      {currentCapability ? <section className="ef-imm-node-inspector"><h3>{currentCapability.title}</h3><p>{currentCapability.bridge ? "课程外支撑能力" : "课程知识"}</p><div><button type="button" disabled={routeControl.busy} onClick={() => routeControl.mark(currentCapability.id, "include")}>必须经过</button><button type="button" disabled={routeControl.busy} onClick={() => routeControl.mark(currentCapability.id, "exclude")}>不经过</button><button type="button" disabled={routeControl.busy} onClick={() => routeControl.undoNode(currentCapability.id)}>撤销</button></div></section> : <p className="ef-imm-panel-note">点击场景中的能力节点，选择「必须经过」或「不经过」。</p>}
      {diff ? <section className="ef-imm-preview-card"><h3>预览变化</h3><div className="ef-imm-preview-stats"><span><b>+{diff.addedNodeIds.length}</b>新增</span><span><b>−{diff.removedNodeIds.length}</b>移除</span><span><b>+{diff.addedEdgeIds.length}</b>关系</span></div><ul>{diff.addedNodeIds.map((id) => <li key={id} className="is-added">+ {knowledgeTitleById.get(id) ?? id}</li>)}{diff.removedNodeIds.map((id) => <li key={id} className="is-removed">− {knowledgeTitleById.get(id) ?? id}</li>)}</ul></section> : null}
      {routeControl.preview && !routeControl.preview.valid ? <section className="ef-imm-preview-card is-conflict"><h3>需要处理的结构冲突</h3><ul>{routeControl.preview.conflicts.slice(0, 5).map((conflict, index) => {
        const copy = routeConflictCopy(conflict, (id) => knowledgeTitleById.get(id) ?? id);
        return <li key={`${conflict.kind}:${index}`} className="is-removed"><strong>{copy.heading}</strong><br/>{copy.reason}
          {copy.locateNodeId ? <button type="button" className="ef-imm-inline-btn" onClick={() => setSelection(capabilityLayout?.nodes.some((node) => node.id === copy.locateNodeId) ? { kind: "capability", id: copy.locateNodeId! } : { kind: "knowledge", id: copy.locateNodeId! })}>定位能力</button> : null}
          {copy.removeNodeId ? <button type="button" className="ef-imm-inline-btn" disabled={routeControl.busy} onClick={() => routeControl.removeNodeConstraint(copy.removeNodeId!)}>移除此项约束</button> : null}
          {copy.excludeTargetNodeId ? <button type="button" className="ef-imm-inline-btn" disabled={routeControl.busy} onClick={() => routeControl.mark(copy.excludeTargetNodeId!, "exclude")}>排除此目标</button> : null}
        </li>;
      })}{routeControl.preview.conflicts.length > 5 ? <li className="is-removed">还有 {routeControl.preview.conflicts.length - 5} 条</li> : null}</ul></section> : null}
      {routeControl.preview?.valid && routeControl.preview.execution?.issues.length ? <section className="ef-imm-preview-card is-conflict"><h3>需要选择真实支撑路径</h3><p>预览发现已选能力之间缺少真实关系。系统不会自动把推荐关系加进路线。</p><ul>{routeControl.preview.execution.issues.slice(0, 5).map((issue) => {
        const fact = issue.edgeId ? capabilityModel?.supportEdges.find((edge) => edge.id === issue.edgeId) : undefined;
        const label = issue.nodeId ? knowledgeTitleById.get(issue.nodeId) ?? issue.nodeId : fact ? `${knowledgeTitleById.get(fact.source) ?? fact.source} → ${knowledgeTitleById.get(fact.target) ?? fact.target}` : issue.edgeId ?? "";
        return <li key={`${issue.kind}:${issue.nodeId ?? issue.edgeId}`} className="is-removed">{label ? <><strong>{label}</strong>：</> : null}{issue.reason}{issue.kind === "action_required" ? "请在场景中选中该能力或关系，选择合法行动后重新预览。" : null}{issue.candidateEdgeIds?.length ? <button type="button" className="ef-imm-inline-btn" onClick={() => routeControl.chooseEdge(issue.candidateEdgeIds![0], true)}>选择支撑</button> : null}</li>;
      })}{routeControl.preview.execution.issues.length > 5 ? <li className="is-removed">还有 {routeControl.preview.execution.issues.length - 5} 条</li> : null}</ul></section> : null}
      {routeControl.error ? <p className="ef-imm-error" role="alert">{routeControl.error}</p> : null}
      <footer className="ef-imm-panel-actions">
        <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" disabled={routeControl.busy} onClick={() => routeControl.replan()}>预览调整结果</button>
        <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" disabled={routeControl.busy || !preview?.valid || !preview.execution?.complete} onClick={() => void routeControl.adopt()}>采用新路线</button>
      </footer>
    </aside>
  ) : null;

  return (
    <main ref={pageRef} className={`ef-imm-page ${entering ? "is-entering" : ""} ${entering && enterPhase !== "start" ? "is-enter-run" : ""} ${leaving ? "is-leaving" : ""}`} data-tab={tab} data-pose={currentPose} data-view={flat ? "flat" : "tree"}>
      {enterOverlay}
      <div className="ef-imm-transition" style={leaving ? leavingStyle ?? undefined : { opacity: 0 }} aria-hidden="true" />

      <header className="ef-imm-top">
        <div className="ef-imm-top-left">
          <button type="button" className="ef-imm-icon-btn" onClick={() => void exitScene()} aria-label="返回档案课程平面"><ArrowLeft size={18} /></button>
          <span className="ef-imm-crumb"><span>← 档案</span><b>{runtime.course.title}</b></span>
          {authenticated
            ? <span className="ef-imm-progress-pill"><b>{progress}%</b><i><b style={{ width: `${progress}%` }} /></i><span>已学 {completedCount} / {courseNodes.length}{currentTitle ? ` · 当前：${currentTitle}` : ""}</span></span>
            : <span className="ef-imm-public-pill"><Lock size={12} />公开课程 · {courseChapters.length} 章 · {courseNodes.length} 个知识</span>}
        </div>
        <nav className="ef-imm-segmented" aria-label="课程视图" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "course" && !flat} className={tab === "course" && !flat ? "is-on" : ""} onClick={() => switchTab("course")}>课程树</button>
          {authenticated ? <button type="button" role="tab" aria-selected={tab === "route" && !flat} className={tab === "route" && !flat ? "is-on" : ""} onClick={() => switchTab("route")}>路线</button> : null}
        </nav>
        <div className="ef-imm-top-right">
          {!session ? <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={openLogin}><LogIn size={14} />登录</button> : null}
        </div>
      </header>

      {!courseLayout && !enterSnapshot ? <div className="ef-imm-layout-wait" role="status"><Clock3 size={16} />正在展开课程结构…</div> : null}

      <div className={`ef-imm-stage-wrap ${flat ? "has-detail" : ""}`}>
        {flat ? (
          <CourseImmersiveStage
            ref={stageRef}
            className="ef-imm-stage-main"
            nodes={stageNodes}
            chapters={baseStageChapters}
            edges={stageEdges}
            beams={flatBeams}
            mode="flat"
            layer={swapped ? "practice" : "skill"}
            pose="flat"
            selectedId={selectedStageId}
            reducedMotion={reducedMotion}
            detailOpen={Boolean(effectiveSelection)}
            onSelect={(id, kind) => {
              setSelectionPinned(false);
              if (kind === "capability") { setSelection({ kind: "capability", id }); return; }
              setSelection({ kind: "knowledge", id });
            }}
            onBackground={() => { setSelection(null); setSelectionPinned(false); }}
            onPoseChange={() => undefined}
            onSemanticZoom={(next, percent) => { setZoom((current) => current === next ? current : next); setZoomPercent((current) => current === percent ? current : percent); }}
            onFps={(fps, nodeCount, domCount) => {
              const value = { fps, nodes: nodeCount, dom: domCount };
              setPerf(value);
              (window as unknown as { __eduflowP4Perf?: typeof value }).__eduflowP4Perf = value;
            }}
            fitKey={`${courseId}:${courseLayout?.revision ?? ""}:flat`}
            instantFit={Boolean(enterSnapshot?.cards.length) && enterPhase !== "done"}
            aria-label={`${runtime.course.title} 三维课程场景`}
          />
        ) : (
          <TiltedCourseStage
            ref={stageRef}
            className="ef-imm-stage-main"
            nodes={stageNodes}
            chapters={baseStageChapters}
            edges={stageEdges}
            beams={courseBeam}
            layer={swapped ? "practice" : "skill"}
            pose={currentPose === "rotated" ? "rotated" : "front"}
            selectedId={selectedStageId}
            externalHoverId={capsHoverId}
            rightInset={effectiveSelection ? (capListOpen ? 688 : 388) : capRailVisible ? 480 : 0}
            reducedMotion={reducedMotion}
            onCapabilityReveal={(visible) => setCapRailVisible(visible)}
            detailOpen={Boolean(effectiveSelection)}
            onSelect={(id, kind, context) => {
              // §10.10: only a front-facing (≤35°) card click may swap layers.
              // On the turned plane every click is select + open detail, so the
              // scene never restructures under the pointer and the clicked facet
              // (including a visible reflection) keeps its own x-ray.
              const front = context.angle <= 35;
              if (kind === "assignment") {
                const card = practiceByKnowledge.get(id.replace(/^(?:assignment:[^:]+:|shadow:[^:]+:|group:|empty:)/, ""));
                if (front) {
                  setTab("course");
                  setSwapped(true);
                  setSelectionPinned(false);
                } else {
                  setSelectionPinned(true);
                }
                setSelection(card && card.kind === "group" ? { kind: "group", id: card.knowledgeId } : { kind: "practice", id: (card?.assignmentIds[0] ?? id) });
                return;
              }
              if (kind === "capability") { setSelectionPinned(!front); setSelection({ kind: "capability", id }); return; }
              if (kind === "chapter" || kind === "chapter-empty") { setSelection(null); setSelectionPinned(false); return; }
              if (front) {
                setTab("course");
                setSwapped(false);
                setSelectionPinned(false);
              } else {
                setSelectionPinned(true);
              }
              setSelection({ kind: "knowledge", id });
            }}
            onBackground={() => { setSelection(null); setSelectionPinned(false); }}
            onPoseChange={(next) => {
              setPose(next);
              if (next === "front") setCapListOpen(false);
            }}
            onSemanticZoom={(next, percent) => { setZoom((current) => current === next ? current : next); setZoomPercent((current) => current === percent ? current : percent); }}
            onFps={(fps, nodeCount, domCount) => {
              const value = { fps, nodes: nodeCount, dom: domCount };
              setPerf(value);
              (window as unknown as { __eduflowP4Perf?: typeof value }).__eduflowP4Perf = value;
            }}
            fitKey={`${courseId}:${courseLayout?.revision ?? ""}:tree`}
            instantFit={Boolean(enterSnapshot?.cards.length) && enterPhase !== "done"}
            aria-label={`${runtime.course.title} 三维课程场景`}
          />
        )}
        {authenticated ? <div className="ef-imm-status-legend" role="group" aria-label={`课程学习状态图例：已学 ${learnerState.counts.acquired}，在学 ${learnerState.counts.learning}，待学 ${learnerState.counts.pending}，合计 ${learnerState.counts.total}`}>
          <span className="ef-imm-status-legend-states">
            <span><i className="is-learned" />已学 {learnerState.counts.acquired}</span>
            <span><i className="is-learning" />在学 {learnerState.counts.learning}</span>
            <span><i className="is-pending" />待学 {learnerState.counts.pending}</span>
            <span className="ef-imm-status-legend-total">合计 <b>{learnerState.counts.total}</b></span>
          </span>
          <span className="ef-imm-status-legend-markers" aria-label="不计入状态合计的呈现标记">
            <span><i className="is-current" />当前 {learnerState.counts.current}</span>
            <span><i className="is-target" />目标 {learnerState.counts.target}</span>
            {capabilityCount > 0 ? <span><i className="is-capability" />前置能力 {capabilityCount}</span> : null}
            <small>标记不计入</small>
          </span>
          {capabilityCount > 0 && pose === "front" && !flat && tab === "course" ? <span className="ef-imm-cap-hint">拖动旋转可查看 {capabilityCount} 个前置能力</span> : null}
        </div> : <div className="ef-imm-status-legend is-public" role="status"><Lock size={12} /><span>公开课程 · 只读 · 登录后查看学习状态和路线</span></div>}

        {!flat ? <SceneZoomToolbar
          className="ef-imm-controls"
          percent={zoomPercent}
          onZoomIn={() => stageRef.current?.zoomIn()}
          onZoomOut={() => stageRef.current?.zoomOut()}
          onFit={() => stageRef.current?.fit()}
          onFront={() => { setPose("front"); setCapListOpen(false); stageRef.current?.front(); }}
        /> : null}

        {tab === "course" && !flat ? <div className="ef-imm-toolbar" role="toolbar" aria-label="课程树工具">
          <button type="button" aria-pressed={swapped} onClick={() => switchLayer(!swapped)}><Layers3 size={14} />切换到{swapped ? "技能树" : "实训树"}</button>
          {authenticated ? <button type="button" aria-pressed={routeOn} onClick={() => setRouteOn((value) => !value)}><span className="ef-imm-switch" />我的路线</button> : null}
          {authenticated ? <button type="button" onClick={enterFlatten} disabled={!capabilityLayout || !activeRoute}><Edit3 size={14} />调整路线</button> : null}
          {authenticated && routeReady && !usingActiveRoute ? <span className="ef-imm-toolbar-note">个人路线未启用 · 按课程顺序</span> : null}
          {authenticated && routeReady && usingActiveRoute ? <span className="ef-imm-toolbar-note">个人路线 · 已采用</span> : null}
        </div> : null}
        {flat ? <div className="ef-imm-flatbar"><span><i />当前路线</span><span><i className="is-preview" />预览路线</span><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={leaveFlatten}>完成</button></div> : null}
      </div>

      {!flat ? capabilityRail : null}

      {!flat ? capabilityPanel : null}

      {!flat ? detailPanel : null}

      {tab === "route" && !flat && authenticated ? <CourseRouteView
        layout={winding}
        steps={routeStepInputs}
        usingActiveRoute={usingActiveRoute}
        routeVersionNumber={activeRoute?.versionNumber}
        reducedMotion={reducedMotion}
        continueStep={winding.currentIndex < 0 && routeCurrentId ? (() => {
          const node = displayNodes.find((item) => item.id === routeCurrentId);
          if (!node) return undefined;
          const micro = microFor(node.id);
          const assignment = runtime?.assignments.find((item) => node.assignmentIds.includes(item.id));
          return { title: node.title, minutes: micro?.estimatedMinutes ?? assignment?.estimatedMinutes, meta: assignment ? `实践 ${String(assignment.order + 1).padStart(2, "0")}` : undefined, onStart: () => startKnowledge(node) };
        })() : undefined}
        onSelect={(step) => {
          const kind: CourseSelection = displayNodes.some((node) => node.id === step.id) ? { kind: "knowledge", id: step.id } : { kind: "capability", id: step.id };
          setSelectionPinned(false);
          setSelection(kind);
        }}
        onStart={(step) => {
          const node = displayNodes.find((item) => item.id === step.id);
          if (node) startKnowledge(node);
          else {
            const micro = microLearningProvider?.getLesson(step.id);
            if (micro) {
              const target = createMicroLearningNavigation(step.id, { courseId, returnTo: `${location.pathname}${location.search}` });
              navigate(target.to, { state: target.state });
            }
          }
        }}
        onAdjust={enterFlatten}
      /> : null}

      {flatPanel}

      {perfEnabled && perf ? <div className="ef-imm-perf" role="status">FPS {perf.fps} · 场景 {perf.nodes} · DOM {perf.dom}</div> : null}

      {session ? <EduFlowAssistant className="ef-imm-assistant" context={{ ...coursePresentationContext({ courseId: runtime.course.id, presentation: flat ? "capability" : tab === "route" ? "path" : "graph", design: false, routeVersionId: activeRoute?.id, graph: selectedKnowledgeId ? { knowledgeId: selectedKnowledgeId } : {}, path: selectedKnowledgeId ? { knowledgeId: selectedKnowledgeId } : {}, capability: currentCapability ? { knowledgeId: currentCapability.id } : {} }), userRole: session.role, capabilities: session.capabilities }} contextLabel={runtime.course.title} drawerOpen={false} /> : null}
    </main>
  );
}

function PlanningMessage({ title, copy, onBack }: { title: string; copy: string; onBack(): void }) {
  return <section className="ef-imm-empty-card"><Target size={26} /><h1>{title}</h1><p>{copy}</p><button type="button" className="ef-ui-btn ef-ui-btn--primary" onClick={onBack}>返回档案 <ArrowRight size={14} /></button></section>;
}

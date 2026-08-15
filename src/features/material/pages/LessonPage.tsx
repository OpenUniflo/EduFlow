import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { MockSession } from "@/features/auth/types";
import { GlobalNav } from "@/app/components/GlobalNav";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import { useDomainGovernance } from "@/features/knowledge/domain/domainStore";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { buildKnowledgeAssignmentContexts, buildMaterialKnowledgeContext, buildMaterialKnowledgeRoles, buildMaterialSegmentProjection, getCourseMaterial } from "@/features/material/materialProjection";
import { MaterialControls } from "@/features/material/reader/MaterialControls";
import { MaterialKnowledgeContext } from "@/features/material/reader/MaterialKnowledgeContext";
import { createMaterialKnowledgeContextState, reduceMaterialKnowledgeContextState, resolveEffectiveKnowledgeId } from "@/features/material/reader/materialKnowledgeContextState";
import { MaterialOutline } from "@/features/material/reader/MaterialOutline";
import { MaterialRenderer } from "@/features/material/reader/MaterialRenderer";
import { useMaterialReaderState } from "@/features/material/reader/useMaterialReaderState";
import { updateMaterialReadingState, useUserCourseState, workflowLaunchUrl } from "@/features/learning/progress/progressService";
import { applicationServices } from "@/app/services/applicationServices";
import type { Material, UserCourseState, UserMaterialState } from "@/features/course/types";
import { sortMaterialSegments } from "@/features/material/materialOrdering";
import { canDesignCourse } from "@/features/auth/capabilities";

const PERSIST_DELAY_MS = 350;

function MaterialReaderShell({ runtime, material, userState, savedState, session, onLogout }: {
  runtime: CourseRuntimeData;
  material: Material;
  userState: UserCourseState;
  savedState?: UserMaterialState;
  session: MockSession;
  onLogout(): void;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const governance = useDomainGovernance();
  const requestedSegmentId = searchParams.get("segment");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const [experience, setExperience] = useState<"learn" | "design">("learn");
  const [draftSegments, setDraftSegments] = useState(material.segments);
  const [undoSegments, setUndoSegments] = useState(material.segments);
  const [assistantNote, setAssistantNote] = useState("选择动作后，中央课件会发生真实变化。");
  const renderedMaterial = useMemo(() => ({ ...material, segments: draftSegments }), [draftSegments, material]);
  const persistTimerRef = useRef<number | null>(null);
  const viewedSegmentIdsRef = useRef(new Set(savedState?.viewedSegmentIds ?? savedState?.completedSegmentIds ?? []));

  const replaceSegmentQuery = useCallback((segmentId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("segment", segmentId);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const reader = useMaterialReaderState({ material: renderedMaterial, requestedSegmentId, recentSegmentId: savedState?.recentSegmentId, onReplaceSegment: replaceSegmentQuery });
  const access = useMemo(() => userKnowledgeAccess(session.userId), [session.userId]);
  const projection = useMemo(() => buildMaterialSegmentProjection(runtime, material, reader.activeSegmentId, userState, applicationServices.knowledgeRepository, access, governance), [access, governance, material, reader.activeSegmentId, runtime, userState]);
  const currentPagePrimaryKnowledgeId = projection?.knowledgeContexts[0]?.nodeId ?? null;
  const [knowledgeContextState, dispatchKnowledgeContext] = useReducer(reduceMaterialKnowledgeContextState, currentPagePrimaryKnowledgeId, createMaterialKnowledgeContextState);
  const effectiveKnowledgeId = resolveEffectiveKnowledgeId(knowledgeContextState, currentPagePrimaryKnowledgeId);
  const effectiveKnowledge = useMemo(() => {
    if (!effectiveKnowledgeId) return null;
    const roles = knowledgeContextState.pinnedKnowledgeId
      ? buildMaterialKnowledgeRoles(runtime, material.id, effectiveKnowledgeId)
      : projection?.knowledgeContexts.find((context) => context.nodeId === effectiveKnowledgeId)?.roles ?? [];
    return buildMaterialKnowledgeContext(effectiveKnowledgeId, roles, applicationServices.knowledgeRepository, access, governance);
  }, [access, effectiveKnowledgeId, governance, knowledgeContextState.pinnedKnowledgeId, material.id, projection, runtime]);
  const knowledgeAssignmentContexts = useMemo(() => buildKnowledgeAssignmentContexts(runtime, effectiveKnowledgeId, userState), [effectiveKnowledgeId, runtime, userState]);
  const activeAssignment = knowledgeAssignmentContexts.find((context) => context.assignmentId === activeAssignmentId) ?? null;
  const orderedSegments = useMemo(() => sortMaterialSegments(renderedMaterial), [renderedMaterial]);
  const activeIndex = orderedSegments.findIndex((segment) => segment.id === reader.activeSegmentId);
  const lesson = runtime.lessons.find((item) => item.id === material.lessonId);

  useEffect(() => {
    viewedSegmentIdsRef.current = new Set(savedState?.viewedSegmentIds ?? savedState?.completedSegmentIds ?? []);
  }, [material.id]);

  useEffect(() => {
    dispatchKnowledgeContext({ type: "page-change", currentPagePrimaryKnowledgeId });
  }, [currentPagePrimaryKnowledgeId, reader.activeSegmentId]);

  useEffect(() => {
    if (!reader.activeSegmentId) return;
    viewedSegmentIdsRef.current.add(reader.activeSegmentId);
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      const viewedSegmentIds = orderedSegments.map((segment) => segment.id).filter((id) => viewedSegmentIdsRef.current.has(id));
      updateMaterialReadingState(session.userId, runtime.course.id, material.lessonId, material.id, {
        recentSegmentId: reader.activeSegmentId,
        viewedSegmentIds,
        progress: Math.round((viewedSegmentIds.length / Math.max(1, material.segments.length)) * 100)
      });
    }, PERSIST_DELAY_MS);
    return () => { if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current); };
  }, [material, orderedSegments, reader.activeSegmentId, runtime.course.id, session.userId]);

  useEffect(() => {
    if (activeAssignmentId && !knowledgeAssignmentContexts.some((context) => context.assignmentId === activeAssignmentId)) setActiveAssignmentId(null);
  }, [activeAssignmentId, knowledgeAssignmentContexts]);

  const previous = orderedSegments[activeIndex - 1];
  const next = orderedSegments[activeIndex + 1];
  function applyAssistant(kind: "simple" | "example" | "timeout" | "alignment") {
    setUndoSegments(draftSegments);
    const copy = kind === "simple" ? ["一句话理解", "并行像三位研究员同时查资料；Merge 像主编等待证据到齐。"] : kind === "example" ? ["案例：三路证据汇合", "Web、Paper 与 RAG 可以乱序完成，Merge 按来源身份收齐 3/3。"] : ["Worker 超时与 Partial Failure", "单个 Worker 超时后执行有界 Retry；耗尽后走 Fallback，并由 Verifier 决定是否足够结算。"];
    setDraftSegments((items) => [...items, { id: `session-${kind}-${Date.now()}`, order: items.length + 1, title: copy[0], section: kind === "timeout" || kind === "alignment" ? "Warning / Failure Case" : "Example", content: { lead: copy[1], code: kind === "timeout" || kind === "alignment" ? "Candidate → Verifier → Verified Success → Atomic Settle → Cancel Remaining Workers" : undefined, visual: kind === "timeout" || kind === "alignment" ? "decision" : "overview" } }]);
    setAssistantNote(kind === "alignment" ? "检测到实训要求 Partial Failure，但课件解释不足；已补充对齐内容。" : "修改已应用到当前 session 的 Lesson draft。切回学习模式仍然可见。" );
  }

  return <main className={`atlas-lesson-page material-reader-current ${leftCollapsed ? "left-collapsed" : ""} ${rightCollapsed ? "right-collapsed" : ""}`}>
    <GlobalNav active="courses" session={session} onLogout={onLogout} />
    <header className="atlas-lesson-header glass-v2">
      <button className="atlas-lesson-back" onClick={() => navigate(`/courses/${runtime.course.id}`)} aria-label="返回课程技能树"><ArrowLeft size={16} /></button>
      <div className="atlas-lesson-breadcrumb"><button onClick={() => navigate(`/courses/${runtime.course.id}`)}>{runtime.course.title}</button><span>/</span><span>{lesson?.title ?? material.title}</span></div>
      <div className="atlas-lesson-title"><strong>{material.title}</strong><small>{material.type === "pdf" ? "Original PDF" : material.type} · {draftSegments.length} 个内容段 · {material.duration ?? "自定进度"}</small></div>
      {canDesignCourse(session) ? <div className="course-experience-toggle"><button className={experience === "learn" ? "active" : ""} onClick={() => setExperience("learn")}>学习模式</button><button className={experience === "design" ? "active" : ""} onClick={() => setExperience("design")}>课程设计</button></div> : null}
    </header>

    <MaterialOutline material={renderedMaterial} activeSegmentId={reader.activeSegmentId} collapsed={leftCollapsed} onToggle={() => setLeftCollapsed((value) => !value)} onSelect={(segmentId) => reader.navigateToSegment(segmentId, "outline", "smooth")} />
    <MaterialRenderer material={renderedMaterial} activeSegmentId={reader.activeSegmentId} zoom={zoom} navigationRequest={reader.navigationRequest} onVisibleSegmentChange={reader.observeSegment} onNavigationSettled={reader.settleNavigation} />
    <MaterialKnowledgeContext projection={projection} selectedKnowledgeId={knowledgeContextState.selectedKnowledgeId} pinnedKnowledgeId={knowledgeContextState.pinnedKnowledgeId} effectiveKnowledge={effectiveKnowledge} knowledgeAssignmentContexts={knowledgeAssignmentContexts} collapsed={rightCollapsed} onToggle={() => setRightCollapsed((value) => !value)} onSelect={(nodeId) => dispatchKnowledgeContext({ type: "select", nodeId })} onTogglePin={() => dispatchKnowledgeContext(knowledgeContextState.pinnedKnowledgeId ? { type: "unpin", currentPagePrimaryKnowledgeId } : { type: "pin" })} onAssignment={setActiveAssignmentId} />
    <MaterialControls current={activeIndex + 1} total={draftSegments.length} zoom={zoom} onZoom={setZoom} onFit={() => setZoom(1)} onPrevious={() => previous && reader.navigateToSegment(previous.id, "previous", "smooth")} onNext={() => next && reader.navigateToSegment(next.id, "next", "smooth")} />
    {experience === "design" && material.type !== "pdf" ? <aside className="lesson-ai-assistant glass-v2"><strong>AI 课件助手</strong><p>{assistantNote}</p><button onClick={() => applyAssistant("simple")}>解释得简单一点</button><button onClick={() => applyAssistant("example")}>增加案例</button><button onClick={() => applyAssistant("timeout")}>增加 Worker 超时案例</button><button onClick={() => applyAssistant("alignment")}>检查课件与实训是否一致</button><button className="undo" onClick={() => { setDraftSegments(undoSegments); setAssistantNote("已撤销本次修改。"); }}>撤销本次修改</button><small>Prototype · 固定意图映射为可应用的 Lesson mutation</small></aside> : null}

    {activeAssignment ? <div className="atlas-workflow-modal" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveAssignmentId(null); }}><article className="atlas-workflow-modal-card glass-v2"><button className="atlas-modal-close" onClick={() => setActiveAssignmentId(null)} aria-label="关闭实训详情"><X size={18} /></button><span className="atlas-kicker">COURSE ASSIGNMENT</span><h2>{activeAssignment.assignment.title}</h2><p>{activeAssignment.assignment.description}</p><section><h3>任务要求</h3>{activeAssignment.assignment.requirements.map((requirement) => <div key={requirement}><Check size={13} />{requirement}</div>)}</section><section><h3>预期成果</h3><p>{activeAssignment.assignment.expectedOutput}</p></section><div className="atlas-modal-actions"><button className="atlas-secondary" onClick={() => setActiveAssignmentId(null)}>关闭</button>{activeAssignment.assignment.mode === "workflow" && activeAssignment.assignment.workflowTemplateId ? <button className="atlas-primary" onClick={() => navigate(workflowLaunchUrl({ courseId: runtime.course.id, assignmentId: activeAssignment.assignment.id, workflowTemplateId: activeAssignment.assignment.workflowTemplateId! }))}>进入工作流 <ArrowRight size={15} /></button> : null}</div></article></div> : null}
  </main>;
}

export function LessonPage({ session, onLogout }: { session: MockSession; onLogout: () => void }) {
  const navigate = useNavigate();
  const { courseId = "", materialId = "" } = useParams();
  const runtime = applicationServices.courseRepository.getCourse(courseId);
  const material = runtime ? getCourseMaterial(runtime, materialId) : null;
  const userState = useUserCourseState(session.userId, courseId);

  if (!runtime || !material) {
    return <main className="atlas-lesson-page material-reader-current"><GlobalNav active="courses" session={session} onLogout={onLogout} /><section className="atlas-empty-state"><h1>课件不存在</h1><p>该课件不存在，或不属于课程 “{courseId}”。</p><button className="atlas-primary" onClick={() => navigate(runtime ? `/courses/${runtime.course.id}` : "/courses")}>返回课程</button></section></main>;
  }

  return <MaterialReaderShell key={`${session.userId}:${runtime.course.id}:${material.id}`} runtime={runtime} material={material} userState={userState} savedState={userState.materialStates[material.id]} session={session} onLogout={onLogout} />;
}

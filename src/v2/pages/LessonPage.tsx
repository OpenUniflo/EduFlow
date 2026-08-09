import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { MockSession } from "../../app/model";
import { GlobalNav } from "../components/GlobalNav";
import type { CourseRuntimeData } from "../course/runtime/courseRuntime";
import { useDomainGovernance } from "../knowledge/domain/domainStore";
import { userKnowledgeAccess } from "../knowledge/repository/KnowledgeRepository";
import { buildMaterialSegmentProjection, getCourseMaterial } from "../material/materialProjection";
import { MaterialControls } from "../material/reader/MaterialControls";
import { MaterialKnowledgeContext, type MaterialKnowledgeItem } from "../material/reader/MaterialKnowledgeContext";
import { MaterialOutline } from "../material/reader/MaterialOutline";
import { MaterialRenderer } from "../material/reader/MaterialRenderer";
import { useMaterialReaderState } from "../material/reader/useMaterialReaderState";
import { updateMaterialReadingState, useUserCourseState, workflowLaunchUrl } from "../progress/progressService";
import { applicationServices } from "../services/applicationServices";
import type { Material, UserCourseState, UserMaterialState } from "../types";

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
  const [pinnedKnowledge, setPinnedKnowledge] = useState<MaterialKnowledgeItem | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const viewedSegmentIdsRef = useRef(new Set(savedState?.viewedSegmentIds ?? savedState?.completedSegmentIds ?? []));

  const replaceSegmentQuery = useCallback((segmentId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("segment", segmentId);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const reader = useMaterialReaderState({ material, requestedSegmentId, recentSegmentId: savedState?.recentSegmentId, onReplaceSegment: replaceSegmentQuery });
  const access = useMemo(() => userKnowledgeAccess(session.email), [session.email]);
  const projection = useMemo(() => buildMaterialSegmentProjection(runtime, material, reader.activeSegmentId, userState, applicationServices.knowledgeRepository, access, governance), [access, governance, material, reader.activeSegmentId, runtime, userState]);
  const activeAssignment = projection?.assignmentContexts.find((context) => context.assignmentId === activeAssignmentId) ?? null;
  const activeIndex = material.segments.findIndex((segment) => segment.id === reader.activeSegmentId);
  const lesson = runtime.lessons.find((item) => item.id === material.lessonId);

  useEffect(() => {
    viewedSegmentIdsRef.current = new Set(savedState?.viewedSegmentIds ?? savedState?.completedSegmentIds ?? []);
    setPinnedKnowledge(null);
  }, [material.id]);

  useEffect(() => {
    if (!reader.activeSegmentId) return;
    viewedSegmentIdsRef.current.add(reader.activeSegmentId);
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      const viewedSegmentIds = material.segments.map((segment) => segment.id).filter((id) => viewedSegmentIdsRef.current.has(id));
      updateMaterialReadingState(session.email, runtime.course.id, material.lessonId, material.id, {
        recentSegmentId: reader.activeSegmentId,
        viewedSegmentIds,
        progress: Math.round((viewedSegmentIds.length / Math.max(1, material.segments.length)) * 100)
      });
    }, PERSIST_DELAY_MS);
    return () => { if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current); };
  }, [material, reader.activeSegmentId, runtime.course.id, session.email]);

  useEffect(() => {
    if (activeAssignmentId && !projection?.assignmentContexts.some((context) => context.assignmentId === activeAssignmentId)) setActiveAssignmentId(null);
  }, [activeAssignmentId, projection]);

  const previous = material.segments[activeIndex - 1];
  const next = material.segments[activeIndex + 1];

  return <main className={`atlas-lesson-page material-reader-current ${leftCollapsed ? "left-collapsed" : ""} ${rightCollapsed ? "right-collapsed" : ""}`}>
    <GlobalNav active="courses" session={session} onLogout={onLogout} />
    <header className="atlas-lesson-header glass-v2">
      <button className="atlas-lesson-back" onClick={() => navigate(`/courses/${runtime.course.id}`)} aria-label="返回课程技能树"><ArrowLeft size={16} /></button>
      <div className="atlas-lesson-breadcrumb"><button onClick={() => navigate(`/courses/${runtime.course.id}`)}>{runtime.course.title}</button><span>/</span><span>{lesson?.title ?? material.title}</span></div>
      <div className="atlas-lesson-title"><strong>{material.title}</strong><small>{material.type === "pdf" ? "Original PDF" : material.type} · {material.segments.length} 个内容段 · {material.duration ?? "自定进度"}</small></div>
    </header>

    <MaterialOutline material={material} activeSegmentId={reader.activeSegmentId} collapsed={leftCollapsed} onToggle={() => setLeftCollapsed((value) => !value)} onSelect={(segmentId) => reader.navigateToSegment(segmentId, "outline", "smooth")} />
    <MaterialRenderer material={material} activeSegmentId={reader.activeSegmentId} zoom={zoom} navigationRequest={reader.navigationRequest} onVisibleSegmentChange={reader.observeSegment} onNavigationSettled={reader.settleNavigation} />
    <MaterialKnowledgeContext projection={projection} pinnedKnowledge={pinnedKnowledge} collapsed={rightCollapsed} onToggle={() => setRightCollapsed((value) => !value)} onPin={setPinnedKnowledge} onAssignment={setActiveAssignmentId} />
    <MaterialControls current={activeIndex + 1} total={material.segments.length} zoom={zoom} onZoom={setZoom} onFit={() => setZoom(1)} onPrevious={() => previous && reader.navigateToSegment(previous.id, "previous", "smooth")} onNext={() => next && reader.navigateToSegment(next.id, "next", "smooth")} />

    {activeAssignment ? <div className="atlas-workflow-modal" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveAssignmentId(null); }}><article className="atlas-workflow-card glass-v2"><button className="atlas-modal-close" onClick={() => setActiveAssignmentId(null)} aria-label="关闭实训详情"><X size={18} /></button><span className="atlas-kicker">COURSE ASSIGNMENT</span><h2>{activeAssignment.assignment.title}</h2><p>{activeAssignment.assignment.description}</p><section><h3>任务要求</h3>{activeAssignment.assignment.requirements.map((requirement) => <div key={requirement}><Check size={13} />{requirement}</div>)}</section><section><h3>预期成果</h3><p>{activeAssignment.assignment.expectedOutput}</p></section><div className="atlas-modal-actions"><button className="atlas-secondary" onClick={() => setActiveAssignmentId(null)}>关闭</button>{activeAssignment.assignment.mode === "workflow" && activeAssignment.assignment.workflowTemplateId ? <button className="atlas-primary" onClick={() => navigate(workflowLaunchUrl({ courseId: runtime.course.id, assignmentId: activeAssignment.assignment.id, workflowTemplateId: activeAssignment.assignment.workflowTemplateId! }))}>进入工作流 <ArrowRight size={15} /></button> : null}</div></article></div> : null}
  </main>;
}

export function LessonPage({ session, onLogout }: { session: MockSession; onLogout: () => void }) {
  const navigate = useNavigate();
  const { courseId = "", materialId = "" } = useParams();
  const runtime = applicationServices.courseRepository.getCourse(courseId);
  const material = runtime ? getCourseMaterial(runtime, materialId) : null;
  const userState = useUserCourseState(session.email, courseId);

  if (!runtime || !material) {
    return <main className="atlas-lesson-page material-reader-current"><GlobalNav active="courses" session={session} onLogout={onLogout} /><section className="atlas-empty-state"><h1>课件不存在</h1><p>该课件不存在，或不属于课程 “{courseId}”。</p><button className="atlas-primary" onClick={() => navigate(runtime ? `/courses/${runtime.course.id}` : "/courses")}>返回课程</button></section></main>;
  }

  return <MaterialReaderShell key={`${session.email}:${runtime.course.id}:${material.id}`} runtime={runtime} material={material} userState={userState} savedState={userState.materialStates[material.id]} session={session} onLogout={onLogout} />;
}

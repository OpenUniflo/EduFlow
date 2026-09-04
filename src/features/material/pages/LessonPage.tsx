import { ArrowLeft, ArrowRight, Check, Send, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { MockSession } from "@/features/auth/types";
import { GlobalNav } from "@/app/components/GlobalNav";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import { useDomainGovernance } from "@/features/knowledge/domain/domainStore";
import { globalKnowledgeAccess, userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { buildKnowledgeAssignmentContexts, buildMaterialKnowledgeContext, buildMaterialKnowledgeRoles, buildMaterialSegmentProjection, getCourseMaterial } from "@/features/material/materialProjection";
import { MaterialControls } from "@/features/material/reader/MaterialControls";
import { MaterialKnowledgeContext } from "@/features/material/reader/MaterialKnowledgeContext";
import { createMaterialKnowledgeContextState, reduceMaterialKnowledgeContextState, resolveEffectiveKnowledgeId } from "@/features/material/reader/materialKnowledgeContextState";
import { MaterialOutline } from "@/features/material/reader/MaterialOutline";
import { MaterialRenderer } from "@/features/material/reader/MaterialRenderer";
import { useMaterialReaderState } from "@/features/material/reader/useMaterialReaderState";
import { updateMaterialReadingState, useOptionalUserCourseState } from "@/features/learning/progress/progressService";
import { applicationServices } from "@/app/services/applicationServices";
import type { Material, UserCourseState, UserMaterialState } from "@/features/course/types";
import { sortMaterialSegments } from "@/features/material/materialOrdering";
import { canDesignCourse } from "@/features/auth/capabilities";
import type { LessonAssistantProvider, LessonAssistantResult } from "@/features/material/lessonAssistant";
import { ExperienceModeToggle } from "@/shared/components/ExperienceModeToggle";
import { applyCourseAuthoringDraft, createEditableKnowledgeRepository, type CourseAuthoringDraftState } from "@/features/course/authoring/courseAuthoringDraft";
import { EduFlowAssistant } from "@/features/assistant/components/EduFlowAssistant";
import { selectPrimaryCurriculumCoverage } from "@/features/course/curriculum/curriculumOrdering";

const PERSIST_DELAY_MS = 350;

function MaterialReaderShell({ runtime, material, userState, savedState, session, lessonAssistantProvider, onLogout, draftState }: {
  runtime: CourseRuntimeData;
  material: Material;
  userState?: UserCourseState;
  savedState?: UserMaterialState;
  session: MockSession | null;
  lessonAssistantProvider?: LessonAssistantProvider;
  onLogout(): void;
  draftState?: CourseAuthoringDraftState | null;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const governance = useDomainGovernance();
  const requestedSegmentId = searchParams.get("segment");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const [experience, setExperience] = useState<"learn" | "design">(() => searchParams.get("experience") === "design" && canDesignCourse(session) ? "design" : "learn");
  const [draftSegments, setDraftSegments] = useState(material.segments);
  const [undoSegments, setUndoSegments] = useState(material.segments);
  const [assistantNote, setAssistantNote] = useState("我会根据当前 Segment、Knowledge 与学习模式提供帮助。");
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantPreview, setAssistantPreview] = useState<LessonAssistantResult | null>(null);
  const renderedMaterial = useMemo(() => ({ ...material, segments: draftSegments }), [draftSegments, material]);
  const persistTimerRef = useRef<number | null>(null);
  const viewedSegmentIdsRef = useRef(new Set(savedState?.viewedSegmentIds ?? savedState?.completedSegmentIds ?? []));

  const replaceSegmentQuery = useCallback((segmentId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("segment", segmentId);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const reader = useMaterialReaderState({ material: renderedMaterial, requestedSegmentId, recentSegmentId: savedState?.recentSegmentId, onReplaceSegment: replaceSegmentQuery });
  const access = useMemo(() => session ? userKnowledgeAccess(session.userId) : globalKnowledgeAccess, [session]);
  const editableKnowledgeRepository=useMemo(()=>draftState ? createEditableKnowledgeRepository(applicationServices.knowledgeRepository,draftState) : applicationServices.knowledgeRepository,[draftState]);
  const projection = useMemo(() => buildMaterialSegmentProjection(runtime, material, reader.activeSegmentId, userState, editableKnowledgeRepository, access, governance), [access, editableKnowledgeRepository, governance, material, reader.activeSegmentId, runtime, userState]);
  const currentPagePrimaryKnowledgeId = projection?.knowledgeContexts[0]?.nodeId ?? null;
  const [knowledgeContextState, dispatchKnowledgeContext] = useReducer(reduceMaterialKnowledgeContextState, currentPagePrimaryKnowledgeId, createMaterialKnowledgeContextState);
  const effectiveKnowledgeId = resolveEffectiveKnowledgeId(knowledgeContextState, currentPagePrimaryKnowledgeId);
  const effectiveKnowledge = useMemo(() => {
    if (!effectiveKnowledgeId) return null;
    const roles = knowledgeContextState.pinnedKnowledgeId
      ? buildMaterialKnowledgeRoles(runtime, material.id, effectiveKnowledgeId)
      : projection?.knowledgeContexts.find((context) => context.nodeId === effectiveKnowledgeId)?.roles ?? [];
    return buildMaterialKnowledgeContext(effectiveKnowledgeId, roles, editableKnowledgeRepository, access, governance);
  }, [access, editableKnowledgeRepository, effectiveKnowledgeId, governance, knowledgeContextState.pinnedKnowledgeId, material.id, projection, runtime]);
  const knowledgeAssignmentContexts = useMemo(() => buildKnowledgeAssignmentContexts(runtime, effectiveKnowledgeId, userState), [effectiveKnowledgeId, runtime, userState]);
  const activeAssignment = knowledgeAssignmentContexts.find((context) => context.assignmentId === activeAssignmentId) ?? null;
  const orderedSegments = useMemo(() => sortMaterialSegments(renderedMaterial), [renderedMaterial]);
  const activeIndex = orderedSegments.findIndex((segment) => segment.id === reader.activeSegmentId);
  const contextualCoverage = selectPrimaryCurriculumCoverage(
    runtime.curriculumCoverages.filter((coverage) => coverage.nodeId === currentPagePrimaryKnowledgeId),
    runtime.lessons
  );
  const lesson = runtime.lessons.find((item) => item.id === contextualCoverage?.lessonId);

  useEffect(() => {
    viewedSegmentIdsRef.current = new Set(savedState?.viewedSegmentIds ?? savedState?.completedSegmentIds ?? []);
  }, [material.id]);

  useEffect(() => {
    dispatchKnowledgeContext({ type: "page-change", currentPagePrimaryKnowledgeId });
  }, [currentPagePrimaryKnowledgeId, reader.activeSegmentId]);

  useEffect(() => {
    if (!session || !reader.activeSegmentId || material.id.startsWith("draft-material-")) return;
    viewedSegmentIdsRef.current.add(reader.activeSegmentId);
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      const viewedSegmentIds = orderedSegments.map((segment) => segment.id).filter((id) => viewedSegmentIdsRef.current.has(id));
      updateMaterialReadingState(session.userId, runtime.course.id, lesson?.id, material.id, {
        recentSegmentId: reader.activeSegmentId,
        viewedSegmentIds,
        progress: Math.round((viewedSegmentIds.length / Math.max(1, material.segments.length)) * 100)
      });
    }, PERSIST_DELAY_MS);
    return () => { if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current); };
  }, [lesson, material, orderedSegments, reader.activeSegmentId, runtime.course.id, session]);

  useEffect(() => {
    if (activeAssignmentId && !knowledgeAssignmentContexts.some((context) => context.assignmentId === activeAssignmentId)) setActiveAssignmentId(null);
  }, [activeAssignmentId, knowledgeAssignmentContexts]);

  const previous = orderedSegments[activeIndex - 1];
  const next = orderedSegments[activeIndex + 1];
  function applyAssistantPreview() {
    if (!assistantPreview?.mutation) return;
    setUndoSegments(draftSegments);
    setDraftSegments((items) => [...items, { ...assistantPreview.mutation!.segment, id:`${assistantPreview.mutation!.segment.id}-${Date.now()}`, order:items.length+1 }]);
    setAssistantNote("修改已应用到当前 session 的 Lesson draft。切回学习模式仍然可见。");
    setAssistantPreview(null);
  }

  const lessonAssistantActions = lessonAssistantProvider?.listActions(material) ?? [];
  const designEnabled = experience === "design" && canDesignCourse(session);
  const assistantContext = session ? {workspace:"material" as const,experienceMode:experience,userRole:session.role,capabilities:session.capabilities,courseId:runtime.course.id,lessonId:lesson?.id,materialId:material.id,segmentId:reader.activeSegmentId,knowledgeId:effectiveKnowledgeId??undefined,assignmentId:activeAssignmentId??undefined} : undefined;

  return <main className={`atlas-lesson-page material-reader-current ${leftCollapsed ? "left-collapsed" : ""} ${rightCollapsed ? "right-collapsed" : ""}`} data-experience={experience}>
    <GlobalNav active={designEnabled ? "teaching" : "courses"} session={session} onLogout={onLogout} />
    <header className="atlas-lesson-header">
      <div className="atlas-lesson-header-left"><button className="atlas-lesson-back" onClick={() => navigate(`/courses/${runtime.course.id}`)} aria-label="返回课程技能树"><ArrowLeft size={16} /></button><div className="atlas-lesson-breadcrumb"><button onClick={() => navigate(`/courses/${runtime.course.id}`)}>{runtime.course.title}</button><span>/</span><span>{lesson?.title ?? material.title}</span></div></div>
      <div className="atlas-lesson-title"><strong>{material.title}</strong><small>{material.type === "pdf" ? "Original PDF" : material.type} · {draftSegments.length} 个内容段 · {material.duration ?? "自定进度"}</small></div>
      {canDesignCourse(session) ? <ExperienceModeToggle value={experience} onChange={setExperience} /> : null}
    </header>

    <MaterialOutline material={renderedMaterial} activeSegmentId={reader.activeSegmentId} collapsed={leftCollapsed} onToggle={() => setLeftCollapsed((value) => !value)} onSelect={(segmentId) => reader.navigateToSegment(segmentId, "outline", "smooth")} />
    <MaterialRenderer material={renderedMaterial} activeSegmentId={reader.activeSegmentId} zoom={zoom} navigationRequest={reader.navigationRequest} onVisibleSegmentChange={reader.observeSegment} onNavigationSettled={reader.settleNavigation} />
    <MaterialKnowledgeContext projection={projection} selectedKnowledgeId={knowledgeContextState.selectedKnowledgeId} pinnedKnowledgeId={knowledgeContextState.pinnedKnowledgeId} effectiveKnowledge={effectiveKnowledge} knowledgeAssignmentContexts={knowledgeAssignmentContexts} collapsed={rightCollapsed} onToggle={() => setRightCollapsed((value) => !value)} onSelect={(nodeId) => dispatchKnowledgeContext({ type: "select", nodeId })} onTogglePin={() => dispatchKnowledgeContext(knowledgeContextState.pinnedKnowledgeId ? { type: "unpin", currentPagePrimaryKnowledgeId } : { type: "pin" })} onAssignment={setActiveAssignmentId} />
    <MaterialControls current={activeIndex + 1} total={draftSegments.length} zoom={zoom} onZoom={setZoom} onFit={() => setZoom(1)} onPrevious={() => previous && reader.navigateToSegment(previous.id, "previous", "smooth")} onNext={() => next && reader.navigateToSegment(next.id, "next", "smooth")} />
    <EduFlowAssistant className="lesson-design-assistant" context={assistantContext} locked={!session} contextLabel={effectiveKnowledge?.title??material.title}>{designEnabled?<><p className="lesson-assistant-note">{assistantNote}</p><div className="course-design-assistant-actions">{lessonAssistantProvider?lessonAssistantActions.map((action)=><button key={action.id} onClick={()=>{const result=lessonAssistantProvider.resolveAction(material,action.id);setAssistantPreview(result);setAssistantNote(result.message);}}>{action.label}</button>):null}</div>{assistantPreview?.mutation?<div className="lesson-assistant-preview"><strong>修改预览</strong><span>{assistantPreview.mutation.segment.title}</span><p>{assistantPreview.mutation.segment.content?.lead}</p><button onClick={applyAssistantPreview}>应用修改</button></div>:null}{lessonAssistantProvider?<><div className="course-design-assistant-input"><input value={assistantInput} onChange={(event)=>setAssistantInput(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&assistantInput.trim()){const result=lessonAssistantProvider.resolveText(material,assistantInput);setAssistantPreview(result);setAssistantNote(result.message);}}} placeholder="描述你想怎样修改课件…"/><button onClick={()=>{if(!assistantInput.trim())return;const result=lessonAssistantProvider.resolveText(material,assistantInput);setAssistantPreview(result);setAssistantNote(result.message);}} aria-label="发送课件修改要求"><Send size={15}/></button></div><button className="lesson-assistant-undo" onClick={()=>{setDraftSegments(undoSegments);setAssistantNote("已撤销本次修改。");setAssistantPreview(null);}}>撤销本次修改</button><small className="lesson-assistant-footnote">Specialized Design Provider · Preview / Validation / Apply / Undo</small></>:null}</>:undefined}</EduFlowAssistant>

    {activeAssignment ? <div className="atlas-workflow-modal" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveAssignmentId(null); }}><article className="atlas-workflow-modal-card glass-v2"><button className="atlas-modal-close" onClick={() => setActiveAssignmentId(null)} aria-label="关闭实训详情"><X size={18} /></button><span className="atlas-kicker">COURSE ASSIGNMENT</span><h2>{activeAssignment.assignment.title}</h2><p>{activeAssignment.assignment.description}</p>{activeAssignment.assignment.inheritedOutputs?.length ? <section><h3>已继承成果</h3>{activeAssignment.assignment.inheritedOutputs.map((item)=><div key={item}><Check size={13}/>{item}</div>)}</section>:null}<section><h3>任务要求</h3>{activeAssignment.assignment.requirements.map((requirement) => <div key={requirement}><Check size={13} />{requirement}</div>)}</section><section><h3>预期成果</h3><p>{activeAssignment.assignment.expectedOutput}</p></section><div className="atlas-modal-actions"><button className="atlas-secondary" onClick={() => setActiveAssignmentId(null)}>关闭</button><button className="atlas-primary" onClick={() => navigate(`/courses/${runtime.course.id}/assignments/${activeAssignment.assignment.id}`)}>进入实训 <ArrowRight size={15} /></button></div></article></div> : null}
  </main>;
}

export function LessonPage({ session, onLogout, lessonAssistantProvider }: { session: MockSession | null; onLogout: () => void; lessonAssistantProvider?: LessonAssistantProvider }) {
  const navigate = useNavigate();
  const { courseId = "", materialId = "" } = useParams();
  const baseRuntime = applicationServices.courseRepository.getCourse(courseId);
  const design = new URLSearchParams(window.location.search).get("experience") === "design" && canDesignCourse(session);
  const [draftState, setDraftState] = useState<CourseAuthoringDraftState | null>(null);
  useEffect(() => { let active=true; if (!design || !baseRuntime) { setDraftState(null); return; } void applicationServices.courseAuthoringDraftRepository.getDraft(courseId).then((result)=>{if(active)setDraftState(result.draft?.state??null);}).catch(()=>{if(active)setDraftState(null);}); return()=>{active=false;}; }, [baseRuntime, courseId, design]);
  const runtime = useMemo(() => baseRuntime ? (draftState ? applyCourseAuthoringDraft(baseRuntime, draftState) : baseRuntime) : undefined, [baseRuntime, draftState]);
  const material = runtime ? getCourseMaterial(runtime, materialId) : null;
  const userState = useOptionalUserCourseState(session?.userId, courseId);

  if (!runtime || !material) {
    return <main className="atlas-lesson-page material-reader-current"><GlobalNav active="courses" session={session} onLogout={onLogout} /><section className="atlas-empty-state"><h1>课件不存在</h1><p>该课件不存在，或不属于课程 “{courseId}”。</p><button className="atlas-primary" onClick={() => navigate(runtime ? `/courses/${runtime.course.id}` : "/courses")}>返回课程</button></section></main>;
  }

  return <MaterialReaderShell key={`${session?.userId??"public"}:${runtime.course.id}:${material.id}`} runtime={runtime} material={material} userState={userState} savedState={userState?.materialStates[material.id]} session={session} lessonAssistantProvider={lessonAssistantProvider} onLogout={onLogout} draftState={draftState} />;
}

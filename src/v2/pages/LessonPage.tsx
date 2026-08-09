import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, FileText, Network, Pin, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { MockSession } from "../../app/model";
import { GlobalNav } from "../components/GlobalNav";
import { useDomainGovernance } from "../knowledge/domain/domainStore";
import { userKnowledgeAccess } from "../knowledge/repository/KnowledgeRepository";
import { buildMaterialSegmentProjection, getCourseMaterial } from "../material/materialProjection";
import { resolveInitialMaterialSegment } from "../material/materialNavigation";
import { updateMaterialReadingState, useUserCourseState, workflowLaunchUrl } from "../progress/progressService";
import { applicationServices } from "../services/applicationServices";

const PERSIST_DELAY_MS = 350;

export function LessonPage({ session, onLogout }: { session: MockSession; onLogout: () => void }) {
  const navigate = useNavigate();
  const { courseId = "", materialId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const governance = useDomainGovernance();
  const runtime = applicationServices.courseRepository.getCourse(courseId);
  const material = runtime ? getCourseMaterial(runtime, materialId) : null;
  const userState = useUserCourseState(session.email, courseId);
  const savedState = userState.materialStates[materialId];
  const requestedSegmentId = searchParams.get("segment");
  const segmentIds = useMemo(() => material?.segments.map((segment) => segment.id) ?? [], [material]);
  const resolvedSegmentId = resolveInitialMaterialSegment({ segmentIds, requestedSegmentId, recentSegmentId: savedState?.recentSegmentId });
  const [activeSegmentId, setActiveSegmentId] = useState(resolvedSegmentId);
  const [pinnedNodeId, setPinnedNodeId] = useState<string | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const persistTimerRef = useRef<number | null>(null);
  const viewedSegmentIdsRef = useRef(new Set<string>());
  const hasAlignedInitialSegmentRef = useRef(false);

  const access = useMemo(() => userKnowledgeAccess(session.email), [session.email]);
  const projection = useMemo(() => runtime && material ? buildMaterialSegmentProjection(runtime, material, activeSegmentId, userState, applicationServices.knowledgeRepository, access, governance) : null, [access, activeSegmentId, governance, material, runtime, userState]);
  const activeKnowledge = pinnedNodeId ? projection?.knowledgeContexts.find((context) => context.nodeId === pinnedNodeId) ?? projection?.knowledgeContexts[0] : projection?.knowledgeContexts[0];
  const activeAssignment = projection?.assignmentContexts.find((context) => context.assignmentId === activeAssignmentId) ?? null;
  const activeIndex = material?.segments.findIndex((segment) => segment.id === activeSegmentId) ?? -1;
  const lesson = runtime?.lessons.find((item) => item.id === material?.lessonId);

  useEffect(() => {
    viewedSegmentIdsRef.current = new Set(savedState?.viewedSegmentIds ?? savedState?.completedSegmentIds ?? []);
    hasAlignedInitialSegmentRef.current = false;
  }, [materialId, savedState?.completedSegmentIds, savedState?.viewedSegmentIds]);

  useEffect(() => {
    if (!material || !resolvedSegmentId) return;
    if (hasAlignedInitialSegmentRef.current && resolvedSegmentId === activeSegmentId) return;
    setActiveSegmentId(resolvedSegmentId);
    setPinnedNodeId(null);
    window.requestAnimationFrame(() => {
      scrollRef.current?.querySelector<HTMLElement>(`[data-segment-id="${CSS.escape(resolvedSegmentId)}"]`)?.scrollIntoView({ behavior: "auto", block: "center" });
      hasAlignedInitialSegmentRef.current = true;
    });
  }, [activeSegmentId, material, resolvedSegmentId]);

  useEffect(() => {
    if (!material || !activeSegmentId || requestedSegmentId === activeSegmentId) return;
    setSearchParams({ segment: activeSegmentId }, { replace: true });
  }, [activeSegmentId, material, requestedSegmentId, setSearchParams]);

  useEffect(() => {
    if (!material || !activeSegmentId) return;
    viewedSegmentIdsRef.current.add(activeSegmentId);
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      const viewedSegmentIds = material.segments.map((segment) => segment.id).filter((id) => viewedSegmentIdsRef.current.has(id));
      updateMaterialReadingState(session.email, courseId, material.lessonId, material.id, {
        recentSegmentId: activeSegmentId,
        viewedSegmentIds,
        progress: Math.round((viewedSegmentIds.length / Math.max(1, material.segments.length)) * 100)
      });
    }, PERSIST_DELAY_MS);
    return () => { if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current); };
  }, [activeSegmentId, courseId, material, session.email]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !material || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting);
      if (!visible.length) return;
      const rootCenter = root.getBoundingClientRect().top + root.clientHeight / 2;
      const nearest = visible.sort((left, right) => Math.abs(left.boundingClientRect.top + left.boundingClientRect.height / 2 - rootCenter) - Math.abs(right.boundingClientRect.top + right.boundingClientRect.height / 2 - rootCenter))[0];
      const segmentId = (nearest.target as HTMLElement).dataset.segmentId;
      if (segmentId) {
        setActiveSegmentId(segmentId);
        setPinnedNodeId(null);
      }
    }, { root, threshold: [0.2, 0.4, 0.6, 0.8] });
    root.querySelectorAll<HTMLElement>("[data-segment-id]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [material]);

  useEffect(() => {
    if (activeAssignmentId && !projection?.assignmentContexts.some((context) => context.assignmentId === activeAssignmentId)) setActiveAssignmentId(null);
  }, [activeAssignmentId, projection]);

  function selectSegment(segmentId: string, behavior: ScrollBehavior = "smooth") {
    if (!material?.segments.some((segment) => segment.id === segmentId)) return;
    setActiveSegmentId(segmentId);
    setPinnedNodeId(null);
    scrollRef.current?.querySelector<HTMLElement>(`[data-segment-id="${CSS.escape(segmentId)}"]`)?.scrollIntoView({ behavior, block: "center" });
  }

  if (!runtime || !material) {
    return <main className="atlas-lesson-page material-reader-current"><GlobalNav active="courses" session={session} onLogout={onLogout} /><section className="atlas-empty-state"><h1>课件不存在</h1><p>该课件不存在，或不属于课程 “{courseId}”。</p><button className="atlas-primary" onClick={() => navigate(runtime ? `/courses/${runtime.course.id}` : "/courses")}>返回课程</button></section></main>;
  }

  return (
    <main className={`atlas-lesson-page material-reader-current ${leftCollapsed ? "left-collapsed" : ""} ${rightCollapsed ? "right-collapsed" : ""}`}>
      <GlobalNav active="courses" session={session} onLogout={onLogout} />
      <header className="atlas-lesson-header glass-v2">
        <button className="atlas-lesson-back" onClick={() => navigate(`/courses/${runtime.course.id}`)} aria-label="返回课程技能树"><ArrowLeft size={16} /></button>
        <div className="atlas-lesson-breadcrumb"><button onClick={() => navigate(`/courses/${runtime.course.id}`)}>{runtime.course.title}</button><span>/</span><span>{lesson?.title ?? material.title}</span></div>
        <div className="atlas-lesson-title"><strong>{material.title}</strong><small>{material.type} · {material.segments.length} 个内容段 · {material.duration ?? "自定进度"}</small></div>
      </header>

      <aside className="atlas-lesson-outline glass-v2">
        <button className="atlas-lesson-collapse" onClick={() => setLeftCollapsed((value) => !value)} aria-label="折叠课件目录">{leftCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>
        {!leftCollapsed ? <><div className="atlas-outline-head"><FileText size={16} /><span><strong>课件目录</strong><small>{material.segments.length} Segments</small></span></div><div className="atlas-outline-list">{material.segments.map((segment) => <button key={segment.id} className={segment.id === activeSegmentId ? "active" : ""} aria-current={segment.id === activeSegmentId ? "true" : undefined} onClick={() => selectSegment(segment.id)}><span>{String(segment.order).padStart(2, "0")}</span><div><strong>{segment.title}</strong><small>{segment.section}</small></div></button>)}</div></> : null}
      </aside>

      <section className="atlas-lesson-scroll" ref={scrollRef}>
        <div className="atlas-lesson-pages" style={{ "--lesson-zoom": zoom } as React.CSSProperties}>
          {material.segments.map((segment) => <article className={`atlas-lesson-slide atlas-slide-${segment.content.visual ?? (segment.content.table ? "comparison" : segment.content.code ? "trace" : "overview")} ${segment.id === activeSegmentId ? "current" : ""}`} key={segment.id} data-segment-id={segment.id} onClick={() => setActiveSegmentId(segment.id)}>
            <div className="atlas-slide-number">{String(segment.order).padStart(2, "0")}</div><span className="atlas-kicker">{segment.section ?? runtime.course.title}</span><h2>{segment.title}</h2>
            {segment.content.lead ? <p className="atlas-slide-lead">{segment.content.lead}</p> : null}
            {segment.content.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {segment.content.bullets?.length ? <ul>{segment.content.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
            {segment.content.code ? <pre><code>{segment.content.code}</code></pre> : null}
            {segment.content.table ? <div className="atlas-table-wrap"><table><thead><tr>{segment.content.table.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{segment.content.table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={`${rowIndex}-${index}`}>{cell}</td>)}</tr>)}</tbody></table></div> : null}
          </article>)}
        </div>
      </section>

      <aside className="atlas-lesson-knowledge glass-v2">
        <button className="atlas-lesson-collapse" onClick={() => setRightCollapsed((value) => !value)} aria-label="折叠知识上下文">{rightCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</button>
        {!rightCollapsed ? <><div className="atlas-outline-head"><Network size={16} /><span><strong>Knowledge Context</strong><small>MaterialKnowledgeCoverage</small></span></div>
          {projection?.knowledgeContexts.length ? <div className="atlas-knowledge-context-list">{projection.knowledgeContexts.map((context) => <button className={activeKnowledge?.nodeId === context.nodeId ? "active" : ""} key={context.nodeId} onClick={() => setPinnedNodeId(context.nodeId)}><span style={{ background: context.color }} /><div><strong>{context.title}</strong><small>{context.roles.join(" · ")}</small></div></button>)}</div> : <p className="atlas-material-empty">当前内容段暂无 Knowledge 映射。</p>}
          {activeKnowledge ? <section className="atlas-active-knowledge"><div className="atlas-pill"><Pin size={12} />{pinnedNodeId ? "已固定" : "随内容联动"}</div><h2>{activeKnowledge.title}</h2><p>{activeKnowledge.description}</p></section> : null}
          {projection?.assignmentContexts.length ? <section className="atlas-drawer-section"><h3>关联实训</h3><div className="atlas-assignment-switcher">{projection.assignmentContexts.map((context) => <button key={context.assignmentId} onClick={() => setActiveAssignmentId(context.assignmentId)}><strong>{context.assignment.title}</strong><small>{context.state?.status ?? "not-started"}</small><ArrowRight size={13} /></button>)}</div></section> : <p className="atlas-material-empty">当前内容段暂无关联实训。</p>}
        </> : null}
      </aside>

      <div className="atlas-lesson-controls glass-v2"><button onClick={() => setZoom((value) => Math.max(0.75, value - 0.1))} aria-label="缩小课件"><ZoomOut size={16} /></button><button onClick={() => setZoom((value) => Math.min(1.35, value + 0.1))} aria-label="放大课件"><ZoomIn size={16} /></button><span>{Math.max(1, activeIndex + 1)} / {material.segments.length}</span><button disabled={activeIndex <= 0} onClick={() => selectSegment(material.segments[activeIndex - 1].id)}><ChevronLeft size={16} /></button><button disabled={activeIndex < 0 || activeIndex >= material.segments.length - 1} onClick={() => selectSegment(material.segments[activeIndex + 1].id)}><ChevronRight size={16} /></button></div>

      {activeAssignment ? <div className="atlas-workflow-modal" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveAssignmentId(null); }}><article className="atlas-workflow-card glass-v2"><button className="atlas-modal-close" onClick={() => setActiveAssignmentId(null)} aria-label="关闭实训详情"><X size={18} /></button><span className="atlas-kicker">COURSE ASSIGNMENT</span><h2>{activeAssignment.assignment.title}</h2><p>{activeAssignment.assignment.description}</p><section><h3>任务要求</h3>{activeAssignment.assignment.requirements.map((requirement) => <div key={requirement}><Check size={13} />{requirement}</div>)}</section><section><h3>预期成果</h3><p>{activeAssignment.assignment.expectedOutput}</p></section><div className="atlas-modal-actions"><button className="atlas-secondary" onClick={() => setActiveAssignmentId(null)}>关闭</button>{activeAssignment.assignment.mode === "workflow" && activeAssignment.assignment.workflowTemplateId ? <button className="atlas-primary" onClick={() => navigate(workflowLaunchUrl({ courseId: runtime.course.id, assignmentId: activeAssignment.assignment.id, workflowTemplateId: activeAssignment.assignment.workflowTemplateId! }))}>进入工作流 <ArrowRight size={15} /></button> : null}</div></article></div> : null}
    </main>
  );
}

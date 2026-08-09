import { ArrowLeft, ArrowRight, BookOpen, Check, Clock3, Crosshair, FileText, Layers3, Maximize2, Minus, Network, Plus, Search, Settings2, Sparkles, Target, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { MockSession } from "../../app/model";
import { GlobalNav } from "../components/GlobalNav";
import { assignmentProjectionForNode, buildChapterAssignmentProjection, detailFacetForMode, flowIdForAnchor, type SelectedAnchor } from "../course/courseSelection";
import { CourseGraph, type CourseGraphHandle } from "../course/graph/CourseGraph";
import type { CourseGraphView } from "../course/graph/courseGraphProjection";
import { courseRepository } from "../course/repository/DemoCourseRepository";
import { buildCourseGraphData } from "../course/runtime/courseRuntime";
import { useUserCourseState, workflowLaunchUrl } from "../progress/progressService";
import type { AssignmentContext, CourseAssignment, CourseChapterProjection, CourseSkillTreeNode } from "../types";

const knowledgeStatusLabel = { completed: "已完成", learning: "学习中", available: "可学习", locked: "未解锁" } as const;
const assignmentStatusLabel = { completed: "已完成", "in-progress": "进行中", "not-started": "未开始" } as const;

export function CourseGraphPage({ session, onLogout }: { session: MockSession; onLogout: () => void }) {
  const navigate = useNavigate();
  const { courseId = "" } = useParams();
  const runtime = courseRepository.getCourse(courseId);
  const userCourseState = useUserCourseState(session.email, courseId);
  const graphData = useMemo(() => runtime ? buildCourseGraphData(runtime, userCourseState) : null, [runtime, userCourseState]);
  const courseChapters = graphData?.chapters ?? [];
  const courseSkillTreeNodes = graphData?.knowledgeNodes ?? [];
  const courseSkillTreeEdges = graphData?.knowledgeEdges ?? [];
  const graphRef = useRef<CourseGraphHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<CourseGraphView>("overview");
  const [mode, setMode] = useState<"knowledge" | "assignment">("knowledge");
  const detailFacet = detailFacetForMode(mode);
  const [selectedAnchor, setSelectedAnchor] = useState<SelectedAnchor | null>(null);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const [focusedChapterId, setFocusedChapterId] = useState<string | null>(null);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchMatch, setSearchMatch] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<"detail" | "materials">("detail");
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [toast, setToast] = useState(() => new URLSearchParams(window.location.search).has("created"));
  const selectedChapter = selectedAnchor?.kind === "chapter" ? courseChapters.find((item) => item.id === selectedAnchor.id) ?? null : null;
  const selectedNode = selectedAnchor?.kind === "knowledge" ? courseSkillTreeNodes.find((item) => item.id === selectedAnchor.id) ?? null : null;
  const selectedFlowId = flowIdForAnchor(selectedAnchor);
  const assignmentProjection = selectedNode && detailFacet === "assignment" ? assignmentProjectionForNode(selectedNode, activeAssignmentId) : null;
  const chapterAssignment = selectedChapter && detailFacet === "assignment" ? buildChapterAssignmentProjection(selectedChapter, courseSkillTreeNodes) : null;
  const drawerOpen = Boolean(selectedAnchor || materialsOpen);
  const drawerMaterials = useMemo(() => {
    if (!runtime) return [];
    if (selectedNode) return runtime.materials.filter((material) => selectedNode.materialIds.includes(material.id));
    if (selectedChapter) return runtime.materials.filter((material) => selectedChapter.lessonIds.includes(material.lessonId));
    return runtime.materials;
  }, [runtime, selectedChapter, selectedNode]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(false), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (drawerOpen) { setSelectedAnchor(null); setMaterialsOpen(false); setActiveAssignmentId(null); }
      else if (view === "focused") changeView("overview");
      else if (searchExpanded) { setSearchExpanded(false); setQuery(""); setSearchMatch(null); }
    }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [drawerOpen, searchExpanded, view]);

  const searchResult = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    const chapter = courseChapters.find((item) => [item.id, item.title, item.outcome, item.description].some((value) => value.toLowerCase().includes(needle)));
    if (chapter) return { kind: "chapter" as const, id: chapter.id };
    const knowledge = courseSkillTreeNodes.find((item) => [item.id, item.title, `第 ${item.lesson} 课`, item.description, ...item.assignmentContexts.map((context) => context.assignment.title)].some((value) => value.toLowerCase().includes(needle)));
    return knowledge ? { kind: "knowledge" as const, id: knowledge.id } : null;
  }, [courseChapters, courseSkillTreeNodes, query]);

  useEffect(() => setSearchMatch(flowIdForAnchor(searchResult)), [searchResult]);

  function changeView(next: CourseGraphView, chapterId: string | null = null) {
    setView(next);
    setFocusedChapterId(next === "focused" ? chapterId : null);
    setSelectedAnchor(null);
    setActiveAssignmentId(null);
    setMaterialsOpen(false);
    setDrawerTab("detail");
  }

  function focusChapter(chapter: CourseChapterProjection) { changeView("focused", chapter.id); setToast(true); }
  function selectAnchor(anchor: SelectedAnchor) { setMaterialsOpen(false); setDrawerTab("detail"); setActiveAssignmentId(null); setSelectedAnchor(anchor); }
  function selectChapter(chapter: CourseChapterProjection) { selectAnchor({ kind: "chapter", id: chapter.id }); }
  function selectKnowledge(node: CourseSkillTreeNode) { selectAnchor({ kind: "knowledge", id: node.id }); }
  function switchMode() { setMode((current) => current === "knowledge" ? "assignment" : "knowledge"); setActiveAssignmentId(null); setDrawerTab("detail"); }

  function executeSearch() {
    if (!searchResult) return;
    if (searchResult.kind === "knowledge") {
      const node = courseSkillTreeNodes.find((item) => item.id === searchResult.id);
      if (!node) return;
      if (view === "overview" || (view === "focused" && focusedChapterId !== node.chapterId)) changeView("focused", node.chapterId);
      setSelectedAnchor(searchResult);
      setActiveAssignmentId(null);
      window.setTimeout(() => graphRef.current?.focus(`knowledge:${node.id}`), 650);
    } else {
      setSelectedAnchor(searchResult);
      setActiveAssignmentId(null);
      window.setTimeout(() => graphRef.current?.focus(`chapter:${searchResult.id}`), 80);
    }
  }

  function selectPrerequisite(id: string) {
    const target = courseSkillTreeNodes.find((item) => item.id === id);
    if (!target) return;
    if (view !== "full" && focusedChapterId !== target.chapterId) changeView("focused", target.chapterId);
    setSelectedAnchor({ kind: "knowledge", id: target.id });
    setActiveAssignmentId(null);
    window.setTimeout(() => graphRef.current?.focus(`knowledge:${id}`), 620);
  }

  function assignmentDetail(assignment: CourseAssignment, context: AssignmentContext, node: CourseSkillTreeNode, canReturnToGroup: boolean) {
    return <>
      {canReturnToGroup ? <button className="atlas-assignment-back" onClick={() => setActiveAssignmentId(null)}><ArrowLeft size={14} />返回该节点全部实训</button> : null}
      <section className="atlas-drawer-section"><h3>任务说明</h3><p>{assignment.description}</p></section>
      <section className="atlas-drawer-section"><h3>任务要求</h3><ol className="atlas-assignment-list">{assignment.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ol></section>
      <section className="atlas-drawer-section"><h3>预期成果</h3><div className="atlas-drawer-info-card"><FileText size={15} /><span>{assignment.expectedOutput}</span></div></section>
      <section className="atlas-drawer-section"><h3>验收标准</h3><div className="atlas-assignment-criteria">{assignment.acceptanceCriteria.map((criterion) => <span key={criterion}><Check size={14} />{criterion}</span>)}</div></section>
      {assignment.estimatedMinutes ? <section className="atlas-drawer-section"><h3>预计时间</h3><div className="atlas-drawer-info-card"><Clock3 size={15} /><span>{assignment.estimatedMinutes} 分钟</span></div></section> : null}
      {assignment.projectContribution ? <section className="atlas-drawer-section"><h3>课程中的作用</h3><p>{assignment.projectContribution}</p></section> : null}
      {assignment.mode === "workflow" && assignment.workflowTemplateId ? <section className="atlas-drawer-section"><h3>执行环境</h3><div className="atlas-drawer-info-card"><Settings2 size={15} /><span>工作流画布</span></div></section> : null}
      <section className="atlas-drawer-section"><h3>关联 Knowledge</h3><div className="atlas-requirement-list"><div className="atlas-requirement"><span className="atlas-requirement-icon ready">◆</span><span>{node.title} · {context.role}</span></div></div></section>
    </>;
  }

  function assignmentGroup(node: CourseSkillTreeNode) {
    return <><section className="atlas-drawer-section atlas-assignment-group"><h3>{node.title} · 实训</h3><div className="atlas-drawer-progress-meta"><span>{node.assignmentCount} 项实训</span><strong>{node.assignmentStateSummary.progress}%</strong></div><div className="atlas-drawer-progress"><i style={{ width: `${node.assignmentStateSummary.progress}%` }} /></div><div className="atlas-assignment-switcher">{node.assignmentContexts.map((context, index) => <button key={context.assignmentId} onClick={() => setActiveAssignmentId(context.assignmentId)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{context.assignment.title}</strong><small>{assignmentStatusLabel[context.state?.status ?? "not-started"]}</small><ArrowRight size={13} /></button>)}</div></section></>;
  }

  function chapterKnowledgeFacet(chapter: CourseChapterProjection) {
    const nodes = courseSkillTreeNodes.filter((node) => node.chapterId === chapter.id);
    return <>
      <section className="atlas-drawer-section"><h3>篇章简介</h3><p>{chapter.description}</p></section>
      <section className="atlas-drawer-section"><h3>Knowledge Progress</h3><div className="atlas-drawer-progress-meta"><span>{chapter.lessonIds.length} 课 · {nodes.length} 个原子知识</span><strong>{chapter.progress}%</strong></div><div className="atlas-drawer-progress"><i style={{ width: `${chapter.progress}%` }} /></div></section>
      <section className="atlas-drawer-section"><h3>课程覆盖</h3><div className="atlas-requirement-list">{chapter.lessonIds.map((lessonId, index) => <div className="atlas-requirement" key={lessonId}><span className="atlas-requirement-icon ready">{index + 1}</span><span><strong>第 {courseSkillTreeNodes.find((node) => node.lessonId === lessonId)?.lesson ?? index + 1} 课</strong><small>{nodes.filter((node) => node.lessonId === lessonId).length} 个 KnowledgeNodes</small></span></div>)}</div></section>
      <section className="atlas-drawer-section"><h3>主要 Atomic KnowledgeNodes</h3><div className="atlas-tag-list">{nodes.slice(0, 12).map((node) => <span key={node.id}>{node.title}</span>)}</div></section>
      <section className="atlas-drawer-section"><h3>关联课件</h3><p>{chapter.lessonIds.length} 份篇章课件与课程覆盖保持关联。</p></section>
      <section className="atlas-drawer-section"><h3>对应实训</h3><p>{chapter.assignmentSummary.assignmentCount} 项对应实训，可切换到实训树查看聚合详情。</p></section>
    </>;
  }

  function chapterAssignmentFacet(chapter: CourseChapterProjection) {
    const projection = chapterAssignment!;
    const summary = chapter.assignmentSummary;
    return <>
      <section className="atlas-drawer-section"><h3>{chapter.title} · 实训</h3><div className="atlas-chapter-assignment-stats"><span><strong>{summary.assignmentCount}</strong>项实训</span><span><strong>{summary.completedCount}</strong>已完成</span><span><strong>{summary.inProgressCount}</strong>进行中</span><span><strong>{summary.notStartedCount}</strong>未开始</span></div><div className="atlas-drawer-progress-meta"><span>完成度</span><strong>{summary.progress}%</strong></div><div className="atlas-drawer-progress"><i style={{ width: `${summary.progress}%` }} /></div></section>
      <section className="atlas-drawer-section"><h3>篇章成果</h3><p>{summary.outcome}</p></section>
      <section className="atlas-drawer-section"><h3>本篇章实训</h3><div className="atlas-assignment-switcher">{projection.assignments.map(({ assignment, context }, index) => <div className="atlas-assignment-row" key={assignment.id}><span>{String(index + 1).padStart(2, "0")}</span><strong>{assignment.title}</strong><small>{assignmentStatusLabel[context.state?.status ?? "not-started"]}</small></div>)}</div></section>
      <section className="atlas-drawer-section"><h3>综合项目贡献</h3>{projection.projectContributions.length ? <div className="atlas-requirement-list">{projection.projectContributions.map((item) => <div className="atlas-requirement" key={item}><span className="atlas-requirement-icon ready"><Check size={13} /></span><span>{item}</span></div>)}</div> : <p>本篇章 Assignment 输出将汇入篇章成果。</p>}</section>
    </>;
  }

  function atomicKnowledgeFacet(node: CourseSkillTreeNode) {
    return <>
      <section className="atlas-drawer-section"><h3>简介</h3><p>{node.description}</p></section>
      <section className="atlas-drawer-section"><h3>课程覆盖</h3><div className="atlas-requirement-list">{node.curriculumContexts.map((context) => <div className="atlas-requirement" key={context.id}><span className="atlas-requirement-icon ready">{context.lessonOrder}</span><span><strong>第 {context.lessonOrder} 课 · {context.role}</strong><small>{courseChapters.find((chapter) => chapter.id === context.chapterId)?.title}</small></span></div>)}</div></section>
      <section className="atlas-drawer-section"><h3>对应实训</h3><p>{node.assignmentCount} 项对应实训；切换到实训树查看任务详情。</p></section>
      <section className="atlas-drawer-section"><h3>前置要求</h3><div className="atlas-requirement-list">{courseSkillTreeEdges.some((edge) => edge.relation === "prerequisite" && edge.target === node.id) ? courseSkillTreeEdges.filter((edge) => edge.relation === "prerequisite" && edge.target === node.id).map((edge) => courseSkillTreeNodes.find((item) => item.id === edge.source)).map((item) => item ? <button className="atlas-requirement interactive" key={item.id} onClick={() => selectPrerequisite(item.id)}><span className={`atlas-requirement-icon ${item.status === "locked" ? "waiting" : "ready"}`}>{item.status === "locked" ? "!" : <Check size={14} />}</span><span><strong>{item.title}</strong><small>第 {item.lesson} 课 · {knowledgeStatusLabel[item.status]}</small></span><ArrowRight size={14} /></button> : null) : <div className="atlas-requirement"><span className="atlas-requirement-icon ready"><Check size={14} /></span><span>当前节点可开始学习</span></div>}</div></section>
    </>;
  }

  const drawerTitle = selectedChapter ? `${selectedChapter.title}${detailFacet === "assignment" ? " · 实训" : ""}` : selectedNode ? `${selectedNode.title}${detailFacet === "assignment" && assignmentProjection?.kind === "group" ? " · 实训" : assignmentProjection?.kind === "detail" ? assignmentProjection.context.assignment.title : ""}` : "";
  const drawerStatus = selectedChapter ? detailFacet === "assignment" ? `${selectedChapter.assignmentSummary.progress}%` : selectedChapter.progress >= 100 ? "已完成" : selectedChapter.progress ? "学习中" : "可学习" : selectedNode ? detailFacet === "knowledge" ? knowledgeStatusLabel[selectedNode.status] : assignmentProjection?.kind === "detail" ? assignmentStatusLabel[assignmentProjection.context.state?.status ?? "not-started"] : `${selectedNode.assignmentCount} 项` : "";

  if (!runtime || !graphData) {
    return <main className="atlas-graph-page"><GlobalNav active="courses" session={session} onLogout={onLogout} /><section className="atlas-empty-state"><h1>课程不存在</h1><p>没有找到课程 “{courseId}”。</p><button className="atlas-primary" onClick={() => navigate("/courses")}>返回课程中心</button></section></main>;
  }

  return (
    <main className="atlas-graph-page">
      <GlobalNav active="courses" session={session} onLogout={onLogout} />
      <header className="atlas-skill-course-island glass-v2"><button onClick={() => view === "overview" ? navigate("/courses") : changeView("overview")} aria-label="返回上一级"><ArrowLeft size={18} /></button><span className="atlas-skill-divider" /><div><span>{runtime.course.title.toUpperCase()}</span><strong>{view === "overview" ? "课程篇章总览" : view === "focused" ? "聚焦篇章" : `完整课程${mode === "knowledge" ? "技能树" : "实训树"}`}</strong>{view === "focused" ? <small>/ {courseChapters.find((item) => item.id === focusedChapterId)?.title}</small> : null}</div>{view !== "full" ? <button className="atlas-skill-focus" onClick={() => changeView("full")}>展开全部篇章 <ArrowRight size={12} /></button> : <button className="atlas-skill-focus" onClick={() => changeView("overview")}>折叠为篇章总览 <X size={12} /></button>}</header>

      <div className={`atlas-graph-stage ${drawerOpen ? "drawer-open" : ""}`}><CourseGraph ref={graphRef} graphData={graphData} view={view} focusedChapterId={focusedChapterId} mode={mode} selectedId={selectedFlowId} searchMatchId={searchMatch} onChapterClick={selectChapter} onChapterDoubleClick={focusChapter} onKnowledgeClick={selectKnowledge} onAssignmentClick={selectKnowledge} /></div>
      <div className={`atlas-graph-meta ${drawerOpen ? "drawer-open" : ""}`}><div className={`atlas-graph-search glass-v2 ${searchExpanded ? "expanded" : ""}`}><button onClick={() => { setSearchExpanded((value) => !value); window.setTimeout(() => searchRef.current?.focus(), 0); }} aria-label="搜索技能树"><Search size={20} /></button><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") executeSearch(); }} placeholder="搜索篇章、知识点或实训…" /></div></div>
      <div className={`atlas-graph-toolbar glass-v2 ${drawerOpen ? "drawer-open" : ""}`}><button onClick={() => graphRef.current?.zoomIn()} data-tip="放大" aria-label="放大"><Plus size={17} /></button><button onClick={() => graphRef.current?.zoomOut()} data-tip="缩小" aria-label="缩小"><Minus size={17} /></button><button onClick={() => graphRef.current?.fit()} data-tip="适配全图" aria-label="适配全图"><Maximize2 size={17} /></button><span /><button className={mode === "assignment" ? "active" : ""} onClick={switchMode} data-tip="切换技能树 / 实训树" aria-label="切换技能树与实训树"><Layers3 size={17} /></button><button onClick={() => setMaterialsOpen(true)} data-tip="查看全部关联课件" aria-label="查看关联课件"><BookOpen size={17} /></button><button disabled={!selectedAnchor} onClick={() => selectedFlowId && graphRef.current?.focus(selectedFlowId)} data-tip="定位当前节点" aria-label="定位当前节点"><Crosshair size={17} /></button><button onClick={() => changeView("overview")} data-tip="返回篇章总览" aria-label="返回篇章总览"><Network size={17} /></button></div>
      <button className={`atlas-graph-legend glass-v2 ${legendCollapsed ? "collapsed" : ""}`} onClick={() => setLegendCollapsed((value) => !value)}><strong>学习状态 <span>{legendCollapsed ? "＋" : "－"}</span></strong><div><span><i className="done" /> 已完成</span><span><i className="learning" /> 学习中</span><span><i className="available" /> 可学习</span><span><i className="locked" /> 未解锁</span><span><i className="sequence" /> 教学顺序补充</span></div></button>
      <div className="atlas-graph-help glass-v2">拖动画布 · 滚轮缩放 · 单击卡片查看 · 双击篇章原位展开</div>

      {selectedAnchor && (selectedChapter || selectedNode) ? <aside className="atlas-detail-drawer open">
        <button className="atlas-panel-close" onClick={() => { setSelectedAnchor(null); setActiveAssignmentId(null); }} aria-label="关闭详情"><X size={17} /></button>
        <div className="atlas-drawer-head"><span>{selectedChapter ? `课程篇章 · ${detailFacet === "knowledge" ? "Knowledge Facet" : "Assignment Aggregate"}` : `原子知识位置 · ${detailFacet === "knowledge" ? "Knowledge Facet" : "Assignment Facet"}`}</span><h2>{drawerTitle}</h2><div><i className="atlas-pill">{selectedChapter ? `${selectedChapter.lessonIds.length} 课` : selectedNode ? `第 ${selectedNode.lesson} 课` : ""}</i><i className="atlas-pill success">{drawerStatus}</i></div></div>
        {detailFacet === "knowledge" ? <div className="atlas-drawer-tabs"><button className={drawerTab === "detail" ? "active" : ""} onClick={() => setDrawerTab("detail")}>节点详情</button><button className={drawerTab === "materials" ? "active" : ""} onClick={() => setDrawerTab("materials")}>关联课件</button></div> : null}
        <div className="atlas-drawer-body">{detailFacet === "knowledge" && drawerTab === "materials" ? <div className="atlas-drawer-material-list">{drawerMaterials.length ? drawerMaterials.map((material) => <button key={material.id} onClick={() => navigate(`/courses/${runtime.course.id}/materials/${material.id}`)}><FileText size={18} /><div><strong>{material.title}</strong><span>{material.type} · {material.segments.length} 个内容段</span></div><ArrowRight size={14} /></button>) : <p>暂无关联课件。</p>}</div> : selectedChapter ? detailFacet === "knowledge" ? chapterKnowledgeFacet(selectedChapter) : chapterAssignmentFacet(selectedChapter) : selectedNode ? detailFacet === "knowledge" ? atomicKnowledgeFacet(selectedNode) : assignmentProjection?.kind === "group" ? assignmentGroup(selectedNode) : assignmentProjection?.kind === "detail" ? assignmentDetail(assignmentProjection.context.assignment, assignmentProjection.context, selectedNode, assignmentProjection.canReturnToGroup) : null : null}</div>
        <div className="atlas-drawer-actions"><button className="atlas-secondary" onClick={() => selectedFlowId && graphRef.current?.focus(selectedFlowId)}><Target size={15} />定位节点</button>{selectedChapter ? <button className="atlas-primary" onClick={() => focusChapter(selectedChapter)}>原位展开篇章</button> : selectedNode && detailFacet === "knowledge" && drawerMaterials.length === 1 ? <button className="atlas-primary" onClick={() => navigate(`/courses/${runtime.course.id}/materials/${drawerMaterials[0].id}`)}><FileText size={15} />查看课件详情</button> : selectedNode && detailFacet === "knowledge" && drawerMaterials.length > 1 ? <button className="atlas-primary" onClick={() => setDrawerTab("materials")}><FileText size={15} />选择关联课件</button> : assignmentProjection?.kind === "detail" && assignmentProjection.context.assignment.mode === "workflow" && assignmentProjection.context.assignment.workflowTemplateId ? <button className="atlas-primary" onClick={() => navigate(workflowLaunchUrl({ courseId: runtime.course.id, assignmentId: assignmentProjection.context.assignment.id, workflowTemplateId: assignmentProjection.context.assignment.workflowTemplateId! }))}><Settings2 size={15} />进入工作流画布</button> : null}</div>
      </aside> : null}

      {materialsOpen ? <aside className="atlas-detail-drawer atlas-materials-drawer open"><button className="atlas-panel-close" onClick={() => setMaterialsOpen(false)} aria-label="关闭课件列表"><X size={17} /></button><div className="atlas-drawer-head"><span>课程资料</span><h2>全部关联课件</h2><div><i className="atlas-pill">{runtime.materials.length} 份课件</i><i className="atlas-pill">课程级</i></div></div><div className="atlas-drawer-body"><p>课件、Knowledge 与 Assignment 通过覆盖数据动态关联。</p>{runtime.materials.map((material) => <button className="atlas-material-card" key={material.id} onClick={() => navigate(`/courses/${runtime.course.id}/materials/${material.id}`)}><div><span>{material.type.toUpperCase()} · {material.segments.length} 个内容段</span><strong>{material.title}</strong><p>{material.description}</p></div><div className="atlas-course-meta"><span>{material.duration ?? "自定进度"}</span></div></button>)}</div>{runtime.materials.length ? <div className="atlas-drawer-actions"><button className="atlas-primary" onClick={() => { const recent = Object.values(userCourseState.materialStates).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.materialId; const material = runtime.materials.find((item) => item.id === recent) ?? runtime.materials[0]; navigate(`/courses/${runtime.course.id}/materials/${material.id}`); }}>打开最近课件 <ArrowRight size={15} /></button></div> : null}</aside> : null}
      {toast ? <div className="atlas-toast"><Sparkles size={16} />{view === "focused" ? "篇章已在宏观位置展开，其他篇章保持折叠" : "课程图已更新"}</div> : null}
    </main>
  );
}

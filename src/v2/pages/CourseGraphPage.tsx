import { ArrowLeft, ArrowRight, BookOpen, Check, Clock3, Crosshair, FileText, Layers3, Maximize2, Minus, Network, Plus, Search, Settings2, Sparkles, Target, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MockSession } from "../../app/model";
import { GlobalNav } from "../components/GlobalNav";
import { CourseGraph, type CourseGraphHandle } from "../course/graph/CourseGraph";
import type { CourseGraphView } from "../course/graph/courseGraphProjection";
import { courseAssignmentSummary, courseChapters, courseSkillTreeEdges, courseSkillTreeNodes } from "../data";
import type { CourseAssignment, CourseChapterProjection, CourseSkillTreeNode } from "../types";

type SelectedEntity =
  | { kind: "chapter"; item: CourseChapterProjection }
  | { kind: "knowledge"; item: CourseSkillTreeNode }
  | { kind: "assignment"; item: CourseSkillTreeNode; assignmentIndex: number };

const knowledgeStatusLabel = { completed: "已完成", learning: "学习中", available: "可学习", locked: "未解锁" } as const;
const assignmentStatusLabel = { completed: "已完成", "in-progress": "进行中", "not-started": "未开始" } as const;

export function CourseGraphPage({ session, onLogout }: { session: MockSession; onLogout: () => void }) {
  const navigate = useNavigate();
  const graphRef = useRef<CourseGraphHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<CourseGraphView>("overview");
  const [mode, setMode] = useState<"knowledge" | "assignment">("knowledge");
  const [selected, setSelected] = useState<SelectedEntity | null>(null);
  const [focusedChapterId, setFocusedChapterId] = useState<string | null>(null);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchMatch, setSearchMatch] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<"detail" | "materials">("detail");
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [toast, setToast] = useState(() => new URLSearchParams(window.location.search).has("created"));
  const drawerOpen = Boolean(selected || materialsOpen);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(false), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (drawerOpen) { setSelected(null); setMaterialsOpen(false); }
      else if (view === "focused") changeView("overview");
      else if (searchExpanded) { setSearchExpanded(false); setQuery(""); setSearchMatch(null); }
    }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [drawerOpen, searchExpanded, view]);

  const selectedFlowId = selected ? selected.kind === "chapter" ? `chapter:${selected.item.id}` : `knowledge:${selected.item.id}` : null;
  const selectedAssignmentContext = selected?.kind === "assignment" ? selected.item.assignmentContexts[selected.assignmentIndex] : undefined;
  const selectedAssignment = selectedAssignmentContext?.assignment;

  const searchResult = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    const chapter = courseChapters.find((item) => [item.id, item.title, item.outcome, item.description].some((value) => value.toLowerCase().includes(needle)));
    if (chapter) return { kind: "chapter" as const, item: chapter };
    const knowledge = courseSkillTreeNodes.find((item) => [item.id, item.title, `第 ${item.lesson} 课`, item.description, ...item.assignmentContexts.map((context) => context.assignment.title)].some((value) => value.toLowerCase().includes(needle)));
    return knowledge ? { kind: "knowledge" as const, item: knowledge } : null;
  }, [query]);

  useEffect(() => setSearchMatch(searchResult ? `${searchResult.kind}:${searchResult.item.id}` : null), [searchResult]);

  function changeView(next: CourseGraphView, chapterId: string | null = null) {
    setView(next);
    setFocusedChapterId(next === "focused" ? chapterId : null);
    setSelected(null);
    setMaterialsOpen(false);
    setDrawerTab("detail");
  }

  function focusChapter(chapter: CourseChapterProjection) { changeView("focused", chapter.id); setToast(true); }
  function selectChapter(chapter: CourseChapterProjection) { setMaterialsOpen(false); setDrawerTab("detail"); setSelected({ kind: "chapter", item: chapter }); }
  function selectKnowledge(item: CourseSkillTreeNode) { setMaterialsOpen(false); setDrawerTab("detail"); setSelected({ kind: "knowledge", item }); }
  function selectAssignment(item: CourseSkillTreeNode, assignmentIndex = 0) { setMaterialsOpen(false); setDrawerTab("detail"); setSelected({ kind: "assignment", item, assignmentIndex }); }

  function executeSearch() {
    if (!searchResult) return;
    if (searchResult.kind === "knowledge") {
      if (view === "overview" || (view === "focused" && focusedChapterId !== searchResult.item.chapterId)) changeView("focused", searchResult.item.chapterId);
      setSelected(searchResult);
      window.setTimeout(() => graphRef.current?.focus(`knowledge:${searchResult.item.id}`), 650);
    } else {
      setSelected(searchResult);
      window.setTimeout(() => graphRef.current?.focus(`chapter:${searchResult.item.id}`), 80);
    }
  }

  function selectPrerequisite(id: string) {
    const target = courseSkillTreeNodes.find((item) => item.id === id);
    if (!target) return;
    if (view !== "full" && focusedChapterId !== target.chapterId) changeView("focused", target.chapterId);
    setSelected({ kind: "knowledge", item: target });
    window.setTimeout(() => graphRef.current?.focus(`knowledge:${id}`), 620);
  }

  const selectedTitle = selected?.kind === "chapter" ? selected.item.title : selected?.kind === "knowledge" ? selected.item.title : selectedAssignment?.title ?? "实训任务";
  const selectedStatus = selected?.kind === "chapter"
    ? selected.item.progress >= 100 ? "已完成" : selected.item.progress ? "学习中" : "可学习"
    : selected?.kind === "knowledge"
      ? knowledgeStatusLabel[selected.item.status]
      : selectedAssignmentContext ? assignmentStatusLabel[selectedAssignmentContext.state?.status ?? "not-started"] : "未开始";

  function assignmentDetail(assignment: CourseAssignment, node: CourseSkillTreeNode) {
    return <>
      {node.assignmentContexts.length > 1 ? <section className="atlas-drawer-section"><h3>该知识点的实训</h3><div className="atlas-assignment-switcher">{node.assignmentContexts.map((context, index) => <button className={selected?.kind === "assignment" && selected.assignmentIndex === index ? "active" : ""} key={context.assignmentId} onClick={() => selectAssignment(node, index)}><span>{index + 1}</span><strong>{context.assignment.title}</strong><small>{assignmentStatusLabel[context.state?.status ?? "not-started"]}</small></button>)}</div></section> : null}
      <section className="atlas-drawer-section"><h3>任务说明</h3><p>{assignment.description}</p></section>
      <section className="atlas-drawer-section"><h3>任务要求</h3><ol className="atlas-assignment-list">{assignment.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ol></section>
      <section className="atlas-drawer-section"><h3>预期成果</h3><div className="atlas-drawer-info-card"><FileText size={15} /><span>{assignment.expectedOutput}</span></div></section>
      <section className="atlas-drawer-section"><h3>验收标准</h3><div className="atlas-assignment-criteria">{assignment.acceptanceCriteria.map((criterion) => <span key={criterion}><Check size={14} />{criterion}</span>)}</div></section>
      {assignment.estimatedMinutes ? <section className="atlas-drawer-section"><h3>预计时间</h3><div className="atlas-drawer-info-card"><Clock3 size={15} /><span>{assignment.estimatedMinutes} 分钟</span></div></section> : null}
      {assignment.projectContribution ? <section className="atlas-drawer-section"><h3>课程中的作用</h3><p>{assignment.projectContribution}</p></section> : null}
      {assignment.mode === "workflow" && assignment.workflowTemplateId ? <section className="atlas-drawer-section"><h3>执行环境</h3><div className="atlas-drawer-info-card"><Settings2 size={15} /><span>工作流画布</span></div></section> : null}
      <section className="atlas-drawer-section"><h3>关联 Knowledge</h3><div className="atlas-requirement-list">{node.assignmentContexts.filter((context) => context.assignmentId === assignment.id).map((context) => <div className="atlas-requirement" key={context.id}><span className="atlas-requirement-icon ready">◆</span><span>{node.title} · {context.role}</span></div>)}</div></section>
    </>;
  }

  return (
    <main className="atlas-graph-page">
      <GlobalNav active="courses" session={session} onLogout={onLogout} />
      <header className="atlas-skill-course-island glass-v2">
        <button onClick={() => view === "overview" ? navigate("/courses") : changeView("overview")} aria-label="返回上一级"><ArrowLeft size={18} /></button><span className="atlas-skill-divider" />
        <div><span>AGENTIC AI</span><strong>{view === "overview" ? "课程篇章总览" : view === "focused" ? "聚焦篇章" : `完整课程${mode === "knowledge" ? "技能树" : "实训树"}`}</strong>{view === "focused" ? <small>/ {courseChapters.find((item) => item.id === focusedChapterId)?.title}</small> : null}</div>
        {view !== "full" ? <button className="atlas-skill-focus" onClick={() => changeView("full")}>展开全部篇章 <ArrowRight size={12} /></button> : <button className="atlas-skill-focus" onClick={() => changeView("overview")}>折叠为篇章总览 <X size={12} /></button>}
      </header>

      <div className={`atlas-graph-stage ${drawerOpen ? "drawer-open" : ""}`}>
        <CourseGraph ref={graphRef} view={view} focusedChapterId={focusedChapterId} mode={mode} selectedId={selectedFlowId} searchMatchId={searchMatch} onChapterClick={selectChapter} onChapterDoubleClick={focusChapter} onKnowledgeClick={selectKnowledge} onAssignmentClick={selectAssignment} />
      </div>
      <div className={`atlas-graph-meta ${drawerOpen ? "drawer-open" : ""}`}><div className={`atlas-graph-search glass-v2 ${searchExpanded ? "expanded" : ""}`}><button onClick={() => { setSearchExpanded((value) => !value); window.setTimeout(() => searchRef.current?.focus(), 0); }} aria-label="搜索技能树"><Search size={20} /></button><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") executeSearch(); }} placeholder="搜索篇章、知识点或实训…" /></div></div>
      <div className={`atlas-graph-toolbar glass-v2 ${drawerOpen ? "drawer-open" : ""}`}>
        <button onClick={() => graphRef.current?.zoomIn()} data-tip="放大" aria-label="放大"><Plus size={17} /></button><button onClick={() => graphRef.current?.zoomOut()} data-tip="缩小" aria-label="缩小"><Minus size={17} /></button><button onClick={() => graphRef.current?.fit()} data-tip="适配全图" aria-label="适配全图"><Maximize2 size={17} /></button><span />
        <button className={mode === "assignment" ? "active" : ""} onClick={() => setMode((current) => current === "knowledge" ? "assignment" : "knowledge")} data-tip="切换技能树 / 实训树" aria-label="切换技能树与实训树"><Layers3 size={17} /></button><button onClick={() => setMaterialsOpen(true)} data-tip="查看全部关联课件" aria-label="查看关联课件"><BookOpen size={17} /></button><button disabled={!selected} onClick={() => selected && graphRef.current?.focus(selected.kind === "chapter" ? `chapter:${selected.item.id}` : `knowledge:${selected.item.id}`)} data-tip="定位当前节点" aria-label="定位当前节点"><Crosshair size={17} /></button><button onClick={() => changeView("overview")} data-tip="返回篇章总览" aria-label="返回篇章总览"><Network size={17} /></button>
      </div>
      <button className={`atlas-graph-legend glass-v2 ${legendCollapsed ? "collapsed" : ""}`} onClick={() => setLegendCollapsed((value) => !value)}><strong>学习状态 <span>{legendCollapsed ? "＋" : "－"}</span></strong><div><span><i className="done" /> 已完成</span><span><i className="learning" /> 学习中</span><span><i className="available" /> 可学习</span><span><i className="locked" /> 未解锁</span><span><i className="sequence" /> 教学顺序补充</span></div></button>
      <div className="atlas-graph-help glass-v2">拖动画布 · 滚轮缩放 · 单击卡片查看 · 双击篇章原位展开</div>

      {selected ? <aside className="atlas-detail-drawer open">
        <button className="atlas-panel-close" onClick={() => setSelected(null)} aria-label="关闭详情"><X size={17} /></button>
        <div className="atlas-drawer-head"><span>{selected.kind === "chapter" ? "课程篇章（展示分组）" : selected.kind === "knowledge" ? "原子知识节点" : "实训任务"}</span><h2>{selectedTitle}</h2><div><i className="atlas-pill">{selected.kind === "chapter" ? `${selected.item.lessonIds.length} 课` : selected.kind === "knowledge" ? `第 ${selected.item.lesson} 课` : selectedAssignment?.mode === "workflow" ? "工作流实训" : "说明型实训"}</i><i className="atlas-pill success">{selectedStatus}</i></div></div>
        {selected.kind !== "assignment" ? <div className="atlas-drawer-tabs"><button className={drawerTab === "detail" ? "active" : ""} onClick={() => setDrawerTab("detail")}>节点详情</button><button className={drawerTab === "materials" ? "active" : ""} onClick={() => setDrawerTab("materials")}>关联课件</button></div> : null}
        <div className="atlas-drawer-body">
          {selected.kind === "assignment" && selectedAssignment ? assignmentDetail(selectedAssignment, selected.item) : drawerTab === "materials" ? <div className="atlas-drawer-material-list"><article><FileText size={18} /><div><strong>{selected.kind === "knowledge" && selected.item.lesson === 4 ? "第四课：推理、规划与反思范式" : "课程关联课件"}</strong><span>课程结构、知识覆盖与实训保持动态关联。</span></div></article></div> : <>
            <section className="atlas-drawer-section"><h3>简介</h3><p>{selected.item.description}</p></section>
            {selected.kind === "chapter" ? <><section className="atlas-drawer-section"><h3>实训汇总</h3><div className="atlas-drawer-progress-meta"><span>{selected.item.assignmentSummary.assignmentCount} 项实训 · {selected.item.assignmentSummary.completedCount} 项完成 · {selected.item.assignmentSummary.inProgressCount} 项进行中</span><strong>{selected.item.assignmentSummary.progress}%</strong></div><div className="atlas-drawer-progress"><i style={{ width: `${selected.item.assignmentSummary.progress}%` }} /></div></section><section className="atlas-drawer-section"><h3>篇章成果</h3><p>{selected.item.assignmentSummary.outcome}</p></section></> : <>
              <section className="atlas-drawer-section"><h3>课程覆盖</h3><div className="atlas-requirement-list">{selected.item.curriculumContexts.map((context) => <div className="atlas-requirement" key={context.id}><span className="atlas-requirement-icon ready">{context.lessonOrder}</span><span><strong>第 {context.lessonOrder} 课 · {context.role}</strong><small>{courseChapters.find((chapter) => chapter.id === context.chapterId)?.title}</small></span></div>)}</div></section>
              <section className="atlas-drawer-section"><h3>对应实训</h3><div className="atlas-assignment-switcher">{selected.item.assignmentContexts.map((context, index) => <button key={context.assignmentId} onClick={() => selectAssignment(selected.item, index)}><span>{index + 1}</span><strong>{context.assignment.title}</strong><small>{assignmentStatusLabel[context.state?.status ?? "not-started"]}</small></button>)}</div></section>
              <section className="atlas-drawer-section"><h3>前置要求</h3><div className="atlas-requirement-list">{courseSkillTreeEdges.some((edge) => edge.relation === "prerequisite" && edge.target === selected.item.id) ? courseSkillTreeEdges.filter((edge) => edge.relation === "prerequisite" && edge.target === selected.item.id).map((edge) => courseSkillTreeNodes.find((item) => item.id === edge.source)).map((item) => item ? <button className="atlas-requirement interactive" key={item.id} onClick={() => selectPrerequisite(item.id)}><span className={`atlas-requirement-icon ${item.status === "locked" ? "waiting" : "ready"}`}>{item.status === "locked" ? "!" : <Check size={14} />}</span><span><strong>{item.title}</strong><small>第 {item.lesson} 课 · {knowledgeStatusLabel[item.status]}</small></span><ArrowRight size={14} /></button> : null) : <div className="atlas-requirement"><span className="atlas-requirement-icon ready"><Check size={14} /></span><span>当前节点可开始学习</span></div>}</div></section>
            </>}
          </>}
        </div>
        <div className="atlas-drawer-actions"><button className="atlas-secondary" onClick={() => graphRef.current?.focus(selected.kind === "chapter" ? `chapter:${selected.item.id}` : `knowledge:${selected.item.id}`)}><Target size={15} />定位节点</button>{selected.kind === "chapter" ? <button className="atlas-primary" onClick={() => focusChapter(selected.item)}>原位展开篇章</button> : selected.kind === "knowledge" ? <button className="atlas-primary" onClick={() => selected.item.lesson === 4 ? navigate("/courses/agentic-ai/materials/lesson-04") : setToast(true)}><FileText size={15} />查看课件详情</button> : selectedAssignment?.mode === "workflow" && selectedAssignment.workflowTemplateId ? <button className="atlas-primary" onClick={() => navigate(`/workflows/${selectedAssignment.workflowTemplateId}`)}><Settings2 size={15} />进入工作流画布</button> : <button className="atlas-primary" onClick={() => selectKnowledge(selected.item)}><BookOpen size={15} />查看关联知识</button>}</div>
      </aside> : null}

      {materialsOpen ? <aside className="atlas-detail-drawer atlas-materials-drawer open"><button className="atlas-panel-close" onClick={() => setMaterialsOpen(false)} aria-label="关闭课件列表"><X size={17} /></button><div className="atlas-drawer-head"><span>课程资料</span><h2>全部关联课件</h2><div><i className="atlas-pill">15 份课件</i><i className="atlas-pill">课程级</i></div></div><div className="atlas-drawer-body"><p>课件详情作为课程中心内部阅读状态，与知识节点和实训动态关联。</p><article className="atlas-material-card"><div><span>DOCX · 32 个教学页面</span><strong>第四课：推理、规划与反思范式</strong><p>覆盖 Direct、ReAct、Plan-and-Execute、Replanning、Reflection 与 Tree of Thoughts。</p></div><div className="atlas-course-meta"><span>110 分钟</span><span>{courseAssignmentSummary.assignmentCount} 个实训</span><span>{courseAssignmentSummary.completedCount}/{courseAssignmentSummary.assignmentCount} 已完成</span></div></article></div><div className="atlas-drawer-actions"><button className="atlas-primary" onClick={() => navigate("/courses/agentic-ai/materials/lesson-04")}>打开最近课件 <ArrowRight size={15} /></button></div></aside> : null}
      {toast ? <div className="atlas-toast"><Sparkles size={16} />{view === "focused" ? "篇章已在宏观位置展开，其他篇章保持折叠" : "课程图已更新"}</div> : null}
    </main>
  );
}

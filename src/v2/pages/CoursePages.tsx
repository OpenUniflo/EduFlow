import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Crosshair,
  FileText,
  Layers3,
  Maximize2,
  Minus,
  Network,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Target,
  X
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { MockSession } from "../../app/model";
import { courseChapterEdges, courseChapters, courseSkillTreeEdges, courseSkillTreeNodes, practices } from "../data";
import { useLearningProgress } from "../progress";
import type { CourseChapterProjection, CourseSkillTreeNode } from "../types";
import { GlobalNav } from "../components/GlobalNav";

export function CourseCenterPage({ session, onLogout }: { session: MockSession; onLogout: () => void }) {
  const navigate = useNavigate();
  const progress = useLearningProgress();
  const completed = progress.completedPracticeIds.length;
  const practicePercent = Math.round((completed / practices.length) * 100);

  return (
    <main className="atlas-page-shell atlas-course-center">
      <GlobalNav active="courses" session={session} onLogout={onLogout} />
      <div className="atlas-course-floating-title glass-v2">课程中心</div>

      <div className="atlas-content-wrap">
        <section className="atlas-course-title atlas-course-title-row">
          <div>
            <h1>课程中心</h1>
            <p>从一门课程进入完整的知识、课件与实训体系。</p>
          </div>
          <span className="atlas-pill">1 门课程 · 1 门学习中</span>
        </section>

        <div className="atlas-course-actions">
          <label className="atlas-course-search glass-v2">
            <Search size={17} />
            <input placeholder="搜索课程、篇章或知识点…" aria-label="搜索课程" />
          </label>
          <button className="atlas-secondary"><Layers3 size={16} /> 全部课程</button>
        </div>

        <section className="atlas-course-section">
          <div className="atlas-section-row">
            <div><span className="atlas-kicker">RECENT</span><h2>最近学习</h2></div>
          </div>
          <article className="atlas-featured-course glass-v2" onClick={() => navigate("/courses/agentic-ai")}>
            <div className="atlas-featured-copy">
              <div className="atlas-kicker">最近学习</div>
              <h2>Agentic AI：从问题建模到受治理智能体</h2>
              <p>继续学习“架构与推理范式”篇章。第四课将通过五套统一任务模板比较 Direct、ReAct、规划、重规划与评价优化。</p>
              <div className="atlas-course-meta">
                <span>当前：第四课 · 推理、规划与反思</span><span>15 课</span><span>5 项重点实训</span>
              </div>
              <div className="atlas-progress-row">
                <div className="atlas-progress-track"><i style={{ width: `${Math.max(36, practicePercent)}%` }} /></div>
                <strong>{Math.max(36, practicePercent)}%</strong>
              </div>
              <button className="atlas-primary" onClick={(event) => { event.stopPropagation(); navigate("/courses/agentic-ai"); }}>
                继续学习 <ArrowRight size={16} />
              </button>
            </div>
            <div className="atlas-recent-mini-map" aria-label="课程技能树缩略图">
              <div className="atlas-mini-map-scene">
                {courseChapters.map((stage, index) => (
                  <i key={stage.id} style={{ "--i": index, "--color": stage.color } as CSSProperties} />
                ))}
              </div>
              <span>{courseChapters.length} 个篇章 · {courseSkillTreeNodes.length} 个原子知识点</span>
            </div>
          </article>
        </section>

        <section className="atlas-course-section">
          <div className="atlas-section-row"><h2>所有课程</h2><span>1 门课程</span></div>
          <div className="atlas-course-grid">
            <article className="atlas-course-card glass-v2" onClick={() => navigate("/courses/agentic-ai")}>
              <div className="atlas-card-accent" />
              <div className="atlas-course-preview" aria-hidden="true">
                <div className="atlas-mini-map-scene compact">
                  {courseChapters.slice(0, 6).map((stage, index) => (
                    <i key={stage.id} style={{ "--i": index, "--color": stage.color } as CSSProperties} />
                  ))}
                </div>
              </div>
              <div className="atlas-pill">学习中 · Agentic AI</div>
              <h3>智能体系统设计与实践</h3>
              <p>从概念、问题建模和推理范式出发，逐步构建可运行、可评测、可治理的 Agent 系统。</p>
              <div className="atlas-course-meta"><span>15 课</span><span>{courseSkillTreeNodes.length} 原子节点</span><span>{practices.length} 实训</span></div>
              <div className="atlas-progress-row"><div className="atlas-progress-track"><i style={{ width: `${Math.max(36, practicePercent)}%` }} /></div><strong>{Math.max(36, practicePercent)}%</strong></div>
            </article>
            <button className="atlas-course-card atlas-new-course glass-v2" onClick={() => navigate("/")}>
              <span><Plus size={22} /></span>
              <strong>从课件创建课程</strong>
              <p>回到知识星图，上传材料并描述课程目标。</p>
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

type SelectedNode = { kind: "stage"; item: CourseChapterProjection } | { kind: "knowledge"; item: CourseSkillTreeNode };

const COURSE_NODE_WIDTH = 196;
const COURSE_NODE_HEIGHT = 104;

function courseEdgePath(source: { x: number; y: number }, target: { x: number; y: number }, index: number) {
  const laneOffset = (index % 5 - 2) * 7;
  const sourceRight = source.x + COURSE_NODE_WIDTH;
  const sourceCenterY = source.y + COURSE_NODE_HEIGHT / 2;
  const targetCenterY = target.y + COURSE_NODE_HEIGHT / 2;
  if (target.x > sourceRight + 18) {
    if (Math.abs(targetCenterY - sourceCenterY) < 1) return `M${sourceRight} ${sourceCenterY} H${target.x}`;
    const laneX = (sourceRight + target.x) / 2 + laneOffset;
    const direction = targetCenterY >= sourceCenterY ? 1 : -1;
    return `M${sourceRight} ${sourceCenterY} H${laneX - 10} Q${laneX} ${sourceCenterY} ${laneX} ${sourceCenterY + direction * 10} V${targetCenterY - direction * 10} Q${laneX} ${targetCenterY} ${laneX + 10} ${targetCenterY} H${target.x}`;
  }
  const downward = target.y >= source.y;
  const x1 = source.x + COURSE_NODE_WIDTH / 2;
  const y1 = source.y + (downward ? COURSE_NODE_HEIGHT : 0);
  const x2 = target.x + COURSE_NODE_WIDTH / 2;
  const y2 = target.y + (downward ? 0 : COURSE_NODE_HEIGHT);
  const laneY = (y1 + y2) / 2 + laneOffset;
  return `M${x1} ${y1} V${laneY} H${x2} V${y2}`;
}

export function CourseGraphPage({ session, onLogout }: { session: MockSession; onLogout: () => void }) {
  const navigate = useNavigate();
  const progress = useLearningProgress();
  const [view, setView] = useState<"overview" | "full">("overview");
  const [mode, setMode] = useState<"knowledge" | "practice">("knowledge");
  const [selected, setSelected] = useState<SelectedNode | null>(null);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [focusStage, setFocusStage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchMatch, setSearchMatch] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<"detail" | "materials">("detail");
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [toast, setToast] = useState(() => new URLSearchParams(window.location.search).has("created"));
  const [transform, setTransform] = useState({ x: view === "overview" ? 80 : -160, y: 96, scale: view === "overview" ? 0.82 : 0.78 });
  const dragRef = useRef({ dragging: false, x: 0, y: 0 });
  const clickTimerRef = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const completed = progress.completedPracticeIds.length;
  const drawerOpen = Boolean(selected || materialsOpen);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(false), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (drawerOpen) {
        setSelected(null);
        setMaterialsOpen(false);
      } else if (focusStage) {
        setFocusStage(null);
      } else if (searchExpanded) {
        setSearchExpanded(false);
        setQuery("");
        setSearchMatch(null);
      }
    }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [drawerOpen, focusStage, searchExpanded]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => view === "full" && focusStage ? fitChapter(focusStage) : fitGraph(view));
    return () => window.cancelAnimationFrame(frame);
  }, [view, focusStage]);

  const currentItems = view === "overview" ? courseChapters : courseSkillTreeNodes;
  const currentEdges = view === "overview"
    ? courseChapterEdges
    : courseSkillTreeEdges.filter((edge) => edge.relation !== "related" || (selected?.kind === "knowledge" && (edge.source === selected.item.id || edge.target === selected.item.id)));
  const searchResult = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    return currentItems.find((item) => {
      const haystack = "outcome" in item
        ? [item.id, item.title, item.outcome, item.description]
        : [item.id, item.title, item.practiceTitle, `第 ${item.lesson} 课`, item.chapterId, item.description];
      return haystack.some((value) => value.toLowerCase().includes(needle));
    }) ?? null;
  }, [currentItems, query]);

  useEffect(() => {
    setSearchMatch(searchResult?.id ?? null);
    if (searchResult) locate(searchResult);
  }, [searchResult]);

  function changeView(next: "overview" | "full", chapterId?: string) {
    setView(next);
    setFocusStage(chapterId ?? null);
    setSelected(null);
    setMaterialsOpen(false);
    setDrawerTab("detail");
    setSearchMatch(null);
  }

  function fitGraph(targetView = view) {
    const items = targetView === "overview" ? courseChapters : courseSkillTreeNodes;
    const minX = Math.min(...items.map((item) => item.x));
    const maxX = Math.max(...items.map((item) => item.x + 205));
    const minY = Math.min(...items.map((item) => item.y));
    const maxY = Math.max(...items.map((item) => item.y + 112));
    const rect = viewportRef.current?.getBoundingClientRect();
    const width = Math.max(320, (rect?.width ?? window.innerWidth) - 110);
    const height = Math.max(280, (rect?.height ?? window.innerHeight) - 110);
    const scale = Math.max(0.28, Math.min(1.08, width / (maxX - minX), height / (maxY - minY)));
    setTransform({
      scale,
      x: (width - (maxX - minX) * scale) / 2 - minX * scale + 55,
      y: (height - (maxY - minY) * scale) / 2 - minY * scale + 55
    });
  }

  function fitChapter(chapterId: string) {
    const items = courseSkillTreeNodes.filter((item) => item.chapterId === chapterId);
    if (!items.length) return fitGraph("full");
    const minX = Math.min(...items.map((item) => item.x));
    const maxX = Math.max(...items.map((item) => item.x + COURSE_NODE_WIDTH));
    const minY = Math.min(...items.map((item) => item.y));
    const maxY = Math.max(...items.map((item) => item.y + COURSE_NODE_HEIGHT));
    const rect = viewportRef.current?.getBoundingClientRect();
    const width = Math.max(360, (rect?.width ?? window.innerWidth) - 120);
    const height = Math.max(320, (rect?.height ?? window.innerHeight) - 140);
    const scale = Math.max(0.58, Math.min(0.9, width / Math.max(1, maxX - minX + 180), height / Math.max(1, maxY - minY + 160)));
    setTransform({
      scale,
      x: (width - (maxX - minX) * scale) / 2 - minX * scale + 60,
      y: (height - (maxY - minY) * scale) / 2 - minY * scale + 70
    });
  }

  function selectItem(item: CourseChapterProjection | CourseSkillTreeNode) {
    setMaterialsOpen(false);
    setDrawerTab("detail");
    setSelected(view === "overview" ? { kind: "stage", item: item as CourseChapterProjection } : { kind: "knowledge", item: item as CourseSkillTreeNode });
  }

  function selectPrerequisite(id: string) {
    const target = courseSkillTreeNodes.find((item) => item.id === id);
    if (!target) return;
    setMaterialsOpen(false);
    setDrawerTab("detail");
    setSelected({ kind: "knowledge", item: target });
    setFocusStage(target.chapterId);
    setSearchMatch(null);
    window.requestAnimationFrame(() => locate(target));
  }

  function queueSelect(item: CourseChapterProjection | CourseSkillTreeNode) {
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => selectItem(item), 220);
  }

  function expandItem(item: CourseChapterProjection | CourseSkillTreeNode) {
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    if (view === "overview") {
      changeView("full", item.id);
      setToast(true);
    } else {
      selectItem(item);
    }
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest(".atlas-skill-node")) return;
    dragRef.current = { dragging: true, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag.dragging) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    setTransform((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
  }

  function pointerUp() {
    dragRef.current.dragging = false;
  }

  function wheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    setTransform((current) => {
      const nextScale = Math.max(0.26, Math.min(1.9, current.scale * (event.deltaY > 0 ? 0.9 : 1.1)));
      const ratio = nextScale / current.scale;
      return { scale: nextScale, x: mx - (mx - current.x) * ratio, y: my - (my - current.y) * ratio };
    });
  }

  function locate(item: CourseChapterProjection | CourseSkillTreeNode) {
    const rect = viewportRef.current?.getBoundingClientRect();
    setTransform((current) => ({
      ...current,
      x: (rect?.width ?? window.innerWidth) / 2 - (item.x + 92) * current.scale,
      y: (rect?.height ?? window.innerHeight) / 2 - (item.y + 42) * current.scale
    }));
  }

  function nodeTitle(item: CourseChapterProjection | CourseSkillTreeNode) {
    if (mode === "knowledge") return item.title;
    if ("outcome" in item) return item.outcome;
    return item.practiceTitle;
  }

  function relation(item: CourseChapterProjection | CourseSkillTreeNode) {
    if (!focusStage) return "normal";
    if (view === "overview") {
      if (item.id === focusStage) return "focused";
      return courseChapterEdges.some(({ source, target }) => (source === focusStage && target === item.id) || (target === focusStage && source === item.id)) ? "related" : "dimmed";
    }
    const node = item as CourseSkillTreeNode;
    if (node.chapterId === focusStage) return "focused";
    const focusedIds = courseSkillTreeNodes.filter((entry) => entry.chapterId === focusStage).map((entry) => entry.id);
    return courseSkillTreeEdges.some((edge) => (focusedIds.includes(edge.source) && edge.target === node.id) || (focusedIds.includes(edge.target) && edge.source === node.id)) ? "related" : "dimmed";
  }

  const statusLabel = (item: CourseChapterProjection | CourseSkillTreeNode) => {
    if ("progress" in item) return item.progress >= 100 ? "已完成" : item.progress ? "学习中" : "可学习";
    return ({ completed: "已完成", learning: "学习中", available: "可学习", locked: "未解锁" })[item.status];
  };

  function nodeProgress(item: CourseChapterProjection | CourseSkillTreeNode) {
    if ("progress" in item) return item.id === "paradigms" ? Math.max(item.progress, Math.round((completed / 5) * 100)) : item.progress;
    if (item.lesson === 4) return Math.max(58, Math.round((completed / 5) * 100));
    if (item.status === "completed") return 100;
    if (item.status === "learning") return 55;
    return 0;
  }

  const selectedProgress = selected ? nodeProgress(selected.item) : 0;

  return (
    <main className="atlas-graph-page">
      <GlobalNav active="courses" session={session} onLogout={onLogout} />
      <header className="atlas-skill-course-island glass-v2">
        <button onClick={() => view === "full" ? changeView("overview") : navigate("/courses")} aria-label="返回上一级"><ArrowLeft size={18} /></button>
        <span className="atlas-skill-divider" />
        <div>
          <span>AGENTIC AI</span>
          <strong>{view === "overview" ? (mode === "knowledge" ? "课程篇章总览" : "篇章实训成果") : `完整课程${mode === "knowledge" ? "技能树" : "实训树"}`}</strong>
          {view === "full" ? <small>/ {focusStage ? courseChapters.find((item) => item.id === focusStage)?.title : "全课程"}</small> : null}
        </div>
        {focusStage ? <button className="atlas-skill-focus" onClick={() => setFocusStage(null)}>聚焦：{courseChapters.find((item) => item.id === focusStage)?.title}<X size={12} /></button> : null}
      </header>

      <div ref={viewportRef} className={`atlas-graph-stage ${drawerOpen ? "drawer-open" : ""}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={wheel}>
        <div className="atlas-graph-world" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>
          <svg className="atlas-graph-lines" aria-hidden="true">
            <defs>
              <marker id="atlas-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" /></marker>
              <marker id="atlas-arrow-active" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" /></marker>
            </defs>
            {currentEdges.map((edge, edgeIndex) => {
              const source = currentItems.find((item) => item.id === edge.source);
              const target = currentItems.find((item) => item.id === edge.target);
              if (!source || !target) return null;
              const highlighted = Boolean((selected && (selected.item.id === source.id || selected.item.id === target.id)) || (focusStage && (relation(source) === "focused" || relation(target) === "focused")));
              const dimmed = Boolean(focusStage && !highlighted);
              const edgeClass = "primaryRelation" in edge
                ? edge.primaryRelation
                : edge.relation === "prerequisite" ? `prerequisite ${edge.strength}` : edge.relation;
              const title = "supportCount" in edge
                ? edge.sourceKind === "curriculum-sequence" ? "教学顺序补充连接" : `${edge.supportCount} 个底层知识依赖 · ${edge.prerequisiteCount} prerequisite · ${edge.enablesCount} enables`
                : edge.reason ?? edge.relation;
              return <path markerEnd={`url(#${highlighted ? "atlas-arrow-active" : "atlas-arrow"})`} key={edge.id} d={courseEdgePath(source, target, edgeIndex)} className={`${edgeClass} ${highlighted ? "highlighted" : ""} ${dimmed ? "dimmed" : ""}`}><title>{title}</title></path>;
            })}
          </svg>
          {currentItems.map((item) => {
            const relationClass = relation(item);
            const selectedNode = selected?.item.id === item.id || searchMatch === item.id;
            const progressValue = nodeProgress(item);
            return (
              <button
                className={`atlas-skill-node ${mode === "practice" ? "practice" : ""} ${selectedNode ? "selected" : ""} ${relationClass}`}
                key={item.id}
                style={{ left: item.x, top: item.y, "--node-color": item.color } as CSSProperties}
                onClick={(event) => { event.stopPropagation(); queueSelect(item); }}
                onDoubleClick={(event) => { event.stopPropagation(); expandItem(item); }}
              >
                <span className="atlas-node-shadow" />
                <span className="atlas-node-selection" />
                <span className="atlas-node-main">
                  <i className={`atlas-node-status ${"status" in item ? item.status : progressValue >= 100 ? "completed" : "learning"}`}>{mode === "knowledge" ? "◆" : <Settings2 size={11} />}</i>
                  <strong>{nodeTitle(item)}</strong>
                  <small>{view === "overview" ? `${(item as CourseChapterProjection).lessonIds.length} 课 · ${statusLabel(item)}` : `第 ${(item as CourseSkillTreeNode).lesson} 课 · ${statusLabel(item)}`}</small>
                  <em>{view === "overview" ? `双击展开完整${mode === "knowledge" ? "技能树" : "实训树"}` : `单击查看${mode === "knowledge" ? "课件与前置要求" : "工作流与交付物"}`}</em>
                  <span className="atlas-node-expand-mark">↗</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={`atlas-graph-meta ${drawerOpen ? "drawer-open" : ""}`}>
        <div className={`atlas-graph-search glass-v2 ${searchExpanded ? "expanded" : ""}`}>
          <button onClick={() => { setSearchExpanded((value) => !value); window.setTimeout(() => searchRef.current?.focus(), 0); }} aria-label="搜索技能树"><Search size={20} /></button>
          <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && searchResult) selectItem(searchResult); }} placeholder="搜索篇章、知识点或实训…" />
        </div>
      </div>

      <div className={`atlas-graph-toolbar glass-v2 ${drawerOpen ? "drawer-open" : ""}`}>
        <button onClick={() => setTransform((current) => ({ ...current, scale: Math.min(1.9, current.scale * 1.15) }))} data-tip="放大" aria-label="放大"><Plus size={17} /></button>
        <button onClick={() => setTransform((current) => ({ ...current, scale: Math.max(0.26, current.scale / 1.15) }))} data-tip="缩小" aria-label="缩小"><Minus size={17} /></button>
        <button onClick={() => fitGraph()} data-tip="适配全图" aria-label="适配全图"><Maximize2 size={17} /></button>
        <button onClick={() => setTransform({ x: 90, y: 105, scale: 0.92 })} data-tip="重置视图" aria-label="重置视图"><RotateCcw size={17} /></button>
        <span />
        <button className={mode === "practice" ? "active" : ""} onClick={() => setMode((current) => current === "knowledge" ? "practice" : "knowledge")} data-tip="切换知识树 / 实训树" aria-label="切换知识树与实训树"><Layers3 size={17} /></button>
        <button onClick={() => setMaterialsOpen(true)} data-tip="查看全部关联课件" aria-label="查看关联课件"><BookOpen size={17} /></button>
        <button disabled={!selected} onClick={() => selected && locate(selected.item)} data-tip="定位当前节点" aria-label="定位当前节点"><Crosshair size={17} /></button>
        <button onClick={() => changeView("overview")} data-tip="返回篇章总览" aria-label="返回篇章总览"><Network size={17} /></button>
      </div>

      <button className={`atlas-graph-legend glass-v2 ${legendCollapsed ? "collapsed" : ""}`} onClick={() => setLegendCollapsed((value) => !value)}>
        <strong>学习状态 <span>{legendCollapsed ? "＋" : "－"}</span></strong>
        <div><span><i className="done" /> 已完成</span><span><i className="learning" /> 学习中</span><span><i className="available" /> 可学习</span><span><i className="locked" /> 未解锁</span></div>
      </button>
      <div className="atlas-graph-help glass-v2">拖动画布 · 滚轮缩放 · 单击查看 · 双击展开</div>

      {selected ? (
        <aside className="atlas-detail-drawer open">
          <button className="atlas-panel-close" onClick={() => setSelected(null)} aria-label="关闭详情"><X size={17} /></button>
          <div className="atlas-drawer-head">
            <span>{selected.kind === "stage" ? (mode === "knowledge" ? "篇章知识节点" : "篇章实训成果") : (mode === "knowledge" ? "知识节点" : "实训节点")}</span>
            <h2>{nodeTitle(selected.item)}</h2>
            <div><i className="atlas-pill">{selected.kind === "stage" ? `${selected.item.lessonIds.length} 课` : `第 ${selected.item.lesson} 课`}</i><i className="atlas-pill success">{statusLabel(selected.item)}</i></div>
          </div>
          <div className="atlas-drawer-tabs">
            <button className={drawerTab === "detail" ? "active" : ""} onClick={() => setDrawerTab("detail")}>节点详情</button>
            <button className={drawerTab === "materials" ? "active" : ""} onClick={() => setDrawerTab("materials")}>关联课件</button>
          </div>
          <div className="atlas-drawer-body">
          {drawerTab === "detail" ? <>
          <section className="atlas-drawer-section">
            <h3>简介</h3>
            <p>{selected.item.description}</p>
          </section>
          {selected.kind === "knowledge" ? <section className="atlas-drawer-section">
            <h3>课程覆盖</h3>
            <div className="atlas-requirement-list">
              {selected.item.curriculumContexts.map((context) => <div className="atlas-requirement" key={context.id}>
                <span className="atlas-requirement-icon ready">{context.lessonOrder}</span>
                <span><strong>第 {context.lessonOrder} 课 · {context.role}</strong><small>{courseChapters.find((chapter) => chapter.id === context.chapterId)?.title}</small></span>
              </div>)}
            </div>
          </section> : null}
          <section className="atlas-drawer-section">
            <h3>{mode === "knowledge" ? "学习进度" : "实训完成度"}</h3>
            <div className="atlas-drawer-progress-meta"><span>{statusLabel(selected.item)}</span><strong>{selectedProgress}%</strong></div>
            <div className="atlas-drawer-progress"><i style={{ width: `${selectedProgress}%` }} /></div>
          </section>
          <section className="atlas-drawer-section">
            <h3>前置要求</h3>
            <div className="atlas-requirement-list">
              {selected.kind === "knowledge" && courseSkillTreeEdges.some((edge) => edge.relation === "prerequisite" && edge.target === selected.item.id) ? courseSkillTreeEdges.filter((edge) => edge.relation === "prerequisite" && edge.target === selected.item.id).map((edge) => edge.source).map((id) => {
                const prerequisite = courseSkillTreeNodes.find((item) => item.id === id);
                if (!prerequisite) return null;
                return (
                  <button className="atlas-requirement interactive" key={id} onClick={() => selectPrerequisite(id)}>
                    <span className={`atlas-requirement-icon ${prerequisite.status === "locked" ? "waiting" : "ready"}`}>{prerequisite.status === "locked" ? "!" : <Check size={14} />}</span>
                    <span><strong>{prerequisite.title}</strong><small>第 {prerequisite.lesson} 课 · {statusLabel(prerequisite)}</small></span>
                    <ArrowRight size={14} />
                  </button>
                );
              }) : <div className="atlas-requirement"><span className="atlas-requirement-icon ready"><Check size={14} /></span><span>当前节点可开始学习</span></div>}
            </div>
          </section>
          <section className="atlas-drawer-section">
            <h3>{mode === "knowledge" ? "课程资料" : "实训信息"}</h3>
            <div className="atlas-drawer-info-card"><FileText size={15} /><span>{selected.kind === "knowledge" ? `课件 ${selected.item.lesson} · ${selected.item.lesson === 4 ? "32 个教学页面" : "课程结构已建立"}` : selected.item.outcome}</span></div>
          </section>
          <section className="atlas-drawer-section">
            <h3>{mode === "knowledge" ? "对应实训" : "对应知识"}</h3>
            <div className="atlas-drawer-info-card">{mode === "knowledge" ? <Settings2 size={15} /> : <span className="atlas-diamond">◆</span>}<span>{selected.kind === "stage" ? selected.item.outcome : mode === "knowledge" ? selected.item.practiceTitle : selected.item.title}</span></div>
          </section>
          </> : <div className="atlas-drawer-material-list">
            {selected.kind === "knowledge" && selected.item.lesson === 4 ? <article><FileText size={18} /><div><strong>第四课：推理、规划与反思范式</strong><span>DOCX · 32 个教学页面 · 5 个模板实训</span></div></article> : <article><FileText size={18} /><div><strong>第 {selected.kind === "knowledge" ? selected.item.lesson : selected.item.lessonIds[0].slice(1)} 课关联课件</strong><span>课程结构已建立，演示版暂未展开正文。</span></div></article>}
          </div>}
          </div>
          <div className="atlas-drawer-actions">
            <button className="atlas-secondary" onClick={() => locate(selected.item)}><Target size={15} />定位节点</button>
            {selected.kind === "stage" ? (
              <button className="atlas-primary" onClick={() => changeView("full", selected.item.id)}>展开完整{mode === "knowledge" ? "技能树" : "实训树"}</button>
            ) : mode === "knowledge" ? (
              <button
                className="atlas-primary"
                onClick={() => selected.item.lesson === 4 ? navigate("/courses/agentic-ai/materials/lesson-04") : setToast(true)}
              >
                <FileText size={15} />查看课件详情
              </button>
            ) : selected.item.lesson === 4 ? (
              <button className="atlas-primary" onClick={() => navigate(`/workflows/${selected.item.practiceIds[0] ?? "lesson-04-react"}`)}>
                <Network size={15} />进入工作流画布
              </button>
            ) : <button className="atlas-primary" onClick={() => setToast(true)}>进入工作流画布</button>}
          </div>
        </aside>
      ) : null}

      {materialsOpen ? (
        <aside className="atlas-detail-drawer atlas-materials-drawer open">
          <button className="atlas-panel-close" onClick={() => setMaterialsOpen(false)} aria-label="关闭课件列表"><X size={17} /></button>
          <div className="atlas-drawer-head">
            <span>课程资料</span>
            <h2>全部关联课件</h2>
            <div><i className="atlas-pill">15 份课件</i><i className="atlas-pill">课程级</i></div>
          </div>
          <div className="atlas-drawer-tabs"><button className="active">关联课件</button></div>
          <div className="atlas-drawer-body">
            <p>课件详情作为课程中心内部阅读状态，与知识节点和实训动态关联。</p>
            <article className="atlas-material-card">
              <div><span>DOCX · 32 个教学页面</span><strong>第四课：推理、规划与反思范式</strong><p>覆盖 Direct、ReAct、Plan-and-Execute、Replanning、Reflection 与 Tree of Thoughts。</p></div>
              <div className="atlas-course-meta"><span>110 分钟</span><span>5 个实训</span><span>{completed}/5 已完成</span></div>
            </article>
            <div className="atlas-placeholder-materials">
              {["第八课：工具使用与环境交互", "第九课：知识、状态与记忆", "第十课：Agent Loop 与 Runtime"].map((title) => (
                <div key={title}><FileText size={16} /><span><strong>{title}</strong><small>课程结构已建立，演示版暂未展开课件。</small></span></div>
              ))}
            </div>
          </div>
          <div className="atlas-drawer-actions">
            <button className="atlas-primary" onClick={() => navigate("/courses/agentic-ai/materials/lesson-04")}>打开最近课件 <ArrowRight size={15} /></button>
          </div>
        </aside>
      ) : null}

      {toast ? <div className="atlas-toast"><Sparkles size={16} />{view === "full" ? "已展开完整技能树并聚焦当前篇章" : "课件解析完成，已进入 Agentic AI 课程技能树"}</div> : null}
    </main>
  );
}

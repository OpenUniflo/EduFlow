import { ArrowRight, BookOpen, ChevronRight, Crosshair, Layers3, List, Lock, Map, Minus, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ArchiveCourse, ArchiveEdge, ArchiveModel, ArchiveNode } from "../model/atlasModel";
import { Avatar } from "@/shared/ui/Avatar";


export function ArchiveCourseMini({ model, onExpand, onFocusCourse, onOpenCourse }: {
  model: ArchiveModel;
  onExpand: () => void;
  onFocusCourse: (courseId: string) => void;
  onOpenCourse: (courseId: string, origin?: DOMRect) => void;
}) {
  const courses = model.courses.filter((course) => course.state === "active" || course.state === "draft").slice(0, 2);
  return (
    <section className="ef-archive-course-mini" aria-label="课程小卡">
      <header><span><BookOpen size={13} aria-hidden />课程</span><button type="button" onClick={onExpand}>展开</button></header>
      {courses.map((course) => (
        <div key={course.id} className="ef-archive-course-mini-row">
          <button type="button" className="ef-archive-course-mini-main" onClick={() => onFocusCourse(course.id)} title={course.title}>
            <b>{course.title}</b>
            <small>{course.state === "draft" ? `草稿 · ${course.knowledgeCount} 个知识` : course.nextLabel}</small>
          </button>
          <em>{course.progress}%</em>
          <button type="button" className="ef-archive-course-mini-go" onClick={(event) => onOpenCourse(course.id, event.currentTarget.getBoundingClientRect())} aria-label={`进入 ${course.title}`}><ArrowRight size={12} aria-hidden /></button>
        </div>
      ))}
      {!courses.length ? <p className="ef-archive-muted">还没有在学课程。</p> : null}
    </section>
  );
}

export function ArchiveCourseFocusBar({ course, mode, learned, total, onMode, onOpen, onClose }: {
  course: ArchiveCourse;
  mode: "skill" | "practice";
  learned: number;
  total: number;
  onMode: (mode: "skill" | "practice") => void;
  onOpen: (origin?: DOMRect) => void;
  onClose: () => void;
}) {
  return (
    <div className="ef-archive-course-pills" role="status" aria-label="课程聚焦">
      <div className="ef-archive-course-title-pill">
        <span className="ef-archive-course-focus-icon"><Layers3 size={15} aria-hidden /></span>
        <b>{course.title}</b>
        <span>{course.chapterCount} 章 · {course.knowledgeCount} 个知识</span>
      </div>
      <div className="ef-archive-course-seg" role="group" aria-label="课程树视图">
        <button type="button" aria-pressed={mode === "skill"} onClick={() => onMode("skill")}>技能树</button>
        <button type="button" aria-pressed={mode === "practice"} onClick={() => onMode("practice")}>实训树</button>
      </div>
      <div className="ef-archive-course-progress-pill">
        <b>{course.progress}%</b>
        <span className="ef-archive-course-progress-track" aria-hidden><i style={{ width: `${Math.max(0, Math.min(100, course.progress))}%` }} /></span>
        <span>{learned}/{total} 已学</span>
      </div>
      <button type="button" className="ef-archive-course-focus-open" onClick={(event) => onOpen(event.currentTarget.getBoundingClientRect())}>进入课程<ArrowRight size={13} aria-hidden /></button>
      <button type="button" className="ef-archive-icon-btn" onClick={onClose} aria-label="退出课程聚焦"><X size={14} aria-hidden /></button>
    </div>
  );
}

export function ArchiveDraftPills({ title, knowledgeCount, weeks }: { title: string; knowledgeCount: number; weeks: number }) {
  return (
    <>
      <div className="ef-archive-draft-tag" role="status">
        <span className="ef-archive-course-focus-icon"><BookOpen size={14} aria-hidden /></span>
        <b>{title}</b>
        <span>课程创建 · 草稿</span>
      </div>
      <div className="ef-archive-draft-scope" role="status">
        <span>知识范围 <b>{knowledgeCount}</b></span>
        <span>预计 <b>{weeks}</b> 周</span>
        <span>未创建</span>
      </div>
    </>
  );
}

export function ArchiveNodePanel({ node, model, edges, onClose, onSelectNode, onOpenCourse }: {
  node: ArchiveNode;
  model: ArchiveModel;
  edges: readonly ArchiveEdge[];
  onClose: () => void;
  onSelectNode: (id: string) => void;
  onOpenCourse: (courseId: string, origin?: DOMRect) => void;
}) {
  const prerequisites = useMemo(() => edges.filter((edge) => edge.target === node.id && edge.relation === "prerequisite").flatMap((edge) => { const item = model.nodeById.get(edge.source); return item ? [item] : []; }).slice(0, 5), [edges, model.nodeById, node.id]);
  const neighbors = useMemo(() => edges.filter((edge) => edge.source === node.id || edge.target === node.id).length, [edges, node.id]);
  const status = node.isMine ? (node.status === "learning" ? "在学" : node.status === "learned" ? "已学" : node.status === "practicing" ? "实训中" : node.status === "mastered" ? "已掌握" : "可探索") : "可探索";
  return (
    <aside className="ef-archive-node-panel" aria-label={`${node.title} 知识详情`}>
      <header>
        <span className="ef-archive-node-domain"><i style={{ background: node.color }} aria-hidden />{node.domainTitle}</span>
        <button type="button" className="ef-archive-icon-btn" onClick={onClose} aria-label="关闭知识详情"><X size={15} aria-hidden /></button>
      </header>
      <h2>{node.title}</h2>
      <div className="ef-archive-node-badges"><span className={`ef-archive-node-status status-${node.status}`}>{node.isMine ? `我的知识 · ${status}` : "公开学习内容"}</span>{node.scope !== "global" ? <span className="ef-archive-node-scope">{node.scope === "tenant" ? "组织知识" : "个人知识"}</span> : null}</div>
      <p>{node.description}</p>
      <dl className="ef-archive-node-facts">
        <div><dt>关联关系</dt><dd>{neighbors} 条</dd></div>
        <div><dt>前置知识</dt><dd>{prerequisites.length} 个</dd></div>
        <div><dt>覆盖课程</dt><dd>{node.courseContexts.length} 门</dd></div>
      </dl>
      {prerequisites.length ? <section><h3>事实前置</h3><div>{prerequisites.map((item) => <button type="button" key={item.id} onClick={() => onSelectNode(item.id)}><span style={{ background: item.color }} aria-hidden />{item.title}<ChevronRight size={12} aria-hidden /></button>)}</div></section> : null}
      {node.courseContexts.length ? <section><h3>出现在课程</h3><div>{node.courseContexts.slice(0, 4).map((context) => <button type="button" key={context.courseId} onClick={(event) => onOpenCourse(context.courseId, event.currentTarget.getBoundingClientRect())}><BookOpen size={12} aria-hidden />{context.courseTitle}<ArrowRight size={12} aria-hidden /></button>)}</div></section> : null}
      <div className="ef-archive-node-actions">
        {node.courseContexts[0] ? <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={(event) => onOpenCourse(node.courseContexts[0].courseId, event.currentTarget.getBoundingClientRect())}>进入相关课程<ArrowRight size={13} aria-hidden /></button> : null}
        <span className="ef-archive-node-note"><Lock size={11} aria-hidden />查看不会改变学习状态</span>
      </div>
    </aside>
  );
}

export function ArchiveZoomControls({ percent, canLocate, listOpen, onZoomIn, onZoomOut, onLocate, onFitAll, onToggleList, disabled }: {
  percent: number;
  canLocate: boolean;
  listOpen: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onLocate: () => void;
  onFitAll: () => void;
  onToggleList: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="ef-archive-zoom" role="group" aria-label="星图镜头">
      <button type="button" onClick={onZoomIn} disabled={disabled} aria-label="放大"><Plus size={16} aria-hidden /></button>
      <button type="button" onClick={onZoomOut} disabled={disabled} aria-label="缩小"><Minus size={16} aria-hidden /></button>
      <button type="button" className="ef-archive-zoom-percent" onClick={onFitAll} disabled={disabled} aria-label={`当前 ${percent}%，查看全图`}>{percent}%</button>
      <span className="ef-archive-zoom-div" aria-hidden />
      <button type="button" className="ef-archive-zoom-me" onClick={onLocate} disabled={!canLocate || disabled} title={canLocate ? "定位到我的知识" : "开始学习后可定位"} aria-label={canLocate ? "定位到我的知识" : "开始学习后可定位"}><Avatar name="我" size={24} personColor="me" decorative /><span>定位到我</span></button>
      <button type="button" onClick={onToggleList} aria-pressed={listOpen} aria-label={listOpen ? "关闭知识列表" : "打开知识列表"}>{listOpen ? <Map size={15} aria-hidden /> : <List size={15} aria-hidden />}</button>
    </div>
  );
}

export function ArchiveLegend({ model, focusMode, hasPeople, hitCount = 0, publicOnly = false, people = [] }: { model: ArchiveModel; focusMode: string; hasPeople: boolean; hitCount?: number; publicOnly?: boolean; people?: readonly { name: string; accent: string }[] }) {
  if (publicOnly) return <div className="ef-archive-legend"><span><i className="is-me" aria-hidden />公开知识 {model.stats.totalNodes}</span><span>{model.stats.totalEdges} 条事实关系</span><span>公开星图</span></div>;
  if (focusMode === "search") return <div className="ef-archive-legend"><span><i className="is-hit" aria-hidden />命中 {hitCount}</span><span><i className="is-ghost" aria-hidden />其他知识淡化</span><span>坐标未改变</span></div>;
  if (focusMode === "course") return <div className="ef-archive-legend"><span><i className="is-course" aria-hidden />课程覆盖知识</span><span><i className="is-ghost" aria-hidden />其他知识淡化</span><span>同一套坐标</span></div>;
  if (focusMode === "draft") return <div className="ef-archive-legend"><span><i className="is-course" aria-hidden />简报知识</span><span>前置层级 1 / 2 / 3</span><span>草稿未创建</span></div>;
  if (hasPeople) return <div className="ef-archive-legend"><span><i className="is-me" aria-hidden />我 {model.stats.mine}</span>{people.map((person) => <span key={person.name}><i style={{ background: `var(--p-${person.accent})` }} aria-hidden />{person.name}</span>)}<span><i className="is-seg" aria-hidden />分段外环</span></div>;
  return <div className="ef-archive-legend">
    <span><i className="is-me" aria-hidden />我的 {model.stats.mine}</span>
    <span><i className="is-learned" aria-hidden />已学 {model.stats.learned}</span>
    <span><i className="is-learning" aria-hidden />在学 {model.stats.learning}</span>
    <span><i className="is-target" aria-hidden />目标/掌握 {model.stats.mastered}</span>
    <span>共 {model.stats.totalNodes} 个知识</span>
  </div>;
}

export function ArchiveKnowledgeList({ open, model, selectedId, onSelect, onClose }: {
  open: boolean;
  model: ArchiveModel;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const nodes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (needle ? model.nodes.filter((node) => node.title.toLowerCase().includes(needle) || node.domainTitle.toLowerCase().includes(needle)) : model.nodes)
      .slice()
      .sort((left, right) => Number(right.isMine) - Number(left.isMine) || left.title.localeCompare(right.title));
  }, [model.nodes, query]);
  if (!open) return null;
  return (
    <section className="ef-archive-list-panel" aria-label="知识列表（画布替代视图）">
      <header><div><b>知识列表</b><span>与星图同一套知识，坐标不变</span></div><button type="button" className="ef-archive-icon-btn" onClick={onClose} aria-label="关闭知识列表"><X size={15} aria-hidden /></button></header>
      <label className="ef-archive-dialog-search"><Search size={14} aria-hidden /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选知识" aria-label="筛选知识列表" /></label>
      <div className="ef-archive-list-scroll" role="list">
        {nodes.map((node) => <button type="button" role="listitem" key={node.id} className={selectedId === node.id ? "is-selected" : ""} onClick={() => onSelect(node.id)}>
          <i style={{ background: node.color }} aria-hidden />
          <span><b>{node.title}</b><small>{node.domainTitle} · {node.isMine ? (node.status === "learning" ? "在学" : node.status === "learned" ? "已学" : "我的知识") : "可探索"}</small></span>
          {node.isMine ? <em>我的</em> : <ChevronRight size={12} aria-hidden />}
        </button>)}
        {!nodes.length ? <p className="ef-archive-muted">没有匹配的知识。</p> : null}
      </div>
      <footer><span>{nodes.length} 个知识 · 可聚焦列表</span></footer>
    </section>
  );
}

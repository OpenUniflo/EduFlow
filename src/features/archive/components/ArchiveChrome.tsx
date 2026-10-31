import { ArrowRight, BookOpen, ChevronRight, Crosshair, Lock, Minus, Plus, X } from "lucide-react";
import type { ArchiveCourse, ArchiveEdge, ArchiveModel, ArchiveNode } from "../model/atlasModel";
import { PreviewBadge } from "@/shared/ui/PreviewBadge";

export function ArchiveLevelChip({ level }: { level: number }) {
  return (
    <div className="ef-atlas-level ef-ui-glass ef-ui-glass--regular" aria-label="当前星图层级">
      {["领域", "主题", "知识"].map((label, index) => <span key={label} className={index === level ? "is-on" : ""}>{label}</span>)}
    </div>
  );
}

export function ArchiveZoomControls({ percent, disabled, onZoomIn, onZoomOut, onReset }: {
  percent: number;
  disabled?: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  return (
    <div className="ef-atlas-zoom ef-ui-glass ef-ui-glass--regular" role="group" aria-label="星图镜头">
      <button type="button" onClick={onZoomOut} disabled={disabled} aria-label="缩小"><Minus size={16} aria-hidden /></button>
      <span className="ef-atlas-zoom-percent" aria-label={`当前缩放 ${percent}%`}>{percent}%</span>
      <button type="button" onClick={onZoomIn} disabled={disabled} aria-label="放大"><Plus size={16} aria-hidden /></button>
      <span className="ef-atlas-zoom-div" aria-hidden />
      <button type="button" className="ef-atlas-zoom-reset" onClick={onReset} disabled={disabled} aria-label="复位视角" title="复位视角"><Crosshair size={15} aria-hidden /><span>复位</span></button>
    </div>
  );
}

export function ArchiveCourseFocusBar({ course, learned, leftInset = 0, onOpen }: {
  course: ArchiveCourse;
  learned: number;
  leftInset?: number;
  onOpen: (origin?: DOMRect) => void;
}) {
  return (
    <div
      className="ef-atlas-coursebar ef-ui-glass ef-ui-glass--regular"
      role="status"
      aria-label="课程聚焦"
      style={{ left: `calc(50% + ${Math.round(leftInset / 2)}px)`, maxWidth: `calc(100% - ${leftInset + 32}px)` }}
    >
      <div className="ef-atlas-coursebar-title">
        <span className="ef-atlas-coursebar-mark" aria-hidden>{course.title.slice(0, 1)}</span>
        <span><b>{course.title}</b><small>点空白处返回星图</small></span>
      </div>
      <div className="ef-atlas-coursebar-progress">
        <span className="ef-atlas-progress-track" aria-hidden><i style={{ width: `${Math.max(0, Math.min(100, course.progress))}%` }} /></span>
        <small>{learned} / {course.knowledgeCount} 已学 · {course.progress}%</small>
      </div>
      <button type="button" className="ef-atlas-primary" onClick={(event) => onOpen(event.currentTarget.getBoundingClientRect())}>进入课程<ArrowRight size={14} aria-hidden /></button>
    </div>
  );
}

export function ArchiveDraftFocusBar({ title, knowledgeCount, weeks, leftInset = 0 }: { title: string; knowledgeCount: number; weeks: number; leftInset?: number }) {
  return (
    <div
      className="ef-atlas-coursebar ef-atlas-draftbar ef-ui-glass ef-ui-glass--regular"
      role="status"
      aria-label="课程创建草稿"
      style={{ left: `calc(50% + ${Math.round(leftInset / 2)}px)`, maxWidth: `calc(100% - ${leftInset + 32}px)` }}
    >
      <div className="ef-atlas-coursebar-title">
        <span className="ef-atlas-coursebar-mark" aria-hidden><BookOpen size={16} /></span>
        <span><b>{title}</b><small>课程创建简报 · 草稿未创建</small></span>
      </div>
      <div className="ef-atlas-draft-meta">
        <span>知识范围 <b>{knowledgeCount}</b></span>
        <span>预计 <b>{weeks}</b> 周</span>
      </div>
      <span className="ef-atlas-draft-hint">点空白处返回星图</span>
    </div>
  );
}

const RELATION_LABEL: Record<string, string> = { prerequisite: "前置", enables: "使能", related: "相关" };

export function ArchiveNodePanel({ node, model, edges, topicName, learners, onClose, onSelectNode, onOpenCourse, focusedCourseId, onOpenFocusCourse }: {
  node: ArchiveNode;
  model: ArchiveModel;
  edges: readonly ArchiveEdge[];
  topicName: string;
  learners: readonly { name: string; color: string; has: boolean }[];
  onClose: () => void;
  onSelectNode: (id: string) => void;
  onOpenCourse: (courseId: string, origin?: DOMRect) => void;
  focusedCourseId?: string | null;
  onOpenFocusCourse?: (knowledgeId: string) => void;
}) {
  const neighbours = edges
    .filter((edge) => edge.source === node.id || edge.target === node.id)
    .flatMap((edge) => {
      const otherId = edge.source === node.id ? edge.target : edge.source;
      const other = model.nodeById.get(otherId);
      return other ? [{ node: other, relation: edge.relation, direction: edge.source === node.id ? "out" : "in" }] : [];
    })
    .sort((left, right) => left.relation.localeCompare(right.relation) || left.node.title.localeCompare(right.node.title))
    .slice(0, 8);
  const status = node.isMine ? (node.status === "learning" ? "在学" : node.status === "learned" ? "已学" : node.status === "practicing" ? "实训中" : node.status === "mastered" ? "已掌握" : "可探索") : "可探索";
  return (
    <aside className="ef-atlas-detail ef-ui-glass ef-ui-glass--regular" aria-label={`${node.title} 知识详情`}>
      <header>
        <div>
          <span className="ef-atlas-detail-kicker"><i style={{ background: node.color }} aria-hidden />{node.domainTitle}<em>·</em>{topicName}</span>
          <h2>{node.title}</h2>
        </div>
        <button type="button" className="ef-atlas-icon-btn" onClick={onClose} aria-label="关闭知识详情"><X size={15} aria-hidden /></button>
      </header>
      <div className="ef-atlas-detail-badges">
        <span className={`ef-atlas-status status-${node.status}`}>{node.isMine ? `我的知识 · ${status}` : "公开学习内容"}</span>
        {node.scope !== "global" ? <span>{node.scope === "tenant" ? "组织知识" : "个人知识"}</span> : null}
      </div>
      <p className="ef-atlas-detail-description">{node.description}</p>
      {learners.length ? (
        <section>
          <h3>谁已学 <PreviewBadge /></h3>
          <div className="ef-atlas-learners">
            {learners.map((learner) => <span key={learner.name} className={learner.has ? "is-yes" : ""}><i style={{ background: learner.color }} aria-hidden />{learner.name}<em>{learner.has ? "已学" : "未学"}</em></span>)}
          </div>
        </section>
      ) : null}
      {neighbours.length ? (
        <section>
          <h3>相邻知识 · {neighbours.length}</h3>
          <div>
            {neighbours.map((item) => (
              <button type="button" key={`${item.node.id}:${item.relation}`} onClick={() => onSelectNode(item.node.id)}>
                <span style={{ background: item.node.color }} aria-hidden />
                {item.node.title}
                <em>{RELATION_LABEL[item.relation] ?? item.relation}{item.direction === "in" ? " · 指向" : " · 指向外"}</em>
                <ChevronRight size={12} aria-hidden />
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {node.courseContexts.length ? (
        <section>
          <h3>出现在课程</h3>
          <div>
            {node.courseContexts.slice(0, 4).map((context) => (
              <button type="button" key={context.courseId} onClick={(event) => onOpenCourse(context.courseId, event.currentTarget.getBoundingClientRect())}>
                <BookOpen size={12} aria-hidden />{context.courseTitle}<ArrowRight size={12} aria-hidden />
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <footer>
        {focusedCourseId && onOpenFocusCourse
          ? <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={() => onOpenFocusCourse(node.id)}>在课程中打开<ArrowRight size={13} aria-hidden /></button>
          : <span><Lock size={11} aria-hidden />查看不会改变学习状态</span>}
      </footer>
    </aside>
  );
}

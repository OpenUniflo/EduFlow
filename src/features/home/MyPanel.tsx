import { ArrowLeft, BookOpen, ChevronRight, Clock, ListChecks, Lock, UserRound, X } from "lucide-react";
import { knowledgeStateLabelFor } from "@/shared/learning/knowledgePresentation";
import { assignmentStatusPresentation } from "@/shared/learning/assignmentPresentation";
import { Button } from "@/shared/ui/Button";
import type { MockSession } from "@/features/auth/types";
import type { UserKnowledgeRecord } from "@/features/profile/types";
import type { MyCourseNextStep, MyTaskOverview } from "./myPanelProjection";
import { useMyPanelModel } from "./useMyPanelModel";
import "./home.css";

type PanelProps = {
  session: MockSession;
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onBack?: () => void;
  backLabel?: string;
  onOpenCourse(courseId: string, origin?: DOMRect): void;
  onOpenPractice(courseId: string, assignmentId: string, title: string, origin?: DOMRect): void;
  onOpenRecent(nodeId: string): void;
  /** Task cards visible in the current conversation, so My never contradicts them. */
  extraAssignmentKeys?: readonly string[];
};

const statusLabels = new Proxy({} as Record<string, string>, {
  get: (_target, key) => knowledgeStateLabelFor(String(key))
});

/**
 * My panel is a read-only personal overview: every current Course, only the
 * tasks that need learner action and recent learning. Every row opens its
 * object. It holds no conversation list and no "new conversation" action.
 */
export function MyPanel({ session, open, loading = false, onClose, onBack, backLabel = "返回", onOpenCourse, onOpenPractice, onOpenRecent, extraAssignmentKeys = [] }: PanelProps) {
  const { courses, tasks, recent, titles } = useMyPanelModel(session);
  // Kept for the Home caller's contract; My reads durable task state directly.
  void extraAssignmentKeys;

  if (!open) return null;

  return <aside id="ef-my-panel" className="ef-my-panel" aria-label="我的面板" aria-modal="false" data-open="true" aria-busy={loading || undefined}>
    <header className="ef-my-panel-head">
      <span className="ef-my-panel-avatar" aria-hidden="true"><UserRound size={18} /></span>
      <div><h2>我的</h2><p>{session.name}</p></div>
      <div className="ef-my-panel-tools">
        {onBack ? <Button variant="ghost" size="32" icon={<ArrowLeft size={14} aria-hidden="true" />} onClick={onBack} aria-label={backLabel}>{backLabel}</Button> : null}
        <button type="button" className="ef-home-icon" onClick={onClose} aria-label="关闭我的面板"><X size={15} /></button>
      </div>
    </header>

    <div className="ef-my-panel-body">
      <section className="ef-my-section" aria-labelledby="my-courses">
        <div className="ef-my-section-head"><h3 id="my-courses"><BookOpen size={14} aria-hidden="true" />当前课程</h3><small>{courses.length} 门</small></div>
        {courses.length ? courses.map((course) => <button key={course.id} type="button" className="ef-my-row" onClick={(event) => onOpenCourse(course.id, event.currentTarget.getBoundingClientRect())}>
          <span className="ef-my-row-main"><BookOpen size={14} aria-hidden="true" /><span>
            <strong>{course.title}</strong>
            {course.nextStep ? <small className="ef-my-course-next">下一步 · {nextStepKindLabel(course.nextStep.kind)}：{course.nextStep.title}</small> : null}
            <small>已学 {course.learned} / {course.total} 个知识点</small>
          </span></span>
          <span className="ef-my-course-bar" aria-hidden="true"><i style={{ width: `${course.total ? Math.round(course.learned / course.total * 100) : 0}%` }} /></span>
          <ChevronRight size={14} aria-hidden="true" />
        </button>) : <p className="ef-my-muted">还没有正在学的课程。</p>}
      </section>

      <section className="ef-my-section" aria-labelledby="my-tasks">
        <div className="ef-my-section-head"><h3 id="my-tasks"><ListChecks size={14} aria-hidden="true" />任务状态</h3><small>{tasks.length} 项</small></div>
        {tasks.length ? tasks.map((task) => <button key={task.id} type="button" className="ef-my-row" onClick={(event) => onOpenPractice(task.courseId, task.assignmentId, task.title, event.currentTarget.getBoundingClientRect())}>
          <span><strong>{task.title}</strong><small>{task.courseTitle}</small></span>
          <span className={`ef-my-status ${taskTone(task)}`}>{taskLabel(task)}</span>
          <ChevronRight size={14} aria-hidden="true" />
        </button>) : <p className="ef-my-muted">现在没有需要处理的任务。</p>}
      </section>

      <section className="ef-my-section" aria-labelledby="my-recent">
        <div className="ef-my-section-head"><h3 id="my-recent"><Clock size={14} aria-hidden="true" />最近学习</h3><small>{recent.length} 条</small></div>
        {recent.length ? recent.map((record) => <button key={record.nodeId} type="button" className="ef-my-row" onClick={() => onOpenRecent(record.nodeId)}>
          <span><strong>{titles.get(record.nodeId) ?? record.nodeId}</strong><small>{statusLabels[record.status] ?? record.status}{record.updatedAt ? ` · ${formatRelative(record.updatedAt)}` : ""}</small></span>
          <ChevronRight size={14} aria-hidden="true" />
        </button>) : <p className="ef-my-muted">还没有学习记录。</p>}
      </section>
    </div>

    <footer className="ef-my-panel-foot"><span><Lock size={12} aria-hidden="true" />仅自己可见</span><span>概览只读</span></footer>
  </aside>;
}

function nextStepKindLabel(kind: MyCourseNextStep["kind"]) {
  if (kind === "micro") return "小练习";
  if (kind === "material") return "资料";
  return "动手任务";
}

function taskLabel(task: MyTaskOverview) {
  return task.kind === "next" ? "下一步" : assignmentStatusPresentation(task.status).label;
}

function taskTone(task: MyTaskOverview) {
  if (task.kind === "needs_revision") return "is-warn";
  if (task.kind === "in_progress" || task.kind === "next") return "is-brand";
  return "is-quiet";
}

function formatRelative(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  if (diff < 86_400_000) return "今天";
  if (diff < 172_800_000) return "昨天";
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

export function statusLabelForRecord(record: UserKnowledgeRecord) {
  return statusLabels[record.status] ?? record.status;
}

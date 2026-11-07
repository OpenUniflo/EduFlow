import { BookOpen, ChevronRight, Clock, ListChecks, Lock, UserRound, X } from "lucide-react";
import { useMemo } from "react";
import { applicationServices } from "@/app/services/applicationServices";
import { satisfiesTeachingPrerequisite } from "@/shared/learning/teachingPrerequisites";
import type { MockSession } from "@/features/auth/types";
import type { UserKnowledgeRecord } from "@/features/profile/types";
import "./home.css";

type PanelProps = {
  session: MockSession;
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onOpenCourse(courseId: string): void;
  onOpenPractice(courseId: string, assignmentId: string, title: string): void;
  onOpenRecent(nodeId: string): void;
};

const statusLabels: Record<string, string> = {
  learning: "在学",
  learned: "已学",
  practicing: "动手任务中",
  mastered: "已掌握"
};

const assignmentLabels: Record<string, string> = {
  not_started: "未开始",
  started: "进行中",
  submitted: "待评价",
  needs_revision: "需要修改",
  accepted: "已通过",
  completed: "已通过"
};

/**
 * My panel is a read-only personal overview: the active Course, real task
 * states and recent learning. Every row opens its object. It holds no
 * conversation list, no "new conversation" action and never restates the
 * next step.
 */
export function MyPanel({ session, open, loading = false, onClose, onOpenCourse, onOpenPractice, onOpenRecent }: PanelProps) {
  const runtimes = useMemo(() => applicationServices.courseRepository.listCourseRuntimes(), []);
  const records = useMemo(() => applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId), [session.userId]);
  const courseStates = useMemo(() => new Map(runtimes.map((runtime) => [runtime.course.id, applicationServices.learningProgressRepository.getCourseState(session.userId, runtime.course.id)])), [runtimes, session.userId]);

  const courses = useMemo(() => runtimes.flatMap((runtime) => {
    const state = courseStates.get(runtime.course.id);
    if (!state?.isActive) return [];
    const nodeIds = [...new Set(runtime.curriculumCoverages.map((coverage) => coverage.nodeId))];
    const status = new Map(records.map((record) => [record.nodeId, record.status]));
    const learned = nodeIds.filter((nodeId) => satisfiesTeachingPrerequisite(status.get(nodeId))).length;
    return [{ id: runtime.course.id, title: runtime.course.title, learned, total: nodeIds.length, updatedAt: state.updatedAt ?? "" }];
  }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)), [courseStates, records, runtimes]);

  const tasks = useMemo(() => runtimes.flatMap((runtime) => {
    const state = courseStates.get(runtime.course.id);
    if (!state?.isActive) return [];
    return runtime.assignments.flatMap((assignment) => {
      const status = state.assignmentStates[assignment.id]?.status;
      if (!status || status === "not_started") return [];
      return [{ id: `${runtime.course.id}:${assignment.id}`, courseId: runtime.course.id, assignmentId: assignment.id, title: assignment.title, status }];
    });
  }).slice(0, 5), [courseStates, runtimes]);

  const recent = useMemo(() => [...records]
    .filter((record) => record.status !== "explore")
    .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))
    .slice(0, 3), [records]);
  const titles = useMemo(() => {
    const map = new Map(applicationServices.knowledgeRepository.getVisibleGraph({ visibleScopes: ["global", "tenant", "user"], userId: session.userId }).nodes.map((node) => [node.id, node.title]));
    for (const record of records) {
      const path = runtimes.map((runtime) => applicationServices.microLearningRepository.getPath(record.nodeId, { courseId: runtime.course.id, mode: "learn" })).find(Boolean)
        ?? applicationServices.microLearningRepository.getPath(record.nodeId, { mode: "learn" });
      if (path) map.set(record.nodeId, path.title);
    }
    return map;
  }, [records, runtimes, session.userId]);

  if (!open) return null;
  const currentCourse = courses[0];

  return <aside id="ef-my-panel" className="ef-my-panel" aria-label="我的面板" aria-modal="false" data-open="true" aria-busy={loading || undefined}>
    <header className="ef-my-panel-head">
      <span className="ef-my-panel-avatar" aria-hidden="true"><UserRound size={18} /></span>
      <div><h2>我的</h2><p>{session.name}</p></div>
      <div className="ef-my-panel-tools"><button type="button" className="ef-home-icon" onClick={onClose} aria-label="关闭我的面板"><X size={15} /></button></div>
    </header>

    <div className="ef-my-panel-body">
      <section className="ef-my-section" aria-labelledby="my-courses">
        <div className="ef-my-section-head"><h3 id="my-courses"><BookOpen size={14} aria-hidden="true" />当前课程</h3></div>
        {currentCourse ? <button type="button" className="ef-my-row" onClick={() => onOpenCourse(currentCourse.id)}>
          <span><strong>{currentCourse.title}</strong><small>已学 {currentCourse.learned} / {currentCourse.total} 个要点</small></span>
          <span className="ef-my-course-bar" aria-hidden="true"><i style={{ width: `${currentCourse.total ? Math.round(currentCourse.learned / currentCourse.total * 100) : 0}%` }} /></span>
          <ChevronRight size={14} aria-hidden="true" />
        </button> : <p className="ef-my-muted">还没有开始学习。</p>}
      </section>

      <section className="ef-my-section" aria-labelledby="my-tasks">
        <div className="ef-my-section-head"><h3 id="my-tasks"><ListChecks size={14} aria-hidden="true" />任务状态</h3><small>{tasks.length} 项</small></div>
        {tasks.length ? tasks.map((task) => <button key={task.id} type="button" className="ef-my-row" onClick={() => onOpenPractice(task.courseId, task.assignmentId, task.title)}>
          <span><strong>{task.title}</strong></span>
          <span className={`ef-my-status ${task.status === "needs_revision" ? "is-warn" : task.status === "accepted" || task.status === "completed" ? "" : "is-quiet"}`}>{assignmentLabels[task.status] ?? task.status}</span>
          <ChevronRight size={14} aria-hidden="true" />
        </button>) : <p className="ef-my-muted">当前没有动手任务。</p>}
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

import { BookOpen, Check, Clock, ListChecks, Lock, MessageSquare, Plus, UserRound, X } from "lucide-react";
import { useMemo } from "react";
import { applicationServices } from "@/app/services/applicationServices";
import { satisfiesTeachingPrerequisite } from "@/shared/learning/teachingPrerequisites";
import type { MockSession } from "@/features/auth/types";
import type { AssistantSession } from "@/features/assistant/assistantContract";
import type { UserKnowledgeRecord } from "@/features/profile/types";
import "./home.css";

type PanelProps = {
  session: MockSession;
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  sessions: AssistantSession[];
  activeSessionId: string | null;
  onNewConversation: () => void;
  onSelectSession: (sessionId: string) => void;
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
 * My panel is read-only overview: the active Course, its tasks and recent
 * learning, plus conversation history. It never restates the next step and
 * never duplicates the conversation's main action.
 */
export function MyPanel({ session, open, loading = false, onClose, sessions, activeSessionId, onNewConversation, onSelectSession }: PanelProps) {
  const runtimes = useMemo(() => applicationServices.courseRepository.listCourseRuntimes(), []);
  const records = useMemo(() => applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId), [session.userId]);
  const courseStates = useMemo(() => new Map(runtimes.map((runtime) => [runtime.course.id, applicationServices.learningProgressRepository.getCourseState(session.userId, runtime.course.id)])), [runtimes, session.userId]);

  const courses = useMemo(() => runtimes.flatMap((runtime) => {
    const state = courseStates.get(runtime.course.id);
    if (!state?.isActive) return [];
    const nodeIds = [...new Set(runtime.curriculumCoverages.map((coverage) => coverage.nodeId))];
    const status = new Map(records.map((record) => [record.nodeId, record.status]));
    const learned = nodeIds.filter((nodeId) => satisfiesTeachingPrerequisite(status.get(nodeId))).length;
    return [{ id: runtime.course.id, title: runtime.course.title, learned, total: nodeIds.length }];
  }), [courseStates, records, runtimes]);

  const tasks = useMemo(() => runtimes.flatMap((runtime) => {
    const state = courseStates.get(runtime.course.id);
    if (!state?.isActive) return [];
    return runtime.assignments.flatMap((assignment) => {
      const status = state.assignmentStates[assignment.id]?.status;
      if (!status || status === "not_started") return [];
      return [{ id: `${runtime.course.id}:${assignment.id}`, title: assignment.title, status }];
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

  return <aside id="ef-my-panel" className="ef-my-panel" aria-label="我的面板" aria-modal="false" data-open="true" aria-busy={loading || undefined}>
    <header className="ef-my-panel-head">
      <span className="ef-my-panel-avatar" aria-hidden="true"><UserRound size={18} /></span>
      <div><h2>我的</h2><p>{session.name}</p></div>
      <div className="ef-my-panel-tools"><button type="button" className="ef-home-icon" onClick={onClose} aria-label="关闭我的面板"><X size={15} /></button></div>
    </header>

    <div className="ef-my-panel-body">
      <section className="ef-my-section" aria-labelledby="my-conversations">
        <div className="ef-my-section-head"><h3 id="my-conversations"><MessageSquare size={14} aria-hidden="true" />对话</h3><small>{sessions.length} 条</small></div>
        <button type="button" className="ef-my-conversation-new" onClick={onNewConversation}><Plus size={14} aria-hidden="true" />新对话</button>
        <div className="ef-my-conversation-list">
          {sessions.length ? sessions.slice(0, 8).map((item) => <button key={item.id} type="button" className={`ef-my-conversation ${item.id === activeSessionId ? "is-active" : ""}`} onClick={() => onSelectSession(item.id)} aria-current={item.id === activeSessionId ? "true" : undefined}>
            <span><strong>{item.title?.trim() || "未命名对话"}</strong><small>{formatRelative(item.updatedAt)}</small></span>
            {item.id === activeSessionId ? <Check size={14} aria-hidden="true" /> : null}
          </button>) : <p className="ef-my-muted">还没有历史对话。</p>}
        </div>
      </section>

      <section className="ef-my-section" aria-labelledby="my-courses">
        <div className="ef-my-section-head"><h3 id="my-courses"><BookOpen size={14} aria-hidden="true" />正在学</h3><small>{courses.length} 门</small></div>
        {courses.length ? courses.slice(0, 3).map((course) => <div key={course.id} className="ef-my-course-overview">
          <span><strong>{course.title}</strong><small>已学 {course.learned} / {course.total} 个要点</small></span>
          <div className="ef-my-course-bar" aria-hidden="true"><i style={{ width: `${course.total ? Math.round(course.learned / course.total * 100) : 0}%` }} /></div>
        </div>) : <p className="ef-my-muted">还没有开始学习。</p>}
      </section>

      <section className="ef-my-section" aria-labelledby="my-tasks">
        <div className="ef-my-section-head"><h3 id="my-tasks"><ListChecks size={14} aria-hidden="true" />我的任务</h3><small>{tasks.length} 项</small></div>
        {tasks.length ? tasks.map((task) => <div key={task.id} className="ef-my-task">
          <span><strong>{task.title}</strong></span>
          <span className={`ef-my-status ${task.status === "needs_revision" ? "is-warn" : task.status === "accepted" || task.status === "completed" ? "" : "is-quiet"}`}>{assignmentLabels[task.status] ?? task.status}</span>
        </div>) : <p className="ef-my-muted">当前没有动手任务。</p>}
      </section>

      <section className="ef-my-section" aria-labelledby="my-recent">
        <div className="ef-my-section-head"><h3 id="my-recent"><Clock size={14} aria-hidden="true" />最近学习</h3><small>{recent.length} 条</small></div>
        {recent.length ? recent.map((record) => <div key={record.nodeId} className="ef-my-recent-row">
          <span><strong>{titles.get(record.nodeId) ?? record.nodeId}</strong><small>{statusLabels[record.status] ?? record.status}{record.updatedAt ? ` · ${formatRelative(record.updatedAt)}` : ""}</small></span>
        </div>) : <p className="ef-my-muted">还没有学习记录。</p>}
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

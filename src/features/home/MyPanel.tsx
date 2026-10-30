import { ArrowRight, BookOpen, Briefcase, ChevronRight, ClipboardCheck, Clock, GraduationCap, Lock, Network, Plus, Sparkles, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { applicationServices } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import { canManageCourses } from "@/features/auth/capabilities";
import type { FollowedPerson } from "@/features/profile/people/PeopleRepository";
import { Avatar } from "@/shared/ui/Avatar";
import { PreviewBadge } from "@/shared/ui/PreviewBadge";
import { buildArchiveSummary, buildPanelPeople, buildRecentLearning, buildTeacherReminders, type PanelCourseItem, type PanelPracticeItem, type PanelRecentItem, type PanelTeacherReminder } from "./panelModel";
import "./home.css";

type PanelProps = {
  session: MockSession;
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  selectedPersonId: string | null;
  onSelectPerson: (person: FollowedPerson | null) => void;
  selectedCourseId: string | null;
  onSelectCourse: (courseId: string) => void;
  onOpenPractice: (courseId: string, assignmentId: string, title: string) => void;
  onOpenImmersivePractice: (courseId: string, assignmentId: string) => void;
};

export function MyPanel({ session, open, loading = false, onClose, selectedPersonId, onSelectPerson, selectedCourseId, onSelectCourse, onOpenPractice, onOpenImmersivePractice }: PanelProps) {
  const navigate = useNavigate();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [revision, setRevision] = useState(0);
  const [people, setPeople] = useState<readonly FollowedPerson[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleError, setPeopleError] = useState("");
  const [teacherReminders, setTeacherReminders] = useState<PanelTeacherReminder[]>([]);
  const [teacherError, setTeacherError] = useState("");
  const [teacherRetry, setTeacherRetry] = useState(0);

  useEffect(() => {
    const unsubscribeProgress = applicationServices.learningProgressRepository.subscribe(() => setRevision((value) => value + 1));
    const unsubscribeKnowledge = applicationServices.userKnowledgeRepository.subscribe(() => setRevision((value) => value + 1));
    return () => { unsubscribeProgress(); unsubscribeKnowledge(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setPeopleLoading(true); setPeopleError("");
    const repository = applicationServices.preview?.peopleRepository;
    if (!repository) { setPeople([]); setPeopleLoading(false); setPeopleError("关注关系尚未接入。"); return () => { live = false; }; }
    void repository.listFollowed(session.userId)
      .then((items) => { if (live) setPeople(items); })
      .catch(() => { if (live) setPeopleError("关注的人暂时无法加载。"); })
      .finally(() => { if (live) setPeopleLoading(false); });
    return () => { live = false; };
  }, [open, session.userId]);

  useEffect(() => {
    if (!open || !canManageCourses(session)) return;
    let live = true;
    setTeacherError("");
    void applicationServices.learnerStateService.listAssignmentSubmissions()
      .then(({ submissions }) => { if (live) setTeacherReminders(buildTeacherReminders(submissions)); })
      .catch(() => { if (live) setTeacherError("教学提醒暂时无法加载，请重试。"); });
    return () => { live = false; };
  }, [open, session, teacherRetry]);

  const runtimes = useMemo(() => applicationServices.courseRepository.listCourseRuntimes(), [revision]);
  const records = useMemo(() => applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId), [revision, session.userId]);
  const graph = useMemo(() => applicationServices.knowledgeRepository.getVisibleGraph({ visibleScopes: ["global", "tenant", "user"], userId: session.userId }), [revision, session.userId]);
  const nodeTitles = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node.title])), [graph.nodes]);

  const courses = useMemo<PanelCourseItem[]>(() => {
    return runtimes.flatMap((runtime) => {
      const state = applicationServices.learningProgressRepository.getCourseState(session.userId, runtime.course.id);
      const isDraft = runtime.course.lifecycle === "draft";
      if (runtime.course.lifecycle === "archived" && !state.isActive) return [];
      if (!state.isActive && !isDraft) return [];
      const pending = runtime.assignments.filter((assignment) => !["accepted", "completed"].includes(state.assignmentStates[assignment.id]?.status ?? ""));
      const accepted = runtime.assignments.length - pending.length;
      const progress = runtime.assignments.length ? Math.round(accepted / runtime.assignments.length * 100) : 0;
      const next = pending[0];
      return [{
        id: runtime.course.id,
        title: runtime.course.title,
        progress,
        nextLabel: isDraft ? "草稿 · 未发布" : next ? `下一步「${next.title}」· ${runtime.chapters.length} 章` : "已完成全部实践",
        active: state.isActive,
        draft: isDraft,
        source: "real" as const
      }];
    }).sort((left, right) => Number(right.active) - Number(left.active) || Number(left.draft) - Number(right.draft) || left.title.localeCompare(right.title));
  }, [runtimes, revision, session.userId]);

  const recent = useMemo<PanelRecentItem[]>(() => buildRecentLearning(records, nodeTitles, 3), [nodeTitles, records]);
  const archive = useMemo(() => buildArchiveSummary(records, nodeTitles), [nodeTitles, records]);

  const practices = useMemo<PanelPracticeItem[]>(() => {
    return runtimes.flatMap((runtime) => {
      const state = applicationServices.learningProgressRepository.getCourseState(session.userId, runtime.course.id);
      return runtime.assignments.flatMap((assignment) => {
        const status = state.assignmentStates[assignment.id]?.status;
        if (!status || ["accepted", "completed"].includes(status)) return [];
        return [{ id: assignment.id, courseId: runtime.course.id, title: assignment.title, status, source: "real" as const }];
      });
    }).slice(0, 2);
  }, [runtimes, revision, session.userId]);

  const peopleView = useMemo(() => buildPanelPeople({ people, selectedPersonId }), [people, selectedPersonId]);

  if (!open) return null;

  if (loading) return <aside id="ef-my-panel" className="ef-my-panel" aria-label="我的面板" aria-modal="false" data-open="true" aria-busy="true">
    <header className="ef-my-panel-head">
      <span className="ef-my-panel-avatar" aria-hidden="true"><UserRound size={18} /></span>
      <div><h2>我的</h2><p>{shortName(session.name)}</p></div>
      <div className="ef-my-panel-tools"><button ref={closeRef} type="button" className="ef-home-icon" onClick={onClose} aria-label="关闭我的面板"><X size={15} /></button></div>
    </header>
    <div className="ef-my-panel-body" role="status" aria-label="正在加载我的面板">
      <MyPanelSkeleton title="我的课程" rows={3} />
      <MyPanelSkeleton title="最近学习" rows={2} />
      <MyPanelSkeleton title="关注的人" rows={2} circles />
      <MyPanelSkeleton title="我的实践" rows={2} />
    </div>
    <footer className="ef-my-panel-foot"><span><Lock size={12} aria-hidden="true" />仅自己可见</span><span>正在读取学习数据…</span></footer>
  </aside>;

  const selectedCourse = courses.find((course) => course.id === selectedCourseId) ?? courses.find((course) => course.active) ?? courses[0];

  return <aside id="ef-my-panel" className="ef-my-panel" aria-label="我的面板" aria-modal="false" data-open="true">
    <header className="ef-my-panel-head">
      <span className="ef-my-panel-avatar" aria-hidden="true"><UserRound size={18} /></span>
      <div><h2>我的</h2><p>{shortName(session.name)}</p></div>
      <div className="ef-my-panel-tools">
        <button type="button" className="ef-home-icon" onClick={() => navigate("/archive")} aria-label="打开档案" title="打开档案"><Network size={15} /></button>
        <button ref={closeRef} type="button" className="ef-home-icon" onClick={onClose} aria-label="关闭我的面板"><X size={15} /></button>
      </div>
    </header>

    <div className="ef-my-panel-body">
      <section className="ef-my-section" aria-labelledby="my-courses">
        <div className="ef-my-section-head"><h3 id="my-courses"><BookOpen size={14} aria-hidden="true" />我的课程</h3><small>{courses.filter((course) => course.active).length} 在学 · {courses.filter((course) => course.draft).length} 草稿</small></div>
        <div className="ef-my-course-list">
          {courses.length ? courses.slice(0, 3).map((course) => <button key={course.id} type="button" className={`ef-my-course ${course.id === selectedCourse?.id ? "is-selected" : ""}`} onClick={() => onSelectCourse(course.id)} title={course.title}>
            <span className="ef-my-course-title">{course.title}</span>
            <span className="ef-my-course-meta"><small>{course.nextLabel}</small><strong>{course.draft ? "草稿" : `${course.progress}%`}</strong></span>
            {course.id === selectedCourse?.id ? <span className="ef-my-course-check" aria-hidden="true">✓</span> : <Plus size={14} aria-hidden="true" className="ef-my-course-plus" />}
          </button>) : <div className="ef-my-empty"><BookOpen size={18} /><strong>还没有课程</strong><p>从档案选一门课程开始，进度会出现在这里。</p></div>}
          {courses.length > 3 ? <button type="button" className="ef-my-more" onClick={() => navigate("/courses")}>还有 {courses.length - 3} 门课程 · 查看全部</button> : null}
        </div>
      </section>

      <section className="ef-my-section" aria-labelledby="my-recent">
        <div className="ef-my-section-head"><h3 id="my-recent"><Clock size={14} aria-hidden="true" />最近学习</h3><small>{recent.length} 条</small></div>
        <div className="ef-my-recent-list">
          {recent.length ? recent.map((item) => <button type="button" key={item.id} className="ef-my-recent" onClick={() => navigate("/archive")}>
            <span><strong>{item.title}</strong><small>{item.detail}{item.updatedAt ? ` · ${formatRelative(item.updatedAt)}` : ""}</small></span><Plus size={14} aria-hidden="true" />
          </button>) : <p className="ef-my-muted">还没有学习记录。</p>}
        </div>
      </section>

      <section className="ef-my-section" aria-labelledby="my-people">
        <div className="ef-my-section-head"><h3 id="my-people"><UserRound size={14} aria-hidden="true" />关注的人</h3>{peopleLoading ? <small>加载中…</small> : peopleView.marker ? <PreviewBadge /> : <small>真实空态</small>}</div>
        {peopleLoading ? <div className="ef-my-people-skeleton" aria-hidden="true"><span /><span /><span /><span /></div> : peopleError ? <p className="ef-my-error" role="alert">{peopleError}</p> : peopleView.state === "empty" ? <div className="ef-my-empty"><UserRound size={18} /><strong>还没有关注的人</strong><p>关注同学后，这里会显示他们的公开进度。</p><button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => navigate("/archive")}>去找人</button></div> : <>
          <div className="ef-my-people-row" role="list">
            {peopleView.people.map((person) => <button key={person.id} type="button" role="listitem" className={`ef-my-person ${selectedPersonId === person.id ? "is-selected" : ""}`} onClick={() => onSelectPerson(person)} aria-pressed={selectedPersonId === person.id}>
              <Avatar name={person.displayName.replace("示例 · ", "")} size={40} personColor={person.accent} />
              <strong>{person.displayName.replace("示例 · ", "")}</strong>
              <small>{person.visibility === "private" ? "未公开" : `${person.sharedKnowledgeCount} 个知识`}</small>
            </button>)}
          </div>
          {peopleView.marker ? <p className="ef-my-preview-note"><PreviewBadge />关注关系为示例数据，不会写入。</p> : null}
        </>}

      </section>

      <section className="ef-my-section" aria-labelledby="my-practices">
        <div className="ef-my-section-head"><h3 id="my-practices"><Briefcase size={14} aria-hidden="true" />我的实践</h3><small>{practices.filter((item) => item.status === "submitted").length} 待提交 · {practices.filter((item) => item.status === "needs_revision").length} 待评价</small></div>
        <div className="ef-my-practice-list">
          {practices.length ? practices.map((practice) => <div key={`${practice.courseId}:${practice.id}`} className="ef-my-practice">
            <button type="button" className="ef-my-practice-main" onClick={() => onOpenPractice(practice.courseId, practice.id, practice.title)}><strong>{practice.title}</strong><small>{statusLabel(practice.status)}</small></button>
            <span className={`ef-my-status ${statusTone(practice.status)}`}>{statusLabel(practice.status)}</span>
            <button type="button" className="ef-home-icon" aria-label={`沉浸打开 ${practice.title}`} onClick={() => onOpenImmersivePractice(practice.courseId, practice.id)}><ArrowRight size={14} /></button>
          </div>) : <p className="ef-my-muted">当前没有待处理的实践。</p>}
        </div>
      </section>

      {canManageCourses(session) ? <section className="ef-my-section" aria-labelledby="my-teaching">
        <div className="ef-my-section-head"><h3 id="my-teaching"><GraduationCap size={14} aria-hidden="true" />教学提醒</h3><button type="button" className="ef-my-link" onClick={() => navigate("/teaching")}>教学<ChevronRight size={12} /></button></div>
        {teacherError ? <p className="ef-my-error" role="alert">{teacherError}<button type="button" onClick={() => setTeacherRetry((value) => value + 1)}>重试</button></p> : teacherReminders.length ? teacherReminders.map((reminder) => <button type="button" className="ef-my-teacher-reminder" key={reminder.id} onClick={() => navigate("/teaching")}><ClipboardCheck size={15} /><span><strong>{reminder.label}</strong><small>点击进入教学审核</small></span><ArrowRight size={14} /></button>) : <p className="ef-my-muted">当前没有待审核的实践。</p>}
      </section> : null}

      <section className="ef-my-section" aria-labelledby="my-archive">
        <div className="ef-my-section-head"><h3 id="my-archive"><Sparkles size={14} aria-hidden="true" />档案快照</h3><button type="button" className="ef-my-link" onClick={() => navigate("/archive")}>打开<ChevronRight size={12} /></button></div>
        <div className="ef-my-archive">
          <div className="ef-my-archive-visual" aria-hidden="true">{(records.length ? records.slice(0, 20) : [{ nodeId: "empty" }]).map((record, index) => <i key={`${record.nodeId}:${index}`} className={`dot-${index % 4}`} style={{ left: `${8 + (index * 17) % 84}%`, top: `${20 + (index * 31) % 60}%` }} />)}</div>
          <div className="ef-my-archive-copy"><strong>{archive.recentTitle ?? "还没有学习记录"}</strong><small>{archive.learned} 已学习 · {archive.learning} 在学 · {archive.practicing} 实训中 · {archive.mastered} 已掌握</small></div>
        </div>
      </section>
    </div>

    <footer className="ef-my-panel-foot">
      <span><Lock size={12} aria-hidden="true" />仅自己可见</span>
      <div><button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => navigate("/archive")}>分享</button><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={() => navigate("/archive")}>打开档案<ArrowRight size={14} /></button></div>
    </footer>
  </aside>;
}

function shortName(name: string) {
  const clean = name.trim();
  if (!clean) return "学习者";
  const words = clean.split(/\s+/);
  return words.length > 1 ? words[0] : clean.slice(0, 8);
}

function formatRelative(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "已记录";
  const diff = Date.now() - date.getTime();
  if (diff < 86_400_000) return "今天";
  if (diff < 172_800_000) return "昨天";
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function MyPanelSkeleton({ title, rows, circles = false }: { title: string; rows: number; circles?: boolean }) {
  return <section className="ef-my-section ef-my-skeleton" aria-label={title}>
    <div className="ef-my-section-head"><h3>{title}</h3><small>加载中…</small></div>
    {circles ? <div className="ef-my-skeleton-circles">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div> : <div className="ef-my-skeleton-rows">{Array.from({ length: rows }, (_, index) => <span key={index} />)}</div>}
  </section>;
}

function statusLabel(status: string) {
  if (status === "submitted") return "待教师评价";
  if (status === "needs_revision") return "需修改";
  if (status === "started") return "进行中";
  if (status === "accepted" || status === "completed") return "已通过";
  return "未开始";
}

function statusTone(status: string) {
  if (status === "needs_revision") return "is-warn";
  if (status === "submitted") return "is-pending";
  if (status === "started") return "is-brand";
  return "is-quiet";
}

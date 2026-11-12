import { Archive, BookOpen, Check, Plus, Rocket } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { applicationServices } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import type { CourseLifecycle } from "@/features/course/types";
import type { AssignmentSubmissionReview } from "@/features/learning/state/ApiLearnerStateService";
import { apiRequest } from "@/shared/api/apiClient";
import { EduFlowAssistant } from "@/features/assistant/components/EduFlowAssistant";
import { assignmentStatusPresentation } from "@/shared/learning/assignmentPresentation";
import { Pill } from "@/shared/ui/Pill";
import "./courseManagement.css";

export function CourseManagementPage({ session, onLogout }: { session: MockSession; onLogout(): void }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | CourseLifecycle>("all");
  const [revision, setRevision] = useState(0);
  const [submissions, setSubmissions] = useState<AssignmentSubmissionReview[]>([]);
  const [reviewError, setReviewError] = useState("");
  const [accepting, setAccepting] = useState("");
  const courses = useMemo(() => applicationServices.courseRepository.listCourseRuntimes().map((runtime) => ({ runtime, lifecycle: runtime.course.lifecycle ?? "published" })), [revision]);
  const labels: Record<CourseLifecycle, string> = { draft: "草稿", published: "已发布", archived: "已归档" };

  async function loadSubmissions() {
    try {
      setReviewError("");
      setSubmissions((await applicationServices.learnerStateService.listAssignmentSubmissions()).submissions);
    } catch (error) {
      console.error("Assignment review queue failed", error);
      setReviewError("验收队列加载失败，请重试。");
    }
  }

  useEffect(() => { void loadSubmissions(); }, []);

  async function setLifecycle(courseId: string, lifecycle: CourseLifecycle) {
    await apiRequest("/api/courses", { method: "PATCH", body: JSON.stringify({ courseId, lifecycle }) });
    setRevision((value) => value + 1);
  }

  async function accept(submission: AssignmentSubmissionReview) {
    const key = `${submission.learnerUserId}:${submission.courseId}:${submission.assignmentId}:${submission.attemptId ?? "aggregate"}`;
    setAccepting(key);
    try {
      await applicationServices.learnerStateService.acceptAssignment(submission.courseId, submission.assignmentId, submission.learnerUserId, submission.attemptId);
      await loadSubmissions();
    } catch (error) {
      console.error("Assignment acceptance failed", error);
      setReviewError("验收失败；只有待验收的提交可以通过。");
    } finally {
      setAccepting("");
    }
  }

  const visible = courses.filter((item) => filter === "all" || item.lifecycle === filter);
  const runtimeById = new Map(courses.map(({ runtime }) => [runtime.course.id, runtime]));

  return <main className="ef-teach-page">
    <div className="ef-teach-wrap">
      <header className="ef-teach-head">
        <div>
          <p className="ef-eyebrow">教学空间</p>
          <h1>教学管理</h1>
          <p>创建、检查和维护可学习的课程；同一门课程可从这里进入设计模式。</p>
        </div>
        <button type="button" className="ef-ui-btn ef-ui-btn--primary" onClick={() => navigate("/teaching/create")}><Plus size={17} aria-hidden="true" />创建课程</button>
      </header>

      <nav className="ef-teach-filters" aria-label="按课程状态筛选">
        {(["all", "draft", "published", "archived"] as const).map((value) => <button
          key={value}
          type="button"
          className="ef-ui-chip"
          aria-pressed={filter === value}
          onClick={() => setFilter(value)}
        >{value === "all" ? "全部" : labels[value]}</button>)}
      </nav>

      <section className="ef-teach-grid" aria-label="课程列表">
        {visible.map(({ runtime, lifecycle }) => <article className="ef-teach-card ef-ui-glass ef-ui-glass--regular ef-ui-glass--r-24" key={runtime.course.id}>
          <div className="ef-teach-card-head">
            <Pill tone={lifecycle === "published" ? "ok" : lifecycle === "draft" ? "warn" : "quiet"}>{labels[lifecycle]}</Pill>
            <span>{runtime.chapters.length} 个章节</span>
          </div>
          <h2>{runtime.course.title}</h2>
          <p>{runtime.course.description}</p>
          <dl className="ef-teach-meta">
            <div><dt>知识点</dt><dd>{new Set(runtime.curriculumCoverages.map((coverage) => coverage.nodeId)).size}</dd></div>
            <div><dt>动手任务</dt><dd>{runtime.assignments.length}</dd></div>
          </dl>
          <div className="ef-teach-actions">
            <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => navigate(`/courses/${runtime.course.id}?experience=design`)}><BookOpen size={15} aria-hidden="true" />设计课程</button>
            {lifecycle === "draft" ? <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={() => void setLifecycle(runtime.course.id, "published")}><Rocket size={15} aria-hidden="true" />发布</button>
              : lifecycle !== "archived" ? <button type="button" className="ef-ui-btn ef-ui-btn--ghost ef-ui-btn--32" onClick={() => void setLifecycle(runtime.course.id, "archived")}><Archive size={15} aria-hidden="true" />归档</button> : null}
          </div>
        </article>)}
        {!visible.length ? <div className="ef-teach-empty" role="status">
          <BookOpen size={22} aria-hidden="true" />
          <strong>{filter === "all" ? "还没有课程" : `没有${filter === "draft" ? "草稿" : filter === "published" ? "已发布" : "已归档"}课程`}</strong>
          <p>{filter === "all" ? "创建第一门课程后，它会出现在这里。" : "切换筛选条件，或创建一门新课程。"}</p>
        </div> : null}
      </section>

      <section className="ef-teach-review ef-ui-glass ef-ui-glass--regular ef-ui-glass--r-24" aria-labelledby="ef-teach-review-title">
        <header>
          <div>
            <p className="ef-eyebrow">手动验收</p>
            <h2 id="ef-teach-review-title">动手任务验收</h2>
            <p>只允许教师验收学员已提交的动手任务；提交不会自动变成通过或掌握。</p>
          </div>
        </header>
        {reviewError ? <div className="ef-teach-alert" role="alert">{reviewError}<button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => void loadSubmissions()}>重试</button></div> : null}
        <div className="ef-teach-review-list">
          {submissions.map((submission) => {
            const runtime = runtimeById.get(submission.courseId);
            const assignment = runtime?.assignments.find((item) => item.id === submission.assignmentId);
            const key = `${submission.learnerUserId}:${submission.courseId}:${submission.assignmentId}:${submission.attemptId ?? "aggregate"}`;
            const status = assignmentStatusPresentation(submission.status);
            return <article key={key}>
              <div className="ef-teach-review-copy">
                <strong>{assignment?.title ?? "动手任务"}</strong>
                <span>{runtime?.course.title ?? "课程"} · {submission.learnerName}{submission.attemptNumber ? ` · 第 ${submission.attemptNumber} 次提交` : ""}</span>
                {submission.response ? <details><summary>查看本次提交</summary><pre>{JSON.stringify(submission.response, null, 2)}</pre></details> : null}
              </div>
              <Pill tone={status.tone}>{status.label}</Pill>
              {submission.status === "submitted"
                ? <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" disabled={accepting === key} onClick={() => void accept(submission)}>{accepting === key ? "正在验收…" : "通过验收"}</button>
                : <span className="ef-teach-accepted"><Check size={15} aria-hidden="true" />已验收</span>}
            </article>;
          })}
          {!submissions.length && !reviewError ? <div className="ef-teach-empty" role="status">
            <Check size={22} aria-hidden="true" />
            <strong>当前没有待验收的提交</strong>
            <p>学员提交动手任务后，会在这里等待验收。</p>
          </div> : null}
        </div>
      </section>
    </div>
    <EduFlowAssistant context={{ workspace: "teaching", experienceMode: "design", userRole: session.role, capabilities: session.capabilities }} contextLabel="课程资产">
      <div className="course-design-assistant-actions">
        <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => navigate("/teaching/create")}>创建课程</button>
        <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => setFilter("draft")}>查看草稿</button>
        <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => setFilter("published")}>查看已发布</button>
      </div>
      <p className="assistant-plain-response">课程生命周期由数据库保存；预览不会改变已发布的学习内容。</p>
    </EduFlowAssistant>
  </main>;
}

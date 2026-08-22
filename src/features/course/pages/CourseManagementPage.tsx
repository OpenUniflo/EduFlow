import { Archive, BookOpen, Check, Plus, Rocket } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GlobalNav } from "@/app/components/GlobalNav";
import { applicationServices } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import type { CourseLifecycle } from "@/features/course/types";
import type { AssignmentSubmissionReview } from "@/features/learning/state/ApiLearnerStateService";
import { apiRequest } from "@/shared/api/apiClient";
import { EduFlowAssistant } from "@/features/assistant/components/EduFlowAssistant";

export function CourseManagementPage({ session, onLogout }: { session: MockSession; onLogout(): void }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | CourseLifecycle>("all");
  const [revision, setRevision] = useState(0);
  const [submissions, setSubmissions] = useState<AssignmentSubmissionReview[]>([]);
  const [reviewError, setReviewError] = useState("");
  const [accepting, setAccepting] = useState("");
  const courses = useMemo(() => applicationServices.courseRepository.listCourseRuntimes().map((runtime) => ({ runtime, lifecycle: runtime.course.lifecycle ?? "published" })), [revision]);
  const labels = { draft: "草稿", published: "已发布", archived: "已归档" };

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
    const key = `${submission.learnerUserId}:${submission.courseId}:${submission.assignmentId}`;
    setAccepting(key);
    try {
      await applicationServices.learnerStateService.acceptAssignment(submission.courseId, submission.assignmentId, submission.learnerUserId);
      await loadSubmissions();
    } catch (error) {
      console.error("Assignment acceptance failed", error);
      setReviewError("Assignment 验收失败；仅 submitted 状态可验收。");
    } finally {
      setAccepting("");
    }
  }

  const visible = courses.filter((item) => filter === "all" || item.lifecycle === filter);
  const runtimeById = new Map(courses.map(({ runtime }) => [runtime.course.id, runtime]));
  return <main className="atlas-page-shell course-management-page">
    <GlobalNav active="teaching" session={session} onLogout={onLogout} />
    <div className="atlas-content-wrap">
      <section className="atlas-course-title atlas-course-title-row"><div><span className="atlas-kicker">TEACHING WORKSPACE</span><h1>教学管理</h1><p>创建、检查和维护可学习的课程资产；同一课程从这里进入 Design Mode。</p></div><button className="atlas-primary" onClick={() => navigate("/teaching/create")}><Plus size={17} /> 创建课程</button></section>
      <div className="course-management-filters">{(["all", "draft", "published", "archived"] as const).map((value) => <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>{value === "all" ? "全部" : labels[value]}</button>)}</div>
      <section className="course-management-grid">{visible.map(({ runtime, lifecycle }) => <article className="course-management-card glass-v2" key={runtime.course.id}><div className="atlas-pill">{labels[lifecycle]}</div><h2>{runtime.course.title}</h2><p>{runtime.course.description}</p><div className="atlas-course-meta"><span>{runtime.chapters.length} 篇章</span><span>{new Set(runtime.curriculumCoverages.map((coverage) => coverage.nodeId)).size} Knowledge</span><span>{runtime.assignments.length} Assignment</span></div><div className="course-management-actions"><button onClick={() => navigate(`/courses/${runtime.course.id}?experience=design`)}><BookOpen size={15} />设计课程</button>{lifecycle === "draft" ? <button onClick={() => void setLifecycle(runtime.course.id, "published")}><Rocket size={15} />发布</button> : lifecycle !== "archived" ? <button onClick={() => void setLifecycle(runtime.course.id, "archived")}><Archive size={15} />归档</button> : null}</div></article>)}</section>
      <section className="course-review-queue glass-v2">
        <div><span className="atlas-kicker">MANUAL ACCEPTANCE</span><h2>Assignment 验收</h2><p>只允许教师验收 learner 已提交的 Assignment；submitted 不会自动成为 accepted 或 mastered。</p></div>
        {reviewError ? <div className="atlas-error-state" role="alert">{reviewError}<button onClick={() => void loadSubmissions()}>重试</button></div> : null}
        <div className="course-review-list">{submissions.map((submission) => {
          const runtime = runtimeById.get(submission.courseId);
          const assignment = runtime?.assignments.find((item) => item.id === submission.assignmentId);
          const key = `${submission.learnerUserId}:${submission.courseId}:${submission.assignmentId}`;
          return <article key={key}><div><strong>{assignment?.title ?? submission.assignmentId}</strong><span>{runtime?.course.title ?? submission.courseId} · {submission.learnerName}</span></div><div className={`atlas-pill ${submission.status}`}>{submission.status}</div>{submission.status === "submitted" ? <button className="atlas-primary" disabled={accepting === key} onClick={() => void accept(submission)}>Accept</button> : <span className="course-review-accepted"><Check size={15} />已验收</span>}</article>;
        })}{!submissions.length && !reviewError ? <p className="atlas-empty-state">当前没有待验收或已验收的 learner submission。</p> : null}</div>
      </section>
    </div>
    <EduFlowAssistant context={{workspace:"teaching",experienceMode:"design",userRole:session.role,capabilities:session.capabilities}} contextLabel="课程资产"><div className="course-design-assistant-actions"><button onClick={()=>navigate("/teaching/create")}>创建课程</button><button onClick={()=>setFilter("draft")}>查看 Draft</button><button onClick={()=>setFilter("published")}>查看 Published</button></div><p className="assistant-plain-response">课程生命周期由数据库保存；Preview 不会改变已发布学习者内容。</p></EduFlowAssistant>
  </main>;
}

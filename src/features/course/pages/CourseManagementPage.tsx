import { Archive, BookOpen, Plus, Rocket } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GlobalNav } from "@/app/components/GlobalNav";
import { applicationServices } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";

type Lifecycle = "draft" | "published" | "archived";
export function CourseManagementPage({ session, onLogout }: { session: MockSession; onLogout(): void }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | Lifecycle>("all");
  const [revision, setRevision] = useState(0);
  const courses = useMemo(() => applicationServices.courseRepository.listCourseRuntimes().map((runtime) => {
    const stored = localStorage.getItem(`eduflow:course-created:${runtime.course.id}`) as Lifecycle | null;
    return { runtime, lifecycle: stored ?? "published" as Lifecycle };
  }), [revision]);
  function setLifecycle(courseId: string, lifecycle: Lifecycle) { localStorage.setItem(`eduflow:course-created:${courseId}`, lifecycle); setRevision((v) => v + 1); }
  const visible = courses.filter((item) => filter === "all" || item.lifecycle === filter);
  const labels = { draft: "草稿", published: "已发布", archived: "已归档" };
  return <main className="atlas-page-shell course-management-page"><GlobalNav active="course-management" session={session} onLogout={onLogout} /><div className="atlas-content-wrap"><section className="atlas-course-title atlas-course-title-row"><div><span className="atlas-kicker">TEACHING ASSETS</span><h1>课程管理</h1><p>创建、检查和维护可学习的课程资产。</p></div><button className="atlas-primary" onClick={() => navigate("/courses/create")}><Plus size={17} /> AI 创建课程</button></section><div className="course-management-filters">{(["all", "draft", "published", "archived"] as const).map((value) => <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>{value === "all" ? "全部" : labels[value]}</button>)}</div><section className="course-management-grid">{visible.map(({ runtime, lifecycle }) => <article className="course-management-card glass-v2" key={runtime.course.id}><div className="atlas-pill">{labels[lifecycle]}</div><h2>{runtime.course.title}</h2><p>{runtime.course.description}</p><div className="atlas-course-meta"><span>{runtime.chapters.length} 篇章</span><span>{new Set(runtime.curriculumCoverages.map((c) => c.nodeId)).size} Knowledge</span><span>{runtime.assignments.length} Assignment</span></div><div className="course-management-actions"><button onClick={() => navigate(`/courses/${runtime.course.id}`)}><BookOpen size={15} />打开课程</button>{lifecycle === "draft" ? <button onClick={() => setLifecycle(runtime.course.id, "published")}><Rocket size={15} />发布</button> : lifecycle !== "archived" ? <button onClick={() => setLifecycle(runtime.course.id, "archived")}><Archive size={15} />归档</button> : null}</div></article>)}</section></div></main>;
}

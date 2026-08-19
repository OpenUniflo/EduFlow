import { Archive, BookOpen, Plus, Rocket } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GlobalNav } from "@/app/components/GlobalNav";
import { applicationServices } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import type { CourseLifecycle } from "@/features/course/types";
import { apiRequest } from "@/shared/api/apiClient";
import { EduFlowAssistant } from "@/features/assistant/components/EduFlowAssistant";

export function CourseManagementPage({ session, onLogout }: { session: MockSession; onLogout(): void }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | CourseLifecycle>("all");
  const [revision, setRevision] = useState(0);
  const courses = useMemo(() => applicationServices.courseRepository.listCourseRuntimes().map((runtime) => {
    return { runtime, lifecycle: runtime.course.lifecycle ?? "published" };
  }), [revision]);
  async function setLifecycle(courseId: string, lifecycle: CourseLifecycle) { await apiRequest("/api/courses", { method:"PATCH", body:JSON.stringify({courseId,lifecycle}) }); setRevision((v) => v + 1); }
  const visible = courses.filter((item) => filter === "all" || item.lifecycle === filter);
  const labels = { draft: "草稿", published: "已发布", archived: "已归档" };
  return <main className="atlas-page-shell course-management-page"><GlobalNav active="teaching" session={session} onLogout={onLogout} /><div className="atlas-content-wrap"><section className="atlas-course-title atlas-course-title-row"><div><span className="atlas-kicker">TEACHING WORKSPACE</span><h1>教学管理</h1><p>创建、检查和维护可学习的课程资产；同一课程从这里进入 Design Mode。</p></div><button className="atlas-primary" onClick={() => navigate("/teaching/create")}><Plus size={17} /> 创建课程</button></section><div className="course-management-filters">{(["all", "draft", "published", "archived"] as const).map((value) => <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>{value === "all" ? "全部" : labels[value]}</button>)}</div><section className="course-management-grid">{visible.map(({ runtime, lifecycle }) => <article className="course-management-card glass-v2" key={runtime.course.id}><div className="atlas-pill">{labels[lifecycle]}</div><h2>{runtime.course.title}</h2><p>{runtime.course.description}</p><div className="atlas-course-meta"><span>{runtime.chapters.length} 篇章</span><span>{new Set(runtime.curriculumCoverages.map((c) => c.nodeId)).size} Knowledge</span><span>{runtime.assignments.length} Assignment</span></div><div className="course-management-actions"><button onClick={() => navigate(`/courses/${runtime.course.id}?experience=design`)}><BookOpen size={15} />设计课程</button>{lifecycle === "draft" ? <button onClick={() => void setLifecycle(runtime.course.id, "published")}><Rocket size={15} />发布</button> : lifecycle !== "archived" ? <button onClick={() => void setLifecycle(runtime.course.id, "archived")}><Archive size={15} />归档</button> : null}</div></article>)}</section></div><EduFlowAssistant context={{workspace:"teaching",experienceMode:"design",userRole:session.role,capabilities:session.capabilities}} contextLabel="课程资产"><div className="course-design-assistant-actions"><button onClick={()=>navigate("/teaching/create")}>创建课程</button><button onClick={()=>setFilter("draft")}>查看 Draft</button><button onClick={()=>setFilter("published")}>查看 Published</button></div><p className="assistant-plain-response">课程生命周期由数据库保存；Preview 不会改变已发布学习者内容。</p></EduFlowAssistant></main>;
}

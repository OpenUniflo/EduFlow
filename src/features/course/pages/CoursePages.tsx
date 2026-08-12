import { ArrowRight, Layers3, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import type { MockSession } from "@/features/auth/types";
import { GlobalNav } from "@/app/components/GlobalNav";
import { buildCourseGraphData, buildCourseSummary } from "@/features/course/runtime/courseRuntime";
import { applicationServices } from "@/app/services/applicationServices";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";

const { courseRepository, learningProgressRepository, knowledgeRepository, userKnowledgeRepository } = applicationServices;

export function CourseCenterPage({ session, onLogout }: { session: MockSession; onLogout: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [progressRevision, setProgressRevision] = useState(0);
  useEffect(() => learningProgressRepository.subscribe(() => setProgressRevision((value) => value + 1)), []);
  const courses = useMemo(() => courseRepository.listCourseRuntimes().map((runtime) => {
    const state = learningProgressRepository.getCourseState(session.email, runtime.course.id);
    const graphData = buildCourseGraphData(runtime, state, knowledgeRepository.getVisibleGraph(userKnowledgeAccess(session.email)), userKnowledgeRepository.getUserKnowledge(session.email));
    return { runtime, state, graphData, summary: buildCourseSummary(runtime, state, graphData) };
  }), [progressRevision, session.email]);
  const needle = query.trim().toLowerCase();
  const visible = courses.filter(({ runtime, graphData }) => !needle || [
    runtime.course.title,
    runtime.course.subtitle ?? "",
    runtime.course.description,
    ...runtime.chapters.map((chapter) => chapter.title),
    ...graphData.knowledgeNodes.map((node) => node.title)
  ].some((value) => value.toLowerCase().includes(needle)));
  const recent = [...courses].sort((left, right) => (right.summary.updatedAt ?? "").localeCompare(left.summary.updatedAt ?? ""))[0];
  const learningCount = courses.filter((item) => item.summary.status === "learning").length;

  function miniMap(chapters: typeof courses[number]["graphData"]["chapters"], compact = false) {
    return <div className={`atlas-mini-map-scene ${compact ? "compact" : ""}`}>{chapters.slice(0, compact ? 6 : chapters.length).map((stage, index) => <i key={stage.id} style={{ "--i": index, "--color": stage.color } as CSSProperties} />)}</div>;
  }

  return (
    <main className="atlas-page-shell atlas-course-center">
      <GlobalNav active="courses" session={session} onLogout={onLogout} />
      <div className="atlas-course-floating-title glass-v2">课程中心</div>
      <div className="atlas-content-wrap">
        <section className="atlas-course-title atlas-course-title-row"><div><h1>课程中心</h1><p>从课程进入完整的知识、课件与实训体系。</p></div><span className="atlas-pill">{courses.length} 门课程 · {learningCount} 门学习中</span></section>
        <div className="atlas-course-actions"><label className="atlas-course-search glass-v2"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索课程、篇章或知识点…" aria-label="搜索课程" /></label><button className="atlas-secondary" onClick={() => setQuery("")}><Layers3 size={16} /> 全部课程</button></div>
        {recent ? <section className="atlas-course-section">
          <div className="atlas-section-row"><div><span className="atlas-kicker">RECENT</span><h2>最近学习</h2></div></div>
          <article className="atlas-featured-course glass-v2" onClick={() => navigate(`/courses/${recent.runtime.course.id}`)}>
            <div className="atlas-featured-copy"><div className="atlas-kicker">最近学习</div><h2>{recent.runtime.course.subtitle ?? recent.runtime.course.title}</h2><p>{recent.runtime.course.description}</p><div className="atlas-course-meta"><span>当前：{recent.runtime.lessons.find((lesson) => lesson.id === recent.summary.recentLessonId)?.title ?? "尚未开始"}</span><span>{recent.summary.lessonCount} 课</span><span>{recent.summary.assignmentCount} 项课程实训</span></div><div className="atlas-progress-row"><div className="atlas-progress-track"><i style={{ width: `${recent.summary.progress}%` }} /></div><strong>{recent.summary.progress}%</strong></div><button className="atlas-primary" onClick={(event) => { event.stopPropagation(); navigate(`/courses/${recent.runtime.course.id}`); }}>继续学习 <ArrowRight size={16} /></button></div>
            <div className="atlas-recent-mini-map" aria-label="课程技能树缩略图">{miniMap(recent.graphData.chapters)}<span>{recent.summary.chapterCount} 个篇章 · {recent.summary.knowledgeNodeCount} 个原子知识点</span></div>
          </article>
        </section> : null}
        <section className="atlas-course-section">
          <div className="atlas-section-row"><h2>所有课程</h2><span>{visible.length} 门课程</span></div>
          <div className="atlas-course-grid">
            {visible.map(({ runtime, graphData, summary }) => <article className="atlas-course-card glass-v2" key={runtime.course.id} onClick={() => navigate(`/courses/${runtime.course.id}`)}><div className="atlas-card-accent" style={{ background: runtime.course.accentColor }} /><div className="atlas-course-preview" aria-hidden="true">{miniMap(graphData.chapters, true)}</div><div className="atlas-pill">{summary.status === "completed" ? "已完成" : summary.status === "learning" ? "学习中" : "未开始"} · {runtime.course.title}</div><h3>{runtime.course.subtitle ?? runtime.course.title}</h3><p>{runtime.course.description}</p><div className="atlas-course-meta"><span>{summary.lessonCount} 课</span><span>{summary.knowledgeNodeCount} 原子节点</span><span>{summary.assignmentCount} 实训</span></div><div className="atlas-progress-row"><div className="atlas-progress-track"><i style={{ width: `${summary.progress}%` }} /></div><strong>{summary.progress}%</strong></div></article>)}
            <button className="atlas-course-card atlas-new-course glass-v2" onClick={() => navigate("/")}><span><Plus size={22} /></span><strong>从课件创建课程</strong><p>回到知识星图，上传材料并描述课程目标。</p></button>
          </div>
        </section>
      </div>
    </main>
  );
}

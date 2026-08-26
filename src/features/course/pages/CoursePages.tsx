import { ArrowRight, Layers3, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MockSession } from "@/features/auth/types";
import { GlobalNav } from "@/app/components/GlobalNav";
import { buildCourseGraphData, buildCourseSummary } from "@/features/course/runtime/courseRuntime";
import { applicationServices } from "@/app/services/applicationServices";
import { globalKnowledgeAccess, userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";

const { courseRepository, learningProgressRepository, knowledgeRepository, userKnowledgeRepository } = applicationServices;

export function CourseCenterPage({ session, onLogout }: { session: MockSession | null; onLogout: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"mine" | "all">(session ? "mine" : "all");
  const [membershipBusy, setMembershipBusy] = useState<string | null>(null);
  const [progressRevision, setProgressRevision] = useState(0);
  useEffect(() => learningProgressRepository.subscribe(() => setProgressRevision((value) => value + 1)), []);
  useEffect(() => userKnowledgeRepository.subscribe(() => setProgressRevision((value) => value + 1)), []);
  const courses = useMemo(() => courseRepository.listCourseRuntimes().filter((runtime) => runtime.course.lifecycle === "published").flatMap((runtime) => {
    try {
      const state = session ? learningProgressRepository.getCourseState(session.userId, runtime.course.id) : undefined;
      const graph=knowledgeRepository.getVisibleGraph(session ? userKnowledgeAccess(session.userId) : globalKnowledgeAccess);
      const graphData = buildCourseGraphData(runtime, state, graph, session ? userKnowledgeRepository.getUserKnowledge(session.userId) : []);
      return [{ runtime, state, graphData, summary: state ? buildCourseSummary(runtime, state, graphData) : null }];
    } catch (error) {
      console.error(`Course center projection failed for ${runtime.course.id}`, error);
      return [];
    }
  }), [progressRevision, session]);
  const needle = query.trim().toLowerCase();
  const tabCourses = tab === "mine" ? courses.filter(({ state }) => state?.isActive) : courses;
  const visible = tabCourses.filter(({ runtime, graphData }) => !needle || [
    runtime.course.title,
    runtime.course.subtitle ?? "",
    runtime.course.description,
    ...runtime.chapters.map((chapter) => chapter.title),
    ...graphData.knowledgeNodes.map((node) => node.title)
  ].some((value) => value.toLowerCase().includes(needle)));
  const recent = session ? [...courses].filter(({ state,summary }) => state?.isActive && summary).sort((left, right) => (right.summary?.updatedAt ?? "").localeCompare(left.summary?.updatedAt ?? ""))[0] : undefined;
  const learningCount = courses.filter((item) => item.state?.isActive).length;

  async function setMembership(courseId: string, active: boolean) {
    setMembershipBusy(courseId);
    try { if (active) await learningProgressRepository.activateCourse(courseId); else await learningProgressRepository.deactivateCourse(courseId); }
    finally { setMembershipBusy(null); }
  }

  function pathPreview(chapters: typeof courses[number]["runtime"]["chapters"]) {
    return <div className="atlas-course-path-preview" aria-label="课程篇章路径">{[...chapters].sort((left,right)=>left.order-right.order).slice(0,4).map((chapter,index)=><span key={chapter.id}>{index? <i>→</i> : null}{chapter.title}</span>)}</div>;
  }

  return (
    <main className="atlas-page-shell atlas-course-center">
      <GlobalNav active="courses" session={session} onLogout={onLogout} />
      <div className="atlas-course-floating-title glass-v2">课程中心</div>
      <div className="atlas-content-wrap">
        <section className="atlas-course-title atlas-course-title-row"><div><h1>课程中心</h1><p>{session ? "Published 课程可供学习；我的课程只包含你主动开始的课程。" : "无需登录即可浏览 Published 课程；个人进度与 My Courses 会在登录后显示。"}</p></div><span className="atlas-pill">{courses.length} 门公开课程{session ? ` · ${learningCount} 门我的课程` : ""}</span></section>
        {session?<nav className="learning-view-tabs" aria-label="课程范围"><button className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>我的课程</button><button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>全部课程</button></nav>:null}
        <div className="atlas-course-actions"><label className="atlas-course-search glass-v2"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索课程、篇章或知识点…" aria-label="搜索课程" /></label><button className="atlas-secondary" onClick={() => { setQuery(""); setTab("all"); }}><Layers3 size={16} /> 浏览全部课程</button></div>
        {recent?.summary ? <section className="atlas-course-section">
          <div className="atlas-section-row"><div><span className="atlas-kicker">RECENT</span><h2>最近学习</h2></div></div>
          <article className="atlas-featured-course glass-v2" onClick={() => navigate(`/courses/${recent.runtime.course.id}`)}>
            <div className="atlas-featured-copy"><div className="atlas-kicker">最近学习</div><h2>{recent.runtime.course.subtitle ?? recent.runtime.course.title}</h2><p>{recent.runtime.course.description}</p><div className="atlas-course-meta"><span>当前：{recent.runtime.lessons.find((lesson) => lesson.id === recent.summary!.recentLessonId)?.title ?? "尚未开始"}</span><span>{recent.summary.lessonCount} 课</span><span>{recent.summary.assignmentCount} 项课程实训</span></div><div className="atlas-progress-row"><span>实训进度</span><div className="atlas-progress-track"><i style={{ width: `${recent.summary.progress}%` }} /></div><strong>{recent.summary.progress}%</strong></div><button className="atlas-primary" onClick={(event) => { event.stopPropagation(); navigate(`/courses/${recent.runtime.course.id}`); }}>继续课程 <ArrowRight size={16} /></button></div>
            <div className="atlas-recent-course-path">{pathPreview(recent.runtime.chapters)}<span>{recent.summary.chapterCount} 个篇章 · {recent.summary.knowledgeNodeCount} 个原子知识点</span></div>
          </article>
        </section> : null}
        <section className="atlas-course-section">
          <div className="atlas-section-row"><h2>{tab === "mine" ? "我的课程" : "全部课程"}</h2><span>{visible.length} 门课程</span></div>
          <div className="atlas-course-grid">
            {visible.map(({ runtime, summary, state, graphData }) => <article className="atlas-course-card" key={runtime.course.id} onClick={() => navigate(`/courses/${runtime.course.id}`)}><div className="atlas-card-accent" style={{ background: runtime.course.accentColor }} /><div className="atlas-pill">{state?.isActive ? "我的课程" : "公开课程"} · {runtime.course.title}</div><h3>{runtime.course.subtitle ?? runtime.course.title}</h3><p>{runtime.course.description}</p>{pathPreview(runtime.chapters)}<div className="atlas-course-meta"><span>{runtime.lessons.length} 课</span><span>{graphData.knowledgeNodes.length} 原子节点</span><span>{runtime.assignments.length} 实训</span></div>{session&&summary?<div className="atlas-progress-row"><span>实训进度</span><div className="atlas-progress-track"><i style={{ width: `${summary.progress}%` }} /></div><strong>{summary.progress}%</strong></div>:null}<div className="atlas-card-actions">{!session?<button className="atlas-primary">浏览课程</button>:state?.isActive ? <><button className="atlas-primary" onClick={(event) => { event.stopPropagation(); navigate(`/courses/${runtime.course.id}`); }}>继续课程</button><button className="atlas-secondary" disabled={membershipBusy === runtime.course.id} onClick={(event) => { event.stopPropagation(); void setMembership(runtime.course.id, false); }}>移出我的课程</button></> : <button className="atlas-primary" disabled={membershipBusy === runtime.course.id} onClick={(event) => { event.stopPropagation(); void setMembership(runtime.course.id, true); }}>开始课程</button>}</div></article>)}
            {!visible.length && tab === "mine" ? <article className="learning-empty"><h3>你还没有开始任何课程</h3><p>浏览公开课程；开始课程只加入 My Courses，不会自动开始第一个 Knowledge。</p><button className="atlas-primary" onClick={() => setTab("all")}>浏览全部课程 <ArrowRight size={15}/></button></article> : null}
          </div>
        </section>
      </div>
    </main>
  );
}

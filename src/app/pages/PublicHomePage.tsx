import { ArrowRight, BookOpen, Compass, Lock, Network, Sparkles, Target, Wrench } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { applicationServices } from "@/app/services/applicationServices";
import { isCourseVisibleToViewer } from "@/features/course/runtime/courseVisibility";
import { globalKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { Button } from "@/shared/ui/Button";
import { courseEntryState } from "@/features/course/pages/courseEntry";
import { GlassSurface } from "@/shared/ui/GlassSurface";
import { Pill } from "@/shared/ui/Pill";
import "./publicHome.css";

export function PublicHomePage() {
  const navigate = useNavigate();
  const courses = applicationServices.courseRepository.listCourseRuntimes().filter((runtime) => runtime.course.lifecycle === "published" && isCourseVisibleToViewer(runtime.course));
  const graph = applicationServices.knowledgeRepository.getVisibleGraph(globalKnowledgeAccess);
  const previewCourses = courses.slice(0, 3);

  return (
    <main className="ef-pub">
      <section className="ef-pub-hero">
        <h1>想学什么，从一句话开始</h1>
        <p>EduFlow 会帮你找到合适的课程，补齐前置知识，并在对话里陪你学完。</p>
        <GlassSurface radius={24} className="ef-pub-lock">
          <Lock size={18} aria-hidden />
          <span>登录后可以和 EduFlow 对话</span>
          <Button variant="primary" size="32" onClick={() => navigate("/login")}>登录</Button>
          <Button variant="secondary" size="32" onClick={() => navigate("/register")}>注册</Button>
        </GlassSurface>
        <div className="ef-pub-chips" aria-label="你可以这样开始">
          <span className="ef-pub-chip">我想做一个能查资料的 Agent</span>
          <span className="ef-pub-chip">从零学 RAG</span>
          <span className="ef-pub-chip">工具调用怎么做</span>
        </div>
      </section>

      <section className="ef-pub-sec" aria-labelledby="ef-pub-courses">
        <h2 id="ef-pub-courses">公开课程<button type="button" onClick={() => navigate("/archive")}>查看全部<ArrowRight size={14} aria-hidden /></button></h2>
        <div className="ef-pub-grid">
          {previewCourses.map((runtime) => (
            <article className="ef-pub-card" key={runtime.course.id}>
              <div className="ef-pub-tag"><Pill tone="quiet">公开</Pill></div>
              <h3>{runtime.course.subtitle ?? runtime.course.title}</h3>
              <p>{runtime.course.description}</p>
              <span className="ef-pub-meta">{runtime.chapters.length} 章 · {runtime.lessons.length} 课 · {runtime.assignments.length} 个实践</span>
              <Button variant="ghost" size="32" onClick={() => navigate(`/courses/${runtime.course.id}`, { state: courseEntryState("home", "/") })}>浏览课程<ArrowRight size={14} aria-hidden /></Button>
            </article>
          ))}
          {!previewCourses.length ? <article className="ef-pub-card ef-pub-card-empty"><h3>公开课程正在准备中</h3><p>课程发布后会出现在这里。</p></article> : null}
          <button type="button" className="ef-pub-map" onClick={() => navigate("/archive")} aria-label={`打开我的地图，浏览 ${graph.nodes.length} 个公开可见知识点`}>
            <Network size={40} aria-hidden />
            <span>知识星图</span>
            <small>{graph.nodes.length} 个公开可见知识点 · 在我的地图中浏览</small>
            <ArrowRight size={16} aria-hidden />
          </button>
        </div>
      </section>

      <section className="ef-pub-sec" aria-labelledby="ef-pub-how">
        <h2 id="ef-pub-how">EduFlow 怎么陪你学</h2>
        <div className="ef-pub-how">
          <div><i><Target size={18} aria-hidden /></i><p><b>说出目标</b><span>助手帮你找到现成课程，或者为你生成一条个人课程。</span></p></div>
          <div><i><Compass size={18} aria-hidden /></i><p><b>看清全貌</b><span>我的地图把学过的、在学的和下一步放在同一张图上。</span></p></div>
          <div><i><Wrench size={18} aria-hidden /></i><p><b>动手实践</b><span>做出作品并提交评估，学会的知识会被点亮。</span></p></div>
        </div>
      </section>

      <footer className="ef-pub-foot">
        <BookOpen size={15} aria-hidden />
        <span>公开内容可以匿名浏览；学习进度、作品与对话需要登录。</span>
        <Sparkles size={14} aria-hidden />
      </footer>
    </main>
  );
}

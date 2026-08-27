import { ArrowRight, BookOpen, Compass, Network } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlobalNav } from "@/app/components/GlobalNav";
import { applicationServices } from "@/app/services/applicationServices";
import { EduFlowAssistant } from "@/features/assistant/components/EduFlowAssistant";
import { globalKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { isCourseVisibleToViewer } from "@/features/course/runtime/courseVisibility";

export function PublicHomePage() {
  const navigate = useNavigate();
  const courses = applicationServices.courseRepository.listCourseRuntimes().filter((runtime) => isCourseVisibleToViewer(runtime.course));
  const graph = applicationServices.knowledgeRepository.getVisibleGraph(globalKnowledgeAccess);
  return <main className="atlas-page-shell atlas-course-center public-home-page">
    <GlobalNav active="learning" />
    <div className="atlas-content-wrap">
      <section className="atlas-course-title"><span className="atlas-kicker">公开学习</span><h1>先探索，再决定从哪里开始</h1><p>无需登录即可浏览公开知识、课程、课件、快速学习与实训。个人进度、正式提交和学习助手会在登录后启用。</p></section>
      <div className="atlas-course-actions"><button className="atlas-primary" onClick={() => navigate("/explore")}><Compass size={16}/>探索全局知识星图<ArrowRight size={15}/></button><button className="atlas-secondary" onClick={() => navigate("/courses")}><BookOpen size={16}/>浏览公开课程</button></div>
      <section className="atlas-course-section"><div className="atlas-section-row"><div><span className="atlas-kicker">公开目录</span><h2>公开学习世界</h2></div><span>{graph.nodes.length} 个知识点 · {courses.length} 门课程</span></div>
        <div className="atlas-course-grid">
          <article className="atlas-course-card" onClick={() => navigate("/explore")}><div className="atlas-card-accent"/><div className="atlas-pill"><Network size={13}/>全局知识星图</div><h3>沿真实关系探索知识</h3><p>浏览已启用的全局知识及其前置、能力与关联关系。</p><button className="atlas-primary">打开星图</button></article>
          {courses.slice(0, 5).map((runtime) => <article className="atlas-course-card" key={runtime.course.id} onClick={() => navigate(`/courses/${runtime.course.id}`)}><div className="atlas-card-accent" style={{background:runtime.course.accentColor}}/><div className="atlas-pill">公开课程</div><h3>{runtime.course.title}</h3><p>{runtime.course.description}</p><div className="atlas-course-meta"><span>{runtime.chapters.length} 篇章</span><span>{runtime.lessons.length} 课</span><span>{runtime.assignments.length} 实训</span></div><button className="atlas-primary">浏览课程</button></article>)}
        </div>
      </section>
    </div>
    <EduFlowAssistant locked contextLabel="Public Learning"/>
  </main>;
}

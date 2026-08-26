import { ArrowRight, BookOpen, Compass, Network } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlobalNav } from "@/app/components/GlobalNav";
import { applicationServices } from "@/app/services/applicationServices";
import { EduFlowAssistant } from "@/features/assistant/components/EduFlowAssistant";
import { globalKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";

export function PublicHomePage() {
  const navigate = useNavigate();
  const courses = applicationServices.courseRepository.listCourseRuntimes().filter((runtime) => runtime.course.lifecycle === "published");
  const graph = applicationServices.knowledgeRepository.getVisibleGraph(globalKnowledgeAccess);
  return <main className="atlas-page-shell atlas-course-center public-home-page">
    <GlobalNav active="learning" />
    <div className="atlas-content-wrap">
      <section className="atlas-course-title"><span className="atlas-kicker">PUBLIC LEARNING</span><h1>先探索，再决定从哪里开始</h1><p>无需登录即可浏览公开 Knowledge、课程、课件、Micro Learning 与实训。个人进度、正式提交和 Assistant 会在登录后启用。</p></section>
      <div className="atlas-course-actions"><button className="atlas-primary" onClick={() => navigate("/explore")}><Compass size={16}/>探索 Global Atlas<ArrowRight size={15}/></button><button className="atlas-secondary" onClick={() => navigate("/courses")}><BookOpen size={16}/>浏览公开课程</button></div>
      <section className="atlas-course-section"><div className="atlas-section-row"><div><span className="atlas-kicker">OPEN CATALOG</span><h2>公开学习世界</h2></div><span>{graph.nodes.length} 个 Knowledge · {courses.length} 门课程</span></div>
        <div className="atlas-course-grid">
          <article className="atlas-course-card" onClick={() => navigate("/explore")}><div className="atlas-card-accent"/><div className="atlas-pill"><Network size={13}/>Global Knowledge Atlas</div><h3>沿真实关系探索知识</h3><p>浏览 active Global Knowledge 及其 prerequisite、enables、related 关系。</p><button className="atlas-primary">打开 Atlas</button></article>
          {courses.slice(0, 5).map((runtime) => <article className="atlas-course-card" key={runtime.course.id} onClick={() => navigate(`/courses/${runtime.course.id}`)}><div className="atlas-card-accent" style={{background:runtime.course.accentColor}}/><div className="atlas-pill">公开课程</div><h3>{runtime.course.title}</h3><p>{runtime.course.description}</p><div className="atlas-course-meta"><span>{runtime.chapters.length} 篇章</span><span>{runtime.lessons.length} 课</span><span>{runtime.assignments.length} 实训</span></div><button className="atlas-primary">浏览课程</button></article>)}
        </div>
      </section>
    </div>
    <EduFlowAssistant locked contextLabel="Public Learning"/>
  </main>;
}

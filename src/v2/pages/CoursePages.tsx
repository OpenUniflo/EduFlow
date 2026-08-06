import { ArrowRight, Layers3, Plus, Search } from "lucide-react";
import { type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import type { MockSession } from "../../app/model";
import { GlobalNav } from "../components/GlobalNav";
import { courseChapters, courseSkillTreeNodes, practices } from "../data";
import { useLearningProgress } from "../progress";

export function CourseCenterPage({ session, onLogout }: { session: MockSession; onLogout: () => void }) {
  const navigate = useNavigate();
  const progress = useLearningProgress();
  const completed = progress.completedPracticeIds.length;
  const practicePercent = Math.round((completed / practices.length) * 100);
  return (
    <main className="atlas-page-shell atlas-course-center">
      <GlobalNav active="courses" session={session} onLogout={onLogout} />
      <div className="atlas-course-floating-title glass-v2">课程中心</div>
      <div className="atlas-content-wrap">
        <section className="atlas-course-title atlas-course-title-row"><div><h1>课程中心</h1><p>从一门课程进入完整的知识、课件与实训体系。</p></div><span className="atlas-pill">1 门课程 · 1 门学习中</span></section>
        <div className="atlas-course-actions"><label className="atlas-course-search glass-v2"><Search size={17} /><input placeholder="搜索课程、篇章或知识点…" aria-label="搜索课程" /></label><button className="atlas-secondary"><Layers3 size={16} /> 全部课程</button></div>
        <section className="atlas-course-section">
          <div className="atlas-section-row"><div><span className="atlas-kicker">RECENT</span><h2>最近学习</h2></div></div>
          <article className="atlas-featured-course glass-v2" onClick={() => navigate("/courses/agentic-ai")}>
            <div className="atlas-featured-copy"><div className="atlas-kicker">最近学习</div><h2>Agentic AI：从问题建模到受治理智能体</h2><p>继续学习“架构与推理范式”篇章。第四课将通过五套统一任务模板比较 Direct、ReAct、规划、重规划与评价优化。</p><div className="atlas-course-meta"><span>当前：第四课 · 推理、规划与反思</span><span>15 课</span><span>5 项重点实训</span></div><div className="atlas-progress-row"><div className="atlas-progress-track"><i style={{ width: `${Math.max(36, practicePercent)}%` }} /></div><strong>{Math.max(36, practicePercent)}%</strong></div><button className="atlas-primary" onClick={(event) => { event.stopPropagation(); navigate("/courses/agentic-ai"); }}>继续学习 <ArrowRight size={16} /></button></div>
            <div className="atlas-recent-mini-map" aria-label="课程技能树缩略图"><div className="atlas-mini-map-scene">{courseChapters.map((stage, index) => <i key={stage.id} style={{ "--i": index, "--color": stage.color } as CSSProperties} />)}</div><span>{courseChapters.length} 个篇章 · {courseSkillTreeNodes.length} 个原子知识点</span></div>
          </article>
        </section>
        <section className="atlas-course-section">
          <div className="atlas-section-row"><h2>所有课程</h2><span>1 门课程</span></div>
          <div className="atlas-course-grid">
            <article className="atlas-course-card glass-v2" onClick={() => navigate("/courses/agentic-ai")}><div className="atlas-card-accent" /><div className="atlas-course-preview" aria-hidden="true"><div className="atlas-mini-map-scene compact">{courseChapters.slice(0, 6).map((stage, index) => <i key={stage.id} style={{ "--i": index, "--color": stage.color } as CSSProperties} />)}</div></div><div className="atlas-pill">学习中 · Agentic AI</div><h3>智能体系统设计与实践</h3><p>从概念、问题建模和推理范式出发，逐步构建可运行、可评测、可治理的 Agent 系统。</p><div className="atlas-course-meta"><span>15 课</span><span>{courseSkillTreeNodes.length} 原子节点</span><span>{practices.length} 实训</span></div><div className="atlas-progress-row"><div className="atlas-progress-track"><i style={{ width: `${Math.max(36, practicePercent)}%` }} /></div><strong>{Math.max(36, practicePercent)}%</strong></div></article>
            <button className="atlas-course-card atlas-new-course glass-v2" onClick={() => navigate("/")}><span><Plus size={22} /></span><strong>从课件创建课程</strong><p>回到知识星图，上传材料并描述课程目标。</p></button>
          </div>
        </section>
      </div>
    </main>
  );
}

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Clock3, GitBranch, Maximize2, Minus, Network, PanelLeftClose, PanelRightClose, Pin, Plus, Target, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { MockSession } from "../../app/model";
import { courseAssignments } from "../data";
import {
  acceptanceItems,
  discussionQuestions,
  homeworkItems,
  lessonFourMaterial,
  lessonFourAssignments,
  teacherChecklist
} from "../lessonData";
import { saveRecentMaterialPage, useLearningProgress } from "../progress";
import { GlobalNav } from "../components/GlobalNav";

type LessonKnowledge = {
  id: string;
  title: string;
  description: string;
  color: string;
  type: string;
  time: string;
  slide: number;
  assignmentId: string;
  related: string[];
  extras: Array<{ title: string; meta: string }>;
};

const lessonKnowledge: Record<string, LessonKnowledge> = {
  concepts: { id: "concepts", title: "决策范式与任务完成", description: "从任务状态、外部证据、行动过程和约束满足理解 Agent 的完成条件。", color: "#78a7ee", type: "基础概念", time: "预计 12 分钟", slide: 1, assignmentId: "lesson-04-direct", related: ["direct", "react", "planning"], extras: [{ title: "范式坐标判断", meta: "概念 · 8 分钟" }] },
  direct: { id: "direct", title: "Direct 与 Reactive", description: "Direct 适合信息完整的一次生成；Reactive 根据当前状态立即行动，但缺少长期计划。", color: "#697ee6", type: "基础范式", time: "预计 14 分钟", slide: 6, assignmentId: "lesson-04-direct", related: ["concepts", "react", "selection"], extras: [{ title: "Direct 基线实验", meta: "模板实验 · 5 分钟" }] },
  react: { id: "react", title: "ReAct 推理—行动循环", description: "让推理、工具行动和环境观察形成闭环，并以停止条件约束执行。", color: "#70c4a5", type: "核心范式", time: "预计 22 分钟", slide: 9, assignmentId: "lesson-04-react", related: ["direct", "planning", "replanning"], extras: [{ title: "来源验证轨迹", meta: "轨迹分析 · 10 分钟" }, { title: "无效循环诊断", meta: "调试 · 8 分钟" }] },
  planning: { id: "planning", title: "Plan-and-Execute", description: "Planner 生成可检查计划，Executor 按依赖、产物和完成条件逐项执行。", color: "#9a8ee6", type: "规划范式", time: "预计 18 分钟", slide: 15, assignmentId: "lesson-04-plan", related: ["react", "replanning", "selection"], extras: [{ title: "计划质量检查", meta: "结构化计划 · 12 分钟" }] },
  replanning: { id: "replanning", title: "增量 Replanning", description: "保留已经完成的结果，只修改受失败、新证据或目标变化影响的剩余步骤。", color: "#eca86c", type: "恢复范式", time: "预计 15 分钟", slide: 19, assignmentId: "lesson-04-replan", related: ["planning", "react", "reflection"], extras: [{ title: "失败触发器实验", meta: "异常恢复 · 10 分钟" }] },
  reflection: { id: "reflection", title: "Reflection 与 Evaluator–Optimizer", description: "把评价结果转化为可执行改进，并以明确 Rubric 控制迭代质量与预算。", color: "#ec92aa", type: "评价范式", time: "预计 20 分钟", slide: 22, assignmentId: "lesson-04-evaluator", related: ["replanning", "selection", "tot"], extras: [{ title: "Evaluator–Optimizer", meta: "模板实验 · 8 分钟" }, { title: "Rubric 偏差检查", meta: "分析 · 10 分钟" }] },
  tot: { id: "tot", title: "Tree of Thoughts", description: "生成、评价和剪枝多个候选中间状态，以搜索换取复杂问题上的决策质量。", color: "#77b7c8", type: "搜索式推理", time: "预计 14 分钟", slide: 27, assignmentId: "lesson-04-plan", related: ["planning", "reflection", "selection"], extras: [{ title: "搜索预算估算", meta: "分析 · 8 分钟" }] },
  selection: { id: "selection", title: "范式选择与组合", description: "从信息缺口、任务长度、环境变化和可评价性出发选择最小可行结构。", color: "#697ee6", type: "综合判断", time: "预计 12 分钟", slide: 30, assignmentId: "lesson-04-evaluator", related: ["direct", "react", "planning", "replanning", "reflection"], extras: [{ title: "同一任务范式比较", meta: "综合实验 · 35 分钟" }] }
};

function knowledgeIdsForPage(page: number) {
  if (page <= 5) return ["concepts", page >= 4 ? "selection" : "direct"];
  if (page <= 8) return ["direct", "react"];
  if (page <= 14) return ["react", page >= 13 ? "replanning" : "concepts"];
  if (page <= 18) return ["planning", "replanning"];
  if (page <= 21) return ["replanning", "planning"];
  if (page <= 26) return ["reflection", "replanning"];
  if (page <= 29) return ["tot", "planning", "reflection"];
  return ["selection", "direct", "react", "planning", "reflection"];
}

export function LessonPage({ session, onLogout }: { session: MockSession; onLogout: () => void }) {
  const navigate = useNavigate();
  const progress = useLearningProgress();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activePage, setActivePage] = useState(() => Math.min(32, Math.max(1, progress.recentMaterialPage)));
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const initialKnowledge = knowledgeIdsForPage(activePage)[0];
  const [activeKnowledgeId, setActiveKnowledgeId] = useState(initialKnowledge);
  const [pinnedKnowledgeId, setPinnedKnowledgeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [locationToast, setLocationToast] = useState("");
  const [workflowAssignmentId, setWorkflowAssignmentId] = useState<string | null>(null);
  const scrollTimerRef = useRef<number | null>(null);
  const activeKnowledge = lessonKnowledge[activeKnowledgeId] ?? lessonKnowledge.concepts;
  const assignment = courseAssignments.find((item) => item.id === activeKnowledge.assignmentId);
  const workflowAssignment = courseAssignments.find((item) => item.id === workflowAssignmentId);
  const pinned = Boolean(pinnedKnowledgeId);
  const completed = progress.completedAssignmentIds.length;

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-page-number]"));
    const closestToCenter = () => {
      const rootRect = root.getBoundingClientRect();
      const center = rootRect.top + rootRect.height / 2;
      return targets.reduce((best, target) => {
        const rect = target.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - center);
        return distance < best.distance ? { page: Number(target.dataset.pageNumber), distance } : best;
      }, { page: 1, distance: Number.POSITIVE_INFINITY }).page;
    };
    const update = () => {
      const max = root.scrollHeight - root.clientHeight;
      setScrollPercent(max <= 0 ? 0 : (root.scrollTop / max) * 100);
      if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = window.setTimeout(() => {
        const page = closestToCenter();
        setActivePage(page);
        saveRecentMaterialPage(page);
        if (!pinnedKnowledgeId) setActiveKnowledgeId(knowledgeIdsForPage(page)[0]);
      }, 320);
    };
    root.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      root.removeEventListener("scroll", update);
      if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
    };
  }, [pinnedKnowledgeId, zoom]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && workflowAssignmentId) setWorkflowAssignmentId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [workflowAssignmentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const root = scrollRef.current;
      if (!root) return;
      const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-page-number]"));
      const center = root.getBoundingClientRect().top + root.clientHeight / 2;
      const closest = targets.sort((a, b) => Math.abs(a.getBoundingClientRect().top + a.clientHeight / 2 - center) - Math.abs(b.getBoundingClientRect().top + b.clientHeight / 2 - center))[0];
      if (closest) setActivePage(Number(closest.dataset.pageNumber));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [zoom]);

  function goToPage(pageNumber: number) {
    const root = scrollRef.current;
    const target = root?.querySelector<HTMLElement>(`[data-page-number="${pageNumber}"]`);
    if (!root || !target) return;
    root.scrollTo({ top: target.offsetTop - 22, behavior: "smooth" });
    setActivePage(pageNumber);
    saveRecentMaterialPage(pageNumber);
    if (!pinnedKnowledgeId) setActiveKnowledgeId(knowledgeIdsForPage(pageNumber)[0]);
    setLocationToast(`已定位到：${lessonFourMaterial.pages[pageNumber - 1].title}`);
    window.setTimeout(() => setLocationToast(""), 1700);
  }

  function chooseKnowledge(id: string) {
    setPinnedKnowledgeId(null);
    setActiveKnowledgeId(id);
  }

  const relatedKnowledge = useMemo(() => activeKnowledge.related.map((id) => lessonKnowledge[id]).filter(Boolean), [activeKnowledge]);

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      // Fullscreen is optional; reading remains available when the browser blocks it.
    }
  }

  return (
    <main className={`atlas-lesson-page ${leftCollapsed ? "left-collapsed" : ""} ${rightCollapsed ? "right-collapsed" : ""} ${pinned ? "context-pinned" : ""}`}>
      <GlobalNav active="courses" session={session} onLogout={onLogout} />
      <header className="atlas-lesson-course-chip glass-v2">
        <button className="atlas-lesson-back" onClick={() => navigate("/courses/agentic-ai")} aria-label="返回课程技能树"><ArrowLeft size={16} /></button>
        <div>
          <button onClick={() => navigate("/courses/agentic-ai")}>Agentic AI</button>
          <ChevronRight size={13} />
          <strong>第四课 · 推理、规划与反思范式</strong>
          <ChevronRight size={13} />
          <span>课程课件</span>
        </div>
        <b>第 {activePage} / 32 页</b>
      </header>
      <div className="atlas-lesson-top-controls glass-v2" aria-label="阅读控制">
        <button onClick={() => setZoom((value) => Math.max(0.72, value - 0.1))} aria-label="缩小课件"><Minus size={16} /></button>
        <button className="atlas-zoom-label" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}% · 适应宽度</button>
        <button onClick={() => setZoom((value) => Math.min(1.42, value + 0.1))} aria-label="放大课件"><Plus size={16} /></button>
        <button onClick={toggleFullscreen} aria-label="全屏阅读"><Maximize2 size={16} /></button>
      </div>

      <section className="atlas-lesson-workspace">
      <aside className="atlas-lesson-outline glass-v2">
        <div className="atlas-outline-head">
          <span>课件页面</span>
          <button onClick={() => setLeftCollapsed((value) => !value)} aria-label={leftCollapsed ? "展开课件页面" : "折叠课件页面"}><PanelLeftClose size={15} /></button>
        </div>
        <div className="atlas-outline-scroll">
          {lessonFourMaterial.pages.map((page) => (
            <button key={page.id} className={activePage === page.number ? "active" : ""} onClick={() => goToPage(page.number)} aria-label={`跳转到第 ${page.number} 页：${page.title}`}>
              <span className="atlas-outline-preview">
                <strong>{page.title}</strong>
                <i /><i /><i />
              </span>
              <b>{String(page.number).padStart(2, "0")}</b>
            </button>
          ))}
        </div>
      </aside>

      <section className="atlas-lesson-reader-shell">
      <div className="atlas-lesson-scroll" ref={scrollRef} style={{ "--lesson-scale": zoom } as CSSProperties}>
        <div className="atlas-lesson-main">
          {lessonFourMaterial.pages.map((page) => (
            <article className={`atlas-lesson-slide atlas-slide-${page.visual ?? (page.table ? "comparison" : page.code ? "trace" : page.assignmentId ? "practice" : "overview")} ${activePage === page.number ? "current" : ""}`} key={page.id} data-page-number={page.number} data-knowledge={knowledgeIdsForPage(page.number)[0]}>
              <div className="atlas-slide-label">{String(page.number).padStart(2, "0")} · {page.section}</div>
              <h2>{page.title}</h2>
              <p className="atlas-slide-lead">{page.lead}</p>
              {page.bullets ? (
                <ul className="atlas-slide-bullets">
                  {page.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                </ul>
              ) : null}
              {page.code ? <pre className="atlas-lesson-code">{page.code}</pre> : null}
              {page.table ? (
                <div className="atlas-table-wrap">
                  <table>
                    <thead><tr>{page.table.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
                    <tbody>{page.table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              ) : null}
              <div className="atlas-slide-tags">{page.knowledge.map((item) => <span key={item}>{item}</span>)}</div>
              {page.assignmentId ? (
                <button className="atlas-inline-practice" onClick={() => setWorkflowAssignmentId(page.assignmentId ?? null)}>
                  <Network size={16} /><span><strong>{courseAssignments.find((item) => item.id === page.assignmentId)?.title}</strong><small>{courseAssignments.find((item) => item.id === page.assignmentId)?.mode === "workflow" ? "预览工作流实训" : "查看实训说明"}</small></span><ArrowRight size={16} />
                </button>
              ) : null}
              <div className="atlas-knowledge-rail" aria-label="本页关联知识点">
                {knowledgeIdsForPage(page.number).map((id, index) => (
                  <button
                    key={id}
                    className={`atlas-rail-mark ${index === 0 ? "primary" : ""}`}
                    style={{ "--mark-color": lessonKnowledge[id].color } as CSSProperties}
                    data-label={lessonKnowledge[id].title}
                    onClick={() => chooseKnowledge(id)}
                    aria-label={`查看知识点：${lessonKnowledge[id].title}`}
                  />
                ))}
              </div>
            </article>
          ))}

          <section className="atlas-lesson-supplement" id="lesson-assignments">
            <div className="atlas-kicker">PRACTICE LAB</div>
            <h2>九、模板实训</h2>
            <p>同一任务分别交给五种模板执行。学生不从空白画布搭建，只修改输入、参数和少量配置，比较每种范式的行为。</p>
            <div className="atlas-practice-grid">
              {lessonFourAssignments.map((item) => {
                const complete = progress.completedAssignmentIds.includes(item.id);
                return (
                  <article className="atlas-practice-card glass-v2" key={item.id}>
                    <div className={`atlas-practice-status ${complete ? "complete" : ""}`}>{complete ? <CheckCircle2 size={15} /> : <Network size={15} />}{complete ? "已完成" : "待运行"}</div>
                    <h3>{item.title}</h3>
                    <pre>{item.structure}</pre>
                    <ul>{item.actions.map((action) => <li key={action}>{action}</li>)}</ul>
                    <p>{item.observation}</p>
                    <button className={complete ? "atlas-secondary" : "atlas-primary"} onClick={() => setWorkflowAssignmentId(item.id)}>预览模板 <ArrowRight size={15} /></button>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="atlas-lesson-supplement">
            <div className="atlas-kicker">LAB RECORD</div>
            <h2>十、实训记录表</h2>
            <div className="atlas-table-wrap">
              <table>
                <thead><tr><th>维度</th>{["Direct", "ReAct", "Plan-Execute", "Replanning", "Evaluator"].map((item) => <th key={item}>{item}</th>)}</tr></thead>
                <tbody>
                  {["是否主动获取资料", "三所高校覆盖度", "引用完整度", "工具调用次数", "模型调用次数", "总执行时间", "最主要失败模式"].map((item) => (
                    <tr key={item}><td>{item}</td>{Array.from({ length: 5 }).map((_, index) => <td key={index}>—</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="atlas-lesson-supplement">
            <div className="atlas-kicker">DISCUSSION</div>
            <h2>十一、课堂讨论问题</h2>
            <div className="atlas-discussion-grid">
              {discussionQuestions.map((item, index) => (
                <article key={item.question}><span>0{index + 1}</span><h3>{item.question}</h3><p>{item.answer}</p></article>
              ))}
            </div>
          </section>

          <section className="atlas-lesson-supplement" id="lesson-acceptance">
            <div className="atlas-kicker">ACCEPTANCE</div>
            <h2>十二、课堂验收标准</h2>
            <div className="atlas-acceptance-panel glass-v2">
              <div>
                <div className="atlas-score-ring"><strong>{completed >= 4 ? "通过" : `${completed}/4`}</strong><span>完成模板</span></div>
                <p>完成至少四种模板，并基于运行轨迹和量化指标推荐最终架构。</p>
              </div>
              <ul>{acceptanceItems.map((item) => <li key={item}><CheckCircle2 size={15} />{item}</li>)}</ul>
            </div>
            <div className="atlas-rubric-grid">
              {[["概念区分准确", "20%"], ["轨迹观察完整", "20%"], ["数据记录准确", "15%"], ["失败模式分析", "20%"], ["架构选择合理", "20%"], ["表达清晰", "5%"]].map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
            </div>
          </section>

          <section className="atlas-lesson-supplement">
            <div className="atlas-kicker">SUMMARY</div>
            <h2>十三、课堂总结与最终选择原则</h2>
            <div className="atlas-summary-flow">
              <div><strong>任务能否一次完成？</strong><span>能 → Direct</span></div>
              <ChevronRight size={20} />
              <div><strong>是否需要反复与环境交互？</strong><span>是 → ReAct</span></div>
              <ChevronRight size={20} />
              <div><strong>是否有稳定的多步骤结构？</strong><span>是 → Plan-and-Execute</span></div>
              <ChevronRight size={20} />
              <div><strong>计划是否可能失效？</strong><span>是 → Replanning</span></div>
              <ChevronRight size={20} />
              <div><strong>结果是否有明确标准？</strong><span>是 → Evaluator-Optimizer</span></div>
            </div>
          </section>

          <section className="atlas-lesson-supplement atlas-two-column-supplement">
            <article>
              <div className="atlas-kicker">HOMEWORK</div>
              <h2>十五、课后任务</h2>
              <ul>{homeworkItems.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
            <article>
              <div className="atlas-kicker">TEACHER CHECKLIST</div>
              <h2>十六、教师备课清单</h2>
              <ul>{teacherChecklist.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
          </section>

          <section className="atlas-lesson-closing">
            <BookOpen size={28} />
            <h2>完成课件阅读，进入范式比较实验</h2>
            <p>所有模板使用相同模型、资料、工具、最终任务和验收标准，避免把性能差异误判为范式差异。</p>
            <div>
              <button className="atlas-secondary" onClick={() => navigate("/courses/agentic-ai")}><ArrowLeft size={15} />返回技能树</button>
              <button className="atlas-primary" onClick={() => setWorkflowAssignmentId("lesson-04-react")}>进入 ReAct 实训 <ArrowRight size={15} /></button>
            </div>
          </section>
        </div>
      </div>
      <div className="atlas-reading-progress"><i style={{ width: `${scrollPercent}%` }} /></div>
      </section>

      <aside className="atlas-lesson-context glass-v2">
        <div className="atlas-context-head">
          <div className="atlas-context-kicker" style={{ "--current-color": activeKnowledge.color } as CSSProperties}><i />{activeKnowledge.type}</div>
          <div>
            <button className={pinned ? "active" : ""} onClick={() => {
              if (pinnedKnowledgeId) {
                setPinnedKnowledgeId(null);
                setActiveKnowledgeId(knowledgeIdsForPage(activePage)[0]);
              } else setPinnedKnowledgeId(activeKnowledgeId);
            }} aria-label="固定当前知识点" aria-pressed={pinned}><Pin size={14} /></button>
            <button onClick={() => setRightCollapsed(true)} aria-label="折叠知识面板"><PanelRightClose size={14} /></button>
          </div>
        </div>
        {rightCollapsed ? (
          <button className="atlas-context-expand" onClick={() => setRightCollapsed(false)} aria-label="展开知识面板"><ChevronLeft size={15} /><span>知识与实训</span></button>
        ) : <>
        {pinned ? <button className="atlas-pin-state" onClick={() => { setPinnedKnowledgeId(null); setActiveKnowledgeId(knowledgeIdsForPage(activePage)[0]); }}><Pin size={12} />已固定知识点 · 点击恢复自动匹配</button> : null}
        <h2>{activeKnowledge.title}</h2>
        <p>{activeKnowledge.description}</p>
        <div className="atlas-context-meta"><span><Clock3 size={13} />{activeKnowledge.time}</span><span>第 {activePage} / 32 页</span></div>
        <section>
          <h3>本段同时涉及</h3>
          <div className="atlas-tag-list">{relatedKnowledge.map((item) => <button key={item.id} onClick={() => chooseKnowledge(item.id)}>{item.title}</button>)}</div>
        </section>
        <section>
          <h3>当前实训</h3>
          <div className="atlas-context-card atlas-context-practice">
            <div className="atlas-practice-card-head"><span>WORKFLOW PRACTICE</span><b>{progress.completedAssignmentIds.includes(activeKnowledge.assignmentId) ? "已完成" : "可开始"}</b></div>
            <strong>{assignment?.title ?? "概念学习与范式比较"}</strong>
            <p>{assignment?.description ?? "本页用于建立后续实训所需的概念和判断标准。"}</p>
            <div className="atlas-practice-meta"><span><Clock3 size={12} />{assignment?.estimatedMinutes ?? 8} 分钟</span><span><GitBranch size={12} />{assignment?.mode === "workflow" ? "工作流画布" : "说明型任务"}</span></div>
            <div className="atlas-prereq-row"><span>前置完成度</span><b>{activeKnowledgeId === "concepts" ? "3 / 3" : "2 / 3"}</b></div>
            <div className="atlas-prereq-track"><i style={{ width: activeKnowledgeId === "concepts" ? "100%" : "66%" }} /></div>
          </div>
        </section>
        <section>
          <h3>相关实训</h3>
          <div className="atlas-related-assignments">{activeKnowledge.extras.map((item) => <button key={item.title}><Network size={14} /><span><strong>{item.title}</strong><small>{item.meta}</small></span><em>查看</em></button>)}</div>
        </section>
        <button className="atlas-primary" onClick={() => setWorkflowAssignmentId(activeKnowledge.assignmentId)}><Network size={15} />{assignment?.mode === "workflow" ? "进入对应工作流" : "查看实训说明"}</button>
        <button className="atlas-secondary" onClick={() => goToPage(activeKnowledge.slide)}><Target size={15} />在课件中定位</button>
        </>}
      </aside>
      </section>
      {locationToast ? <div className="atlas-location-toast">{locationToast}</div> : null}
      {workflowAssignmentId ? (
        <div className="atlas-workflow-modal" onMouseDown={(event) => { if (event.target === event.currentTarget) setWorkflowAssignmentId(null); }}>
          <div className="atlas-workflow-modal-card glass-v2" role="dialog" aria-modal="true" aria-labelledby="workflow-preview-title">
            <button className="atlas-modal-close" onClick={() => setWorkflowAssignmentId(null)} aria-label="关闭工作流预览"><X size={18} /></button>
            <div className="atlas-kicker">{workflowAssignment?.mode === "workflow" ? "WORKFLOW ASSIGNMENT" : "COURSE ASSIGNMENT"}</div>
            <h2 id="workflow-preview-title">{workflowAssignment?.title}</h2>
            <p>{workflowAssignment?.description}</p>
            <div className="atlas-modal-workflow-preview">
              <span>输入任务</span><i /><span>{workflowAssignment?.mode === "workflow" ? "工作流画布" : "独立完成"}</span><i /><span>课程资料</span><i /><span>{workflowAssignment?.expectedOutput}</span>
            </div>
            <div className="atlas-modal-facts"><span>{workflowAssignment?.estimatedMinutes} 分钟</span><span>统一资料与工具</span><span>保留第 {activePage} 页进度</span></div>
            <div className="atlas-modal-actions">
              <button className="atlas-secondary" onClick={() => setWorkflowAssignmentId(null)}>取消</button>
              {workflowAssignment?.mode === "workflow" && workflowAssignment.workflowTemplateId ? <button className="atlas-primary" onClick={() => { saveRecentMaterialPage(activePage); navigate(`/workflows/${workflowAssignment.workflowTemplateId}`); }}>打开工作流 <ArrowRight size={15} /></button> : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

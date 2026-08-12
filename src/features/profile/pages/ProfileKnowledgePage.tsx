import { ArrowRight, BookOpen, CircleDot, Crosshair, Maximize2, Minus, Network, Plus, RotateCcw, Send, Sparkles, Workflow, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MockSession } from "@/features/auth/types";
import { GlobalNav } from "@/app/components/GlobalNav";
import { KnowledgeAtlasScene, type KnowledgeAtlasSceneHandle } from "@/features/knowledge/components/KnowledgeAtlasScene";
import { buildPersonalAtlasProjection } from "@/features/knowledge/projections/atlasProjections";
import { resolveNodeDomain, useDomainGovernance } from "@/features/knowledge/domain/domainStore";
import { workflowLaunchUrl } from "@/features/learning/progress/progressService";
import { buildPersonalKnowledgeGraph } from "@/features/profile/profileGraph";
import type { PersonalKnowledgeNode } from "@/features/profile/types";
import { applicationServices } from "@/app/services/applicationServices";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { buildMaterialDeepLink } from "@/features/material/materialNavigation";

const { courseRepository, learningProgressRepository, knowledgeRepository, userKnowledgeRepository } = applicationServices;

const statusLabels = { mastered: "已掌握", learning: "学习中", explore: "可探索" } as const;
const relationLabels = { prerequisite: "前置依赖", enables: "能力支持", related: "知识相关" } as const;

function initials(name: string) {
  const clean = name.trim();
  if (!clean) return "同学";
  const words = clean.split(/\s+/).filter(Boolean);
  return words.length > 1 ? words.slice(0, 2).map((word) => word[0]).join("").toUpperCase() : clean.slice(0, 2).toUpperCase();
}

export function ProfileKnowledgePage({ session, onLogout }: { session: MockSession; onLogout: () => void }) {
  const navigate = useNavigate();
  const governance = useDomainGovernance();
  const sceneRef = useRef<KnowledgeAtlasSceneHandle>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [progressRevision, setProgressRevision] = useState(0);
  useEffect(() => learningProgressRepository.subscribe(() => setProgressRevision((value) => value + 1)), []);
  const runtimes = useMemo(() => courseRepository.listCourseRuntimes(), []);
  const userCourseStates = useMemo(() => runtimes.map((runtime) => learningProgressRepository.getCourseState(session.email, runtime.course.id)), [progressRevision, runtimes, session.email]);
  const graph = useMemo(() => buildPersonalKnowledgeGraph(knowledgeRepository.getVisibleGraph(userKnowledgeAccess(session.email)), userKnowledgeRepository.getUserKnowledge(session.email), runtimes, userCourseStates, governance), [governance, runtimes, session.email, userCourseStates]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchMatchId, setSearchMatchId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [courseChooserOpen, setCourseChooserOpen] = useState(false);
  const [assignmentChooserOpen, setAssignmentChooserOpen] = useState(false);
  const atlas = useMemo(() => buildPersonalAtlasProjection(graph, governance, runtimes), [governance, graph, runtimes]);
  const selected = selectedId ? graph.nodes.find((node) => node.id === selectedId) ?? null : null;
  const selectedDomain = selected ? resolveNodeDomain(selected.id, governance).domain : undefined;
  const drawerOpen = Boolean(selected);
  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);

  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (selectedId) { setSelectedId(null); setSearchMatchId(null); }
    }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [selectedId]);
  useEffect(() => () => { if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current); }, []);
  useEffect(() => { setCourseChooserOpen(false); setAssignmentChooserOpen(false); }, [selectedId]);

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2400);
  }

  function locateNode(node: PersonalKnowledgeNode, openDetail = true) {
    setSearchMatchId(node.id);
    if (openDetail) setSelectedId(node.id);
  }

  function currentLearning() {
    const target = graph.nodes.find((node) => node.id === graph.summary.currentLearningId);
    if (!target) return showToast("当前没有学习中的知识节点");
    locateNode(target);
    showToast(`已定位当前学习：${target.title}`);
  }

  function askKnowledgeSpace(text: string) {
    const prompt = text.trim();
    if (!prompt) return;
    setQuery("");
    const matched = graph.nodes.find((node) => prompt.toLowerCase().includes(node.title.toLowerCase()) || node.title.toLowerCase().includes(prompt.toLowerCase()));
    if (matched) {
      locateNode(matched);
      return showToast(`已定位：${matched.title}`);
    }
    if (/下一步|路线|应该学|继续/.test(prompt)) return currentLearning();
    if (/探索|关联|结构|薄弱/.test(prompt)) {
      const target = graph.nodes.find((node) => node.status === "explore");
      if (target) locateNode(target);
      return showToast(target ? `已定位直接关联的可探索知识：${target.title}` : "当前没有直接一跳的可探索知识");
    }
    showToast("可输入当前图中的知识名称进行搜索和定位");
  }

  function courseOptionsForNode(node: PersonalKnowledgeNode) {
    const options: Array<{ courseId: string; materialId: string | null; segmentId?: string }> = [];
    node.curriculumContexts.forEach((context) => {
      if (context.materialEntries.length) context.materialEntries.forEach((entry) => options.push({ courseId: context.courseId, materialId: entry.materialId, segmentId: entry.segmentId }));
      else options.push({ courseId: context.courseId, materialId: null });
    });
    return Array.from(new Map(options.map((option) => [`${option.courseId}:${option.materialId ?? "course"}:${option.segmentId ?? ""}`, option])).values());
  }

  function openCourse(node: PersonalKnowledgeNode) {
    const options = courseOptionsForNode(node);
    if (!options.length) return;
    if (options.length > 1) return setCourseChooserOpen(true);
    const option = options[0];
    navigate(option.materialId ? buildMaterialDeepLink({ courseId: option.courseId, materialId: option.materialId, segmentId: option.segmentId }) : `/courses/${option.courseId}`);
  }

  function openAssignment(node: PersonalKnowledgeNode) {
    if (!node.assignmentContexts.length) return;
    if (node.assignmentContexts.length > 1) return setAssignmentChooserOpen(true);
    const context = node.assignmentContexts[0];
    navigate(context.workflowTemplateId ? workflowLaunchUrl({ courseId: context.courseId, assignmentId: context.assignmentId, workflowTemplateId: context.workflowTemplateId }) : `/courses/${context.courseId}`);
  }

  const incidentEdges = selected ? graph.edges.filter((edge) => edge.source === selected.id || edge.target === selected.id) : [];

  return (
    <main className={`personal-atlas-page ${drawerOpen ? "has-drawer" : ""}`}>
      <GlobalNav active="profile" session={session} onLogout={onLogout} />
      <header className="personal-page-title"><h1>我的知识空间</h1><p>Personal Knowledge Atlas</p></header>
      <aside className="personal-summary glass-v2">
        <div className="personal-identity"><span className="personal-avatar">{initials(session.name)}</span><span><strong>{session.name}</strong><small>{session.email}</small></span><button aria-label="打开个人设置" onClick={() => showToast("个人资料设置将在后续版本开放")}>•••</button></div>
        <div className="personal-summary-divider" />
        <div className="personal-summary-heading"><span><strong>我的知识空间</strong><small>Personal Knowledge Graph</small></span><i><Network size={15} /></i></div>
        <div className="personal-summary-stats"><span><strong>{graph.summary.mastered}</strong><small>已掌握</small></span><span><strong>{graph.summary.learning}</strong><small>学习中</small></span><span><strong>{graph.summary.explore}</strong><small>可探索</small></span><span><strong>{graph.summary.completedAssignments}</strong><small>实训验证</small></span></div>
        <div className="personal-summary-divider" />
        <div className="personal-summary-kicker">知识结构</div>
        <div className="personal-structure-row"><span>直接可探索</span><strong>{graph.summary.explore} 个</strong></div>
        <div className="personal-structure-row"><span>跨领域连接</span><strong>{graph.summary.crossDomainConnections} 条</strong></div>
        <div className="personal-connectivity"><span><span title="衡量核心知识中进入有效结构的比例，不是考试成绩。">知识连接度 ⓘ</span><strong>{graph.summary.connectivity}%</strong></span><i><b style={{ width: `${graph.summary.connectivity}%` }} /></i></div>
        <button className="personal-growth-chip" onClick={currentLearning}>当前成长方向 <strong>{graph.nodes.find((node) => node.id === graph.summary.currentLearningId)?.title ?? "等待新目标"}</strong></button>
      </aside>

      <div className="personal-canvas">
        <KnowledgeAtlasScene ref={sceneRef} variant="personal" nodes={atlas.nodes} edges={atlas.edges} selectedId={selectedId} searchMatchId={searchMatchId} currentLearningId={graph.summary.currentLearningId} autoRotate={false} onNodeClick={(node) => setSelectedId(node.id)} onBackgroundClick={() => { setSelectedId(null); setSearchMatchId(null); setCourseChooserOpen(false); setAssignmentChooserOpen(false); }} />
      </div>

      <aside className={`personal-drawer glass-v2 ${drawerOpen ? "open" : ""}`}>
        {selected ? <>
          <div className="personal-drawer-head"><span><small>{selectedDomain?.name ?? "未分类"} · {selected.scope}</small><h2>{selected.title}</h2><p>{selected.description}</p><i className={`status-${selected.status}`}>{statusLabels[selected.status]}{selected.status === "learning" ? ` · ${selected.progress}%` : ""}</i></span><button onClick={() => { setSelectedId(null); setSearchMatchId(null); setCourseChooserOpen(false); setAssignmentChooserOpen(false); }} aria-label="关闭节点详情"><X size={17} /></button></div>
          <section><h3>当前掌握</h3><div className="personal-progress-card"><span><small>个人知识状态</small><strong>{selected.progress ? `${selected.progress}%` : statusLabels[selected.status]}</strong></span><i><b style={{ width: `${selected.progress || 8}%` }} /></i></div></section>
          <section><h3>课程上下文</h3>{selected.curriculumContexts.length ? <div className="personal-drawer-list">{selected.curriculumContexts.map((context) => <span key={`${context.courseId}:${context.coverageId}`}><small>第 {context.lessonOrder} 课 · {context.role}</small><strong>{context.lessonId}</strong></span>)}</div> : <div className="personal-empty-analysis"><CircleDot size={18} /><strong>暂无课程引用</strong><p>知识节点可独立于课程存在。</p></div>}</section>
          <section><h3>学习与实践证据</h3>{selected.evidence.length ? <div className="personal-drawer-list">{selected.evidence.map((item, index) => <span key={`${item}-${index}`}><small>证据 {String(index + 1).padStart(2, "0")}</small><strong>{item}</strong></span>)}</div> : <div className="personal-empty-analysis"><CircleDot size={18} /><strong>尚无学习证据</strong><p>节点出现在图中不会自动视为已掌握。</p></div>}</section>
          <section><h3>直接知识关系</h3><div className="personal-relation-tags">{incidentEdges.map((edge) => { const other = nodeById.get(edge.source === selected.id ? edge.target : edge.source); return other ? <button key={edge.id} onClick={() => locateNode(other)}><small>{relationLabels[edge.relation]}</small>{other.title}<ArrowRight size={12} /></button> : null; })}</div></section>
          {selected.status === "explore" ? <div className="personal-explore-note"><CircleDot size={18} /><span><strong>一跳可探索知识</strong><p>它与至少一个核心节点直接相关，但尚未进入你的掌握或学习状态。</p></span></div> : null}
          {courseChooserOpen ? <section><h3>选择课程上下文</h3><div className="personal-drawer-list">{courseOptionsForNode(selected).map((option) => { const context = selected.curriculumContexts.find((item) => item.courseId === option.courseId); const entry = context?.materialEntries.find((item) => item.materialId === option.materialId && item.segmentId === option.segmentId); return <button key={`${option.courseId}:${option.materialId ?? "course"}:${option.segmentId ?? ""}`} onClick={() => navigate(option.materialId ? buildMaterialDeepLink({ courseId: option.courseId, materialId: option.materialId, segmentId: option.segmentId }) : `/courses/${option.courseId}`)}><small>{entry ? `${option.courseId} · 第 ${entry.segmentOrder} 段 · ${entry.role}` : context?.role}</small><strong>{entry?.materialTitle ?? option.courseId}</strong></button>; })}</div></section> : null}
          {assignmentChooserOpen ? <section><h3>选择关联实训</h3><div className="personal-drawer-list">{selected.assignmentContexts.map((context) => <button key={`${context.courseId}:${context.coverageId}`} onClick={() => navigate(context.workflowTemplateId ? workflowLaunchUrl({ courseId: context.courseId, assignmentId: context.assignmentId, workflowTemplateId: context.workflowTemplateId }) : `/courses/${context.courseId}`)}><small>{context.courseId} · {context.status}</small><strong>{context.title}</strong></button>)}</div></section> : null}
          <div className="personal-drawer-actions">{selected.curriculumContexts.length ? <button className="primary" onClick={() => openCourse(selected)}>查看课程上下文<BookOpen size={14} /></button> : null}{selected.assignmentContexts.length ? <button onClick={() => openAssignment(selected)}>查看实训<Workflow size={14} /></button> : null}</div>
        </> : null}
      </aside>

      <div className={`personal-toolbar glass-v2 ${drawerOpen ? "drawer-open" : ""}`} data-personal-interactive>
        <button onClick={() => sceneRef.current?.zoomBy(1.14)} data-tip="放大" aria-label="放大"><Plus size={17} /></button><button onClick={() => sceneRef.current?.zoomBy(0.88)} data-tip="缩小" aria-label="缩小"><Minus size={17} /></button><button onClick={() => { sceneRef.current?.fit(); showToast("已适配个人知识图"); }} data-tip="适配知识图" aria-label="适配知识图"><Maximize2 size={17} /></button><button onClick={currentLearning} data-tip="定位当前学习" aria-label="定位当前学习"><Crosshair size={17} /></button><span />
        <button onClick={() => { sceneRef.current?.reset(); setSelectedId(null); setSearchMatchId(null); }} data-tip="重置视图" aria-label="重置视图"><RotateCcw size={17} /></button>
      </div>
      <div className="personal-legend glass-v2"><span><i className="dot mastered" />已掌握</span><span><i className="dot learning" />学习中</span><span><i className="dot explore" />可探索</span><span><i className="diamond" />实训验证</span></div>
      <form className="personal-ai" onSubmit={(event) => { event.preventDefault(); askKnowledgeSpace(query); }} data-personal-interactive><div className="personal-ai-box glass-v2"><span><Sparkles size={15} /></span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索知识，或基于我的知识空间提问……" aria-label="搜索或向个人知识空间提问" /><button type="submit" aria-label="发送"><Send size={16} /></button></div><div className="personal-ai-suggestions"><button type="button" onClick={() => askKnowledgeSpace("我下一步应该学什么？")}>我下一步应该学什么？</button><button type="button" onClick={() => askKnowledgeSpace("显示直接关联的可探索知识")}>直接关联哪些知识？</button><button type="button" onClick={() => askKnowledgeSpace("我的知识结构如何？")}>我的知识结构如何？</button></div></form>
      <div className={`personal-toast ${toast ? "show" : ""}`}>{toast}</div>
    </main>
  );
}

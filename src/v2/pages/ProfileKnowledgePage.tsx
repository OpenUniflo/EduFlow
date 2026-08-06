import { ArrowRight, BookOpen, CircleDot, Crosshair, History, Layers3, Maximize2, Minus, Network, Plus, RotateCcw, Send, Sparkles, Workflow, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MockSession } from "../../app/model";
import { GlobalNav } from "../components/GlobalNav";
import { curriculumCoverages, curriculumLessons, practiceCoverages, practices } from "../data";
import { KnowledgeAtlasScene, type KnowledgeAtlasSceneHandle } from "../knowledge/components/KnowledgeAtlasScene";
import { buildPersonalAtlasProjection } from "../knowledge/projections/atlasProjections";
import { useLearningProgress } from "../progress";
import { demoPersonalKnowledgeGraph, demoUserKnowledge } from "../profile/demoUserKnowledge";
import { buildPersonalKnowledgeGraph } from "../profile/profileGraph";
import type { PersonalKnowledgeNode, PersonalKnowledgeViewMode } from "../profile/types";

const modeLabels: Record<PersonalKnowledgeViewMode, string> = { knowledge: "我的知识", history: "学习轨迹", practice: "实训成果" };
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
  const progress = useLearningProgress();
  const sceneRef = useRef<KnowledgeAtlasSceneHandle>(null);
  const toastTimerRef = useRef<number | null>(null);
  const graph = useMemo(() => buildPersonalKnowledgeGraph(demoPersonalKnowledgeGraph, demoUserKnowledge, practices, curriculumCoverages, curriculumLessons, practiceCoverages, progress), [progress]);
  const [mode, setMode] = useState<PersonalKnowledgeViewMode>("knowledge");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchMatchId, setSearchMatchId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const atlas = useMemo(() => buildPersonalAtlasProjection(graph, searchMatchId), [graph, searchMatchId]);
  const selected = selectedId ? graph.nodes.find((node) => node.id === selectedId) ?? null : null;
  const drawerOpen = Boolean(selected);
  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);

  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (selectedId) setSelectedId(null);
      else if (mode !== "knowledge") setMode("knowledge");
    }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [mode, selectedId]);
  useEffect(() => () => { if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current); }, []);

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2400);
  }

  function selectMode(nextMode: PersonalKnowledgeViewMode) {
    setMode(nextMode);
    setSelectedId(null);
    if (nextMode === "history") showToast("学习轨迹来自个人知识状态与课程证据");
    if (nextMode === "practice") showToast("实训成果继续使用 PracticeCoverage N:M 证据");
  }

  function locateNode(node: PersonalKnowledgeNode, openDetail = true) {
    setSearchMatchId(node.id);
    sceneRef.current?.focus(node.id);
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

  function openCourse(node: PersonalKnowledgeNode) {
    const context = node.curriculumContexts[0];
    if (context?.materialIds[0]) navigate(`/courses/${context.courseId}/materials/${context.materialIds[0]}`);
    else if (context) navigate(`/courses/${context.courseId}`);
    else navigate("/courses");
  }

  function openPractice(node: PersonalKnowledgeNode) {
    const context = node.practiceContexts[0];
    navigate(context ? `/workflows/${context.templateId}` : "/workflows");
  }

  const incidentEdges = selected ? graph.edges.filter((edge) => edge.source === selected.id || edge.target === selected.id) : [];

  return (
    <main className={`personal-atlas-page personal-mode-${mode} ${drawerOpen ? "has-drawer" : ""}`}>
      <GlobalNav active="profile" session={session} onLogout={onLogout} />
      <header className="personal-page-title"><h1>我的知识空间</h1><p>Personal Knowledge Atlas</p></header>
      <aside className="personal-summary glass-v2">
        <div className="personal-identity"><span className="personal-avatar">{initials(session.name)}</span><span><strong>{session.name}</strong><small>{session.email}</small></span><button aria-label="打开个人设置" onClick={() => showToast("个人资料设置将在后续版本开放")}>•••</button></div>
        <div className="personal-summary-divider" />
        <div className="personal-summary-heading"><span><strong>我的知识空间</strong><small>Personal Knowledge Graph</small></span><i><Network size={15} /></i></div>
        <div className="personal-summary-stats"><span><strong>{graph.summary.mastered}</strong><small>已掌握</small></span><span><strong>{graph.summary.learning}</strong><small>学习中</small></span><span><strong>{graph.summary.explore}</strong><small>可探索</small></span><span><strong>{graph.summary.verifiedPractices}</strong><small>实训验证</small></span></div>
        <div className="personal-summary-divider" />
        <div className="personal-summary-kicker">知识结构</div>
        <div className="personal-structure-row"><span>直接可探索</span><strong>{graph.summary.explore} 个</strong></div>
        <div className="personal-structure-row"><span>跨领域连接</span><strong>{graph.summary.crossDomainConnections} 条</strong></div>
        <div className="personal-connectivity"><span><span title="衡量核心知识中进入有效结构的比例，不是考试成绩。">知识连接度 ⓘ</span><strong>{graph.summary.connectivity}%</strong></span><i><b style={{ width: `${graph.summary.connectivity}%` }} /></i></div>
        <button className="personal-growth-chip" onClick={currentLearning}>当前成长方向 <strong>{graph.nodes.find((node) => node.id === graph.summary.currentLearningId)?.title ?? "等待新目标"}</strong></button>
      </aside>

      <div className="personal-canvas">
        <KnowledgeAtlasScene ref={sceneRef} variant="personal" nodes={atlas.nodes} edges={atlas.edges} selectedId={selectedId} autoRotate={false} onNodeClick={(node) => setSelectedId(node.id)} onBackgroundClick={() => setSelectedId(null)} />
      </div>

      <aside className={`personal-drawer glass-v2 ${drawerOpen ? "open" : ""}`}>
        {selected ? <>
          <div className="personal-drawer-head"><span><small>{selected.domainTitle ?? "个人知识"} · {selected.scope}</small><h2>{selected.title}</h2><p>{selected.description}</p><i className={`status-${selected.status}`}>{statusLabels[selected.status]}{selected.status === "learning" ? ` · ${selected.progress}%` : ""}</i></span><button onClick={() => setSelectedId(null)} aria-label="关闭节点详情"><X size={17} /></button></div>
          <section><h3>当前掌握</h3><div className="personal-progress-card"><span><small>个人知识状态</small><strong>{selected.progress ? `${selected.progress}%` : statusLabels[selected.status]}</strong></span><i><b style={{ width: `${selected.progress || 8}%` }} /></i></div></section>
          <section><h3>课程上下文</h3>{selected.curriculumContexts.length ? <div className="personal-drawer-list">{selected.curriculumContexts.map((context) => <span key={context.coverageId}><small>第 {context.lessonOrder} 课 · {context.role}</small><strong>{context.lessonId}</strong></span>)}</div> : <div className="personal-empty-analysis"><CircleDot size={18} /><strong>暂无课程引用</strong><p>知识节点可独立于课程存在。</p></div>}</section>
          <section><h3>学习与实践证据</h3>{selected.evidence.length ? <div className="personal-drawer-list">{selected.evidence.map((item, index) => <span key={`${item}-${index}`}><small>证据 {String(index + 1).padStart(2, "0")}</small><strong>{item}</strong></span>)}</div> : <div className="personal-empty-analysis"><CircleDot size={18} /><strong>尚无学习证据</strong><p>节点出现在图中不会自动视为已掌握。</p></div>}</section>
          <section><h3>直接知识关系</h3><div className="personal-relation-tags">{incidentEdges.map((edge) => { const other = nodeById.get(edge.source === selected.id ? edge.target : edge.source); return other ? <button key={edge.id} onClick={() => locateNode(other)}><small>{relationLabels[edge.relation]}</small>{other.title}<ArrowRight size={12} /></button> : null; })}</div></section>
          {selected.status === "explore" ? <div className="personal-explore-note"><CircleDot size={18} /><span><strong>一跳可探索知识</strong><p>它与至少一个核心节点直接相关，但尚未进入你的掌握或学习状态。</p></span></div> : null}
          <div className="personal-drawer-actions"><button className="primary" onClick={() => openCourse(selected)}>查看课程上下文<BookOpen size={14} /></button><button onClick={() => openPractice(selected)}>进入实训<Workflow size={14} /></button><button onClick={() => selectMode("history")}>查看学习轨迹</button></div>
        </> : null}
      </aside>

      <div className={`personal-toolbar glass-v2 ${drawerOpen ? "drawer-open" : ""}`} data-personal-interactive>
        <button onClick={() => sceneRef.current?.zoomBy(1.14)} data-tip="放大" aria-label="放大"><Plus size={17} /></button><button onClick={() => sceneRef.current?.zoomBy(0.88)} data-tip="缩小" aria-label="缩小"><Minus size={17} /></button><button onClick={() => { sceneRef.current?.fit(); showToast("已适配个人知识图"); }} data-tip="适配知识图" aria-label="适配知识图"><Maximize2 size={17} /></button><button onClick={currentLearning} data-tip="定位当前学习" aria-label="定位当前学习"><Crosshair size={17} /></button><span />
        <button className={mode === "knowledge" ? "active" : ""} onClick={() => selectMode("knowledge")} data-tip="我的知识" aria-label="我的知识"><Network size={17} /></button><button className={mode === "history" ? "active" : ""} onClick={() => selectMode("history")} data-tip="学习轨迹" aria-label="学习轨迹"><History size={17} /></button><button className={mode === "practice" ? "active" : ""} onClick={() => selectMode("practice")} data-tip="实训成果" aria-label="实训成果"><Workflow size={17} /></button><span /><button onClick={() => { sceneRef.current?.reset(); setSearchMatchId(null); selectMode("knowledge"); }} data-tip="重置视图" aria-label="重置视图"><RotateCcw size={17} /></button>
      </div>
      <div className="personal-legend glass-v2"><span><i className="dot mastered" />已掌握</span><span><i className="dot learning" />学习中</span><span><i className="dot explore" />可探索</span><span><i className="diamond" />实训验证</span></div>
      <form className="personal-ai" onSubmit={(event) => { event.preventDefault(); askKnowledgeSpace(query); }} data-personal-interactive><div className="personal-ai-box glass-v2"><span><Sparkles size={15} /></span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索知识，或基于我的知识空间提问……" aria-label="搜索或向个人知识空间提问" /><button type="submit" aria-label="发送"><Send size={16} /></button></div><div className="personal-ai-suggestions"><button type="button" onClick={() => askKnowledgeSpace("我下一步应该学什么？")}>我下一步应该学什么？</button><button type="button" onClick={() => askKnowledgeSpace("显示直接关联的可探索知识")}>直接关联哪些知识？</button><button type="button" onClick={() => askKnowledgeSpace("我的知识结构如何？")}>我的知识结构如何？</button></div></form>
      <div className={`personal-mode-note glass-v2 ${mode !== "knowledge" ? "show" : ""}`}><Layers3 size={13} /><span>{modeLabels[mode]}{mode === "history" ? " · 基于知识状态与证据" : ""}</span></div>
      <div className={`personal-toast ${toast ? "show" : ""}`}>{toast}</div>
    </main>
  );
}

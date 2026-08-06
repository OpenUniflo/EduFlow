import { ArrowRight, BookOpen, CircleDot, Crosshair, History, Layers3, Maximize2, Minus, Network, Plus, RotateCcw, Send, Sparkles, Workflow, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { MockSession } from "../../app/model";
import { curriculumCoverages, curriculumLessons, practiceCoverages, practices } from "../data";
import { GlobalNav } from "../components/GlobalNav";
import { useLearningProgress } from "../progress";
import { demoPersonalKnowledgeGraph, demoUserKnowledge } from "../profile/demoUserKnowledge";
import { PERSONAL_WORLD_HEIGHT, PERSONAL_WORLD_WIDTH } from "../profile/personalLayout";
import { buildPersonalKnowledgeGraph } from "../profile/profileGraph";
import type { PersonalKnowledgeNode, PersonalKnowledgeViewMode } from "../profile/types";

const modeLabels: Record<PersonalKnowledgeViewMode, string> = {
  knowledge: "我的知识",
  history: "学习轨迹",
  practice: "实训成果"
};

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
  const graph = useMemo(
    () => buildPersonalKnowledgeGraph(demoPersonalKnowledgeGraph, demoUserKnowledge, practices, curriculumCoverages, curriculumLessons, practiceCoverages, progress),
    [progress]
  );
  const viewportRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<number | null>(null);
  const dragRef = useRef({ dragging: false, x: 0, y: 0 });
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [mode, setMode] = useState<PersonalKnowledgeViewMode>("knowledge");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const selected = selectedId ? graph.nodes.find((node) => node.id === selectedId) ?? null : null;
  const drawerOpen = Boolean(selected);
  const zoomLevel = transform.scale < 0.6 ? "far" : transform.scale < 1 ? "medium" : "near";
  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);

  const fitGraph = useCallback(() => {
    const rect = viewportRef.current?.getBoundingClientRect();
    const width = rect?.width ?? window.innerWidth;
    const height = rect?.height ?? window.innerHeight;
    const leftInset = width >= 900 ? 300 : 0;
    const availableWidth = width - leftInset;
    const scale = Math.max(0.42, Math.min(availableWidth / PERSONAL_WORLD_WIDTH, height / PERSONAL_WORLD_HEIGHT) * 0.96);
    setTransform({
      scale,
      x: leftInset + (availableWidth - PERSONAL_WORLD_WIDTH * scale) / 2,
      y: (height - PERSONAL_WORLD_HEIGHT * scale) / 2
    });
  }, []);

  useEffect(() => {
    fitGraph();
    window.addEventListener("resize", fitGraph);
    return () => window.removeEventListener("resize", fitGraph);
  }, [fitGraph]);

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
    if (nextMode === "practice") showToast("已显示全部实训与知识的 N:M 关联");
  }

  function locateNode(node: PersonalKnowledgeNode, openDetail = true) {
    const rect = viewportRef.current?.getBoundingClientRect();
    const scale = Math.max(transform.scale, 1.04);
    setTransform({ x: (rect?.width ?? window.innerWidth) / 2 - node.x * scale, y: (rect?.height ?? window.innerHeight) / 2 - node.y * scale, scale });
    if (openDetail) setSelectedId(node.id);
  }

  function currentLearning() {
    const target = graph.nodes.find((node) => node.id === graph.summary.currentLearningId);
    if (!target) return showToast("当前没有学习中的知识节点");
    locateNode(target);
    showToast(`已定位当前学习：${target.title}`);
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as Element).closest("[data-personal-interactive]")) return;
    dragRef.current = { dragging: true, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current.dragging) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    dragRef.current.x = event.clientX;
    dragRef.current.y = event.clientY;
    setTransform((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
  }

  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current.dragging = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function wheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    setTransform((current) => {
      const nextScale = Math.min(1.85, Math.max(0.42, current.scale * (event.deltaY < 0 ? 1.1 : 0.91)));
      const ratio = nextScale / current.scale;
      return { scale: nextScale, x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio };
    });
  }

  function zoom(multiplier: number) {
    const rect = viewportRef.current?.getBoundingClientRect();
    const cx = (rect?.width ?? window.innerWidth) / 2;
    const cy = (rect?.height ?? window.innerHeight) / 2;
    setTransform((current) => {
      const nextScale = Math.min(1.85, Math.max(0.42, current.scale * multiplier));
      const ratio = nextScale / current.scale;
      return { scale: nextScale, x: cx - (cx - current.x) * ratio, y: cy - (cy - current.y) * ratio };
    });
  }

  function askKnowledgeSpace(text: string) {
    const prompt = text.trim();
    if (!prompt) return;
    setQuery("");
    if (/下一步|路线|应该学|继续/.test(prompt)) return currentLearning();
    if (/探索|关联|结构|薄弱/.test(prompt)) {
      const target = graph.nodes.find((node) => node.status === "explore");
      if (target) locateNode(target);
      return showToast(target ? `已定位直接关联的可探索知识：${target.title}` : "当前没有直接一跳的可探索知识");
    }
    showToast("本地演示已读取当前知识图；暂未连接在线 AI 模型");
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
    <main className={`personal-atlas-page personal-mode-${mode} personal-zoom-${zoomLevel} ${drawerOpen ? "has-drawer" : ""}`}>
      <GlobalNav active="profile" session={session} onLogout={onLogout} />
      <header className="personal-page-title"><h1>我的知识空间</h1><p>Personal Knowledge Atlas</p></header>

      <aside className="personal-summary glass-v2">
        <div className="personal-identity"><span className="personal-avatar">{initials(session.name)}</span><span><strong>{session.name}</strong><small>{session.email}</small></span><button aria-label="打开个人设置" onClick={() => showToast("个人资料设置将在后续版本开放")}>•••</button></div>
        <div className="personal-summary-divider" />
        <div className="personal-summary-heading"><span><strong>我的知识空间</strong><small>Personal Knowledge Graph</small></span><i><Network size={15} /></i></div>
        <div className="personal-summary-stats">
          <span><strong>{graph.summary.mastered}</strong><small>已掌握</small></span>
          <span><strong>{graph.summary.learning}</strong><small>学习中</small></span>
          <span><strong>{graph.summary.explore}</strong><small>可探索</small></span>
          <span><strong>{graph.summary.verifiedPractices}</strong><small>实训验证</small></span>
        </div>
        <div className="personal-summary-divider" />
        <div className="personal-summary-kicker">知识结构</div>
        <div className="personal-structure-row"><span>直接可探索</span><strong>{graph.summary.explore} 个</strong></div>
        <div className="personal-structure-row"><span>跨领域连接</span><strong>{graph.summary.crossDomainConnections} 条</strong></div>
        <div className="personal-connectivity"><span><span title="衡量核心知识中进入有效结构的比例，不是考试成绩。">知识连接度 ⓘ</span><strong>{graph.summary.connectivity}%</strong></span><i><b style={{ width: `${graph.summary.connectivity}%` }} /></i></div>
        <button className="personal-growth-chip" onClick={currentLearning}>当前成长方向 <strong>{graph.nodes.find((node) => node.id === graph.summary.currentLearningId)?.title ?? "等待新目标"}</strong></button>
      </aside>

      <div ref={viewportRef} className="personal-canvas" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={wheel}>
        <svg className="personal-graph" width={PERSONAL_WORLD_WIDTH} height={PERSONAL_WORLD_HEIGHT} viewBox={`0 0 ${PERSONAL_WORLD_WIDTH} ${PERSONAL_WORLD_HEIGHT}`} style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }} aria-label="个人知识关系图谱">
          <defs>
            <filter id="personal-green-glow" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#55ae89" floodOpacity=".35" /></filter>
            <filter id="personal-blue-glow" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#6f89ef" floodOpacity=".46" /></filter>
            <filter id="personal-selected-glow" x="-120%" y="-120%" width="340%" height="340%"><feDropShadow dx="0" dy="0" stdDeviation="9" floodColor="#5b7cfa" floodOpacity=".48" /></filter>
          </defs>
          <g className="personal-world">
            {graph.edges.map((edge) => {
              const source = nodeById.get(edge.source);
              const target = nodeById.get(edge.target);
              if (!source || !target) return null;
              const midpoint = (source.x + target.x) / 2;
              const highlighted = selectedId === edge.source || selectedId === edge.target;
              return <path key={edge.id} className={`personal-edge ${edge.effective ? "history-active" : ""} ${highlighted ? "selected-relation" : ""}`} d={`M${source.x} ${source.y} C${midpoint} ${source.y}, ${midpoint} ${target.y}, ${target.x} ${target.y}`} />;
            })}

            {mode === "practice" ? graph.nodes.flatMap((node) => node.practiceContexts.map((context, index) => {
              const x = node.x + (index % 3 - 1) * 68;
              const y = node.y + (index % 2 === 0 ? -82 : 86);
              return <g className={`personal-practice-evidence ${context.completed ? "completed" : "pending"}`} key={`${node.id}-${context.coverageId}`} data-personal-interactive onClick={() => navigate(`/workflows/${context.templateId}`)}><path d={`M${node.x} ${node.y} C${node.x} ${(node.y + y) / 2}, ${x} ${(node.y + y) / 2}, ${x} ${y}`} /><circle cx={x} cy={y} r="6" /><text x={x + 11} y={y + 3}>{context.title}</text></g>;
            })) : null}

            {graph.nodes.map((node) => {
              const selectedNode = selectedId === node.id;
              const forcedLabel = selectedNode || hoveredId === node.id || graph.summary.currentLearningId === node.id;
              const hasEvidence = node.evidence.length > 0;
              return (
                <g className={`personal-node status-${node.status} ${node.isCore ? "core" : "context"} ${hasEvidence ? "has-evidence" : ""} ${selectedNode ? "selected" : ""} ${forcedLabel ? "force-label" : ""}`} key={node.id} transform={`translate(${node.x} ${node.y})`} style={{ "--domain-color": node.domainColor } as CSSProperties} role="button" tabIndex={0} data-personal-interactive onMouseEnter={() => setHoveredId(node.id)} onMouseLeave={() => setHoveredId(null)} onClick={() => setSelectedId(node.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedId(node.id); }} aria-label={`${node.title}，${statusLabels[node.status]}`}>
                  {node.status === "learning" ? <circle className="personal-node-pulse" r="24" /> : null}
                  <circle className="personal-node-hit" r="40" />
                  <circle className="personal-node-outer" r={node.status === "learning" ? 29 : node.isCore ? 25 : 19} />
                  <circle className="personal-node-inner" r={node.status === "learning" ? 14 : node.isCore ? 12 : 8} />
                  {hasEvidence ? <circle className="personal-evidence-dot" cx="19" cy="-18" r="4" /> : null}
                  <g className="personal-node-copy"><text className="personal-node-title" y={node.status === "learning" ? 45 : 40}>{node.title}</text><text className="personal-node-status" y={node.status === "learning" ? 58 : 53}>{statusLabels[node.status]}{node.status === "learning" ? ` · ${node.progress}%` : ""}</text></g>
                </g>
              );
            })}
          </g>
        </svg>
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
        <button onClick={() => zoom(1.14)} data-tip="放大" aria-label="放大"><Plus size={17} /></button><button onClick={() => zoom(0.88)} data-tip="缩小" aria-label="缩小"><Minus size={17} /></button><button onClick={() => { fitGraph(); showToast("已适配个人知识图"); }} data-tip="适配知识图" aria-label="适配知识图"><Maximize2 size={17} /></button><button onClick={currentLearning} data-tip="定位当前学习" aria-label="定位当前学习"><Crosshair size={17} /></button><span />
        <button className={mode === "knowledge" ? "active" : ""} onClick={() => selectMode("knowledge")} data-tip="我的知识" aria-label="我的知识"><Network size={17} /></button><button className={mode === "history" ? "active" : ""} onClick={() => selectMode("history")} data-tip="学习轨迹" aria-label="学习轨迹"><History size={17} /></button><button className={mode === "practice" ? "active" : ""} onClick={() => selectMode("practice")} data-tip="实训成果" aria-label="实训成果"><Workflow size={17} /></button><span /><button onClick={() => { fitGraph(); selectMode("knowledge"); }} data-tip="重置视图" aria-label="重置视图"><RotateCcw size={17} /></button>
      </div>

      <div className="personal-legend glass-v2"><span><i className="dot mastered" />已掌握</span><span><i className="dot learning" />学习中</span><span><i className="dot explore" />可探索</span><span><i className="diamond" />实训验证</span></div>
      <form className="personal-ai" onSubmit={(event) => { event.preventDefault(); askKnowledgeSpace(query); }} data-personal-interactive><div className="personal-ai-box glass-v2"><span><Sparkles size={15} /></span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="基于我的知识空间问点什么……" aria-label="向个人知识空间提问" /><button type="submit" aria-label="发送"><Send size={16} /></button></div><div className="personal-ai-suggestions"><button type="button" onClick={() => askKnowledgeSpace("我下一步应该学什么？")}>我下一步应该学什么？</button><button type="button" onClick={() => askKnowledgeSpace("显示直接关联的可探索知识")}>直接关联哪些知识？</button><button type="button" onClick={() => askKnowledgeSpace("我的知识结构如何？")}>我的知识结构如何？</button></div></form>
      <div className={`personal-mode-note glass-v2 ${mode !== "knowledge" ? "show" : ""}`}><Layers3 size={13} /><span>{modeLabels[mode]}{mode === "history" ? " · 基于知识状态与证据" : ""}</span></div>
      <div className={`personal-toast ${toast ? "show" : ""}`}>{toast}</div>
    </main>
  );
}

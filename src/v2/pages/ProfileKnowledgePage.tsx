import {
  ArrowRight,
  BookOpen,
  CircleDot,
  Crosshair,
  GitBranch,
  History,
  Layers3,
  Maximize2,
  Minus,
  Network,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Workflow,
  X
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent
} from "react";
import { useNavigate } from "react-router-dom";
import type { MockSession } from "../../app/model";
import { courseEdges, courseStages, knowledgeNodes, practices } from "../data";
import { useLearningProgress } from "../progress";
import { GlobalNav } from "../components/GlobalNav";
import { buildPersonalKnowledgeGraph } from "../profile/profileGraph";
import type { PersonalKnowledgeNode, PersonalKnowledgeViewMode } from "../profile/types";

const WORLD_WIDTH = 1440;
const WORLD_HEIGHT = 900;
const COURSE_ID = "agentic-ai";

const modeLabels: Record<PersonalKnowledgeViewMode, string> = {
  knowledge: "我的知识",
  history: "学习轨迹",
  practice: "实训成果",
  connection: "连接分析"
};

const statusLabels = {
  mastered: "已掌握",
  learning: "学习中",
  explore: "可探索",
  gap: "待补充"
} as const;

function initials(name: string) {
  const clean = name.trim();
  if (!clean) return "同学";
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

export function ProfileKnowledgePage({ session, onLogout }: { session: MockSession; onLogout: () => void }) {
  const navigate = useNavigate();
  const progress = useLearningProgress();
  const graph = useMemo(
    () => buildPersonalKnowledgeGraph(knowledgeNodes, courseEdges, practices, courseStages, progress),
    [progress]
  );
  const viewportRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<number | null>(null);
  const dragRef = useRef({ dragging: false, moved: false, x: 0, y: 0 });
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [mode, setMode] = useState<PersonalKnowledgeViewMode>("knowledge");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectionPanelOpen, setConnectionPanelOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const selected = selectedId ? graph.nodes.find((node) => node.id === selectedId) ?? null : null;
  const drawerOpen = Boolean(selected || (mode === "connection" && connectionPanelOpen));
  const zoomLevel = transform.scale < 0.48 ? "island" : transform.scale < 0.82 ? "cluster" : "node";

  const fitGraph = useCallback(() => {
    const rect = viewportRef.current?.getBoundingClientRect();
    const width = rect?.width ?? window.innerWidth;
    const height = rect?.height ?? window.innerHeight;
    const scale = Math.max(0.5, Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT) * 1.03);
    setTransform({
      scale,
      x: (width - WORLD_WIDTH * scale) / 2,
      y: (height - WORLD_HEIGHT * scale) / 2
    });
  }, []);

  useEffect(() => {
    fitGraph();
    const resize = () => fitGraph();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [fitGraph]);

  useEffect(() => {
    function exitLayer(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (selectedId) {
        setSelectedId(null);
        return;
      }
      if (mode === "connection" && connectionPanelOpen) {
        setConnectionPanelOpen(false);
        return;
      }
      if (mode !== "knowledge") setMode("knowledge");
    }
    window.addEventListener("keydown", exitLayer);
    return () => window.removeEventListener("keydown", exitLayer);
  }, [connectionPanelOpen, mode, selectedId]);

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2400);
  }

  function selectMode(nextMode: PersonalKnowledgeViewMode) {
    setMode(nextMode);
    setSelectedId(null);
    setConnectionPanelOpen(nextMode === "connection");
    if (nextMode === "history") showToast("学习轨迹按课程依赖与完成状态推断");
    if (nextMode === "practice") showToast("已突出完成的工作流实训与关联知识");
    if (nextMode === "connection") showToast("当前课程数据形成 1 座知识岛，未生成虚假跨域连接");
  }

  function locateNode(node: PersonalKnowledgeNode, openDetail = true) {
    const rect = viewportRef.current?.getBoundingClientRect();
    const width = rect?.width ?? window.innerWidth;
    const height = rect?.height ?? window.innerHeight;
    const scale = Math.max(transform.scale, 1.03);
    setTransform({ x: width / 2 - node.x * scale, y: height / 2 - node.y * scale, scale });
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
    dragRef.current = { dragging: true, moved: false, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag.dragging) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    drag.x = event.clientX;
    drag.y = event.clientY;
    setTransform((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
  }

  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current.dragging = false;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture can already be released by the browser.
    }
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
    if (/连接|知识岛|结构/.test(prompt)) {
      selectMode("connection");
      return;
    }
    if (/下一步|路线|应该学|继续/.test(prompt)) {
      currentLearning();
      return;
    }
    if (/薄弱|缺口|待补充|不足/.test(prompt)) {
      const target = graph.nodes.find((node) => node.id === graph.summary.exploreTargetId);
      if (target) {
        locateNode(target);
        showToast(`建议关注下一跳知识：${target.title}`);
      } else {
        showToast("当前一跳范围内没有待补充节点");
      }
      return;
    }
    showToast("本地演示已读取当前知识图；暂未连接在线 AI 模型");
  }

  function openCourse(node: PersonalKnowledgeNode) {
    if (node.materialId) navigate(`/courses/${COURSE_ID}/materials/${node.materialId}`);
    else navigate(`/courses/${COURSE_ID}`);
  }

  function openPractice(node: PersonalKnowledgeNode) {
    const practice = practices.find((item) => item.id === node.practiceId)
      ?? practices.find((item) => item.title === node.practiceTitle);
    if (practice) navigate(`/workflows/${practice.templateId}`);
    else navigate("/workflows");
  }

  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const evidenceByNode = useMemo(() => {
    const map = new Map<string, boolean>();
    graph.practices.forEach((practice) => {
      if (practice.completed) map.set(practice.knowledgeId, true);
    });
    return map;
  }, [graph.practices]);

  return (
    <main className={`personal-atlas-page personal-mode-${mode} personal-zoom-${zoomLevel} ${drawerOpen ? "has-drawer" : ""}`}>
      <GlobalNav active="profile" session={session} onLogout={onLogout} />
      <header className="personal-page-title">
        <h1>我的知识空间</h1>
        <p>Personal Knowledge Atlas</p>
      </header>

      <aside className="personal-summary glass-v2">
        <div className="personal-identity">
          <span className="personal-avatar">{initials(session.name)}</span>
          <span><strong>{session.name}</strong><small>{session.email}</small></span>
          <button aria-label="打开个人设置" onClick={() => showToast("个人资料设置将在后续版本开放")}>•••</button>
        </div>
        <div className="personal-summary-divider" />
        <div className="personal-summary-heading">
          <span><strong>我的知识空间</strong><small>Personal Knowledge Archipelago</small></span>
          <i><Network size={15} /></i>
        </div>
        <div className="personal-summary-stats">
          <span><strong>{graph.summary.mastered}</strong><small>已掌握</small></span>
          <span><strong>{graph.summary.learning}</strong><small>学习中</small></span>
          <span><strong>{graph.summary.verifiedPractices}</strong><small>实训验证</small></span>
          <span><strong>{graph.summary.projects}</strong><small>综合项目</small></span>
        </div>
        <div className="personal-summary-divider" />
        <div className="personal-summary-kicker">知识结构</div>
        <div className="personal-structure-row"><span>知识岛</span><strong>{graph.summary.islandCount} 个</strong></div>
        <div className="personal-structure-row"><span>最大知识岛</span><strong>{graph.summary.largestIslandName} · {graph.summary.largestIslandSize}</strong></div>
        <div className="personal-structure-row"><span>跨领域连接</span><strong>{graph.summary.crossDomainConnections} 条</strong></div>
        <button className="personal-connectivity" onClick={() => selectMode("connection")}>
          <span><span title="衡量核心知识中进入有效结构的比例，不是考试成绩。">知识连接度 ⓘ</span><strong>{graph.summary.connectivity}% <ArrowRight size={12} /></strong></span>
          <i><b style={{ width: `${graph.summary.connectivity}%` }} /></i>
        </button>
        <button className="personal-growth-chip" onClick={currentLearning}>
          当前成长方向 <strong>{graph.nodes.find((node) => node.id === graph.summary.currentLearningId)?.title ?? "等待新目标"}</strong>
        </button>
      </aside>

      <div
        ref={viewportRef}
        className="personal-canvas"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onWheel={wheel}
      >
        <svg className="personal-graph" width={WORLD_WIDTH} height={WORLD_HEIGHT} viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`} style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }} aria-label="个人知识群岛图谱">
          <defs>
            <filter id="personal-green-glow" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#55ae89" floodOpacity=".35" /></filter>
            <filter id="personal-blue-glow" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#6f89ef" floodOpacity=".46" /></filter>
            <filter id="personal-selected-glow" x="-120%" y="-120%" width="340%" height="340%"><feDropShadow dx="0" dy="0" stdDeviation="9" floodColor="#5b7cfa" floodOpacity=".48" /></filter>
          </defs>
          <g className="personal-world">
            <ellipse className="personal-island-halo" cx="770" cy="425" rx="355" ry="275" />
            <g className="personal-island-overview">
              <circle cx="770" cy="425" r="62" />
              <text x="770" y="419">Agentic AI</text>
              <text x="770" y="441">{graph.summary.largestIslandSize} 个核心知识 · {graph.summary.learning} 个学习中</text>
            </g>
            <text className="personal-island-title" x="455" y="165">Agentic AI</text>
            <text className="personal-island-meta" x="455" y="184">{graph.summary.largestIslandSize} 个核心知识 · {graph.summary.learning} 个学习中 · 当前个人知识岛</text>

            {graph.stages.map((stage) => (
              <g className="personal-stage" key={stage.id}>
                <rect x={stage.x} y={stage.y} width={stage.width} height={stage.height} rx="34" />
                <text x={stage.x + 18} y={stage.y + 26}>{stage.title}</text>
                <text className="personal-stage-count" x={stage.x + 18} y={stage.y + 43}>{stage.nodeCount} 个节点</text>
              </g>
            ))}

            {graph.edges.map((edge) => {
              const source = nodeById.get(edge.source);
              const target = nodeById.get(edge.target);
              if (!source || !target) return null;
              const midpoint = (source.x + target.x) / 2;
              const historyActive = source.isCore && target.isCore;
              return (
                <path
                  key={`${edge.source}-${edge.target}`}
                  className={`personal-edge ${historyActive ? "history-active" : ""}`}
                  d={`M${source.x} ${source.y} C${midpoint} ${source.y}, ${midpoint} ${target.y}, ${target.x} ${target.y}`}
                />
              );
            })}

            {graph.practices.map((practice) => {
              const source = nodeById.get(practice.knowledgeId);
              if (!source) return null;
              return (
                <g className={`personal-practice-evidence ${practice.completed ? "completed" : "pending"}`} key={practice.id} data-personal-interactive onClick={() => navigate(`/workflows/${practice.templateId}`)}>
                  <path d={`M${source.x} ${source.y} C${source.x} ${(source.y + practice.y) / 2}, ${practice.x} ${(source.y + practice.y) / 2}, ${practice.x} ${practice.y}`} />
                  <circle cx={practice.x} cy={practice.y} r="6" />
                  <text x={practice.x + 11} y={practice.y + 3}>{practice.title}</text>
                </g>
              );
            })}

            {graph.nodes.map((node) => {
              const selectedNode = selectedId === node.id;
              const hasEvidence = evidenceByNode.has(node.id);
              return (
                <g
                  className={`personal-node status-${node.status} ${node.isCore ? "core" : "context"} ${hasEvidence ? "has-evidence" : ""} ${selectedNode ? "selected" : ""}`}
                  key={node.id}
                  transform={`translate(${node.x} ${node.y})`}
                  role="button"
                  tabIndex={0}
                  data-personal-interactive
                  onClick={() => setSelectedId(node.id)}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedId(node.id); }}
                  aria-label={`${node.title}，${statusLabels[node.status]}`}
                >
                  {node.status === "learning" ? <circle className="personal-node-pulse" r="24" /> : null}
                  <circle className="personal-node-hit" r="40" />
                  <circle className="personal-node-outer" r={node.status === "learning" ? 29 : node.isCore ? 25 : 22} />
                  <circle className="personal-node-inner" r={node.status === "learning" ? 14 : node.isCore ? 12 : 10} />
                  {hasEvidence ? <circle className="personal-evidence-dot" cx="19" cy="-18" r="4" /> : null}
                  <g className="personal-node-copy">
                    <text className="personal-node-title" y={node.status === "learning" ? 45 : 40}>{node.title}</text>
                    <text className="personal-node-status" y={node.status === "learning" ? 58 : 53}>{statusLabels[node.status]}{node.status === "learning" ? ` · ${node.progress}%` : ""}</text>
                  </g>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <aside className={`personal-drawer glass-v2 ${drawerOpen ? "open" : ""}`}>
        {mode === "connection" && !selected ? (
          <>
            <div className="personal-drawer-head">
              <span><small>CONNECTION ANALYSIS</small><h2>个人知识结构分析</h2><p>查看当前课程知识如何形成有效结构。</p></span>
              <button onClick={() => setConnectionPanelOpen(false)} aria-label="关闭连接分析"><X size={17} /></button>
            </div>
            <section><h3>知识结构</h3><div className="personal-drawer-list"><span><small>知识岛</small><strong>{graph.summary.islandCount} 个</strong></span><span><small>最大知识岛</small><strong>{graph.summary.largestIslandName} · {graph.summary.largestIslandSize}</strong></span><span><small>知识连接度</small><strong>{graph.summary.connectivity}%</strong></span></div></section>
            <section><h3>已建立连接</h3><div className="personal-drawer-list"><span><small>知识依赖</small><strong>{graph.summary.dependencyConnections} 条</strong></span><span><small>实训关联</small><strong>{graph.summary.practiceConnections} 条</strong></span><span><small>项目组合</small><strong>{graph.summary.projectConnections} 条</strong></span><span><small>跨领域桥梁</small><strong>{graph.summary.crossDomainConnections} 条</strong></span></div></section>
            <section><h3>跨领域连接</h3><div className="personal-empty-analysis"><GitBranch size={20} /><strong>暂未形成跨领域桥梁</strong><p>当前数据只包含 Agentic AI 课程。系统不会为了视觉完整而生成虚假知识连接。</p></div></section>
            <div className="personal-drawer-actions"><button className="primary" onClick={currentLearning}>定位当前学习</button><button onClick={() => selectMode("knowledge")}>返回我的知识</button></div>
          </>
        ) : selected ? (
          <>
            <div className="personal-drawer-head">
              <span><small>{selected.stageTitle}</small><h2>{selected.title}</h2><p>{selected.description}</p><i className={`status-${selected.status}`}>{statusLabels[selected.status]}{selected.status === "learning" ? ` · ${selected.progress}%` : ""}</i></span>
              <button onClick={() => setSelectedId(null)} aria-label="关闭节点详情"><X size={17} /></button>
            </div>
            <section><h3>当前掌握</h3><div className="personal-progress-card"><span><small>课程学习进度</small><strong>{selected.progress ? `${selected.progress}%` : statusLabels[selected.status]}</strong></span><i><b style={{ width: `${selected.progress || 8}%` }} /></i></div></section>
            <section><h3>学习与实践证据</h3><div className="personal-drawer-list">{selected.evidence.map((item, index) => <span key={item}><small>证据 {String(index + 1).padStart(2, "0")}</small><strong>{item}</strong></span>)}</div></section>
            <section><h3>主要关联</h3><div className="personal-relation-tags">{[...selected.prerequisiteIds, ...selected.nextIds].map((id) => { const related = nodeById.get(id); return related ? <button key={id} onClick={() => locateNode(related)}>{related.title}<ArrowRight size={12} /></button> : null; })}</div></section>
            {selected.status === "explore" ? <div className="personal-explore-note"><CircleDot size={18} /><span><strong>一跳可探索知识</strong><p>它与当前已掌握或学习中的节点直接相关，但尚未计入你的核心知识。</p></span></div> : null}
            <div className="personal-drawer-actions">
              <button className="primary" onClick={() => openCourse(selected)}>{selected.status === "explore" ? "查看学习路径" : "继续学习"}<BookOpen size={14} /></button>
              <button onClick={() => openPractice(selected)}>进入实训<Workflow size={14} /></button>
              <button onClick={() => selectMode("history")}>查看学习轨迹</button>
            </div>
          </>
        ) : null}
      </aside>

      <div className={`personal-toolbar glass-v2 ${drawerOpen ? "drawer-open" : ""}`} data-personal-interactive>
        <button onClick={() => zoom(1.14)} data-tip="放大" aria-label="放大"><Plus size={17} /></button>
        <button onClick={() => zoom(0.88)} data-tip="缩小" aria-label="缩小"><Minus size={17} /></button>
        <button onClick={() => { fitGraph(); showToast("已适配当前个人知识岛"); }} data-tip="适配知识岛" aria-label="适配知识岛"><Maximize2 size={17} /></button>
        <button onClick={currentLearning} data-tip="定位当前学习" aria-label="定位当前学习"><Crosshair size={17} /></button>
        <span />
        <button className={mode === "knowledge" ? "active" : ""} onClick={() => selectMode("knowledge")} data-tip="我的知识" aria-label="我的知识"><Network size={17} /></button>
        <button className={mode === "history" ? "active" : ""} onClick={() => selectMode("history")} data-tip="学习轨迹" aria-label="学习轨迹"><History size={17} /></button>
        <button className={mode === "practice" ? "active" : ""} onClick={() => selectMode("practice")} data-tip="实训成果" aria-label="实训成果"><Workflow size={17} /></button>
        <button className={mode === "connection" ? "active" : ""} onClick={() => selectMode("connection")} data-tip="连接分析" aria-label="连接分析"><GitBranch size={17} /></button>
        <span />
        <button onClick={() => { fitGraph(); selectMode("knowledge"); }} data-tip="重置视图" aria-label="重置视图"><RotateCcw size={17} /></button>
      </div>

      <div className="personal-legend glass-v2">
        {mode === "connection" ? <><span><i className="line" />知识依赖</span><span><i className="line practice" />实训关联</span><span><i className="line cross" />跨领域桥梁</span></> : <><span><i className="dot mastered" />已掌握</span><span><i className="dot learning" />学习中</span><span><i className="dot explore" />可探索</span><span><i className="diamond" />实训验证</span></>}
      </div>

      <form className="personal-ai" onSubmit={(event) => { event.preventDefault(); askKnowledgeSpace(query); }} data-personal-interactive>
        <div className="personal-ai-box glass-v2"><span><Sparkles size={15} /></span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="基于我的知识空间问点什么……" aria-label="向个人知识空间提问" /><button type="submit" aria-label="发送"><Send size={16} /></button></div>
        <div className="personal-ai-suggestions"><button type="button" onClick={() => askKnowledgeSpace("我下一步应该学什么？")}>我下一步应该学什么？</button><button type="button" onClick={() => askKnowledgeSpace("哪些知识岛值得连接？")}>哪些知识岛值得连接？</button><button type="button" onClick={() => askKnowledgeSpace("我的能力薄弱点在哪里？")}>我的能力薄弱点在哪里？</button></div>
      </form>

      <div className={`personal-mode-note glass-v2 ${mode !== "knowledge" ? "show" : ""}`}><Layers3 size={13} /><span>{modeLabels[mode]}{mode === "history" ? " · 基于依赖和完成状态推断" : ""}</span></div>
      <div className={`personal-toast ${toast ? "show" : ""}`}>{toast}</div>
    </main>
  );
}

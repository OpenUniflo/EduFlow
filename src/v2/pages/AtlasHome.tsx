import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { ArrowRight, FileText, Minus, Pause, Play, Plus, RefreshCcw, Send, Upload, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { MockSession } from "../../app/model";
import { GlobalNav } from "../components/GlobalNav";

type AtlasNode = {
  id: string;
  name: string;
  category: string;
  color: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  knowledge: number;
  courses: number;
  description: string;
  tags: string[];
  minor?: boolean;
  related: string[];
  projection?: { x: number; y: number; z: number; radius: number };
};

const palette = ["#78a7ee", "#9a8ee6", "#70c4a5", "#ec92aa", "#eca86c", "#77b7c8"];
const featuredSeed = [
  ["agentic-ai", "Agentic AI", "人工智能 · 课程主题", 0, -110, -90, 80, 20, 68, 1, "围绕规划、工具调用、记忆、运行时、评测与治理构建可执行的智能体系统。", ["大语言模型", "工具调用", "多智能体", "评测与治理"]],
  ["machine-learning", "机器学习", "数据与算法 · 知识领域", 1, 240, -185, 50, 18, 118, 0, "从监督学习、无监督学习到深度学习，建立数据驱动的建模方法。", ["统计学", "深度学习", "数据分析"]],
  ["education-ai", "教育 AI", "教育技术 · 课程主题", 5, -20, 145, -80, 19, 88, 0, "将知识图谱、生成式 AI、学习分析与教学设计结合，形成可交互学习系统。", ["学习科学", "课程设计", "知识图谱"]],
  ["language-learning", "语言学习", "语言与人文 · 知识领域", 3, -350, -210, 80, 17, 126, 0, "涵盖语法、表达、阅读、写作与跨文化交流的语言能力体系。", ["学术写作", "跨文化交流"]],
  ["business-analysis", "商业分析", "商业与社会 · 课程主题", 4, 340, 75, -25, 16, 84, 0, "连接数据、商业问题与决策，形成可执行的分析结论。", ["数据分析", "创新创业"]],
  ["biology", "生命科学", "自然科学 · 知识领域", 2, 40, -300, 100, 18, 134, 0, "研究生命结构、遗传、进化、生态和复杂生物系统。", ["气候环境", "数据建模"]]
] as const;

function createAtlas() {
  const nodes: AtlasNode[] = featuredSeed.map((item) => ({
    id: item[0],
    name: item[1],
    category: item[2],
    color: palette[item[3]],
    x: item[4],
    y: item[5],
    z: item[6],
    radius: item[7],
    knowledge: item[8],
    courses: item[9],
    description: item[10],
    tags: [...item[11]],
    related: []
  }));
  const featured = [...nodes];
  let seed = 42;
  const random = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  featured.forEach((parent, cluster) => {
    for (let index = 0; index < 24; index += 1) {
      const angle = random() * Math.PI * 2;
      const distance = 45 + random() * 145;
      nodes.push({
        id: `minor-${cluster}-${index}`,
        name: "关联知识",
        category: "知识节点",
        color: parent.color,
        x: parent.x + Math.cos(angle) * distance,
        y: parent.y + Math.sin(angle) * distance * 0.65,
        z: parent.z + (random() - 0.5) * 200,
        radius: 3 + random() * 5,
        knowledge: 0,
        courses: 0,
        description: "",
        tags: [],
        minor: true,
        related: []
      });
    }
  });
  const edges: Array<[string, string]> = [];
  featured.forEach((parent, cluster) => {
    const clusterNodes = nodes.filter((node) => node.id.startsWith(`minor-${cluster}-`));
    clusterNodes.forEach((node, index) => {
      if (index === 0) edges.push([parent.id, node.id]);
      else edges.push([node.id, clusterNodes[Math.max(0, index - 1 - Math.floor(random() * 3))].id]);
      if (index > 2 && random() > 0.76) edges.push([node.id, clusterNodes[Math.floor(random() * index)].id]);
    });
  });
  edges.push(["agentic-ai", "education-ai"], ["agentic-ai", "machine-learning"], ["machine-learning", "business-analysis"], ["education-ai", "language-learning"], ["biology", "machine-learning"]);
  const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));
  edges.forEach(([from, to]) => {
    byId[from]?.related.push(to);
    byId[to]?.related.push(from);
  });
  return { nodes, edges, byId };
}

const atlas = createAtlas();
const generationStages = ["读取课件", "识别章节", "提取知识节点", "分析前置依赖", "生成实训目标", "完成课程"];
const atlasPrerequisites: Record<string, string[]> = {
  "agentic-ai": ["机器学习", "大语言模型基础", "教育 AI 场景认知"],
  "machine-learning": ["数据分析", "概率统计", "线性代数"],
  "education-ai": ["学习科学", "课程设计", "生成式 AI 基础"],
  "language-learning": ["语言学基础", "阅读与写作", "跨文化交流"],
  "business-analysis": ["数据分析", "统计推断", "商业问题建模"],
  biology: ["基础化学", "科学研究方法", "数据建模"]
};

export function AtlasHome({ session, onLogout }: { session: MockSession; onLogout: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generationIndex, setGenerationIndex] = useState(0);
  const selected = selectedId ? atlas.byId[selectedId] : null;
  const interaction = useRef({
    rotationY: -0.3,
    rotationX: 0.08,
    zoom: 1.02,
    dragging: false,
    moved: false,
    hoveredId: null as string | null,
    lastX: 0,
    lastY: 0,
    autoResumeAt: 0
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const drawingCanvas = canvas;
    const ctx = context;
    let frame = 0;
    let previous = performance.now();
    let width = 0;
    let height = 0;
    const density = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      width = drawingCanvas.clientWidth;
      height = drawingCanvas.clientHeight;
      drawingCanvas.width = Math.floor(width * density);
      drawingCanvas.height = Math.floor(height * density);
      ctx.setTransform(density, 0, 0, density, 0, 0);
    }

    function project(node: AtlasNode) {
      const state = interaction.current;
      const cy = Math.cos(state.rotationY);
      const sy = Math.sin(state.rotationY);
      const cx = Math.cos(state.rotationX);
      const sx = Math.sin(state.rotationX);
      const x1 = node.x * cy - node.z * sy;
      const z1 = node.x * sy + node.z * cy;
      const y1 = node.y * cx - z1 * sx;
      const z2 = node.y * sx + z1 * cx;
      const scale = (760 / (760 + z2)) * state.zoom;
      return {
        x: width / 2 + x1 * scale,
        y: height * 0.44 + y1 * scale,
        z: z2,
        radius: Math.max(2, node.radius * scale)
      };
    }

    function rgba(hex: string, alpha: number) {
      const value = Number.parseInt(hex.slice(1), 16);
      return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
    }

    function draw(now: number) {
      const delta = Math.min(32, now - previous);
      previous = now;
      const state = interaction.current;
      if (!paused && !state.dragging && now > state.autoResumeAt && !selectedId) state.rotationY += delta * 0.000032;
      ctx.clearRect(0, 0, width, height);
      atlas.nodes.forEach((node) => { node.projection = project(node); });
      atlas.edges.forEach(([from, to]) => {
        const source = atlas.byId[from].projection!;
        const target = atlas.byId[to].projection!;
        const direct = selectedId && (from === selectedId || to === selectedId);
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = direct ? rgba(atlas.byId[selectedId].color, 0.72) : selectedId ? "rgba(104,126,160,.025)" : "rgba(104,126,160,.08)";
        ctx.lineWidth = direct ? 1.7 : 0.65;
        ctx.stroke();
      });
      [...atlas.nodes].sort((a, b) => a.projection!.z - b.projection!.z).forEach((node) => {
        const projection = node.projection!;
        const isSelected = node.id === selectedId;
        const related = selectedId && (isSelected || atlas.byId[selectedId].related.includes(node.id));
        const alpha = selectedId ? (isSelected ? 1 : related ? 0.84 : node.minor ? 0.06 : 0.14) : node.minor ? 0.48 : 0.8;
        const radius = projection.radius * (isSelected ? 1.18 : node.id === state.hoveredId ? 1.1 : 1);
        if (isSelected || node.id === state.hoveredId) {
          ctx.beginPath();
          ctx.arc(projection.x, projection.y, radius + 7, 0, Math.PI * 2);
          ctx.fillStyle = rgba(node.color, 0.14);
          ctx.fill();
        }
        const gradient = ctx.createRadialGradient(projection.x - radius * 0.3, projection.y - radius * 0.3, radius * 0.1, projection.x, projection.y, radius);
        gradient.addColorStop(0, rgba("#ffffff", alpha));
        gradient.addColorStop(0.28, rgba(node.color, alpha));
        gradient.addColorStop(1, rgba(node.color, alpha * 0.82));
        ctx.beginPath();
        ctx.arc(projection.x, projection.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        if (!node.minor && (isSelected || node.id === state.hoveredId || node.radius >= 18)) {
          ctx.font = "600 12px Inter, system-ui";
          ctx.textAlign = "center";
          ctx.fillStyle = `rgba(40,56,78,${selectedId && !related ? 0.16 : 0.86})`;
          ctx.fillText(node.name, projection.x, projection.y + radius + 16);
        }
      });
      frame = requestAnimationFrame(draw);
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(drawingCanvas);
    frame = requestAnimationFrame(draw);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [paused, selectedId]);

  function hit(clientX: number, clientY: number): AtlasNode | null {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best: AtlasNode | null = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const node of atlas.nodes) {
      if (!node.projection) continue;
      const current = Math.hypot(x - node.projection.x, y - node.projection.y);
      if (current < Math.max(10, node.projection.radius + 7) && current < distance) {
        best = node;
        distance = current;
      }
    }
    return best;
  }

  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const state = interaction.current;
    state.dragging = true;
    state.moved = false;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const state = interaction.current;
    if (state.dragging) {
      const dx = event.clientX - state.lastX;
      const dy = event.clientY - state.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) state.moved = true;
      state.rotationY += dx * 0.004;
      state.rotationX = Math.max(-0.5, Math.min(0.5, state.rotationX + dy * 0.0025));
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      state.autoResumeAt = performance.now() + 1800;
    } else {
      state.hoveredId = hit(event.clientX, event.clientY)?.id ?? null;
      event.currentTarget.style.cursor = state.hoveredId ? "pointer" : "grab";
    }
  }

  function pointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const state = interaction.current;
    state.dragging = false;
    if (!state.moved) {
      const node = hit(event.clientX, event.clientY);
      if (node && !node.minor) setSelectedId(node.id);
    }
    state.autoResumeAt = performance.now() + 1800;
  }

  function zoom(event: WheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    interaction.current.zoom = Math.max(0.65, Math.min(1.8, interaction.current.zoom * (event.deltaY > 0 ? 0.92 : 1.08)));
    interaction.current.autoResumeAt = performance.now() + 1800;
  }

  function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const next = Array.from(event.target.files ?? []);
    setFiles((current) => [...current, ...next.filter((file) => !current.some((item) => item.name === file.name && item.size === file.size))]);
    event.target.value = "";
  }

  function createCourse() {
    if (!prompt.trim() && files.length === 0) {
      setPrompt("根据 Agentic AI 课程知识节点表创建 15 课时课程，并为第四课绑定五类范式实训。");
      return;
    }
    if (generating) return;
    setGenerating(true);
    setGenerationIndex(0);
    generationStages.forEach((_, index) => {
      window.setTimeout(() => setGenerationIndex(index), index * 430);
    });
    window.setTimeout(() => navigate("/courses/agentic-ai?created=1"), generationStages.length * 430 + 280);
  }

  function adjustZoom(multiplier: number) {
    interaction.current.zoom = Math.max(0.65, Math.min(1.8, interaction.current.zoom * multiplier));
  }

  function resetView() {
    Object.assign(interaction.current, { rotationY: -0.3, rotationX: 0.08, zoom: 1.02, autoResumeAt: 0 });
    setSelectedId(null);
    setPaused(false);
  }

  return (
    <main className="atlas-home-page">
      <GlobalNav active="atlas" session={session} onLogout={onLogout} />
      <canvas
        ref={canvasRef}
        className="atlas-star-canvas"
        aria-label="可交互知识星图"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onWheel={zoom}
      />
      <div className="atlas-home-veil" aria-hidden="true" />

      <section className="atlas-home-hero">
        <div className="atlas-home-heading">
          <span className="atlas-kicker">LEARN BY DISCOVERY</span>
          <h1>从知识星图中探索，或创建一门课程</h1>
          <p>上传课件并补充要求，自动生成课程技能树、关联课件与配套实训。</p>
        </div>
        <div className="atlas-creator">
          {files.length ? (
            <div className="atlas-file-strip">
              {files.map((file, index) => (
                <div className="atlas-file-chip" key={`${file.name}-${file.size}`}>
                  <FileText size={14} />
                  <span>{file.name}</span>
                  <button onClick={() => setFiles((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`移除${file.name}`}><X size={13} /></button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="atlas-composer glass-v2">
            <label className="atlas-upload" title="上传课件">
              <Upload size={19} />
              <input hidden multiple type="file" accept=".pdf,.ppt,.pptx,.doc,.docx" onChange={chooseFiles} />
            </label>
            <textarea
              aria-label="课程创建要求"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="上传课件，或描述你想创建的课程…"
            />
            <button className="atlas-send" type="button" aria-label="生成课程" onClick={createCourse}>
              {generating ? <span className="atlas-spinner" /> : <Send size={18} />}
            </button>
          </div>
          <div className="atlas-quick-actions">
            {[
              "根据课件生成技能树",
              "创建 15 课时 Agentic AI 课程",
              "补充前置依赖、评测和最终项目"
            ].map((label) => (
              <button key={label} onClick={() => setPrompt(label)}>{label}</button>
            ))}
          </div>
          {generating ? (
            <div className="atlas-generation glass-v2" aria-live="polite">
              <div className="atlas-generation-track"><i style={{ width: `${((generationIndex + 1) / generationStages.length) * 100}%` }} /></div>
              <div className="atlas-generation-steps">
                {generationStages.map((stage, index) => (
                  <span key={stage} className={index < generationIndex ? "done" : index === generationIndex ? "active" : ""}>{index < generationIndex ? "✓" : index + 1} {stage}</span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {selected ? (
        <aside className="atlas-node-panel glass-v2">
          <button className="atlas-panel-close" onClick={() => setSelectedId(null)} aria-label="关闭简介"><X size={17} /></button>
          <div className="atlas-pill"><i style={{ background: selected.color }} />{selected.category}</div>
          <h2>{selected.name}</h2>
          <p>{selected.description}</p>
          <div className="atlas-metric-grid">
            <div><strong>{selected.knowledge}</strong><span>知识点</span></div>
            <div><strong>{selected.courses || "—"}</strong><span>课程</span></div>
            <div><strong>{selected.related.length}</strong><span>关联主题</span></div>
          </div>
          <div className="atlas-tag-list">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          <section className="atlas-node-dependencies">
            <h3>前置依赖</h3>
            <div>
              {(atlasPrerequisites[selected.id] ?? ["通识基础"]).map((dependency) => (
                <span key={dependency}><ArrowRight size={12} />{dependency}</span>
              ))}
            </div>
          </section>
          <div className="atlas-panel-actions">
            <button className="atlas-primary" disabled={selected.id !== "agentic-ai"} onClick={() => navigate("/courses/agentic-ai")}>
              查看对应课程 <ArrowRight size={16} />
            </button>
            <button className="atlas-secondary" onClick={() => { setPrompt(`围绕“${selected.name}”创建一门课程，设计清晰的前置依赖与实训。`); setSelectedId(null); }}>
              基于此主题创建
            </button>
          </div>
        </aside>
      ) : null}

      <div className="atlas-home-hint glass-v2">拖动旋转 · 滚轮缩放 · 单击节点查看简介</div>
      <div className="atlas-home-controls">
        <button onClick={() => adjustZoom(0.9)} aria-label="缩小"><Minus size={17} /></button>
        <button onClick={() => adjustZoom(1.1)} aria-label="放大"><Plus size={17} /></button>
        <button onClick={() => setPaused((value) => !value)} aria-label={paused ? "继续旋转" : "暂停旋转"}>{paused ? <Play size={17} /> : <Pause size={17} />}</button>
        <button onClick={resetView} aria-label="重置星图"><RefreshCcw size={17} /></button>
      </div>
    </main>
  );
}

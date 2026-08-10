import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { ArrowRight, FileText, Minus, Pause, Play, Plus, RefreshCcw, Send, Settings2, Upload, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { MockSession } from "../../app/model";
import { GlobalNav } from "../components/GlobalNav";
import { applicationServices } from "../services/applicationServices";
import { KnowledgeAtlasScene, type KnowledgeAtlasSceneHandle } from "../knowledge/components/KnowledgeAtlasScene";
import { buildGlobalAtlasProjection } from "../knowledge/projections/atlasProjections";
import { assignNodeDomain, resolveNodeDomain, useDomainGovernance } from "../knowledge/domain/domainStore";
import { canManageKnowledgeDomains } from "../session/capabilities";
import { globalKnowledgeAccess } from "../knowledge/repository/KnowledgeRepository";

const generationStages = ["读取课件", "识别章节", "提取知识节点", "分析前置依赖", "生成实训目标", "完成课程"];

export function AtlasHome({ session, onLogout }: { session: MockSession; onLogout: () => void }) {
  const navigate = useNavigate();
  const sceneRef = useRef<KnowledgeAtlasSceneHandle>(null);
  const governance = useDomainGovernance();
  const canManageDomains = canManageKnowledgeDomains(session);
  const domainActor = useMemo(() => ({ id: session.email, capabilities: session.capabilities }), [session.capabilities, session.email]);
  const atlas = useMemo(() => buildGlobalAtlasProjection(applicationServices.knowledgeRepository.getVisibleGraph(globalKnowledgeAccess), governance, applicationServices.courseRepository.listCourseRuntimes()), [governance]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generationIndex, setGenerationIndex] = useState(0);
  const selected = useMemo(() => {
    const node = atlas.nodes.find((item) => item.id === selectedId);
    if (!node) return null;
    const incident = atlas.edges.filter((edge) => edge.source === node.id || edge.target === node.id);
    return {
      ...node,
      related: incident.map((edge) => edge.source === node.id ? edge.target : edge.source),
      prerequisites: atlas.edges
        .filter((edge) => edge.target === node.id && edge.relation === "prerequisite")
        .map((edge) => atlas.nodes.find((item) => item.id === edge.source)?.title ?? edge.source)
    };
  }, [atlas, selectedId]);

  function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const next = Array.from(event.target.files ?? []);
    setFiles((current) => [...current, ...next.filter((file) => !current.some((item) => item.name === file.name && item.size === file.size))]);
    event.target.value = "";
  }

  async function createCourse() {
    if (!prompt.trim() && files.length === 0) {
      setPrompt("请上传课件或描述课程主题、目标学习者与期望成果。");
      return;
    }
    if (generating) return;
    setGenerating(true);
    setGenerationIndex(0);
    generationStages.forEach((_, index) => window.setTimeout(() => setGenerationIndex(index), index * 430));
    const result = await applicationServices.courseCreationService.createCourse({ files, prompt });
    window.setTimeout(() => navigate(`/courses/${result.courseId}?created=1`), generationStages.length * 430 + 280);
  }

  return (
    <main className="atlas-home-page">
      <GlobalNav active="atlas" session={session} onLogout={onLogout} />
      <KnowledgeAtlasScene
        ref={sceneRef}
        className="atlas-star-canvas"
        variant="global"
        nodes={atlas.nodes}
        edges={atlas.edges}
        selectedId={selectedId}
        autoRotate={!paused && !selectedId}
        onNodeClick={(node) => setSelectedId(node.id)}
        onBackgroundClick={() => setSelectedId(null)}
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
                  <FileText size={14} /><span>{file.name}</span>
                  <button onClick={() => setFiles((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`移除${file.name}`}><X size={13} /></button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="atlas-composer glass-v2">
            <label className="atlas-upload" title="上传课件"><Upload size={19} /><input hidden multiple type="file" accept=".pdf,.ppt,.pptx,.doc,.docx" onChange={chooseFiles} /></label>
            <textarea aria-label="课程创建要求" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="上传课件，或描述你想创建的课程…" />
            <button className="atlas-send" type="button" aria-label="生成课程" onClick={createCourse}>{generating ? <span className="atlas-spinner" /> : <Send size={18} />}</button>
          </div>
          <div className="atlas-quick-actions">
            {["根据课件生成技能树", "创建 15 课时 Agentic AI 课程", "补充前置依赖、评测和最终项目"].map((label) => <button key={label} onClick={() => setPrompt(label)}>{label}</button>)}
          </div>
          {generating ? (
            <div className="atlas-generation glass-v2" aria-live="polite">
              <div className="atlas-generation-track"><i style={{ width: `${((generationIndex + 1) / generationStages.length) * 100}%` }} /></div>
              <div className="atlas-generation-steps">{generationStages.map((stage, index) => <span key={stage} className={index < generationIndex ? "done" : index === generationIndex ? "active" : ""}>{index < generationIndex ? "✓" : index + 1} {stage}</span>)}</div>
            </div>
          ) : null}
        </div>
      </section>

      {selected ? (
        <aside className="atlas-node-panel glass-v2">
          <button className="atlas-panel-close" onClick={() => setSelectedId(null)} aria-label="关闭简介"><X size={17} /></button>
          <div className="atlas-pill"><i style={{ background: selected.color }} />{selected.domainTitle}</div>
          <h2>{selected.title}</h2><p>{selected.description}</p>
          <div className="atlas-metric-grid"><div><strong>1</strong><span>知识点</span></div><div><strong>{selected.courseContexts.length || "—"}</strong><span>课程</span></div><div><strong>{selected.related.length}</strong><span>关联主题</span></div></div>
          <div className="atlas-tag-list">{(selected.knowledge?.tags ?? [selected.domainTitle]).map((tag) => <span key={tag}>{tag}</span>)}</div>
          <section className="atlas-node-dependencies"><h3>前置依赖</h3><div>{selected.prerequisites.length ? selected.prerequisites.map((dependency) => <span key={dependency}><ArrowRight size={12} />{dependency}</span>) : <span>暂无严格前置依赖</span>}</div></section>
          {canManageDomains ? <section className="atlas-domain-quick-edit">
            <div><h3>知识领域</h3><button onClick={() => navigate("/admin/domains")}><Settings2 size={13} />领域管理</button></div>
            <select aria-label="修改知识领域" value={resolveNodeDomain(selected.id, governance).domain?.id ?? ""} onChange={(event) => assignNodeDomain({ actor: domainActor, access: globalKnowledgeAccess, nodeId: selected.id, domainId: event.target.value || null })}>
              <option value="">未分类</option>
              {governance.domains.filter((domain) => domain.status === "active").map((domain) => <option key={domain.id} value={domain.id}>{domain.name}</option>)}
            </select>
            <small>管理员修改会写入 pinned 归属；颜色立即同步，节点位置保持不变。</small>
          </section> : null}
          {selected.courseContexts.length > 1 ? <section className="atlas-node-dependencies"><h3>关联课程 {selected.courseContexts.length}</h3><div>{selected.courseContexts.map((context) => <button key={context.courseId} onClick={() => navigate(`/courses/${context.courseId}`)}><ArrowRight size={12} />{context.courseTitle}</button>)}</div></section> : null}
          <div className="atlas-panel-actions">
            <button className="atlas-primary" disabled={!selected.courseContexts.length} onClick={() => selected.courseContexts.length === 1 && navigate(`/courses/${selected.courseContexts[0].courseId}`)}>{selected.courseContexts.length > 1 ? "请选择关联课程" : "查看对应课程"} <ArrowRight size={16} /></button>
            <button className="atlas-secondary" onClick={() => { setPrompt(`围绕“${selected.title}”创建一门课程，设计清晰的前置依赖与实训。`); setSelectedId(null); }}>基于此主题创建</button>
          </div>
        </aside>
      ) : null}

      <div className="atlas-home-hint glass-v2">拖动旋转 · 滚轮缩放 · 单击节点查看简介</div>
      <div className="atlas-home-controls">
        <button onClick={() => sceneRef.current?.zoomBy(0.9)} aria-label="缩小"><Minus size={17} /></button>
        <button onClick={() => sceneRef.current?.zoomBy(1.1)} aria-label="放大"><Plus size={17} /></button>
        <button onClick={() => setPaused((value) => !value)} aria-label={paused ? "继续旋转" : "暂停旋转"}>{paused ? <Play size={17} /> : <Pause size={17} />}</button>
        <button onClick={() => { setSelectedId(null); setPaused(false); sceneRef.current?.reset(); }} aria-label="重置星图"><RefreshCcw size={17} /></button>
      </div>
    </main>
  );
}

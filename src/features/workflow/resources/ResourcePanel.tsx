import { useMemo } from "react";
import { Braces, ChevronRight, Maximize2, Pencil, Server, Sparkles, Wrench, X } from "lucide-react";
import type { WorkflowConfiguration, WorkflowDefinitionV2, WorkflowEnvironment, WorkflowTool } from "../domain/v2/types";
import { useExtensions } from "../editor/v2/FunctionExecutionFields";
import { resolveWorkflowResources, type WorkflowResourceDisplay } from "./resourceCatalog";
import type { ResourceEditorTarget } from "./ResourceEditor";
import "./resourceEditor.css";

export type ResourcePanelProps = {
  definition: WorkflowDefinitionV2;
  environment?: WorkflowEnvironment;
  tools: WorkflowTool[];
  variableConfiguration?: WorkflowConfiguration | null;
  variableValues?: Record<string, string | number | boolean>;
  locked?: boolean;
  onClose: () => void;
  onExpand: (section: "providers" | "apis" | "mcp" | "functions" | "variables") => void;
  onEdit: (target: ResourceEditorTarget) => void;
};

/** “本流程资源” floating panel. Opening/closing never touches canvas layout or viewport. */
export function ResourcePanel({ definition, environment, tools, variableConfiguration, variableValues = {}, locked = false, onClose, onExpand, onEdit }: ResourcePanelProps) {
  const { data, error } = useExtensions(environment?.environmentRef);
  const items = useMemo<WorkflowResourceDisplay[]>(() => resolveWorkflowResources({
    definition,
    connections: data?.connections,
    functions: data?.functions,
    tools,
    environment,
    variableConfiguration,
    variableValues,
  }), [data, definition, environment, tools, variableConfiguration, variableValues]);

  function itemTone(kind: WorkflowResourceDisplay["kind"]): "model" | "api" | "fn" | "var" {
    return kind === "provider" ? "model" : kind === "api" ? "api" : kind === "function" ? "fn" : "var";
  }

  function itemIcon(kind: WorkflowResourceDisplay["kind"]) {
    if (kind === "provider") return <Sparkles size={14}/>;
    if (kind === "api") return <Server size={14}/>;
    if (kind === "function") return <Wrench size={14}/>;
    return <Braces size={14}/>;
  }

  function editItem(item: WorkflowResourceDisplay) {
    if (item.kind === "variable") { onExpand("variables"); return; }
    if (locked || !item.edit) return;
    onEdit(item.edit);
  }

  return <aside className="wf-resource-panel" aria-label="本流程资源">
    <header>
      <div className="wf-resource-panel-icon" aria-hidden="true"><Braces size={16}/></div>
      <div className="wf-resource-panel-title"><h2>资源</h2><p>这个流程用到的连接、函数和变量</p></div>
      <span className="wf-resource-panel-count">{items.length} 个</span>
      <button type="button" className="wf-editor-iconbtn" aria-label="展开完整资源中心" title="展开完整资源中心" onClick={() => onExpand("providers")}><Maximize2 size={15}/></button>
      <button type="button" className="wf-editor-iconbtn" aria-label="关闭面板" title="关闭" onClick={onClose}><X size={16}/></button>
    </header>
    <div className="wf-resource-panel-body">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="wf-resource-panel-kicker">本流程资源</span>
      </div>
      {error ? <p role="alert" className="wf-editor-feedback is-error">资源目录暂时无法读取：{error}</p> : null}
      {!data && !error ? <p className="wf-resource-panel-empty" role="status">正在读取资源…</p> : null}
      {data ? items.map(item => <div className="wf-resource-panel-card" key={item.key}>
        <span className={`wf-resource-panel-card-icon is-${itemTone(item.kind)}`} aria-hidden="true">{itemIcon(item.kind)}</span>
        <div className="wf-resource-panel-card-copy">
          <div className="wf-resource-panel-card-title"><strong title={item.title}>{item.title}</strong><span className={`wf-resource-panel-badge is-${itemTone(item.kind)}`}>{item.badge}</span>{item.platform ? <span className="wf-resource-panel-badge is-platform">平台提供</span> : null}</div>
          <div className={`wf-resource-panel-card-meta${item.mono ? " is-mono" : ""}`} title={item.meta}>{item.meta}</div>
          <div className="wf-resource-panel-card-use">用于 {item.usage}</div>
        </div>
        {item.kind === "variable" || item.edit ? <button type="button" className="wf-resource-panel-edit" aria-label={`编辑 ${item.title}`} title="编辑" onClick={() => editItem(item)}><Pencil size={14}/></button> : null}
      </div>) : null}
      {data && !items.length ? <p className="wf-resource-panel-empty">这个流程还没有引用模型、API、函数或变量。打开资源中心创建后，在节点里选择即可。</p> : null}
      <div className="wf-resource-panel-hint"><ChevronRight size={12}/><span>点击铅笔即可编辑；展开双箭头打开资源中心</span></div>
    </div>
  </aside>;
}

import { useMemo } from "react";
import { Braces, ChevronRight, Maximize2, Pencil, Server, Sparkles, Wrench, X } from "lucide-react";
import type { JsonValue, WorkflowConfiguration, WorkflowDefinitionV2, WorkflowEnvironment, WorkflowTool } from "../domain/v2/types";
import { definitionScopes, variableReferences } from "../domain/v2/dataFlow";
import { useExtensions, type FunctionVersion } from "../editor/v2/FunctionExecutionFields";
import { nodeLabelIndex } from "../editor/v2/StateFields";
import { apiDisplayUrl } from "./apiResourceModel";
import { isFixtureConnection, latestEntries, modelRefsOf, type CatalogConnection } from "./resourceModel";
import type { FunctionDraft, ResourceEditorTarget } from "./ResourceEditor";
import "./resourceEditor.css";

type FunctionCatalogEntry = FunctionVersion & { code?: string; inputSchema?: unknown; outputSchema?: unknown; description?: string; purpose?: string };

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

type PanelItem = {
  id: string;
  kind: "model" | "api" | "function" | "variable";
  title: string;
  badge: string;
  meta: string;
  mono?: boolean;
  platform?: boolean;
  usage: string;
  edit: ResourceEditorTarget;
  section: "providers" | "apis" | "mcp" | "functions" | "variables";
};

function nodeLabels(definition: WorkflowDefinitionV2): Map<string, string> {
  return nodeLabelIndex(definition);
}

function functionDraftOf(node: { label: string; config: Record<string, JsonValue> }): FunctionDraft {
  const language = String(node.config.language ?? "python");
  return {
    name: String(node.config.name ?? node.label),
    language: language === "javascript" ? "javascript" : "python",
    description: String(node.config.description ?? ""),
    code: String(node.config.code ?? ""),
    inputSchema: (node.config.inputSchema as FunctionDraft["inputSchema"]) ?? { type: "object", properties: {} },
    outputSchema: (node.config.outputSchema as FunctionDraft["outputSchema"]) ?? { type: "object", properties: {} },
  };
}

function typeLabel(value: JsonValue | undefined): string {
  if (Array.isArray(value)) return "列表";
  if (typeof value === "number") return "数字";
  if (typeof value === "boolean") return "布尔";
  if (value && typeof value === "object") return "对象";
  return "文本";
}

/** “本流程资源” floating panel. Opening/closing never touches canvas layout or viewport. */
export function ResourcePanel({ definition, environment, tools, variableConfiguration, variableValues = {}, locked = false, onClose, onExpand, onEdit }: ResourcePanelProps) {
  const { data, error, refresh } = useExtensions(environment?.environmentRef);
  const labels = useMemo(() => nodeLabels(definition), [definition]);
  const connections = useMemo(() => latestEntries((data?.connections ?? []).filter(entry => !isFixtureConnection(entry))), [data]);
  const functions = useMemo(() => (data?.functions ?? []) as FunctionCatalogEntry[], [data]);

  const items = useMemo<PanelItem[]>(() => {
    const found = new Map<string, PanelItem>();
    const identity = (kind: string, id: string) => `${kind}\u0000${id}`;
    for (const scope of definitionScopes(definition)) for (const node of scope.definition.nodes) {
      if (!node || typeof node !== "object") continue;
      const config = node.config as Record<string, JsonValue>;
      const usage = labels.get(node.id) ?? node.label;
      if (node.type === "core.llm" && typeof config.providerRef === "string" && config.providerRef) {
        const ref = config.providerRef;
        const connection = connections.find(entry => entry.connectionKey === ref || entry.ref === ref);
        if (connection) {
          const models = modelRefsOf(connection.content);
          const selected = typeof config.modelRef === "string" ? config.modelRef : "";
          found.set(identity("model", ref), {
            id: ref, kind: "model", section: "providers", title: String(connection.content.name ?? connection.ref),
            badge: "模型供应商", meta: `${models.length} 个模型${selected ? ` · ${selected} 已启用` : ""}`,
            usage, edit: { kind: "provider", mode: "edit", ref: connection.ref },
          });
        }
      }
      const toolRefs = [...(typeof config.toolRef === "string" && config.toolRef ? [config.toolRef] : []), ...(Array.isArray(config.allowedToolRefs) ? config.allowedToolRefs.filter((ref): ref is string => typeof ref === "string") : [])];
      for (const ref of toolRefs) {
        const connection = connections.find(entry => entry.connectionKey === ref);
        const tool = tools.find(item => item.ref === ref);
        if (connection) {
          found.set(identity("api", ref), {
            id: ref, kind: "api", section: "apis", title: String(connection.content.name ?? connection.ref),
            badge: "API", meta: apiDisplayUrl(connection.content), mono: true,
            usage, edit: { kind: "api", mode: "edit", ref: connection.ref },
          });
        } else if (tool) {
          found.set(identity("api", ref), {
            id: ref, kind: "api", section: "apis", title: ref === "hn_search" ? "Hacker News 搜索" : tool.name,
            badge: "API", meta: ref === "hn_search" ? "GET hn.algolia.com/api/v1/search · 4 个参数" : `${tool.name} · 平台提供`, mono: true,
            usage, platform: true, edit: ref === "hn_search" ? { kind: "api", mode: "create", platformTool: tool } : { kind: "api", mode: "create", platformTool: tool },
          });
        }
      }
      if (node.type === "core.function") {
        const implementation = String(config.implementation ?? "");
        if (implementation === "registered" && typeof config.functionRef === "string" && config.functionRef) {
          const ref = config.functionRef;
          const fn = functions.find(item => item.ref === ref);
          found.set(identity("function", ref), {
            id: ref, kind: "function", section: "functions", title: String(fn?.name ?? ref),
            badge: "函数", meta: `${String(fn?.language ?? "python") === "javascript" ? "JavaScript" : "Python"} · 固定版本`,
            usage, edit: { kind: "function", mode: "edit", ref, version: typeof config.functionVersion === "number" ? config.functionVersion : undefined },
          });
        } else if (implementation === "code") {
          const ref = `inline:${node.id}`;
          found.set(identity("function", ref), {
            id: ref, kind: "function", section: "functions", title: node.label,
            badge: "函数", meta: `${String(config.language ?? "python") === "javascript" ? "JavaScript" : "Python"} · 本流程代码`,
            usage, edit: { kind: "function", mode: "create", name: node.label, initial: functionDraftOf({ label: node.label, config }) },
          });
        }
      }
    }
    for (const reference of variableReferences(definition)) {
      if (found.has(identity("variable", reference.key))) continue;
      const variable = (variableConfiguration?.variables ?? []).find(item => item.key === reference.key);
      const value = variableValues[reference.key] ?? variable?.value;
      found.set(identity("variable", reference.key), {
        id: reference.key, kind: "variable", section: "variables", title: reference.key,
        badge: "变量", meta: `${typeLabel(value as JsonValue)} · ${String(value ?? "未提供")}`.slice(0, 60),
        usage: labels.get(reference.nodeId) ?? reference.nodeId,
        edit: { kind: "api", mode: "create" },
      });
    }
    return [...found.values()];
  }, [connections, definition, environment, functions, labels, tools, variableConfiguration, variableValues]);

  function itemIcon(kind: PanelItem["kind"]) {
    if (kind === "model") return <Sparkles size={14}/>;
    if (kind === "api") return <Server size={14}/>;
    if (kind === "function") return <Wrench size={14}/>;
    return <Braces size={14}/>;
  }

  function editItem(item: PanelItem) {
    if (item.kind === "variable") { onExpand("variables"); return; }
    if (locked) return;
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
      {items.map(item => <div className="wf-resource-panel-card" key={`${item.kind}:${item.id}`}>
        <span className={`wf-resource-panel-card-icon is-${item.kind === "model" ? "model" : item.kind === "api" ? "api" : item.kind === "function" ? "fn" : "var"}`} aria-hidden="true">{itemIcon(item.kind)}</span>
        <div className="wf-resource-panel-card-copy">
          <div className="wf-resource-panel-card-title"><strong title={item.title}>{item.title}</strong><span className={`wf-resource-panel-badge is-${item.kind === "model" ? "model" : item.kind === "api" ? "api" : item.kind === "function" ? "fn" : "var"}`}>{item.badge}</span>{item.platform ? <span className="wf-resource-panel-badge is-platform">平台提供</span> : null}</div>
          <div className={`wf-resource-panel-card-meta${item.mono ? " is-mono" : ""}`} title={item.meta}>{item.meta}</div>
          <div className="wf-resource-panel-card-use">用于 {item.usage}</div>
        </div>
        <button type="button" className="wf-resource-panel-edit" aria-label={`编辑 ${item.title}`} title="编辑" onClick={() => editItem(item)}><Pencil size={14}/></button>
      </div>)}
      {data && !items.length ? <p className="wf-resource-panel-empty">这个流程还没有引用模型、API、函数或变量。打开资源中心创建后，在节点里选择即可。</p> : null}
      <div className="wf-resource-panel-hint"><ChevronRight size={12}/><span>点击铅笔即可编辑；展开双箭头打开资源中心</span></div>
    </div>
  </aside>;
}


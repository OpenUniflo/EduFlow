import { useState, type ReactNode } from "react";
import { Bot, Braces, Check, Code2, Combine, GitBranch, GitFork, Hammer, Maximize2, MoreHorizontal, Play, Route, Send, X, Boxes } from "lucide-react";
import type { WorkflowNodeV2 } from "../../domain/v2/types";
import "./nodePanel.css";

/**
 * Unified node panel skeleton (plan 2.4 / M8).
 *
 * The panel owns only the shared chrome: header, config/run-data tabs, collapsible sections
 * and footer. Every node type passes its own "处理" content through `sections`; this file
 * never branches on node type except for the header icon/label. Section collapse state is
 * deliberately local and never persisted.
 */

export type NodePanelTab = "config" | "runData";

export type NodePanelSection = {
  id: string;
  title: string;
  count?: number;
  defaultCollapsed?: boolean;
  content: ReactNode;
};

export type NodePanelProps = {
  node: WorkflowNodeV2;
  readOnly: boolean;
  activeTab: NodePanelTab;
  onTabChange: (tab: NodePanelTab) => void;
  showRunData: boolean;
  runData?: ReactNode;
  sections: NodePanelSection[];
  onRename: (label: string) => void;
  onClose: () => void;
  onExpandDebug?: () => void;
  footer?: ReactNode;
};

const typeLabels: Record<string, string> = {
  "core.start": "入口",
  "core.end": "结束",
  "core.llm": "模型",
  "core.tool": "工具",
  "core.tool_dispatch": "工具执行",
  "core.router": "条件分支",
  "core.transform": "数据处理",
  "core.function": "函数",
  "core.subgraph": "子图",
  "core.memory": "长期记忆",
  "core.progress": "过程进度",
  "control.fork": "并行分支",
  "control.join": "等待汇合",
  "control.send": "动态分发",
};

const typeIcons = {
  "core.start": Play,
  "core.end": Check,
  "core.llm": Bot,
  "core.tool": Hammer,
  "core.tool_dispatch": Route,
  "core.transform": Braces,
  "core.router": GitBranch,
  "core.function": Code2,
  "core.subgraph": Boxes,
  "core.memory": Boxes,
  "core.progress": Route,
  "control.fork": GitFork,
  "control.join": Combine,
  "control.send": Send,
};

export function nodePanelTypeLabel(type: string): string {
  return typeLabels[type] ?? type;
}

function defaultCollapsed(section: NodePanelSection): boolean {
  if (typeof section.defaultCollapsed === "boolean") return section.defaultCollapsed;
  return section.id === "advanced" || section.title.includes("高级");
}

export function NodePanel(props: NodePanelProps) {
  const { node, readOnly, activeTab, onTabChange, showRunData, runData, sections, onRename, onClose, onExpandDebug, footer } = props;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const Icon = typeIcons[node.type as keyof typeof typeIcons] ?? Boxes;
  const isCollapsed = (section: NodePanelSection) => collapsed[section.id] ?? defaultCollapsed(section);
  const toggleSection = (section: NodePanelSection) => setCollapsed(current => ({ ...current, [section.id]: !isCollapsed(section) }));

  return (
    <section className="wf-nodepanel" aria-label={`${node.label} 节点面板`} data-node-type={node.type} data-config-field="节点配置">
      <header className="wf-nodepanel-header">
        <span className="wf-nodepanel-icon" aria-hidden="true"><Icon size={19} /></span>
        <div className="wf-nodepanel-heading">
          <input className="wf-nodepanel-title" aria-label="节点名称" value={node.label} readOnly={readOnly} onChange={event => onRename(event.target.value)} />
          <div className="wf-nodepanel-meta"><span className="wf-nodepanel-badge">{nodePanelTypeLabel(node.type)}</span><small>{node.type} · v{node.typeVersion}</small></div>
        </div>
        <div className="wf-nodepanel-actions">
          {onExpandDebug ? <button type="button" className="wf-nodepanel-action" aria-label="展开调试" title="展开调试" onClick={onExpandDebug}><Maximize2 size={15} /></button> : null}
          <details className="wf-nodepanel-more">
            <summary aria-label="更多操作" title="更多"><MoreHorizontal size={16} /></summary>
            <div className="wf-nodepanel-more-body"><p>节点 ID<code>{node.id}</code></p><p>类型<code>{node.type} · v{node.typeVersion}</code></p></div>
          </details>
          <button type="button" className="wf-nodepanel-action" aria-label="关闭节点面板" title="关闭" onClick={onClose}><X size={16} /></button>
        </div>
      </header>
      {showRunData ? (
        <div className="wf-nodepanel-tabs" role="tablist" aria-label="节点面板视图">
          <button type="button" role="tab" id="wf-nodepanel-tab-config" aria-controls="wf-nodepanel-panel-config" aria-selected={activeTab === "config"} className={activeTab === "config" ? "active" : ""} onClick={() => onTabChange("config")}>配置</button>
          <button type="button" role="tab" id="wf-nodepanel-tab-runData" aria-controls="wf-nodepanel-panel-runData" aria-selected={activeTab === "runData"} className={activeTab === "runData" ? "active" : ""} onClick={() => onTabChange("runData")}>运行数据</button>
        </div>
      ) : null}
      <div className="wf-nodepanel-body">
        {showRunData && activeTab === "runData" ? (
          <div className="wf-nodepanel-run-data" role="tabpanel" id="wf-nodepanel-panel-runData" aria-labelledby="wf-nodepanel-tab-runData">{runData ?? <p className="wf-nodepanel-empty">本次运行未经过此节点。</p>}</div>
        ) : (
          <div className="wf-nodepanel-config" role={showRunData ? "tabpanel" : undefined} id={showRunData ? "wf-nodepanel-panel-config" : undefined} aria-labelledby={showRunData ? "wf-nodepanel-tab-config" : undefined} aria-label={showRunData ? undefined : "配置"}>
            {sections.map((section, index) => {
              const open = !isCollapsed(section);
              return (
                <section key={section.id} className={`wf-nodepanel-section${open ? "" : " collapsed"}`} data-section-id={section.id}>
                  <button type="button" className="wf-nodepanel-section-head" aria-expanded={open} aria-controls={`wf-nodepanel-section-${section.id}`} onClick={() => toggleSection(section)}>
                    <span className="wf-nodepanel-section-index">{index + 1}</span>
                    <span className="wf-nodepanel-section-title">{section.title}</span>
                    {typeof section.count === "number" ? <span className="wf-nodepanel-section-count">{section.count}</span> : null}
                    <span className="wf-nodepanel-section-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
                  </button>
                  {open ? <div className="wf-nodepanel-section-content" id={`wf-nodepanel-section-${section.id}`}>{section.content}</div> : null}
                </section>
              );
            })}
            {!sections.length ? <p className="wf-nodepanel-empty">此节点没有可配置项。</p> : null}
          </div>
        )}
      </div>
      {footer ? <footer className="wf-nodepanel-footer">{footer}</footer> : null}
    </section>
  );
}

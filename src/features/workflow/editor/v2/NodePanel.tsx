import { useState, type ReactNode } from "react";
import { Bot, Braces, Check, Code2, Combine, Copy, Crosshair, GitBranch, GitFork, Hammer, Info, Maximize2, MoreHorizontal, Play, Route, Send, Trash2, X, Boxes } from "lucide-react";
import type { WorkflowNodeV2 } from "../../domain/v2/types";
import "./nodePanel.css";

/**
 * Unified node panel chrome. One header layer owns the icon, editable name, Chinese type badge
 * and four 32px actions. Input / processing / output / outlets are always visible; only the
 * final advanced section collapses, and its state stays local to the panel.
 */

export type NodePanelTab = "config" | "runData";

export type NodePanelSection = {
  id: string;
  title: string;
  description?: string;
  count?: number;
  defaultCollapsed?: boolean;
  action?: { label: string; onClick: () => void; disabled?: boolean; expanded?: boolean };
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
  onLocate?: () => void;
  onExpandDebug?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
};

const typeLabels: Record<string, string> = {
  "core.start": "入口",
  "core.end": "结束",
  "core.llm": "模型",
  "core.tool": "工具",
  "core.tool_dispatch": "工具",
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

function isAdvancedSection(section: NodePanelSection): boolean {
  return section.id === "advanced" || section.title.includes("高级");
}

function defaultCollapsed(section: NodePanelSection): boolean {
  if (typeof section.defaultCollapsed === "boolean") return section.defaultCollapsed;
  return isAdvancedSection(section);
}

function sectionSubtitle(section: NodePanelSection): string {
  const base = section.description?.trim() ?? "";
  if (typeof section.count !== "number") return base;
  const count = `${section.count} 项`;
  return base ? `${base} · ${count}` : count;
}

/** Shared section renderer for the side panel and the large node workbench. */
export function NodePanelSections({ sections }: { sections: NodePanelSection[] }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  return <div className="wf-nodepanel-config">
    {sections.map(section => {
      const advanced = isAdvancedSection(section);
      const open = advanced ? !(collapsed[section.id] ?? defaultCollapsed(section)) : true;
      const subtitle = sectionSubtitle(section);
      if (!advanced) {
        return <section key={section.id} className="wf-nodepanel-section" data-section-id={section.id}>
          <div className="wf-nodepanel-section-heading">
            <span className="wf-nodepanel-accent" aria-hidden="true" />
            <div className="wf-nodepanel-section-copy">
              <h3 className="wf-nodepanel-section-title">{section.title}</h3>
              {subtitle ? <p className="wf-nodepanel-section-description">{subtitle}</p> : null}
            </div>
            {section.action ? <button type="button" className="wf-nodepanel-section-action" aria-expanded={section.action.expanded} disabled={section.action.disabled} onClick={section.action.onClick}>{section.action.label}</button> : null}
          </div>
          <div className="wf-nodepanel-section-content" id={`wf-nodepanel-section-${section.id}`}>{section.content}</div>
        </section>;
      }
      return <section key={section.id} className={`wf-nodepanel-section wf-nodepanel-advanced${open ? "" : " collapsed"}`} data-section-id={section.id}>
        <button type="button" className="wf-nodepanel-advanced-toggle" aria-expanded={open} aria-controls={`wf-nodepanel-section-${section.id}`} onClick={() => setCollapsed(current => ({ ...current, [section.id]: open }))}>
          <span className="wf-nodepanel-advanced-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
          <strong>{section.title}</strong>
          {subtitle ? <small>{subtitle}</small> : null}
        </button>
        {open ? <div className="wf-nodepanel-section-content" id={`wf-nodepanel-section-${section.id}`}>{section.content}</div> : null}
      </section>;
    })}
    {!sections.length ? <p className="wf-nodepanel-empty">此节点没有可配置项。</p> : null}
  </div>;
}

export function NodePanel(props: NodePanelProps) {
  const { node, readOnly, activeTab, onTabChange, showRunData, runData, sections, onRename, onClose, onLocate, onExpandDebug, onDuplicate, onDelete } = props;
  const Icon = typeIcons[node.type as keyof typeof typeIcons] ?? Boxes;
  const label = nodePanelTypeLabel(node.type);
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <section className="wf-nodepanel" aria-label={`${node.label} 节点面板`} data-node-type={node.type} data-config-field="节点配置">
      <header className="wf-nodepanel-header">
        <span className="wf-nodepanel-icon" aria-hidden="true"><Icon size={16} /></span>
        <input className="wf-nodepanel-title" aria-label="节点名称" value={node.label} readOnly={readOnly} onChange={event => onRename(event.target.value)} />
        <span className="wf-nodepanel-badge" data-type={node.type}>{label}</span>
        <div className="wf-nodepanel-actions">
          {onLocate ? <button type="button" className="wf-nodepanel-action" aria-label="在画布中定位节点" title="定位" onClick={onLocate}><Crosshair size={16} /></button> : null}
          {onExpandDebug ? <button type="button" className="wf-nodepanel-action" aria-label="展开为大窗口" title="展开为大窗口" onClick={onExpandDebug}><Maximize2 size={15} /></button> : null}
          <details className="wf-nodepanel-more">
            <summary aria-label="更多操作" title="更多操作"><MoreHorizontal size={16} /></summary>
            <div className="wf-nodepanel-more-body" role="menu" aria-label="节点更多操作">
              <button type="button" role="menuitem" className="wf-nodepanel-more-item" onClick={() => setInfoOpen(value => !value)}>
                <span className="wf-nodepanel-more-icon" aria-hidden="true"><Info size={14}/></span>节点信息
              </button>
              {onDuplicate ? <button type="button" role="menuitem" className="wf-nodepanel-more-item" onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); onDuplicate(); }}>
                <span className="wf-nodepanel-more-icon" aria-hidden="true"><Copy size={14}/></span>复制节点
              </button> : null}
              {onDelete ? <><div className="wf-nodepanel-more-divider" /><button type="button" role="menuitem" className="wf-nodepanel-more-item danger" onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); onDelete(); }}>
                <span className="wf-nodepanel-more-icon" aria-hidden="true"><Trash2 size={14}/></span>删除节点
              </button></> : null}
              {infoOpen ? <div className="wf-nodepanel-info" role="note">
                <p>类型<code>{label} · v{node.typeVersion}</code></p>
                <p>输出<code>{Object.keys(node.writes).length} 项</code></p>
              </div> : null}
            </div>
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
          <div className="wf-nodepanel-config-panel" role={showRunData ? "tabpanel" : undefined} id={showRunData ? "wf-nodepanel-panel-config" : undefined} aria-labelledby={showRunData ? "wf-nodepanel-tab-config" : undefined} aria-label={showRunData ? undefined : "配置"}>
            <NodePanelSections sections={sections} />
          </div>
        )}
      </div>
    </section>
  );
}
